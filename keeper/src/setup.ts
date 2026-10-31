// One-time harbour setup: creates DUCAT and the five goods as native assets, opens their pools
// on the native DEX and seeds liquidity. Safe to rerun: existing assets and pools are skipped.
import { connect, keeperPair, send, native, withId, DUCAT, GOODS, POT, UNIT, toUnits, type AssetKind } from './chain.js';

const api = await connect();
const keeper = keeperPair();
const log = (...a: unknown[]) => console.log('•', ...a);

/** DUCAT reserve in each goods pool. Bigger = players move prices less. */
const GOODS_POOL_DUCAT = BigInt(process.env.GOODS_POOL_DUCAT ?? 100_000);
/** DUCAT/tPOT pool that lets players pay fees in DUCAT. */
const FEE_POOL_POT = BigInt(process.env.FEE_POOL_POT ?? 20);
const FEE_POOL_DUCAT = BigInt(process.env.FEE_POOL_DUCAT ?? 20_000);

async function ensureAsset(id: number, symbol: string, name: string) {
  const existing = (await api.query.assets.asset(id)) as any;
  if (existing.isSome) {
    const owner = (existing.unwrap() as any).owner.toString();
    if (owner !== keeper.address) throw new Error(`asset ${id} already exists and belongs to ${owner}; set ASSET_BASE to a free range`);
    return log(`${symbol} (${id}) exists`);
  }
  await send(api, api.tx.utility.batchAll([
    api.tx.assets.create(id, keeper.address, 1n),
    api.tx.assets.setMetadata(id, name, symbol, 10),
  ]), keeper);
  log(`created ${symbol} (${id})`);
}

const poolKey = (a: AssetKind, b: AssetKind) => [a, b];

async function poolExists(a: AssetKind, b: AssetKind) {
  return ((await api.query.assetConversion.pools(poolKey(a, b))) as any).isSome;
}

/** Tries a direct goods/DUCAT pool and reports whether the runtime allows non-native pairs. */
async function ensurePool(a: AssetKind, b: AssetKind, amountA: bigint, amountB: bigint, label: string) {
  if (await poolExists(a, b)) return log(`pool ${label} exists`), true;
  try {
    await send(api, api.tx.utility.batchAll([
      api.tx.assetConversion.createPool(a, b),
      api.tx.assetConversion.addLiquidity(a, b, amountA, amountB, 0, 0, keeper.address),
    ]), keeper);
    log(`opened pool ${label}`);
    return true;
  } catch (e) {
    log(`pool ${label} failed: ${(e as Error).message}`);
    return false;
  }
}

const balance = (await api.query.system.account(keeper.address)) as any;
log(`keeper ${keeper.address} holds ${Number(balance.data.free.toBigInt() / (POT / 100n)) / 100} tPOT`);

await ensureAsset(DUCAT, 'DUCAT', 'Ducat');
for (const g of GOODS) await ensureAsset(g.id, g.symbol, g.name);

// Keeper inventory: enough to seed pools and pay out starter purses.
const mintTo = (id: number, amount: bigint) => api.tx.assets.mint(id, keeper.address, amount);
await send(api, api.tx.utility.batchAll([
  mintTo(DUCAT, toUnits(5_000_000)),
  ...GOODS.map((g) => mintTo(g.id, toUnits(Number(GOODS_POOL_DUCAT) * 4 / g.basePrice))),
]), keeper);
log('minted keeper inventory');

await ensurePool(native, withId(DUCAT), FEE_POOL_POT * POT, FEE_POOL_DUCAT * UNIT, 'tPOT/DUCAT');

let direct = true;
for (const g of GOODS) {
  const goodsAmount = toUnits(Number(GOODS_POOL_DUCAT) / g.basePrice);
  const ok = await ensurePool(withId(DUCAT), withId(g.id), GOODS_POOL_DUCAT * UNIT, goodsAmount, `DUCAT/${g.symbol}`);
  if (!ok) { direct = false; break; }
}
log(direct ? 'goods trade directly against DUCAT' : 'runtime needs tPOT on one side of every pool');

await api.disconnect();
