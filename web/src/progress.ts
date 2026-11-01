// Captain ranks and the "called it" streak. Both are read from data the harbour already serves:
// net worth from the leaderboard, and calls from the player's trades against each round's news.
import type { HarbourEvent, HarbourState, Trade } from './api';

export const RANKS = [
  { name: 'Deckhand', min: 0 },
  { name: 'Mate', min: 1000 },
  { name: 'Navigator', min: 1100 },
  { name: 'Captain', min: 1250 },
  { name: 'Commodore', min: 1500 },
  { name: 'Admiral', min: 2000 },
];

export function rankFor(worth: number) {
  let i = 0;
  while (i + 1 < RANKS.length && worth >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1];
  return { tier: i, name: RANKS[i].name, next: next?.name, toNext: next ? next.min - worth : 0 };
}

export type Verdict = 'right' | 'wrong';
export interface Call { season: number; round: number; good: number; verdict: Verdict; event: HarbourEvent }

/** Trades are stamped when the keeper indexes their block, a few seconds after signing. */
const INDEX_GRACE = 3000;

/**
 * A call is a trade in the news good between the news landing and the ship docking: buying before
 * good news or selling before bad news is right, the opposite is wrong. Rounds you sit out don't count.
 */
export function callsFor(state: HarbourState, trades: Trade[]): Call[] {
  const all = new Map<string, HarbourEvent & { t?: number }>();
  for (const e of state.events) all.set(`${e.season}:${e.round}`, e);
  if (state.event) all.set(`${state.event.season}:${state.event.round}`, { ...state.event, t: state.roundStartedAt });
  const out: Call[] = [];
  for (const e of [...all.values()].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))) {
    if (e.dir === 0 || e.t === undefined) continue;
    const isCurrent = state.event && e.season === state.event.season && e.round === state.event.round;
    if (isCurrent && !state.event!.docked) continue;
    const id = state.goods[e.good]?.id;
    const dock = e.t + state.dockSeconds * 1000 + INDEX_GRACE;
    const mine = trades.filter((t) => t.t >= e.t! && t.t < dock && (t.to === id || t.from === id));
    if (!mine.length) continue;
    const right = mine.some((t) => (e.dir > 0 ? t.to === id : t.from === id));
    out.push({ season: e.season, round: e.round, good: e.good, verdict: right ? 'right' : 'wrong', event: e });
  }
  return out;
}

export function streakOf(calls: Call[]) {
  let current = 0, best = 0, run = 0;
  for (const c of calls) { run = c.verdict === 'right' ? run + 1 : 0; best = Math.max(best, run); }
  for (let i = calls.length - 1; i >= 0 && calls[i].verdict === 'right'; i--) current++;
  return { current, best, right: calls.filter((c) => c.verdict === 'right').length, wrong: calls.filter((c) => c.verdict === 'wrong').length };
}
