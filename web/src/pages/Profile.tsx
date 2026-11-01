import { useEffect, useMemo, useState } from 'react';
import type { HarbourState, Player } from '../api';
import { Link } from '../router';
import { CARGO } from '../art';
import { ago, explorer, fmt, priceDigits, short, STARTING_PURSE, useClock, useHarbour } from '../data';
import { callsFor, rankFor, RANKS, streakOf } from '../progress';
import { BADGES, earnedBadges, missionsFor, rememberBadges } from '../missions';
import { Face, Page } from './Site';

/** Shares held per stock with an average cost, rebuilt from the captain's trades oldest first. */
function positions(state: HarbourState, player: Player) {
  const book = new Map<number, { shares: number; cost: number }>();
  for (const t of [...player.trades].reverse()) {
    const buy = t.from === state.ducat, id = buy ? t.to : t.from;
    const p = book.get(id) ?? { shares: 0, cost: 0 };
    if (buy) { p.shares += t.amountOut; p.cost += t.amountIn; }
    else if (p.shares > 0) { const f = Math.min(1, t.amountIn / p.shares); p.cost *= 1 - f; p.shares = Math.max(0, p.shares - t.amountIn); }
    book.set(id, p);
  }
  return state.goods.map((g) => {
    const held = player.holdings?.[g.id] ?? 0;
    const b = book.get(g.id);
    const avg = b && b.shares > 0.0001 ? b.cost / b.shares : undefined;
    const price = state.prices[g.id]?.price ?? 0;
    const value = held * price;
    const pnl = avg !== undefined ? (price - avg) * held : undefined;
    return { g, held, avg, price, value, pnl };
  });
}

function WorthChart({ points }: { points: { t: number; w: number }[] }) {
  if (points.length < 2) return <div className="chart empty">Your net worth chart fills in as you play.</div>;
  const W = 640, H = 180;
  const ws = points.map((p) => p.w).concat(STARTING_PURSE);
  const lo = Math.min(...ws) * 0.995, hi = Math.max(...ws) * 1.005;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (w: number) => H - ((w - lo) / (hi - lo || 1)) * (H - 20) - 10;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`).join(' ');
  const up = points[points.length - 1].w >= STARTING_PURSE;
  const c = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg className="worth-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Net worth over time">
      <line x1="0" x2={W} y1={y(STARTING_PURSE)} y2={y(STARTING_PURSE)} className="baseline" />
      <path d={`${d} L${W} ${H} L0 ${H}Z`} fill={c} opacity="0.1" />
      <path d={d} fill="none" stroke={c} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export default function Profile({ address }: { address?: string }) {
  const { me } = useHarbour();
  const who = address ?? me?.pair.address;
  const mine = !!me && who === me.pair.address;
  const { state, player } = useHarbour(who, 5000);
  const now = useClock(15_000);
  const [badges, setBadges] = useState<Set<string>>(new Set());

  const calls = useMemo(() => (state && player ? callsFor(state, player.trades) : []), [state, player]);
  const streak = streakOf(calls);
  useEffect(() => {
    if (!state || !player || !who) return;
    const earned = earnedBadges(state, player);
    setBadges(mine ? rememberBadges(who, earned).all : earned);
  }, [state, player, who, mine]);

  if (!state || !who) return <Page state={state}><div className="wrap loading-page">Loading the harbour office…</div></Page>;
  if (player && !player.registered) {
    return (
      <Page state={state}>
        <div className="wrap empty-page panel card">
          <Face address={who} size={96} />
          <h1>{mine ? 'You haven’t signed the register yet' : 'No captain at this address'}</h1>
          <p className="lede">{mine ? 'Open the harbour, pick a name, and your portfolio starts here.' : short(who)}</p>
          <Link to="/play" className="btn go big">{mine ? 'Open the harbour' : 'Play Portside'}</Link>
        </div>
      </Page>
    );
  }
  if (!player) return <Page state={state}><div className="wrap loading-page">Loading captain…</div></Page>;

  const worth = player.worth ?? 0;
  const pnl = worth - STARTING_PURSE;
  const rank = rankFor(worth);
  const rows = positions(state, player);
  const purse = player.holdings?.[state.ducat] ?? 0;
  const missions = mine ? missionsFor(state, player) : [];
  const goodOf = (id: number) => state.goods.find((g) => g.id === id);

  return (
    <Page state={state} className="profile">
      <header className="page-head profile-head">
        <div className="wrap profile-top">
          <Face address={who} tier={rank.tier} size={112} />
          <div className="who">
            <span className="eyebrow">{mine ? 'Your portfolio' : 'Captain'}</span>
            <h1>{player.name}</h1>
            <p className="lede">{rank.name}{player.rank ? ` · #${player.rank} of ${state.players}` : ''}{player.joinedAt ? ` · joined ${ago(now - player.joinedAt)} ago` : ''}</p>
            {rank.next && <div className="next-rank"><div className="track"><span style={{ width: `${Math.max(4, Math.min(100, ((worth - RANKS[rank.tier].min) / (RANKS[rank.tier + 1].min - RANKS[rank.tier].min)) * 100))}%` }} /></div><small>{fmt(rank.toNext, 0)} DUCAT to {rank.next}</small></div>}
          </div>
          <div className="stat-row">
            <div><small>Net worth</small><b>{fmt(worth)}</b><em className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</em></div>
            <div><small>Purse</small><b>{fmt(purse)}</b><em>DUCAT</em></div>
            <div><small>Right calls</small><b>{streak.right}</b><em>{streak.wrong} wrong</em></div>
            <div><small>Best streak</small><b>{streak.best}</b><em>now {streak.current}</em></div>
          </div>
        </div>
      </header>

      <div className="wrap profile-grid">
        <section className="panel card wide">
          <h2>Net worth</h2>
          <WorthChart points={player.worthHistory ?? []} />
        </section>

        <section className="panel card wide">
          <h2>Holdings</h2>
          <table className="table">
            <thead><tr><th>Stock</th><th className="num">Shares</th><th className="num">Avg cost</th><th className="num">Price</th><th className="num">Value</th><th className="num">P&amp;L</th></tr></thead>
            <tbody>
              {rows.map(({ g, held, avg, price, value, pnl: p }) => (
                <tr key={g.id} className={held < 0.005 ? 'faint' : ''}>
                  <td><span className="stock-cell"><img src={CARGO[g.symbol]} alt="" /><b className="sym">{g.symbol}</b>{g.name}</span></td>
                  <td className="num">{fmt(held, 3)}</td>
                  <td className="num">{avg !== undefined && held >= 0.005 ? fmt(avg, priceDigits(avg)) : '–'}</td>
                  <td className="num">{fmt(price, priceDigits(price))}</td>
                  <td className="num"><b>{fmt(value)}</b></td>
                  <td className={`num ${p === undefined || held < 0.005 ? '' : p >= 0 ? 'up' : 'down'}`}>{p === undefined || held < 0.005 ? '–' : `${p >= 0 ? '+' : ''}${fmt(p)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mine && <Link to="/play" className="btn go">Trade in the harbour</Link>}
        </section>

        {mine && (
          <section className="panel card">
            <h2>Today’s missions</h2>
            <ul className="missions">
              {missions.map((m) => (
                <li key={m.id} className={m.done ? 'done' : ''}>
                  <span className="tick">{m.done ? '✓' : `${m.progress}/${m.goal}`}</span>
                  <div><b>{m.title}</b><small>{m.detail}</small><div className="track"><span style={{ width: `${(m.progress / m.goal) * 100}%` }} /></div></div>
                </li>
              ))}
            </ul>
            <p className="muted">New missions at midnight UTC.</p>
          </section>
        )}

        <section className={`panel card ${mine ? '' : 'wide'}`}>
          <h2>Badges <small>{badges.size} of {BADGES.length}</small></h2>
          <div className="badge-grid">
            {BADGES.map((b) => (
              <div key={b.id} className={`medal tone-${b.tone} ${badges.has(b.id) ? '' : 'locked'}`} title={b.how}>
                <span><img src={b.icon} alt="" /></span><b>{b.name}</b><small>{b.how}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel card wide">
          <h2>Recent trades</h2>
          <ul className="trade-list">
            {player.trades.slice(0, 25).map((t) => {
              const buy = t.from === state.ducat, g = goodOf(buy ? t.to : t.from);
              return (
                <li key={t.hash}>
                  <img src={CARGO[g?.symbol ?? '']} alt="" />
                  <span><b className={buy ? 'up' : 'down'}>{buy ? 'Bought' : 'Sold'}</b> {buy ? fmt(t.amountOut, 3) : fmt(t.amountIn, 3)} {g?.symbol}</span>
                  <span className="muted">{buy ? `for ${fmt(t.amountIn)}` : `for ${fmt(t.amountOut)}`} DUCAT</span>
                  <span className="muted">{ago(now - t.t)} ago</span>
                  <a href={explorer(t.hash)} target="_blank" rel="noreferrer">#{t.block}</a>
                </li>
              );
            })}
            {!player.trades.length && <li className="empty">No trades yet.</li>}
          </ul>
        </section>
      </div>
    </Page>
  );
}
