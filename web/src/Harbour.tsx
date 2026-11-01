import { useEffect, useRef, useState } from 'react';
import type { HarbourState, Player } from './api';
import { PIERS, horizonFor, KIND_ART, captainArt } from './art';
import { Flag } from './Flags';

const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Per-good change since the round opened, so the bubbles show what this round's news did. */
export function roundChange(state: HarbourState, id: number) {
  const h = state.history[id] ?? [];
  const start = h.find((x) => x.t >= state.roundStartedAt)?.p ?? h[0]?.p;
  const p = state.prices[id]?.price ?? 0;
  return start ? (p / start - 1) * 100 : 0;
}

/**
 * The harbour itself. Each good has a pier with its signal flag and a live price bubble; the round's
 * news arrives as a ship that sails in from the horizon and moors at that good's pier when it docks.
 */
/** Someone's trade, shown for a few seconds as their face rising off the pier. */
export interface Pop { key: string; good: number; address: string; name: string; side: 'buy' | 'sell' }

export function Harbour({ state, player, now, onPick, crowd, pops }: {
  state: HarbourState; player?: Player; now: number; onPick: (id: number) => void;
  /** Captains who traded each good this round, by good index. */
  crowd: { address: string; name: string }[][];
  pops: Pop[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ev = state.event;
  const target = ev ? ev.good : -1;
  const calm = !ev || ev.dir === 0;

  // Splash and a floating "+9%" the moment the ship docks.
  const [splash, setSplash] = useState<number>();
  const was = useRef<{ round?: number; docked?: boolean }>({});
  useEffect(() => {
    if (!ev) return;
    const prev = was.current;
    if (prev.round === ev.round && !prev.docked && ev.docked && ev.dir !== 0) {
      setSplash(ev.round);
      setTimeout(() => setSplash(undefined), 2600);
    }
    was.current = { round: ev.round, docked: ev.docked };
  }, [ev?.round, ev?.docked]);

  // On narrow screens the harbour scrolls sideways; bring the news pier into view each round.
  useEffect(() => {
    const el = wrap.current;
    if (!el || el.scrollWidth <= el.clientWidth || target < 0) return;
    const x = (PIERS[target].cargo[0] / 100) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTo({ left: x, behavior: 'smooth' });
  }, [ev?.round, target]);

  const span = Math.max(1, state.dockAt - state.roundStartedAt);
  const t = ev?.docked ? 1 : Math.min(1, Math.max(0, (now - state.roundStartedAt) / span));
  const pier = target >= 0 ? PIERS[target] : undefined;
  const from = pier ? horizonFor(pier.berth) : undefined;
  const ship = pier && from && !calm ? [lerp(from[0], pier.berth[0], ease(t)), lerp(from[1], pier.berth[1], ease(t))] : undefined;
  const moored = !!ev?.docked;
  const left = Math.ceil((state.dockAt - now) / 1000);
  const final = ship && !moored && left > 0 && left <= 10 ? left : undefined;

  return (
    <div className="harbour" ref={wrap}>
      <div className={`stage ${splash !== undefined ? 'is-shaking' : ''}`}>
        <img className="scene" src="/art/scene.webp" srcSet="/art/scene-1600.webp 1600w, /art/scene.webp 2688w" sizes="(max-width: 760px) 1100px, 100vw" alt="" draggable={false} />

        <img className="drifter d1" src="/art/ship.webp" alt="" />
        <img className="drifter d2" src="/art/ship.webp" alt="" />
        {calm && ev && <img className="sun" src="/art/sun.webp" alt="" />}

        {state.goods.map((g, i) => {
          const pr = PIERS[i];
          const price = state.prices[g.id]?.price ?? 0;
          const ch = roundChange(state, g.id);
          const held = player?.holdings?.[g.id] ?? 0;
          const news = i === target && !calm;
          return (
            <div key={g.id}>
              <span className="pier-flag" style={{ left: `${pr.pole[0]}%`, top: `${pr.pole[1]}%` }}><Flag symbol={g.symbol} size={30} waving /></span>
              <button
                className={`bubble ${news ? 'is-news' : ''} ${ch >= 0 ? 'is-up' : 'is-down'} ${splash !== undefined && news ? 'is-pop' : ''}`}
                style={{ left: `${pr.cargo[0]}%`, top: `${pr.cargo[1]}%` }}
                onClick={() => onPick(g.id)}
                aria-label={`Trade ${g.name}`}
              >
                <small>{g.symbol}</small>
                <b>{fmt(price, price < 10 ? 3 : 2)}</b>
                <i>{ch >= 0 ? '▲' : '▼'}{fmt(Math.abs(ch), 1)}%</i>
                {held >= 0.005 && <em>you {fmt(held, held < 10 ? 2 : 1)}</em>}
              </button>
              {crowd[i]?.length > 0 && (
                <span className="crowd" style={{ left: `${pr.cargo[0] + 3.4}%`, top: `${pr.cargo[1] - 1}%` }} title={crowd[i].map((c) => c.name).join(', ')}>
                  {crowd[i].slice(0, 3).map((c) => <img key={c.address} src={captainArt(c.address)} alt={c.name} />)}
                  {crowd[i].length > 3 && <b>+{crowd[i].length - 3}</b>}
                </span>
              )}
              {pops.filter((p) => p.good === i).map((p, j) => (
                <span key={p.key} className={`trade-pop ${p.side}`} style={{ left: `${pr.cargo[0] - 1 + j * 2}%`, top: `${pr.cargo[1] - 8}%` }}>
                  <img src={captainArt(p.address)} alt="" />
                  <span><b>{p.name}</b> {p.side === 'buy' ? 'bought' : 'sold'}</span>
                </span>
              ))}
              {splash !== undefined && news && ev && (
                <span className={`jump ${ev.dir > 0 ? 'is-up' : 'is-down'}`} style={{ left: `${pr.berth[0]}%`, top: `${pr.berth[1] - 6}%` }}>
                  {ev.dir > 0 ? '+' : '−'}{ev.magnitude}%
                </span>
              )}
            </div>
          );
        })}

        {ship && ev && (
          <>
            {ev.kind === 4 && [[-6, -5], [5, -9]].map(([dx, dy], i) => (
              <img key={i} className="ship escort" src="/art/ship.webp" alt="" style={{ left: `${ship[0] - dx * (1 - t * 0.6)}%`, top: `${ship[1] + dy * (1 - t * 0.5)}%` }} />
            ))}
            <div className={`ship-wrap ${moored ? 'moored' : 'sailing'}`} style={{ left: `${ship[0]}%`, top: `${ship[1]}%`, ['--s' as string]: 0.72 + 0.28 * ease(t) }}>
              <img className="ship" src="/art/ship.webp" alt={`Ship bringing news about ${state.goods[target]?.name}`} />
              {[0, 2, 3].includes(ev.kind) && <img className={`omen k${ev.kind}`} src={KIND_ART[ev.kind]} alt="" />}
              {final !== undefined && <span key={final} className={`count ${final <= 3 ? 'is-urgent' : ''}`}>{final}</span>}
            </div>
            {ev.kind === 1 && <img className="debris" src={KIND_ART[1]} alt="" style={{ left: `${pier!.berth[0] + 6}%`, top: `${pier!.berth[1] - 12}%` }} />}
            {splash !== undefined && <span className="splash" style={{ left: `${pier!.berth[0]}%`, top: `${pier!.berth[1]}%` }} />}
          </>
        )}
      </div>
    </div>
  );
}
