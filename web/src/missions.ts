// Daily missions and the season's badge cabinet. Both are read from the captain's own trades and
// calls, so they need nothing new on-chain. Badges a captain has earned are also remembered in this
// browser, because the harbour office only keeps their most recent trades.
import type { HarbourState, Player } from './api';
import { callsFor, rankFor, streakOf, type Call } from './progress';

export interface Mission { id: string; title: string; detail: string; progress: number; goal: number; done: boolean }

const dayStart = (now = Date.now()) => Date.parse(new Date(now).toISOString().slice(0, 10));
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

interface Ctx { state: HarbourState; player: Player; calls: Call[] }

const POOL: { id: string; title: string; detail: string; goal: number; count: (c: Ctx, since: number) => number }[] = [
  { id: 'calls', title: 'Make 2 right calls', detail: 'Trade the news stock the right way before its ship docks.', goal: 2,
    count: ({ calls }, since) => calls.filter((c) => c.verdict === 'right' && (c.event as { t?: number }).t! >= since).length },
  { id: 'spread', title: 'Trade 3 different stocks', detail: 'Spread your bets across the piers.', goal: 3,
    count: ({ state, player }, since) => new Set(player.trades.filter((t) => t.t >= since).map((t) => (t.from === state.ducat ? t.to : t.from))).size },
  { id: 'dodge', title: 'Sell before a fall', detail: 'Get out of a stock before bad news docks.', goal: 1,
    count: ({ calls }, since) => calls.filter((c) => c.verdict === 'right' && c.event.dir < 0 && (c.event as { t?: number }).t! >= since).length },
  { id: 'ride', title: 'Buy before a rise', detail: 'Get in before good news docks.', goal: 1,
    count: ({ calls }, since) => calls.filter((c) => c.verdict === 'right' && c.event.dir > 0 && (c.event as { t?: number }).t! >= since).length },
  { id: 'rounds', title: 'Trade in 4 different rounds', detail: 'Come back to the harbour through the day.', goal: 4,
    count: ({ state, player }, since) => {
      const starts = state.events.map((e) => e.t ?? 0).concat(state.roundStartedAt).sort((a, b) => a - b);
      return new Set(player.trades.filter((t) => t.t >= since).map((t) => starts.filter((s) => s <= t.t).pop())).size;
    } },
  { id: 'rumour', title: 'Buy a rumour', detail: 'Hear the next ship a minute before the board.', goal: 1,
    count: ({ player }) => player.rumour?.boughtToday ?? 0 },
  { id: 'big', title: 'Make a 200 DUCAT trade', detail: 'One trade worth 200 DUCAT or more.', goal: 1,
    count: ({ state, player }, since) => player.trades.filter((t) => t.t >= since && (t.from === state.ducat ? t.amountIn : t.amountOut) >= 200).length },
];

/** Three missions a day, the same for every captain, picked from the date. */
export function missionsFor(state: HarbourState, player: Player, now = Date.now()): Mission[] {
  const key = dayKey(now);
  let h = 0;
  for (const ch of key) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const rand = (i: number) => { let x = (h + i * 0x9e3779b9) >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % 10_007; };
  const unique = POOL.map((m, i) => ({ m, k: rand(i + 1) })).sort((a, b) => a.k - b.k).slice(0, 3).map((x) => x.m);
  const ctx = { state, player, calls: callsFor(state, player.trades) };
  return unique.map((m) => {
    const progress = Math.min(m.goal, m.count(ctx, dayStart(now)));
    return { id: m.id, title: m.title, detail: m.detail, progress, goal: m.goal, done: progress >= m.goal };
  });
}

export interface Badge { id: string; name: string; how: string; icon: string; tone: 'gold' | 'sea' | 'fire' | 'ink' }
export const BADGES: Badge[] = [
  { id: 'first', name: 'First trade', how: 'Make your first trade.', icon: '/art/ship.webp', tone: 'sea' },
  { id: 'sharp', name: 'Sharp eye', how: 'Make your first right call.', icon: '/art/trophy.webp', tone: 'gold' },
  { id: 'hot', name: 'Hot streak', how: 'Three right calls in a row.', icon: '/art/rocket.webp', tone: 'fire' },
  { id: 'fire', name: 'On fire', how: 'Five right calls in a row.', icon: '/art/rocket.webp', tone: 'fire' },
  { id: 'dodger', name: 'Storm dodger', how: 'Sell a stock before bad news docks.', icon: '/art/cloud.webp', tone: 'ink' },
  { id: 'whale', name: 'Whale', how: 'Make one trade worth 250 DUCAT.', icon: '/art/guild.webp', tone: 'gold' },
  { id: 'fleet', name: 'Full fleet', how: 'Hold all five stocks at once.', icon: '/art/parcels.webp', tone: 'sea' },
  { id: 'insider', name: 'Insider', how: 'Hear a rumour before the board.', icon: '/art/headset.webp', tone: 'ink' },
  { id: 'navigator', name: 'Navigator', how: 'Reach 1,100 DUCAT net worth.', icon: '/art/chips.webp', tone: 'sea' },
  { id: 'captain', name: 'Captain', how: 'Reach 1,250 DUCAT net worth.', icon: '/art/car.webp', tone: 'gold' },
  { id: 'admiral', name: 'Admiral', how: 'Reach 2,000 DUCAT net worth.', icon: '/art/sun.webp', tone: 'gold' },
  { id: 'shipshape', name: 'Shipshape', how: "Finish all three of a day's missions.", icon: '/art/phones.webp', tone: 'sea' },
];

export function earnedBadges(state: HarbourState, player: Player): Set<string> {
  const got = new Set<string>();
  if (!player.registered) return got;
  const calls = callsFor(state, player.trades);
  const s = streakOf(calls);
  const tier = rankFor(player.worth ?? 0).tier;
  if (player.trades.length) got.add('first');
  if (s.right) got.add('sharp');
  if (s.best >= 3) got.add('hot');
  if (s.best >= 5) got.add('fire');
  if (calls.some((c) => c.verdict === 'right' && c.event.dir < 0)) got.add('dodger');
  if (player.trades.some((t) => (t.from === state.ducat ? t.amountIn : t.amountOut) >= 250)) got.add('whale');
  if (state.goods.every((g) => (player.holdings?.[g.id] ?? 0) >= 0.005)) got.add('fleet');
  if (player.rumour?.heard || (player.rumour?.boughtToday ?? 0) > 0) got.add('insider');
  if (tier >= 2) got.add('navigator');
  if (tier >= 3) got.add('captain');
  if (tier >= 5) got.add('admiral');
  if (missionsFor(state, player).every((m) => m.done)) got.add('shipshape');
  return got;
}

/** Earned badges never un-earn: union with what this browser has seen before. */
export function rememberBadges(address: string, now: Set<string>) {
  const key = `portside:badges:${address}`;
  let before: string[] = [], first = true;
  try { const raw = localStorage.getItem(key); first = raw === null; before = JSON.parse(raw ?? '[]'); } catch { /* private mode */ }
  const all = new Set([...before, ...now]);
  try { localStorage.setItem(key, JSON.stringify([...all])); } catch { /* private mode */ }
  return { all, fresh: [...now].filter((b) => !before.includes(b)), first };
}
