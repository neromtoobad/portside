import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyringPair } from '@polkadot/keyring/types';
import { getState, getPlayer, register, type HarbourState, type Player, type Good } from './api';
import { loadWallet, trade, quote, toUnits, fromUnits } from './chain';
import { mockState, mockPlayer, mockTrade } from './mock';
import { Board } from './Board';
import { Flag } from './Flags';

const MOCK = new URLSearchParams(location.search).has('mock');
const EXPLORER = import.meta.env.VITE_EXPLORER ?? 'https://node-console.portaldot.dev/#/explorer/query/';
const explorer = (hash: string) => `${EXPLORER}${hash}`;
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const short = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;

function useClock(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

function Spark({ points, up }: { points: { p: number }[]; up: boolean }) {
  if (points.length < 2) return <svg className="spark" />;
  const ps = points.slice(-60).map((x) => x.p);
  const lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const d = ps.map((p, i) => `${i ? 'L' : 'M'}${(i / (ps.length - 1)) * 120} ${30 - ((p - lo) / span) * 26 - 2}`).join(' ');
  return <svg className="spark" viewBox="0 0 120 30" preserveAspectRatio="none"><path d={d} className={up ? 'up' : 'down'} /></svg>;
}

/** Circular tide gauge: fills as the round runs, marks when the ship docks. */
function Tide({ start, seconds, dockAt, now }: { start: number; seconds: number; dockAt: number; now: number }) {
  const frac = Math.min(1, Math.max(0, (now - start) / (seconds * 1000)));
  const dockFrac = (dockAt - start) / (seconds * 1000);
  const left = Math.max(0, Math.ceil((start + seconds * 1000 - now) / 1000));
  const r = 19, c = 2 * Math.PI * r;
  const a = dockFrac * 2 * Math.PI - Math.PI / 2;
  return (
    <div className="tide" title="Time left in this round">
      <svg viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r={r} className="tide-track" />
        <circle cx="24" cy="24" r={r} className="tide-fill" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 24 24)" />
        <circle cx={24 + r * Math.cos(a)} cy={24 + r * Math.sin(a)} r="3" className="tide-dock" />
      </svg>
      <div><small>Tide turns in</small><b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b></div>
    </div>
  );
}

function Onboard({ onJoin, busy, error }: { onJoin: (name: string) => void; busy: boolean; error?: string }) {
  const [name, setName] = useState('');
  return (
    <div className="scrim">
      <form className="card onboard" onSubmit={(e) => { e.preventDefault(); onJoin(name); }}>
        <div className="hoist"><Flag symbol="COFFEE" size={28} /><Flag symbol="SPICE" size={28} /><Flag symbol="SILK" size={28} /><Flag symbol="SALT" size={28} /><Flag symbol="COPPER" size={28} /></div>
        <h2>Sign the harbour register</h2>
        <p>You get a warehouse, <b>1,000 DUCAT</b> and a wallet that lives in this browser. Every trade is a real swap on Portaldot's DEX, and fees are paid in DUCAT.</p>
        <label>Captain's name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="e.g. Marlowe" autoFocus /></label>
        <button className="btn primary" disabled={busy}>{busy ? 'Opening your warehouse…' : 'Open my warehouse'}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'done'; hash: string } | { kind: 'error'; text: string };

function TradeDrawer({ good, state, player, pair, onClose, onTraded }: {
  good: Good; state: HarbourState; player?: Player; pair: KeyringPair; onClose: () => void; onTraded: () => void;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
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

  async function submit() {
    if (n <= 0 || n > max) return;
    setStatus({ kind: 'busy', text: 'Signing in your browser…' });
    try {
      const hash = MOCK
        ? mockTrade(pair.address, good.id, side, n)
        : await trade(pair, state.ducat, good.id, side, toUnits(n), toUnits(out * 0.97));
      setStatus({ kind: 'done', hash });
      setAmount('');
      onTraded();
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message.replace(/^.*?: /, '') });
    }
  }

  const chips = side === 'buy' ? [50, 100, 250] : [0.25, 0.5, 1].map((f) => +(held * f).toFixed(4));
  return (
    <aside className="drawer card">
      <header>
        <Flag symbol={good.symbol} size={40} waving />
        <div><h3>{good.name}</h3><span className="muted">{fmt(pool?.price ?? 0, 3)} DUCAT each</span></div>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="seg">
        <button className={side === 'buy' ? 'on' : ''} onClick={() => { setSide('buy'); setAmount(''); }}>Buy</button>
        <button className={side === 'sell' ? 'on' : ''} onClick={() => { setSide('sell'); setAmount(''); }}>Sell</button>
      </div>
      <label className="amount">
        <span>{side === 'buy' ? 'Spend DUCAT' : `Sell ${good.name}`}</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
      </label>
      <div className="chips">
        {chips.map((c, i) => <button key={i} onClick={() => setAmount(String(Math.min(c, max)))} disabled={max <= 0}>{side === 'buy' ? c : ['¼', '½', 'All'][i]}</button>)}
        <span className="muted">{side === 'buy' ? `purse ${fmt(purse)}` : `held ${fmt(held, 3)}`}</span>
      </div>
      <dl className="quote">
        <div><dt>You get about</dt><dd>{fmt(out, side === 'buy' ? 3 : 2)} {side === 'buy' ? good.symbol : 'DUCAT'}</dd></div>
        <div><dt>Price impact</dt><dd className={impact > 3 ? 'warn' : ''}>{fmt(impact, 2)}%</dd></div>
        <div><dt>Network fee</dt><dd>paid in DUCAT</dd></div>
      </dl>
      <button className="btn primary wide" disabled={n <= 0 || n > max || status.kind === 'busy'} onClick={submit}>
        {status.kind === 'busy' ? status.text : `${side === 'buy' ? 'Buy' : 'Sell'} ${good.name}`}
      </button>
      {status.kind === 'done' && <a className="ok" href={explorer(status.hash)} target="_blank" rel="noreferrer">Sent to Portaldot · {status.hash.slice(0, 12)}…</a>}
      {status.kind === 'error' && <p className="error">{status.text}</p>}
    </aside>
  );
}

export default function App() {
  const now = useClock();
  const [pair, setPair] = useState<KeyringPair>();
  const [mnemonic, setMnemonic] = useState('');
  const [state, setState] = useState<HarbourState>();
  const [player, setPlayer] = useState<Player>();
  const [offline, setOffline] = useState('');
  const [selected, setSelected] = useState<number>();
  const [tab, setTab] = useState<'board' | 'ledger' | 'log'>('board');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string>();

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
    return <div className="loading"><Flag symbol="SPICE" size={40} waving /><p>{offline || 'Raising the flags…'}</p></div>;
  }

  const goodOf = (id: number) => state.goods.find((g) => g.id === id);
  const evGood = state.event ? state.goods[state.event.good] : undefined;
  const roundOpen = state.history; // eslint-friendly alias
  const changeOf = (g: Good) => {
    const h = roundOpen[g.id] ?? [];
    const start = h.find((x) => x.t >= state.roundStartedAt)?.p ?? h[0]?.p;
    const p = state.prices[g.id]?.price ?? 0;
    return start ? (p / start - 1) * 100 : 0;
  };
  const worth = player?.worth ?? 0;
  const purse = player?.holdings?.[state.ducat] ?? 0;
  const pnl = worth ? worth - 1000 : 0;
  const myRank = state.leaderboard.findIndex((r) => r.address === pair.address) + 1;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mast" aria-hidden><Flag symbol="SILK" size={18} /><Flag symbol="SPICE" size={18} /></span>
          <h1>Portside</h1>
          <span className="tag">Season {state.season} · on Portaldot V3</span>
        </div>
        <Tide start={state.roundStartedAt} seconds={state.roundSeconds} dockAt={state.dockAt} now={now} />
        <div className="purse">
          <div><small>Purse</small><b>{fmt(purse)} <i>DUCAT</i></b></div>
          <div><small>Net worth</small><b>{fmt(worth)}</b><em className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</em></div>
          <div><small>Rank</small><b>{myRank ? `#${myRank}` : '—'}<i> of {state.players}</i></b></div>
        </div>
      </header>

      {offline && <div className="banner">Harbour office unreachable: {offline}. Retrying…</div>}

      <Board event={state.event} goodName={evGood?.name ?? ''} dockIn={state.dockAt - now} explorer={explorer} />

      <main className="grid">
        <section className="card market">
          <div className="card-head"><h2>Market</h2><span className="muted">Prices are live pools on Portaldot's DEX</span></div>
          <div className="rows">
            {state.goods.map((g) => {
              const p = state.prices[g.id]?.price ?? 0;
              const ch = changeOf(g);
              const held = player?.holdings?.[g.id] ?? 0;
              const news = state.event && state.goods[state.event.good]?.id === g.id && state.event.dir !== 0;
              return (
                <button key={g.id} className={`row ${selected === g.id ? 'sel' : ''} ${news ? 'news' : ''}`} onClick={() => setSelected(g.id)}>
                  <Flag symbol={g.symbol} waving={news} />
                  <span className="name"><b>{g.name}</b><small>{g.symbol}</small></span>
                  <Spark points={state.history[g.id] ?? []} up={ch >= 0} />
                  <span className="price"><b>{fmt(p, 3)}</b><small className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'} {fmt(Math.abs(ch), 1)}%</small></span>
                  <span className="held"><small>You hold</small><b>{held ? fmt(held, 2) : '—'}</b></span>
                  <span className="go">Trade</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card side">
          <div className="tabs">
            {(['board', 'ledger', 'log'] as const).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ board: 'Captains', ledger: 'My ledger', log: 'Harbour log' }[t]}</button>
            ))}
          </div>
          {tab === 'board' && (
            <ol className="leaders">
              {state.leaderboard.slice(0, 12).map((r, i) => (
                <li key={r.address} className={r.address === pair.address ? 'me' : ''}>
                  <span className="pos">{i + 1}</span><span className="who">{r.name}</span><span className="val">{fmt(r.worth)}</span>
                </li>
              ))}
              {!state.leaderboard.length && <li className="muted">No captains yet. Be the first.</li>}
            </ol>
          )}
          {tab === 'ledger' && (
            <ul className="ledger">
              {(player?.trades ?? []).map((t) => (
                <li key={t.hash}>
                  <span>{t.from === state.ducat ? 'Bought' : 'Sold'} <b>{goodOf(t.from === state.ducat ? t.to : t.from)?.name}</b></span>
                  <span className="muted">{t.from === state.ducat ? `${fmt(t.amountIn)} → ${fmt(t.amountOut, 3)}` : `${fmt(t.amountIn, 3)} → ${fmt(t.amountOut)}`}</span>
                  <a href={explorer(t.hash)} target="_blank" rel="noreferrer">#{t.block}</a>
                </li>
              ))}
              {!player?.trades?.length && <li className="muted">Your trades land here with their block on Portaldot.</li>}
            </ul>
          )}
          {tab === 'log' && (
            <ul className="ledger">
              {state.events.map((e) => (
                <li key={e.proof}>
                  <span>R{e.round} <b>{e.title}</b></span>
                  <span className={e.dir > 0 ? 'up' : e.dir < 0 ? 'down' : 'muted'}>{state.goods[e.good]?.name} {e.dir ? `${e.dir > 0 ? '+' : '−'}${e.magnitude}%` : ''}</span>
                  <a href={explorer(e.proof)} target="_blank" rel="noreferrer">proof</a>
                </li>
              ))}
              {state.anchors.map((a) => (
                <li key={a.root}><span>Day {a.day} standings anchored</span><span className="muted">{a.players} captains</span><a href={explorer(a.proof)} target="_blank" rel="noreferrer">root</a></li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="foot">
        <span>Wallet {short(pair.address)}</span>
        <button className="link" onClick={() => { navigator.clipboard?.writeText(mnemonic); alert('Recovery phrase copied. Keep it somewhere safe.'); }}>Copy recovery phrase</button>
        <span>Events {state.mode === 'contract' ? 'drawn by the Harbour contract (EVM)' : 'drawn with on-chain commit-reveal'} · goods & pools are native Portaldot assets</span>
      </footer>

      {selected !== undefined && goodOf(selected) && (
        <TradeDrawer good={goodOf(selected)!} state={state} player={player} pair={pair} onClose={() => setSelected(undefined)} onTraded={refresh} />
      )}
      {!MOCK && player && !player.registered && <Onboard onJoin={join} busy={joining} error={joinError} />}
    </div>
  );
}
