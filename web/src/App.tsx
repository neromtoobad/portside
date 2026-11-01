import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyringPair } from '@polkadot/keyring/types';
import { getState, getPlayer, register, type HarbourState, type Player, type Good } from './api';
import { loadWallet, trade, quote, toUnits, fromUnits } from './chain';
import { mockState, mockPlayer, mockTrade } from './mock';
import { Harbour, roundChange, type Pop } from './Harbour';
import { CARGO, KIND_ART, captainArt } from './art';
import { sfx } from './sound';
import { callsFor, rankFor, streakOf } from './progress';
import { shareBrag } from './share';

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
        <p>You get <b>1,000 DUCAT</b> to trade Nvidia, Apple, Tesla, Amazon and Meta shares, and a wallet that lives in this browser. Every trade is a real swap on Portaldot's DEX, and {feeMode === 'native' ? 'the harbour covers your network fees' : 'network fees are paid in DUCAT'}.</p>
        <ol className="steps">
          <li><b>Read the news.</b> Each round a ship brings news about one stock.</li>
          <li><b>Trade before it docks.</b> When it lands, its share price jumps or sinks by the posted amount.</li>
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
            <span className="muted"><b className="tkr">{good.symbol}</b> {fmt(pool?.price ?? 0, priceDigits(pool?.price ?? 0))} DUCAT a share</span>
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
          <span>{side === 'buy' ? 'Spend DUCAT' : `Sell ${good.symbol} shares`}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
        </label>
        <div className="chips">
          {chips.map((c, i) => <button key={i} onClick={() => setAmount(String(Math.min(c, max)))} disabled={max <= 0}>{side === 'buy' ? c : ['¼', '½', 'All'][i]}</button>)}
          <span className="muted">{side === 'buy' ? `purse ${fmt(purse)}` : `${fmt(held, 3)} shares`}</span>
        </div>
        <PriceChart
          points={state.history[good.id] ?? []}
          events={state.events.concat(state.event ? [{ ...state.event, t: state.dockAt }] : []).filter((e) => state.goods[e.good]?.id === good.id && e.dir !== 0 && (e.docked ?? true))}
          color={(state.prices[good.id]?.price ?? 0) >= good.basePrice ? '#13a864' : '#f0524f'}
        />
        <dl className="quote">
          <div><dt>You get about</dt><dd>{fmt(out, side === 'buy' ? 3 : 2)} {side === 'buy' ? `${good.symbol} shares` : 'DUCAT'}</dd></div>
          <div><dt>Price impact</dt><dd className={impact > 3 ? 'warn' : ''}>{fmt(impact, 2)}%</dd></div>
          <div><dt>Network fee</dt><dd>{state.feeMode === 'native' ? 'covered by the harbour' : 'paid in DUCAT'}</dd></div>
        </dl>
        <button className={`btn wide ${side === 'buy' ? 'go' : 'stop'}`} disabled={n <= 0 || n > max || status.kind === 'busy'} onClick={submit}>
          {status.kind === 'busy' ? status.text : `${side === 'buy' ? 'Buy' : 'Sell'} ${good.symbol}`}
        </button>
        {status.kind === 'done' && <a className="ok" href={explorer(status.hash)} target="_blank" rel="noreferrer">Sent to Portaldot · {status.hash.slice(0, 12)}…</a>}
        {status.kind === 'error' && <p className="error">{status.text}</p>}
      </aside>
    </>
  );
}

const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };

function Flame() {
  return <svg viewBox="0 0 16 20" width="12" height="15" aria-hidden="true"><path d="M8 0c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="currentColor" /></svg>;
}

function SoundToggle() {
  const [muted, setMuted] = useState(sfx.muted);
  useEffect(() => sfx.subscribe(setMuted), []);
  return (
    <button className="sound" onClick={() => sfx.setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} title={muted ? 'Sound off' : 'Sound on'}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted
          ? <path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

type Outcome = 'win' | 'loss' | 'dodge' | 'miss';
interface Result { key: string; outcome: Outcome; amount: number; title: string; goodName: string; dir: number; magnitude: number; kind: number; streak: number }

const HEADLINES: Record<Outcome, string> = { win: 'You called it!', dodge: 'Dodged it!', loss: 'Caught out', miss: 'Missed the boat' };

/** The moment the ship docks: what this round's news did to your warehouse. */
function DockResult({ r, captain, address, rank, onClose }: { r: Result; captain: string; address: string; rank: string; onClose: () => void }) {
  const [sharing, setSharing] = useState('');
  const good = r.outcome === 'win' || r.outcome === 'dodge';
  const move = `${r.goodName} ${r.dir > 0 ? '+' : '−'}${r.magnitude}%`;
  const amount = r.outcome === 'miss' ? move : `${r.amount >= 0 ? '+' : '−'}${fmt(Math.abs(r.amount))}`;
  async function share() {
    setSharing('Drawing your card…');
    const text = r.outcome === 'dodge'
      ? `Sold before the ${r.title.toLowerCase()} hit ${r.goodName} (${r.dir > 0 ? '+' : '−'}${r.magnitude}%) and saved ${fmt(Math.abs(r.amount))} DUCAT on Portside.`
      : `Called the ${r.title.toLowerCase()} on Portside: ${move}, ${amount} DUCAT.${r.streak >= 2 ? ` ${r.streak} calls in a row.` : ''}`;
    const how = await shareBrag({
      headline: HEADLINES[r.outcome], detail: `${r.title} · ${move}`, amount: `${amount} DUCAT`, up: good,
      captain, rank, face: captainArt(address), kind: KIND_ART[r.kind], streak: r.streak,
    }, text).catch(() => 'failed');
    setSharing(how === 'downloaded' ? 'Card saved. Attach it to your post.' : how === 'failed' ? 'Could not draw the card.' : '');
  }
  return (
    <div className={`result is-${r.outcome}`} role="status">
      {good && <div className="coins" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 5) * 0.12}s` }} />)}</div>}
      <div className="panel result-card">
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <img src={KIND_ART[r.kind]} alt="" />
        <h2>{HEADLINES[r.outcome]}</h2>
        <p className="detail">{r.title} · {move}</p>
        <b className={good ? 'up' : r.outcome === 'loss' ? 'down' : ''}>{amount}{r.outcome !== 'miss' && <i> DUCAT</i>}</b>
        <p className="sub">{{
          win: 'You held shares when the news landed.',
          dodge: 'You sold your shares before it landed.',
          loss: 'You held shares when it landed. Sell before the next one.',
          miss: 'You held no shares. Buy before the next ship docks.',
        }[r.outcome]}</p>
        {r.streak >= 2 && r.outcome === 'win' && <span className="streak big"><Flame /> {r.streak} calls in a row</span>}
        <div className="result-btns">
          {good && <button className="btn go" onClick={share} disabled={!!sharing && sharing.endsWith('…')}>Share this win</button>}
          <button className="btn" onClick={onClose}>Back to trading</button>
        </div>
        {sharing && <p className="sub">{sharing}</p>}
      </div>
    </div>
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
  const [result, setResult] = useState<Result>();
  const [pops, setPops] = useState<Pop[]>([]);
  const [promo, setPromo] = useState<string>();
  const seen = useRef<Set<string>>();
  const dockSnap = useRef<{ key: string; docked: boolean; price: number; held: number }>();
  const lastTick = useRef(0);
  const lastTier = useRef<number>();

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

  const names = useMemo(() => new Map(state?.leaderboard.map((r) => [r.address, r.name]) ?? []), [state?.leaderboard]);
  const calls = useMemo(() => (state && player?.trades ? callsFor(state, player.trades) : []), [state, player?.trades]);
  const streak = streakOf(calls);

  // Other captains' trades rise off their pier as they land.
  useEffect(() => {
    if (!state || !pair) return;
    const fresh = state.trades.filter((t) => !seen.current?.has(t.hash));
    const first = !seen.current;
    seen.current ??= new Set();
    fresh.forEach((t) => seen.current!.add(t.hash));
    if (first) return;
    const added: Pop[] = fresh.filter((t) => t.address !== pair.address).map((t): Pop => {
      const buy = t.from === state.ducat;
      return { key: t.hash, good: state.goods.findIndex((g) => g.id === (buy ? t.to : t.from)), address: t.address, name: names.get(t.address) ?? short(t.address), side: buy ? 'buy' : 'sell' };
    }).filter((p) => p.good >= 0);
    if (!added.length) return;
    sfx.clink();
    setPops((p) => [...p, ...added].slice(-8));
    setTimeout(() => setPops((p) => p.filter((x) => !added.some((a) => a.key === x.key))), 4200);
  }, [state?.trades]);

  // Horn when a news ship appears; when it docks, work out what it did to this player's warehouse.
  useEffect(() => {
    const ev = state?.event;
    if (!state || !ev) return;
    const key = `${ev.season}:${ev.round}`;
    const id = state.goods[ev.good]?.id;
    const price = state.prices[id]?.price ?? 0;
    const held = player?.holdings?.[id] ?? 0;
    const prev = dockSnap.current;
    if (!prev || prev.key !== key) {
      if (prev && ev.dir !== 0) sfx.horn();
      dockSnap.current = { key, docked: !!ev.docked, price, held };
      return;
    }
    if (!ev.docked) { dockSnap.current = { key, docked: false, price, held }; return; }
    if (prev.docked) return;
    dockSnap.current = { ...prev, docked: true };
    if (ev.dir === 0) return;
    sfx.splash();
    setTimeout(() => sfx.horn(true), 250);
    if (!player?.registered) return;
    // Holdings can lag a refresh behind the chain, so count this round's own trades too.
    const mine = (player.trades ?? []).filter((t) => t.t >= state.roundStartedAt);
    const bought = mine.filter((t) => t.to === id).reduce((s, t) => s + t.amountOut, 0);
    const sold = mine.filter((t) => t.from === id).reduce((s, t) => s + t.amountIn, 0);
    const aboard = Math.max(prev.held, bought - sold);
    const move = (ev.magnitude / 100) * prev.price;
    let outcome: Outcome | undefined, amount = 0;
    if (aboard >= 0.005) { outcome = ev.dir > 0 ? 'win' : 'loss'; amount = ev.dir * aboard * move; }
    else if (ev.dir < 0 && sold > 0) { outcome = 'dodge'; amount = sold * move; }
    else if (ev.dir > 0) outcome = 'miss';
    if (!outcome) return;
    const run = outcome === 'win' || outcome === 'dodge' ? streak.current + (calls.some((c) => `${c.season}:${c.round}` === key) ? 0 : 1) : 0;
    setResult({ key, outcome, amount, title: ev.title, goodName: state.goods[ev.good]?.name ?? '', dir: ev.dir, magnitude: ev.magnitude, kind: ev.kind, streak: run });
    if (outcome === 'win') { sfx.coins(10); setTimeout(() => sfx.fanfare(), 300); }
    else if (outcome === 'dodge') sfx.coins(5);
    else if (outcome === 'loss') sfx.lose();
    setTimeout(() => setResult((r) => (r?.key === key ? undefined : r)), 11000);
  }, [state, player]);

  // Countdown ticks for the ship's last ten seconds.
  useEffect(() => {
    const ev = state?.event;
    if (!state || !ev || ev.dir === 0 || ev.docked) return;
    const left = Math.ceil((state.dockAt - now) / 1000);
    if (left >= 1 && left <= 10 && left !== lastTick.current) { lastTick.current = left; sfx.tick(left <= 3); }
  }, [now]);

  // Promotion when net worth crosses into a new rank.
  useEffect(() => {
    if (!player?.registered || player.worth === undefined) return;
    const r = rankFor(player.worth);
    if (lastTier.current !== undefined && r.tier > lastTier.current) {
      setPromo(r.name);
      sfx.fanfare();
      setTimeout(() => setPromo(undefined), 6000);
    }
    lastTier.current = r.tier;
  }, [player?.worth]);

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
  const myRankName = rankFor(worth);
  const thisRound = state.trades.filter((t) => t.t >= state.roundStartedAt);
  const crowd = state.goods.map((g) => {
    const by = new Map<string, { address: string; name: string }>();
    for (const t of thisRound) if (t.to === g.id || t.from === g.id) by.set(t.address, { address: t.address, name: names.get(t.address) ?? short(t.address) });
    return [...by.values()];
  });
  const traders = new Set(thisRound.map((t) => t.address)).size;
  const latest = state.trades.slice(0, 3);

  return (
    <div className="game">
      <Harbour state={state} player={player} now={now} onPick={(id) => setPicked({ id, side: 'buy' })} crowd={crowd} pops={pops} />

      <div className="hud">
        <NewsCard state={state} now={now} />

        <section className="panel purse">
          <img className={`face tier-${myRankName.tier}`} src={captainArt(pair.address)} alt="" />
          <div className="who">
            <small title={myRankName.next ? `${fmt(myRankName.toNext, 0)} DUCAT to ${myRankName.next}` : 'Top rank'}>{player?.registered ? myRankName.name : 'Captain'}</small>
            <b>{me?.name ?? 'Unsigned'}</b>
          </div>
          {streak.current >= 2 && <span className={`streak ${streak.current >= 3 ? 'hot' : ''}`} title="Right calls in a row"><Flame /> {streak.current}</span>}
          <div><small>Purse</small><b>{fmt(purse)}<i> DUCAT</i></b></div>
          <div><small>Net worth</small><b>{fmt(worth)}</b><em className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</em></div>
          <div className="rank"><small>Rank</small><b>{myRank ? `#${myRank}` : '—'}</b><i>of {state.players}</i></div>
          <SoundToggle />
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
                  <img className={`tier-${rankFor(r.worth).tier}`} src={captainArt(r.address)} alt="" />
                  <span className="who">{r.address === pair.address ? `${r.name} (you)` : r.name}<small>{rankFor(r.worth).name}</small></span>
                  <span className="val">{fmt(r.worth, 0)}</span>
                </li>
              ))}
              {!state.leaderboard.length && <li className="empty">No captains yet. Be the first.</li>}
            </ol>
          )}
          {crewOpen && tab === 'ledger' && (
            <ul className="ledger">
              {calls.length > 0 && (
                <li className="calls"><span><b>{streak.right}</b> right calls · <b>{streak.wrong}</b> wrong · best run <b>{streak.best}</b></span></li>
              )}
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

        <div className="ticker" aria-live="polite">
          <span className="ticker-count">{traders ? `${traders} captain${traders > 1 ? 's' : ''} trading this round` : 'Quiet harbour this round'}</span>
          {latest.map((t) => {
            const buy = t.from === state.ducat;
            const g = goodOf(buy ? t.to : t.from);
            return (
              <span key={t.hash} className="ticker-item">
                <img src={captainArt(t.address)} alt="" />
                <b>{t.address === pair.address ? 'You' : names.get(t.address) ?? short(t.address)}</b>
                <span className={buy ? 'up' : 'down'}>{buy ? 'bought' : 'sold'}</span> {g?.name}
                <small>{ago(now - t.t)}</small>
              </span>
            );
          })}
        </div>

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
                  <span><b title={g.name}><i className="sym">{g.symbol}</i> {g.name}</b><span className="p">{fmt(p, priceDigits(p))}</span><small className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'}{fmt(Math.abs(ch), 1)}%{held >= 0.005 ? ` · you ${fmt(held, held < 10 ? 2 : 1)}` : ''}</small></span>
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
          <span className="foot-wide">Wallet {short(pair.address)}</span>
          <button className="link" onClick={() => { navigator.clipboard?.writeText(mnemonic); alert('Recovery phrase copied. Keep it somewhere safe.'); }}>Copy recovery phrase</button>
          <span className="foot-wide">{state.mode === 'contract' ? 'News drawn by the Harbour contract' : 'News drawn on-chain'} · live pools on Portaldot V3</span>
          <span>Game prices, not market data</span>
        </footer>
      </div>

      {howto && (
        <div className="scrim" onClick={() => setHowto(false)}>
          <div className="panel onboard" onClick={(e) => e.stopPropagation()}>
            <img className="onboard-face" src="/art/ship.webp" alt="" />
            <h2>How to play</h2>
            <ol className="steps">
              <li><b>Read the news.</b> Each round a ship brings news about one stock.</li>
              <li><b>Trade before it docks.</b> When it lands, its share price jumps or sinks by the posted amount.</li>
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

      {result && <DockResult r={result} captain={me?.name ?? 'Captain'} address={pair.address} rank={myRankName.name} onClose={() => setResult(undefined)} />}
      {promo && (
        <div className="recap promo" role="status">
          <img className={`tier-${myRankName.tier}`} src={captainArt(pair.address)} alt="" />
          <span>Promoted to</span><b>{promo}</b>
        </div>
      )}

      {picked && goodOf(picked.id) && (
        <TradeDrawer good={goodOf(picked.id)!} initialSide={picked.side} state={state} player={player} pair={pair} onClose={() => setPicked(undefined)} onTraded={refresh} />
      )}
      {!MOCK && player && !player.registered && <Onboard address={pair.address} onJoin={join} busy={joining} error={joinError} feeMode={state.feeMode} />}
    </div>
  );
}
