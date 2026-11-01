import { keccak256, solidityPacked, Contract, JsonRpcProvider, Wallet, randomBytes, hexlify } from 'ethers';
import type { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import { GOODS, send } from './chain.js';

/** Same table as Harbour.sol: kinds 0-2 push a company's shares up, 3-4 push them down, 5 is a quiet round. */
export const KINDS = [
  { name: 'Earnings beat', line: 'profits landed well above forecast', dir: 1 },
  { name: 'Launch sell-out', line: 'the new product is flying off the shelves', dir: 1 },
  { name: 'Whale buying', line: 'a big fund is scooping up shares', dir: 1 },
  { name: 'Supply storm', line: 'shipments stuck behind a storm at sea', dir: -1 },
  { name: 'Rival fleet', line: 'competitors flooded the port with cheaper stock', dir: -1 },
  { name: 'Calm seas', line: 'a quiet day on the exchange', dir: 0 },
] as const;

export interface HarbourEvent {
  season: number;
  round: number;
  good: number;
  kind: number;
  magnitude: number;
  entropy: string;
  /** EVM tx hash when drawn by the contract, extrinsic hash when drawn locally. */
  proof: string;
  source: 'contract' | 'remark';
}

/** Mirrors Harbour.drawEvent so local draws and contract draws read identically. */
export function drawEvent(entropy: string) {
  const e = BigInt(entropy);
  const good = Number(e % 5n);
  const kind = Number((e >> 8n) % 6n);
  const magnitude = kind === 5 ? 0 : Number(5n + ((e >> 16n) % 25n));
  return { good, kind, magnitude };
}

const ABI = [
  'function openSeason(bytes32 firstCommit)',
  'function reveal(bytes32 seed, bytes32 nextCommit)',
  'function anchorDay(uint32 day, bytes32 root, uint32 players)',
  'function season() view returns (uint32)',
  'function round() view returns (uint32)',
  'event RoundOpened(uint32 indexed season, uint32 indexed round, uint8 good, uint8 kind, uint8 magnitude, bytes32 entropy)',
];

const newSeed = () => hexlify(randomBytes(32));
const commitOf = (seed: string) => keccak256(seed);

/**
 * Draws round events with commit-reveal. With HARBOUR_ADDRESS set it drives the Harbour contract
 * on Portaldot's EVM; otherwise (local fork) it mixes the seed with the latest block hash and
 * records the reveal on-chain with system.remark so the draw is still auditable.
 */
export class EventDrawer {
  private seed = newSeed();
  private contract?: Contract;
  season = 0;
  round = 0;

  constructor(private api: ApiPromise, private keeper: KeyringPair) {
    const address = process.env.HARBOUR_ADDRESS;
    const key = process.env.KEEPER_EVM_KEY;
    if (address && key) {
      const provider = new JsonRpcProvider(process.env.PORTALDOT_EVM_RPC ?? 'https://test-evm-rpc-v3.portaldot.dev', 420420777);
      this.contract = new Contract(address, ABI, new Wallet(key, provider));
    }
  }

  get mode() { return this.contract ? 'contract' : 'remark'; }

  /** The unrevealed seed has to survive a restart, or the next reveal won't match its commit. */
  snapshot() { return { season: this.season, round: this.round, seed: this.seed }; }
  restore(s?: { season: number; round: number; seed: string }) {
    if (!s) return;
    this.season = s.season;
    this.round = s.round;
    this.seed = s.seed;
  }

  async openSeason() {
    this.seed = newSeed();
    if (this.contract) {
      await (await this.contract.openSeason(commitOf(this.seed))).wait();
      this.season = Number(await this.contract.season());
    } else {
      this.season += 1;
      await send(this.api, this.api.tx.system.remarkWithEvent(`portside:season:${this.season}:commit:${commitOf(this.seed)}`), this.keeper);
    }
    this.round = 0;
  }

  async next(): Promise<HarbourEvent> {
    const seed = this.seed;
    this.seed = newSeed();
    const nextCommit = commitOf(this.seed);
    if (this.contract) {
      const receipt = await (await this.contract.reveal(seed, nextCommit)).wait();
      const log = receipt.logs.map((l: any) => { try { return this.contract!.interface.parseLog(l); } catch { return null; } }).find((l: any) => l?.name === 'RoundOpened');
      const [season, round, good, kind, magnitude, entropy] = log!.args;
      this.round = Number(round);
      return { season: Number(season), round: Number(round), good: Number(good), kind: Number(kind), magnitude: Number(magnitude), entropy, proof: receipt.hash, source: 'contract' };
    }
    const head = (await this.api.rpc.chain.getFinalizedHead()).toHex();
    const entropy = keccak256(solidityPacked(['bytes32', 'bytes32', 'uint32', 'uint32'], [seed, head, this.season, this.round]));
    const { good, kind, magnitude } = drawEvent(entropy);
    this.round += 1;
    const sent = await send(this.api, this.api.tx.system.remarkWithEvent(`portside:reveal:${this.season}:${this.round}:${seed}:${head}:next:${nextCommit}`), this.keeper);
    return { season: this.season, round: this.round, good, kind, magnitude, entropy, proof: sent.hash, source: 'remark' };
  }

  async anchorDay(day: number, root: string, players: number) {
    if (this.contract) return (await (await this.contract.anchorDay(day, root, players)).wait()).hash as string;
    return (await send(this.api, this.api.tx.system.remarkWithEvent(`portside:day:${this.season}:${day}:${root}:${players}`), this.keeper)).hash;
  }
}

export const describe = (e: Pick<HarbourEvent, 'good' | 'kind' | 'magnitude'>) => {
  const k = KINDS[e.kind];
  const g = GOODS[e.good];
  return { title: k.name, goodName: g.name, line: k.line, dir: k.dir, magnitude: e.magnitude };
};
