import type { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import { DUCAT, GOODS, UNIT, send, withId, fromUnits } from './chain.js';

export interface Reserves { ducat: bigint; goods: bigint }

/** Reads a goods pool's reserves through the runtime API (DUCAT side first). */
export async function reserves(api: ApiPromise, goodId: number): Promise<Reserves> {
  const res = (await api.call.assetConversionApi.getReserves(withId(DUCAT), withId(goodId))) as any;
  if (res.isNone) throw new Error(`no pool for ${goodId}`);
  const [ducat, goods] = res.unwrap();
  return { ducat: ducat.toBigInt(), goods: goods.toBigInt() };
}

export const spot = (r: Reserves) => Number(r.ducat) / Number(r.goods);

export async function allPrices(api: ApiPromise) {
  const out: Record<number, { price: number; reserves: Reserves }> = {};
  await Promise.all(GOODS.map(async (g) => {
    const r = await reserves(api, g.id);
    out[g.id] = { price: spot(r), reserves: r };
  }));
  return out;
}

const LP_FEE = 0.997;

/**
 * Moves a pool's spot price by `factor` (1.18 = +18%) with one house swap.
 * Constant product: price = D/G and D·G = k, so the DUCAT side scales by √factor.
 */
export async function pushPrice(api: ApiPromise, house: KeyringPair, goodId: number, factor: number) {
  const r = await reserves(api, goodId);
  const s = Math.sqrt(factor);
  if (factor > 1) {
    const amountIn = BigInt(Math.floor((Number(r.ducat) * (s - 1)) / LP_FEE));
    await ensureBalance(api, house, DUCAT, amountIn);
    return send(api, api.tx.assetConversion.swapExactTokensForTokens([withId(DUCAT), withId(goodId)], amountIn, 0, house.address, true), house);
  }
  const amountIn = BigInt(Math.floor((Number(r.goods) * (1 / s - 1)) / LP_FEE));
  await ensureBalance(api, house, goodId, amountIn);
  return send(api, api.tx.assetConversion.swapExactTokensForTokens([withId(goodId), withId(DUCAT)], amountIn, 0, house.address, true), house);
}

/** The house is the asset owner, so it can always mint what it needs to move a market. */
async function ensureBalance(api: ApiPromise, house: KeyringPair, assetId: number, amount: bigint) {
  const acct = (await api.query.assets.account(assetId, house.address)) as any;
  const have = acct.isSome ? acct.unwrap().balance.toBigInt() : 0n;
  if (have < amount) await send(api, api.tx.assets.mint(assetId, house.address, amount - have + 1000n * UNIT), house);
}

/** DUCAT plus every good at spot price, for each player. */
export async function netWorths(api: ApiPromise, players: string[], prices: Record<number, { price: number }>) {
  if (!players.length) return [];
  const ids = [DUCAT, ...GOODS.map((g) => g.id)];
  const keys = players.flatMap((p) => ids.map((id) => [id, p]));
  const rows = (await api.query.assets.account.multi(keys)) as any[];
  return players.map((address, i) => {
    const holdings: Record<number, number> = {};
    ids.forEach((id, j) => {
      const row = rows[i * ids.length + j];
      holdings[id] = row.isSome ? fromUnits(row.unwrap().balance.toBigInt()) : 0;
    });
    const worth = holdings[DUCAT] + GOODS.reduce((sum, g) => sum + holdings[g.id] * (prices[g.id]?.price ?? 0), 0);
    return { address, holdings, worth };
  });
}
