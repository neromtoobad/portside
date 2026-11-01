import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import 'dotenv/config';

export const CHAIN_WS = process.env.CHAIN_WS ?? 'ws://127.0.0.1:8000';
export const ON_FORK = CHAIN_WS.includes('127.0.0.1') || CHAIN_WS.includes('localhost');

/** 1 tPOT = 10^14 planck. Game assets use 10 decimals. */
export const POT = 10n ** 14n;
export const UNIT = 10n ** 10n;

const ASSET_BASE = Number(process.env.ASSET_BASE ?? 8_801_000);
export const DUCAT = ASSET_BASE;
export const GOODS = [
  // Five harbour trading companies, one per cargo. Shares trade against DUCAT.
  { id: ASSET_BASE + 1, symbol: 'BEAN', name: 'Golden Bean', cargo: 'coffee', basePrice: 12 },
  { id: ASSET_BASE + 2, symbol: 'SAFF', name: 'Saffron & Sons', cargo: 'spice', basePrice: 30 },
  { id: ASSET_BASE + 3, symbol: 'JADE', name: 'Jade Silk', cargo: 'silk', basePrice: 55 },
  { id: ASSET_BASE + 4, symbol: 'CLIF', name: 'White Cliffs', cargo: 'salt', basePrice: 4 },
  { id: ASSET_BASE + 5, symbol: 'REDH', name: 'Red Hill', cargo: 'copper', basePrice: 20 },
] as const;

export const native = 'Native' as const;
export const withId = (id: number) => ({ WithId: id });
export type AssetKind = typeof native | ReturnType<typeof withId>;

export async function connect() {
  await cryptoWaitReady();
  return ApiPromise.create({ provider: new WsProvider(CHAIN_WS, 2_500, {}, 120_000), noInitWarn: true });
}

/** On the fork the keeper is Alice; on the testnet it is the hackathon wallet. */
export function keeperPair(): KeyringPair {
  const keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
  if (process.env.KEEPER_SEED) return keyring.addFromUri(process.env.KEEPER_SEED);
  if (ON_FORK) return keyring.addFromUri('//Alice');
  return keyring.addFromUri(readFileSync(`${homedir()}/.portaldot-hh.seed`, 'utf8').trim());
}

export function pairFromUri(uri: string): KeyringPair {
  return new Keyring({ type: 'sr25519', ss58Format: 42 }).addFromUri(uri);
}

export interface Sent {
  hash: string;
  block: string;
  events: { section: string; method: string; data: unknown }[];
}

const nonces = new Map<string, number>();

/**
 * Signs, submits and waits for inclusion. Rejects with the decoded dispatch error.
 * `feeAsset` pays the fee in a game asset through ChargeAssetTxPayment.
 */
export async function send(api: ApiPromise, tx: SubmittableExtrinsic<'promise'>, signer: KeyringPair, feeAsset?: number): Promise<Sent> {
  // accountNextIndex can lag right after inclusion (seen on Chopsticks), so keep our own count.
  const onChain = ((await api.query.system.account(signer.address)) as any).nonce.toNumber();
  const nonce = Math.max(onChain, nonces.get(signer.address) ?? 0);
  nonces.set(signer.address, nonce + 1);
  return new Promise((resolve, reject) => {
    const opts = { nonce, ...(feeAsset === undefined ? {} : { assetId: withId(feeAsset) }) };
    tx.signAndSend(signer, opts, ({ status, events, dispatchError, txHash }) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const { section, name, docs } = api.registry.findMetaError(dispatchError.asModule);
          return reject(new Error(`${section}.${name}: ${docs.join(' ')}`));
        }
        return reject(new Error(dispatchError.toString()));
      }
      if (status.isInvalid || status.isDropped || status.isUsurped) {
        nonces.delete(signer.address);
        return reject(new Error(`transaction ${status.type.toLowerCase()}`));
      }
      if (status.isInBlock) {
        resolve({
          hash: txHash.toHex(),
          block: status.asInBlock.toHex(),
          events: events.map(({ event }) => ({ section: event.section, method: event.method, data: event.data.toHuman() })),
        });
      }
    }).catch(reject);
  });
}

/** Chopsticks only produces blocks on demand; nudge it after submitting. */
export async function newBlock(api: ApiPromise) {
  if (ON_FORK) await (api as any)._rpcCore.provider.send('dev_newBlock', [{}]);
}

export const toUnits = (n: number | bigint) => BigInt(Math.round(Number(n) * 1e4)) * (UNIT / 10_000n);
export const fromUnits = (v: bigint | string | number) => Number(BigInt(v.toString().replace(/,/g, ''))) / Number(UNIT);
