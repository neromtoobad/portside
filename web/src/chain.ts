import { ApiPromise, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import type { KeyringPair } from '@polkadot/keyring/types';
import { cryptoWaitReady, mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { API } from './api';

export const UNIT = 10n ** 10n;
const KEY = 'portside.mnemonic';

/** A browser wallet the player never has to think about. The phrase can be exported. */
export async function loadWallet(): Promise<{ pair: KeyringPair; mnemonic: string; fresh: boolean }> {
  await cryptoWaitReady();
  let mnemonic = '';
  try { mnemonic = localStorage.getItem(KEY) ?? ''; } catch { /* private mode */ }
  const fresh = !mnemonicValidate(mnemonic);
  if (fresh) {
    mnemonic = mnemonicGenerate(12);
    try { localStorage.setItem(KEY, mnemonic); } catch { /* keeps working for this tab */ }
  }
  const pair = new Keyring({ type: 'sr25519', ss58Format: 42 }).addFromUri(mnemonic);
  return { pair, mnemonic, fresh };
}

let apiPromise: Promise<ApiPromise> | undefined;
/** Talks to Portaldot through the keeper's HTTPS relay; the public wss endpoint drops big frames. */
export function chain() {
  apiPromise ??= ApiPromise.create({ provider: new HttpProvider(`${API || location.origin}/api/rpc`), noInitWarn: true });
  return apiPromise;
}

const withId = (id: number) => ({ WithId: id });

/**
 * Swaps on Portaldot's native DEX (pallet-asset-conversion). Buying spends DUCAT for a good,
 * selling spends the good for DUCAT. By default the fee is paid in DUCAT via ChargeAssetTxPayment,
 * so players never hold gas; in the keeper's native fallback it comes from a tPOT tank the harbour refills.
 */
export async function trade(pair: KeyringPair, ducat: number, goodId: number, side: 'buy' | 'sell', amountIn: bigint, minOut: bigint, feeInDucat = true) {
  const api = await chain();
  const path = side === 'buy' ? [withId(ducat), withId(goodId)] : [withId(goodId), withId(ducat)];
  const tx = api.tx.assetConversion.swapExactTokensForTokens(path, amountIn, minOut, pair.address, true);
  const signed = await tx.signAsync(pair, feeInDucat ? { assetId: withId(ducat), nonce: -1 } : { nonce: -1 });
  return (await api.rpc.author.submitExtrinsic(signed)).toHex();
}

/** Pays the harbourmaster in DUCAT, which is how a rumour ticket is bought. */
export async function payDucat(pair: KeyringPair, ducat: number, to: string, amount: bigint, feeInDucat = true) {
  const api = await chain();
  const tx = api.tx.assets.transferKeepAlive(ducat, to, amount);
  const signed = await tx.signAsync(pair, feeInDucat ? { assetId: withId(ducat), nonce: -1 } : { nonce: -1 });
  return (await api.rpc.author.submitExtrinsic(signed)).toHex();
}

/** Constant-product quote with the pool's 0.3% LP fee, same as the runtime's. */
export function quote(reserveIn: bigint, reserveOut: bigint, amountIn: bigint) {
  if (amountIn <= 0n || reserveIn <= 0n) return 0n;
  const inWithFee = amountIn * 997n;
  return (inWithFee * reserveOut) / (reserveIn * 1000n + inWithFee);
}

export const toUnits = (n: number) => BigInt(Math.floor(n * 1e4)) * (UNIT / 10_000n);
export const fromUnits = (v: bigint) => Number(v) / Number(UNIT);
