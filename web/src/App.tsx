import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyringPair } from '@polkadot/keyring/types';
import { getState, getPlayer, register, type HarbourState, type Player, type Good } from './api';
import { loadWallet, trade, quote, toUnits, fromUnits } from './chain';
import { mockState, mockPlayer, mockTrade } from './mock';
import { Harbour, roundChange } from './Harbour';
import { CARGO, KIND_ART, captainArt } from './art';

const MOCK = new URLSearchParams(location.search).has('mock');
const EXPLORER = import.meta.env.VITE_EXPLORER ?? 'https://node-console.portaldot.dev/#/explorer/query/';
const explorer = (hash: string) => `${EXPLORER}${hash}`;
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const short = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const priceDigits = (p: number) => (p < 10 ? 3 : 2);

function useClock(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** A good's recent price with a marker wherever news about it docked. */
function PriceChart({ points, events, color }: { points: { t: number; p: number }[]; events: { t?: number; dir: number; magnitude: number }[]; color: string }) {
  if (points.length < 2) return <div className="chart empty">Prices appear after the first few blocks.</div>;
  const W = 340, H = 110, t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const ps = points.map((x) => x.p), lo = Math.min(...ps) * 0.98, hi = Math.max(...ps) * 1.02;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (p: number) => H - ((p - lo) / (hi - lo || 1)) * (H - 16) - 8;
  const d = points.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.t).toFixed(1)} ${y(pt.p).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Recent price">
      <path d={`${d} L${W} ${H} L0 ${H}Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {events.filter((e) => e.t && e.t >= t0).map((e, i) => (
        <g key={i}>
          <line x1={x(e.t!)} x2={x(e.t!)} y1="0" y2={H} className="chart-mark" />
          <text x={x(e.t!) + 4} y="12" className="chart-label">{e.dir > 0 ? '▲' : '▼'}{e.magnitude}%</text>
        </g>
      ))}
    </svg>
  );
}

/** Top-left card: this round's news, the ship's countdown and the on-chain proof of the draw. */
function NewsCard({ state, now }: { state: HarbourState; now: number }) {
  const ev = state.event;
  const good = ev ? state.goods[ev.good] : undefined;
  const roundEnd = state.roundStartedAt + state.roundSeconds * 1000;
  const sailing = ev && ev.dir !== 0 && !ev.docked;
  const span = Math.max(1, state.dockAt - state.roundStartedAt);
  const progress = ev?.docked ? 100 : Math.min(100, Math.max(0, ((now - state.roundStartedAt) / span) * 100));
  return (
    <section className="panel news" aria-live="polite">
      <div className="news-top">
        <span className="wordmark">Portside</span>
        <span className="round">Season {state.season} · Round {ev?.round ?? '–'}</span>
      </div>
      {!ev ? (
        <div className="news-body"><img className="kind" src="/art/sun.webp" alt="" /><div><h2>Harbour opening</h2><p className="line">The first ship is on its way.</p></div></div>
      ) : (
        <div className="news-body">
          <img className="kind" src={KIND_ART[ev.kind]} alt="" />
          <div>
            <h2>{ev.title}{ev.dir !== 0 && '!'}</h2>
            {ev.dir !== 0 ? (
              <span className={`move ${ev.dir > 0 ? 'up' : 'down'}`}>{good?.name} {ev.dir > 0 ? '▲' : '▼'} {ev.magnitude}%</span>
            ) : <span className="move flat">No price news</span>}
            <p className="line">{ev.line}</p>
          </div>
        </div>
      )}
      {ev && ev.dir !== 0 && (
        <div className={`voyage ${sailing ? '' : 'done'}`}>
          <div className="track"><span style={{ width: `${progress}%` }} /></div>
          <p>{sailing
            ? state.dockAt - now > 0 ? <>Ship docks in <b>{mmss(state.dockAt - now)}</b> · trade before it lands</> : 'Ship docking now…'
            : <>Docked · {good?.name} moved {ev.dir > 0 ? '+' : '−'}{ev.magnitude}%</>}</p>
        </div>
      )}
      <div className="news-foot">
        <span>Next news in <b>{mmss(roundEnd - now)}</b></span>
        {ev && <a href={explorer(ev.proof)} target="_blank" rel="noreferrer">drawn on-chain · {ev.proof.slice(0, 8)}…</a>}
      </div>
    </section>
  );
}

function Onboard({ address, onJoin, busy, error, feeMode }: { address: string; onJoin: (name: string) => void; busy: boolean; error?: string; feeMode: HarbourState['feeMode'] }) {
  const [name, setName] = useState('');
  return (
    <div className="scrim">
      <form className="panel onboard" onSubmit={(e) => { e.preventDefault(); onJoin(name); }}>
        <img className="onboard-face" src={captainArt(address)} alt="Your captain" />
        <h2>Sign the harbour register</h2>
        <p>You get a warehouse, <b>1,000 DUCAT</b> and a wallet that lives in this browser. Every trade is a real swap on Portaldot's DEX, and {feeMode === 'native' ? 'the harbour covers your network fees' : 'network fees are paid in DUCAT'}.</p>
        <ol className="steps">
          <li><b>Read the news.</b> Each round a ship brings news about one good.</li>
          <li><b>Trade before it docks.</b> When it lands, that price jumps or sinks by the posted amount.</li>
          <li><b>Sell into the move.</b> Highest net worth tops the captains' board.</li>
        </ol>
        <label>Captain's name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="e.g. Marlowe" autoFocus /></label>
        <button className="btn go wide" disabled={busy}>{busy ? 'Opening your warehouse…' : 'Open my warehouse'}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; hash: string } | { kind: 'error'; text: string };

function TradeDrawer({ good, initialSide, state, player, pair, onClose, onTraded }: {
  good: Good; initialSide: 'buy' | 'sell'; state: HarbourState; player?: Player; pair: KeyringPair; onClose: () => void; onTraded: () => void;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  useEffect(() => { setSide(initialSide); setAmount(''); setStatus({ kind: 'idle' }); }, [good.id, initialSide]);
  const pool = state.prices[good.id];
  const purse = player?.holdings?.[state.ducat] ?? 0;
  const held = player?.holdings?.[good.id] ?? 0;
  const max = side === 'buy' ? Math.max(0, purse - 1) : held;
  const n = Number(amount) || 0;
  const out = useMemo(() => {
    if (!pool || n <= 0) return 0;
    const [rin, rout] = side === 'buy' ? [BigInt(pool.ducat), BigInt(pool.goods)] : [BigInt(pool.goods), BigInt(pool.ducat)];
    return fromUnits(quote(rin, rout, toUnits(n)));
  }, [pool, n, side]);
  const impact = pool && n > 0 ? Math.abs((side === 'buy' ? n / out : out / n) / pool.price - 1) * 100 : 0;
  const ev = state.event;
  const news = ev && state.goods[ev.good]?.id === good.id && ev.dir !== 0 ? ev : undefined;

  async function submit() {
    if (n <= 0 || n > max) return;
    setStatus({ kind: 'busy', text: 'Signing in your browser…' });
    try {
      const hash = MOCK
        ? mockTrade(pair.address, good.id, side, n)
        : await trade(pair, state.ducat, good.id, side, toUnits(n), toUnits(out * 0.97), state.feeMode !== 'native');
      setStatus({ kind: 'done', hash });
      setAmount('');
      onTraded();
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message.replace(/^.*?: /, '') });
    }
  }

  const chips = side === 'buy' ? [50, 100, 250] : [0.25, 0.5, 1].map((f) => Math.floor(held * f * 1e4) / 1e4);
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <aside className="panel sheet" role="dialog" aria-label={`Trade ${good.name}`}>
        <header>
          <img src={CARGO[good.symbol]} alt="" />
          <div>
            <h3>{good.name}</h3>
            <span className="muted">{fmt(pool?.price ?? 0, priceDigits(pool?.price ?? 0))} DUCAT each</span>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </header>
        {news && (
          <p className={`sheet-news ${news.dir > 0 ? 'up' : 'down'}`}>
            {news.title}: {news.docked ? `docked, moved ${news.dir > 0 ? '+' : '−'}${news.magnitude}%` : `ship docks in ${mmss(state.dockAt - Date.now())}, ${news.dir > 0 ? '+' : '−'}${news.magnitude}% when it lands`}
          </p>
        )}
        <div className="seg">
          <button className={side === 'buy' ? 'on buy' : ''} onClick={() => { setSide('buy'); setAmount(''); }}>Buy</button>
          <button className={side === 'sell' ? 'on sell' : ''} onClick={() => { setSide('sell'); setAmount(''); }}>Sell</button>
        </div>
        <label className="amount">
          <span>{side === 'buy' ? 'Spend DUCAT' : `Sell ${good.name}`}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
        </label>
        <div className="chips">
          {chips.map((c, i) => <button key={i} onClick={() => setAmount(String(Math.min(c, max)))} disabled={max <= 0}>{side === 'buy' ? c : ['¼', '½', 'All'][i]}</button>)}
          <span className="muted">{side === 'buy' ? `purse ${fmt(purse)}` : `held ${fmt(held, 3)}`}</span>
        </div>
        <PriceChart
          points={state.history[good.id] ?? []}
          events={state.events.concat(state.event ? [{ ...state.event, t: state.dockAt }] : []).filter((e) => state.goods[e.good]?.id === good.id && e.dir !== 0 && (e.docked ?? true))}
          color={(state.prices[good.id]?.price ?? 0) >= good.basePrice ? '#13a864' : '#f0524f'}
        />
        <dl className="quote">
          <div><dt>You get about</dt><dd>{fmt(out, side === 'buy' ? 3 : 2)} {side === 'buy' ? good.symbol : 'DUCAT'}</dd></div>
          <div><dt>Price impact</dt><dd className={impact > 3 ? 'warn' : ''}>{fmt(impact, 2)}%</dd></div>
          <div><dt>Network fee</dt><dd>{state.feeMode === 'native' ? 'covered by the harbour' : 'paid in DUCAT'}</dd></div>
        </dl>
        <button className={`btn wide ${side === 'buy' ? 'go' : 'stop'}`} disabled={n <= 0 || n > max || status.kind === 'busy'} onClick={submit}>
          {status.kind === 'busy' ? status.text : `${side === 'buy' ? 'Buy' : 'Sell'} ${good.name}`}
        </button>
        {status.kind === 'done' && <a className="ok" href={explorer(status.hash)} target="_blank" rel="noreferrer">Sent to Portaldot · {status.hash.slice(0, 12)}…</a>}
        {status.kind === 'error' && <p className="error">{status.text}</p>}
      </aside>
    </>
  );
}

export default function App() {
  const now = useClock();
  const [pair, setPair] = useState<KeyringPair>();
  const [mnemonic, setMnemonic] = useState('');
  const [state, setState] = useState<HarbourState>();
  const [player, setPlayer] = useState<Player>();
  const [offline, setOffline] = useState('');
  const [picked, setPicked] = useState<{ id: number; side: 'buy' | 'sell' }>();
  const [tab, setTab] = useState<'board' | 'ledger' | 'log'>('board');
  // The crew list covers the right-hand piers on smaller screens, so it starts folded there.
  const [crewOpen, setCrewOpen] = useState(() => window.innerWidth >= 1600 || window.innerWidth <= 760);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string>();
  const [howto, setHowto] = useState(false);
  const [recap, setRecap] = useState<{ round: number; delta: number; rank: number }>();
  const roundMark = useRef<{ round: number; worth: number }>();

  // When a round closes, tell the player how their warehouse did.
  useEffect(() => {
    const round = state?.event?.round, worth = player?.worth;
    if (round === undefined || worth === undefined || !player?.registered) return;
    const mark = roundMark.current;
    if (mark && round > mark.round) {
      const rank = state!.leaderboard.findIndex((r) => r.address === pair?.address) + 1;
      setRecap({ round: mark.round, delta: worth - mark.worth, rank });
      setTimeout(() => setRecap(undefined), 7000);
    }
    if (!mark || round !== mark.round) roundMark.current = { round, worth };
  }, [state?.event?.round, player?.worth, player?.registered]);

  useEffect(() => { loadWallet().then(({ pair, mnemonic }) => { setPair(pair); setMnemonic(mnemonic); }); }, []);

  const refresh = useCallback(async () => {
    if (!pair) return;
    try {
      if (MOCK) { setState(mockState(pair.address)); setPlayer(mockPlayer(pair.address)); return; }
      const [s, p] = await Promise.all([getState(), getPlayer(pair.address)]);
      setState(s); setPlayer(p); setOffline('');
    } catch (e) { setOffline((e as Error).message); }
  }, [pair]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 2500); return () => clearInterval(id); }, [refresh]);

  async function join(name: string) {
    if (!pair) return;
    setJoining(true); setJoinError(undefined);
    const r = await register(pair.address, name).catch((e) => ({ error: String(e) }));
    setJoining(false);
    if (r.error) setJoinError(r.error); else refresh();
  }

  if (!state || !pair) {
    return <div className="loading"><img src="/art/ship.webp" alt="" /><p>{offline || 'A ship is coming into port…'}</p></div>;
  }

  const goodOf = (id: number) => state.goods.find((g) => g.id === id);
  const worth = player?.worth ?? 0;
  const purse = player?.holdings?.[state.ducat] ?? 0;
  const pnl = worth ? worth - 1000 : 0;
  const myRank = state.leaderboard.findIndex((r) => r.address === pair.address) + 1;
  const me = state.leaderboard.find((r) => r.address === pair.address);
  const ev = state.event;

  return (
    <div className="game">
      <Harbour state={state} player={player} now={now} onPick={(id) => setPicked({ id, side: 'buy' })} />

      <div className="hud">
        <NewsCard state={state} now={now} />

        <section className="panel purse">
          <img className="face" src={captainArt(pair.address)} alt="" />
          <div className="who"><small>Captain</small><b>{me?.name ?? 'Unsigned'}</b></div>
          <div><small>Purse</small><b>{fmt(purse)}<i> DUCAT</i></b></div>
          <div><small>Net worth</small><b>{fmt(worth)}</b><em className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</em></div>
          <div className="rank"><small>Rank</small><b>{myRank ? `#${myRank}` : '—'}</b><i>of {state.players}</i></div>
        </section>

        <section className={`panel captains ${crewOpen ? '' : 'is-folded'}`}>
          <div className="tabs">
            {(['board', 'ledger', 'log'] as const).map((t) => (
              <button key={t} className={tab === t && crewOpen ? 'on' : ''} onClick={() => { setTab(t); setCrewOpen(true); }}>{{ board: 'Captains', ledger: 'My ledger', log: 'Harbour log' }[t]}</button>
            ))}
            <button className="fold" onClick={() => setCrewOpen(!crewOpen)} aria-label={crewOpen ? 'Fold the list' : 'Open the list'}>{crewOpen ? '▴' : '▾'}</button>
          </div>
          {crewOpen && tab === 'board' && (
            <ol className="leaders">
              {state.leaderboard.slice(0, 10).map((r, i) => (
                <li key={r.address} className={r.address === pair.address ? 'me' : ''}>
                  <span className="pos">{i + 1}</span>
                  <img src={captainArt(r.address)} alt="" />
                  <span className="who">{r.address === pair.address ? `${r.name} (you)` : r.name}</span>
                  <span className="val">{fmt(r.worth, 0)}</span>
                </li>
              ))}
              {!state.leaderboard.length && <li className="empty">No captains yet. Be the first.</li>}
            </ol>
          )}
          {crewOpen && tab === 'ledger' && (
            <ul className="ledger">
              {(player?.trades ?? []).map((t) => (
                <li key={t.hash}>
                  <img src={CARGO[goodOf(t.from === state.ducat ? t.to : t.from)?.symbol ?? '']} alt="" />
                  <span>{t.from === state.ducat ? 'Bought' : 'Sold'} <b>{goodOf(t.from === state.ducat ? t.to : t.from)?.name}</b>
                    <small>{t.from === state.ducat ? `${fmt(t.amountIn)} → ${fmt(t.amountOut, 3)}` : `${fmt(t.amountIn, 3)} → ${fmt(t.amountOut)}`}</small></span>
                  <a href={explorer(t.hash)} target="_blank" rel="noreferrer">#{t.block}</a>
                </li>
              ))}
              {!player?.trades?.length && <li className="empty">Your trades land here with their block on Portaldot.</li>}
            </ul>
          )}
          {crewOpen && tab === 'log' && (
            <ul className="ledger">
              {state.events.map((e) => (
                <li key={e.proof}>
                  <img src={KIND_ART[e.kind]} alt="" />
                  <span>{e.season !== state.season && `S${e.season} · `}R{e.round} <b>{e.title}</b>
                    <small className={e.dir > 0 ? 'up' : e.dir < 0 ? 'down' : ''}>{state.goods[e.good]?.name} {e.dir ? `${e.dir > 0 ? '+' : '−'}${e.magnitude}%` : 'no change'}</small></span>
                  <a href={explorer(e.proof)} target="_blank" rel="noreferrer">proof</a>
                </li>
              ))}
              {state.anchors.map((a) => (
                <li key={a.root}><img src="/art/guild.webp" alt="" /><span>Day {a.day} standings anchored<small>{a.players} captains</small></span><a href={explorer(a.proof)} target="_blank" rel="noreferrer">root</a></li>
              ))}
              {!state.events.length && <li className="empty">Past rounds appear here with their on-chain proof.</li>}
            </ul>
          )}
        </section>

        <nav className="dock" aria-label="Market">
          {state.goods.map((g, i) => {
            const p = state.prices[g.id]?.price ?? 0;
            const ch = roundChange(state, g.id);
            const held = player?.holdings?.[g.id] ?? 0;
            const news = ev && ev.good === i && ev.dir !== 0;
            return (
              <div key={g.id} className={`crate ${news ? 'is-news' : ''}`}>
                {news && <span className={`tag ${ev!.dir > 0 ? 'up' : 'down'}`}>{ev!.docked ? 'Docked' : 'News'} {ev!.dir > 0 ? '▲' : '▼'}{ev!.magnitude}%</span>}
                <button className="crate-head" onClick={() => setPicked({ id: g.id, side: 'buy' })}>
                  <img src={CARGO[g.symbol]} alt="" />
                  <span><b>{g.name}</b><span className="p">{fmt(p, priceDigits(p))}</span><small className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'}{fmt(Math.abs(ch), 1)}%{held >= 0.005 ? ` · you ${fmt(held, held < 10 ? 2 : 1)}` : ''}</small></span>
                </button>
                <div className="crate-btns">
                  <button className="btn go" onClick={() => setPicked({ id: g.id, side: 'buy' })}>Buy</button>
                  <button className="btn stop" disabled={held < 0.005} onClick={() => setPicked({ id: g.id, side: 'sell' })}>Sell</button>
                </div>
              </div>
            );
          })}
        </nav>

        <footer className="foot">
          <button className="link" onClick={() => setHowto(true)}>How to play</button>
          <span>Wallet {short(pair.address)}</span>
          <button className="link" onClick={() => { navigator.clipboard?.writeText(mnemonic); alert('Recovery phrase copied. Keep it somewhere safe.'); }}>Copy recovery phrase</button>
          <span>{state.mode === 'contract' ? 'News drawn by the Harbour contract' : 'News drawn with on-chain commit-reveal'} · every price is a live pool on Portaldot V3</span>
        </footer>
      </div>

      {howto && (
        <div className="scrim" onClick={() => setHowto(false)}>
          <div className="panel onboard" onClick={(e) => e.stopPropagation()}>
            <img className="onboard-face" src="/art/ship.webp" alt="" />
            <h2>How to play</h2>
            <ol className="steps">
              <li><b>Read the news.</b> Each round a ship brings news about one good.</li>
              <li><b>Trade before it docks.</b> When it lands, that price jumps or sinks by the posted amount.</li>
              <li><b>Sell into the move.</b> Highest net worth tops the captains' board.</li>
            </ol>
            <button className="btn go wide" onClick={() => setHowto(false)}>Back to the harbour</button>
          </div>
        </div>
      )}

      {offline && <div className="banner">Harbour office unreachable: {offline}. Retrying…</div>}

      {recap && (
        <div className="recap" role="status">
          <img src={captainArt(pair.address)} alt="" />
          <span>Round {recap.round} closed</span>
          <b className={recap.delta >= 0 ? 'up' : 'down'}>{recap.delta >= 0 ? '+' : ''}{fmt(recap.delta)} DUCAT</b>
          {recap.rank > 0 && <span>now #{recap.rank}</span>}
        </div>
      )}

      {picked && goodOf(picked.id) && (
        <TradeDrawer good={goodOf(picked.id)!} initialSide={picked.side} state={state} player={player} pair={pair} onClose={() => setPicked(undefined)} onTraded={refresh} />
      )}
      {!MOCK && player && !player.registered && <Onboard address={pair.address} onJoin={join} busy={joining} error={joinError} feeMode={state.feeMode} />}
    </div>
  );
}
