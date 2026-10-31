// Portside keeper: runs the harbour clock, moves markets on events, tops up new players,
// indexes their trades, and serves the game API (plus the built web app) from one process.
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { decodeAddress } from '@polkadot/util-crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { connect, keeperPair, send, DUCAT, GOODS, POT, UNIT, toUnits, fromUnits, CHAIN_WS, ON_FORK } from './chain.js';
import { allPrices, pushPrice, netWorths } from './market.js';
import { EventDrawer, describe, type HarbourEvent } from './events.js';

const ROUND_SECONDS = Number(process.env.ROUND_SECONDS ?? 600);
const DOCK_SECONDS = Number(process.env.DOCK_SECONDS ?? 45);
const STARTER_DUCAT = Number(process.env.STARTER_DUCAT ?? 1000);
/** Existential deposit (0.1) plus room for a few native fees, in tPOT hundredths. */
/**
 * How players pay network fees. 'ducat' uses ChargeAssetTxPayment so a player never holds gas;
 * 'native' is the fallback: the harbour keeps every player's tPOT tank topped up instead.
 */
const FEE_MODE = (process.env.FEE_MODE ?? 'ducat') as 'ducat' | 'native';
const STARTER_POT_CENTS = BigInt(process.env.STARTER_POT_CENTS ?? (FEE_MODE === 'native' ? 100 : 20));
/** In native mode, refill a player's tank when it drops under this many tPOT hundredths. */
const TANK_LOW_CENTS = BigInt(process.env.TANK_LOW_CENTS ?? 40);
const DATA_DIR = process.env.DATA_DIR ?? '.data';
const CHAIN_HTTP = process.env.CHAIN_HTTP ?? CHAIN_WS.replace(/^ws/, 'http');
const PORT = Number(process.env.PORT ?? 8790);

interface Trade { address: string; hash: string; block: number; t: number; from: number; to: number; amountIn: number; amountOut: number }
interface State {
  season: number;
  roundStartedAt: number;
  dockAt: number;
  revertAt: number;
  event?: HarbourEvent & { docked: boolean; dockProof?: string };
  events: (HarbourEvent & { t: number })[];
  history: Record<number, { t: number; p: number }[]>;
  players: Record<string, { name: string; joinedAt: number; tx: string }>;
  leaderboard: { address: string; name: string; worth: number; holdings: Record<number, number> }[];
  trades: Trade[];
  anchors: { day: string; root: string; proof: string; players: number }[];
  lastBlock: number;
  day: string;
  drawer?: { season: number; round: number; seed: string };
}

mkdirSync(DATA_DIR, { recursive: true });
const file = `${DATA_DIR}/state.json`;
const state: State = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : { season: 0, roundStartedAt: 0, dockAt: 0, revertAt: 0, events: [], history: {}, players: {}, leaderboard: [], trades: [], anchors: [], lastBlock: 0, day: '' };
const api = await connect();
const keeper = keeperPair();
const drawer = new EventDrawer(api, keeper);
drawer.season = state.season;
drawer.restore(state.drawer);
// A state file from before seeds were saved can't reveal its last commit: open a fresh season.
let needsCommit = !state.drawer && state.season > 0;
const save = () => {
  state.drawer = drawer.snapshot();
  writeFileSync(file, JSON.stringify(state));
};
/** JSON has no Infinity, so "already settled this round" is a far-future timestamp. */
const NEVER = Number.MAX_SAFE_INTEGER;
state.revertAt ??= NEVER;
let prices: Awaited<ReturnType<typeof allPrices>> = {};
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Every keeper extrinsic goes through one queue so nonces never collide. */
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(fn: () => Promise<T>) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

// ---- harbour clock -------------------------------------------------------

async function openRound() {
  if (!state.season || drawer.season !== state.season || needsCommit) {
    await enqueue(() => drawer.openSeason());
    needsCommit = false;
    state.season = drawer.season;
    log('season', state.season, 'opened via', drawer.mode);
  }
  const ev = await enqueue(() => drawer.next());
  const now = Date.now();
  state.event = { ...ev, docked: ev.magnitude === 0 };
  state.events = [{ ...ev, t: now }, ...state.events].slice(0, 40);
  state.roundStartedAt = now;
  state.dockAt = now + DOCK_SECONDS * 1000;
  state.revertAt = now + (ROUND_SECONDS * 1000) / 2;
  const d = describe(ev);
  log(`round ${ev.round}: ${d.title} / ${d.goodName} ${d.dir > 0 ? '+' : d.dir < 0 ? '-' : ''}${d.magnitude}% (${ev.proof.slice(0, 12)})`);
  save();
}

async function dock() {
  const ev = state.event!;
  const kind = describe(ev);
  const factor = 1 + (kind.dir * ev.magnitude) / 100;
  const sent = await enqueue(() => pushPrice(api, keeper, GOODS[ev.good].id, factor));
  ev.docked = true;
  ev.dockProof = sent.hash;
  log(`docked: ${kind.goodName} x${factor.toFixed(2)}`);
  save();
}

/** Halfway through a round every market drifts a quarter of the way back to its base price. */
async function settleTide() {
  state.revertAt = NEVER;
  for (const g of GOODS) {
    const p = prices[g.id]?.price;
    if (!p) continue;
    const target = p + (g.basePrice - p) * 0.25;
    if (Math.abs(target / p - 1) > 0.01) await enqueue(() => pushPrice(api, keeper, g.id, target / p));
  }
}

async function refreshPrices() {
  prices = await allPrices(api);
  const t = Date.now();
  for (const g of GOODS) {
    const h = (state.history[g.id] ??= []);
    const p = prices[g.id].price;
    if (!h.length || h[h.length - 1].p !== p || t - h[h.length - 1].t > 60_000) h.push({ t, p });
    if (h.length > 240) h.splice(0, h.length - 240);
  }
}

async function refreshLeaderboard() {
  const addrs = Object.keys(state.players);
  const rows = await netWorths(api, addrs, prices);
  state.leaderboard = rows
    .map((r) => ({ ...r, name: state.players[r.address].name }))
    .sort((a, b) => b.worth - a.worth);
}

/** Merkle root of the day's standings, anchored on-chain so any payout can be checked. */
async function anchorDayIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (!state.day) { state.day = today; return; }
  if (state.day === today || !state.leaderboard.length) return;
  let level = state.leaderboard.map((r, i) => keccak256(toUtf8Bytes(`${state.day}:${i + 1}:${r.address}:${r.worth.toFixed(4)}`)));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const [a, b] = [level[i], level[i + 1] ?? level[i]].sort();
      next.push(keccak256(a + b.slice(2)));
    }
    level = next;
  }
  const dayNumber = Math.floor(Date.parse(state.day) / 86_400_000);
  const proof = await enqueue(() => drawer.anchorDay(dayNumber, level[0], state.leaderboard.length));
  state.anchors = [{ day: state.day, root: level[0], proof, players: state.leaderboard.length }, ...state.anchors].slice(0, 30);
  log('anchored', state.day, level[0].slice(0, 12));
  state.day = today;
  save();
}

/** Picks up players' swaps from new blocks for the ledger. */
async function indexTrades() {
  const head = (await api.rpc.chain.getHeader()).number.toNumber();
  if (!state.lastBlock) state.lastBlock = head - 1;
  for (let n = state.lastBlock + 1; n <= head; n++) {
    const hash = await api.rpc.chain.getBlockHash(n);
    const [block, events] = await Promise.all([api.rpc.chain.getBlock(hash), api.query.system.events.at(hash)]);
    for (const { event, phase } of events as any) {
      if (event.section !== 'assetConversion' || event.method !== 'SwapExecuted') continue;
      const who = event.data.who.toString();
      if (!state.players[who]) continue;
      const path = event.data.path.toJSON() as [any, string][];
      const id = (k: any) => (k === 'native' || k?.native !== undefined ? 0 : Number(k.withId ?? k.WithId));
      state.trades.unshift({
        address: who,
        hash: block.block.extrinsics[phase.asApplyExtrinsic.toNumber()].hash.toHex(),
        block: n,
        t: Date.now(),
        from: id(path[0][0]),
        to: id(path[path.length - 1][0]),
        amountIn: fromUnits(event.data.amountIn.toBigInt()),
        amountOut: fromUnits(event.data.amountOut.toBigInt()),
      });
    }
  }
  state.trades = state.trades.slice(0, 400);
  state.lastBlock = head;
}

/** Native-fee fallback: refill any player whose tPOT is running low, in one batch. */
async function topUpTanks() {
  const addrs = Object.keys(state.players);
  if (!addrs.length) return;
  const accounts = (await api.query.system.account.multi(addrs)) as any[];
  const low = addrs.filter((_, i) => accounts[i].data.free.toBigInt() < (TANK_LOW_CENTS * POT) / 100n);
  if (!low.length) return;
  const refill = ((STARTER_POT_CENTS - TANK_LOW_CENTS / 2n) * POT) / 100n;
  await enqueue(() => send(api, api.tx.utility.batchAll(low.map((a) => api.tx.balances.transferKeepAlive(a, refill))), keeper));
  log('topped up', low.length, 'tanks');
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    if (!state.event || now >= state.roundStartedAt + ROUND_SECONDS * 1000) await openRound();
    else if (!state.event.docked && now >= state.dockAt) await dock();
    else if (now >= state.revertAt) await settleTide();
    await refreshPrices();
    await indexTrades();
    await refreshLeaderboard();
    if (FEE_MODE === 'native') await topUpTanks();
    await anchorDayIfNeeded();
    save();
  } catch (e) {
    log('tick error:', (e as Error).message);
  } finally {
    busy = false;
  }
}

// ---- HTTP ----------------------------------------------------------------

const app = new Hono();
const goodsMeta = GOODS.map((g) => ({ id: g.id, symbol: g.symbol, name: g.name, basePrice: g.basePrice }));

app.use('/api/*', async (c, next) => {
  await next();
  c.header('access-control-allow-origin', '*');
  c.header('access-control-allow-headers', 'content-type');
});
app.options('/api/*', (c) => c.body(null, 204));

app.get('/api/state', (c) => c.json({
  now: Date.now(),
  roundSeconds: ROUND_SECONDS,
  dockSeconds: DOCK_SECONDS,
  ducat: DUCAT,
  goods: goodsMeta,
  season: state.season,
  roundStartedAt: state.roundStartedAt,
  dockAt: state.dockAt,
  event: state.event && { ...state.event, ...describe(state.event) },
  events: state.events.slice(0, 12).map((e) => ({ ...e, ...describe(e) })),
  prices: Object.fromEntries(GOODS.map((g) => [g.id, prices[g.id] && {
    price: prices[g.id].price,
    ducat: prices[g.id].reserves.ducat.toString(),
    goods: prices[g.id].reserves.goods.toString(),
  }])),
  history: state.history,
  leaderboard: state.leaderboard.slice(0, 50),
  trades: state.trades.slice(0, 40),
  anchors: state.anchors.slice(0, 5),
  players: Object.keys(state.players).length,
  mode: drawer.mode,
  feeMode: FEE_MODE,
}));

app.get('/api/player/:address', (c) => {
  const address = c.req.param('address');
  const row = state.leaderboard.find((r) => r.address === address);
  return c.json({
    registered: Boolean(state.players[address]),
    name: state.players[address]?.name,
    rank: row ? state.leaderboard.indexOf(row) + 1 : null,
    ...row,
    trades: state.trades.filter((t) => t.address === address).slice(0, 30),
  });
});

const recent = new Map<string, number[]>();
app.post('/api/register', async (c) => {
  const { address, name } = await c.req.json<{ address: string; name: string }>();
  try { decodeAddress(address); } catch { return c.json({ error: 'not a Portaldot address' }, 400); }
  if (state.players[address]) return c.json({ ok: true, already: true });
  const ip = c.req.header('x-forwarded-for')?.split(',')[0] ?? 'local';
  const hits = (recent.get(ip) ?? []).filter((t) => Date.now() - t < 3_600_000);
  if (hits.length >= 5) return c.json({ error: 'too many new captains from here, try again later' }, 429);
  recent.set(ip, [...hits, Date.now()]);
  const clean = String(name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 18) || `Captain ${address.slice(-4)}`;
  try {
    const sent = await enqueue(() => send(api, api.tx.utility.batchAll([
      api.tx.balances.transferKeepAlive(address, (STARTER_POT_CENTS * POT) / 100n),
      api.tx.assets.mint(DUCAT, address, toUnits(STARTER_DUCAT)),
    ]), keeper));
    state.players[address] = { name: clean, joinedAt: Date.now(), tx: sent.hash };
    save();
    log('new captain', clean, address);
    return c.json({ ok: true, tx: sent.hash });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

/** The browser talks to the chain through here: the testnet's wss drops large frames, HTTPS does not. */
const RPC_ALLOW = /^(chain_|state_(getMetadata|getRuntimeVersion|getStorage|call|queryStorageAt)|system_(chain|properties|accountNextIndex|version|name)|author_submitExtrinsic|payment_queryInfo|rpc_methods)/;
app.post('/api/rpc', async (c) => {
  const body = await c.req.json<{ method: string; id: unknown; params?: unknown[] }>();
  if (!RPC_ALLOW.test(body.method)) return c.json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'method not allowed' } });
  const { id, params } = body;
  try {
    // Chopsticks' HTTP replies trip Node's strict parser, so on the fork reuse the keeper's socket.
    if (ON_FORK && !process.env.CHAIN_HTTP) {
      const result = await (api as any)._rpcCore.provider.send(body.method, params ?? []);
      return c.json({ jsonrpc: '2.0', id, result });
    }
    const res = await fetch(CHAIN_HTTP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return c.body(await res.text(), 200, { 'content-type': 'application/json' });
  } catch (e) {
    return c.json({ jsonrpc: '2.0', id, error: { code: -32603, message: (e as Error).message } });
  }
});

app.get('/healthz', (c) => c.text('ok'));
app.use('/*', serveStatic({ root: process.env.WEB_DIST ?? '../web/dist' }));
app.get('/*', serveStatic({ path: `${process.env.WEB_DIST ?? '../web/dist'}/index.html` }));

serve({ fetch: app.fetch, port: PORT });
log(`keeper ${keeper.address} on :${PORT}, chain ${CHAIN_WS}, events via ${drawer.mode}, round ${ROUND_SECONDS}s`);
await tick();
setInterval(tick, 3000);
