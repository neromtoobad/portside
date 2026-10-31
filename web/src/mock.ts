// Offline harbour for design work (?mock in the URL). Pools are simulated with the same
// constant-product maths as pallet-asset-conversion; nothing here touches a chain.
import type { HarbourState, Player } from './api';

const GOODS = [
  { id: 8801001, symbol: 'COFFEE', name: 'Coffee', basePrice: 12 },
  { id: 8801002, symbol: 'SPICE', name: 'Spice', basePrice: 30 },
  { id: 8801003, symbol: 'SILK', name: 'Silk', basePrice: 55 },
  { id: 8801004, symbol: 'SALT', name: 'Salt', basePrice: 4 },
  { id: 8801005, symbol: 'COPPER', name: 'Copper', basePrice: 20 },
];
const KINDS = [
  ['Storm at sea', 'ships held offshore', 1], ['Shipwreck', 'cargo lost on the reef', 1], ['Guild buyout', 'merchants buying it all up', 1],
  ['Bumper harvest', 'holds full to the brim', -1], ['Glut', 'too many ships in port', -1], ['Calm seas', 'nothing to report', 0],
] as const;
const ROUND = 120_000, DOCK = 30_000;
const UNIT = 1e10;
const hex = () => '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

const pools = Object.fromEntries(GOODS.map((g) => [g.id, { d: 100_000 * UNIT, g: (100_000 / g.basePrice) * UNIT }]));
const history: HarbourState['history'] = Object.fromEntries(GOODS.map((g) => [g.id, [] as { t: number; p: number }[]]));
const me = { DUCAT: 1000, goods: Object.fromEntries(GOODS.map((g) => [g.id, 0])) as Record<number, number> };
const trades: HarbourState['trades'] = [];
const rivals = ['Wren', 'Marlowe', 'Ines Vale', 'Okafor', 'Tamsin', 'Bo Lindqvist', 'Rhea'].map((name, i) => ({ name, address: `5Rival${i}`, worth: 1000 + Math.round(Math.random() * 600 - 150) }));
let roundStart = Date.now() - 20_000, round = 13, event = draw(), docked = false;
const events: any[] = [];

function draw() {
  const k = KINDS[Math.floor(Math.random() * KINDS.length)];
  return { good: Math.floor(Math.random() * 5), kind: KINDS.indexOf(k), title: k[0], line: k[1], dir: k[2], magnitude: k[2] === 0 ? 0 : 5 + Math.floor(Math.random() * 25) };
}
const price = (id: number) => pools[id].d / pools[id].g;
function swap(id: number, ducatIn: boolean, amountIn: number) {
  const p = pools[id];
  const [rin, rout] = ducatIn ? [p.d, p.g] : [p.g, p.d];
  const out = (amountIn * 997 * rout) / (rin * 1000 + amountIn * 997);
  if (ducatIn) { p.d += amountIn; p.g -= out; } else { p.g += amountIn; p.d -= out; }
  return out;
}

function step() {
  const now = Date.now();
  if (now - roundStart > ROUND) {
    events.unshift({ ...event, round, t: roundStart });
    roundStart = now; round += 1; event = draw(); docked = event.dir === 0;
  }
  if (!docked && now - roundStart > DOCK) {
    const id = GOODS[event.good].id, f = 1 + (event.dir * event.magnitude) / 100, s = Math.sqrt(f);
    if (f > 1) swap(id, true, (pools[id].d * (s - 1)) / 0.997); else swap(id, false, (pools[id].g * (1 / s - 1)) / 0.997);
    docked = true;
  }
  for (const g of GOODS) {
    // Rival traders lean toward the base price, like the keeper's mid-round tide.
    const buy = Math.random() < (price(g.id) < g.basePrice ? 0.65 : 0.35);
    if (Math.random() < 0.3) swap(g.id, buy, (Math.random() * 400 + 50) * UNIT * (buy ? 1 : 1 / price(g.id)));
    const h = history[g.id];
    h.push({ t: now, p: price(g.id) });
    if (h.length > 120) h.shift();
  }
  rivals.forEach((r) => { r.worth += Math.round(Math.random() * 30 - 14); });
}
for (let i = 0; i < 60; i++) step();

const myWorth = () => me.DUCAT + GOODS.reduce((s, g) => s + me.goods[g.id] * price(g.id), 0);

export function mockState(address: string): HarbourState {
  step();
  const board = [...rivals, { name: 'You', address, worth: myWorth() }].sort((a, b) => b.worth - a.worth);
  return {
    now: Date.now(), roundSeconds: ROUND / 1000, dockSeconds: DOCK / 1000, ducat: 8801000, goods: GOODS,
    season: 1, roundStartedAt: roundStart, dockAt: roundStart + DOCK,
    event: { ...event, season: 1, round, entropy: hex(), proof: hex(), source: 'contract', docked },
    events: events.slice(0, 10).map((e) => ({ ...e, season: 1, entropy: hex(), proof: hex(), source: 'contract' })),
    prices: Object.fromEntries(GOODS.map((g) => [g.id, { price: price(g.id), ducat: String(Math.round(pools[g.id].d)), goods: String(Math.round(pools[g.id].g)) }])),
    history,
    leaderboard: board.map((r) => ({ ...r, holdings: {} })),
    trades,
    anchors: [{ day: '2026-10-31', root: hex(), proof: hex(), players: 8 }],
    players: board.length,
    mode: 'contract',
  };
}

export function mockPlayer(address: string): Player {
  return {
    registered: true, name: 'You', address, worth: myWorth(), rank: null,
    holdings: { 8801000: me.DUCAT, ...me.goods }, trades: trades.filter((t) => t.address === address),
  };
}

export function mockTrade(address: string, goodId: number, side: 'buy' | 'sell', amount: number) {
  const out = swap(goodId, side === 'buy', amount * UNIT) / UNIT;
  if (side === 'buy') { me.DUCAT -= amount; me.goods[goodId] += out; } else { me.goods[goodId] -= amount; me.DUCAT += out; }
  const hash = hex();
  trades.unshift({ address, hash, block: 265_100 + trades.length, t: Date.now(), from: side === 'buy' ? 8801000 : goodId, to: side === 'buy' ? goodId : 8801000, amountIn: amount, amountOut: out });
  return hash;
}
