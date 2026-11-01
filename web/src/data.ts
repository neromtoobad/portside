// Shared plumbing for the site pages: number formatting, the browser wallet, and live harbour data.
import { useEffect, useState } from 'react';
import type { KeyringPair } from '@polkadot/keyring/types';
import { getState, getPlayer, type HarbourState, type Player } from './api';
import { loadWallet } from './chain';
import { mockState, mockPlayer } from './mock';

export const MOCK = new URLSearchParams(location.search).has('mock');
export const EXPLORER = import.meta.env.VITE_EXPLORER ?? 'https://node-console.portaldot.dev/#/explorer/query/';
export const explorer = (hash: string) => `${EXPLORER}${hash}`;

export const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const short = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;
export const priceDigits = (p: number) => (p < 10 ? 3 : 2);
export const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86_400)}d`; };
export const STARTING_PURSE = 1000;

let wallet: ReturnType<typeof loadWallet> | undefined;
export function useWallet() {
  const [w, setW] = useState<{ pair: KeyringPair; mnemonic: string }>();
  useEffect(() => { (wallet ??= loadWallet()).then(setW); }, []);
  return w;
}

export function useClock(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** Polls the harbour office (or the offline mock) and, given an address, that captain's record. */
export function useHarbour(address?: string, every = 4000) {
  const me = useWallet();
  const [state, setState] = useState<HarbourState>();
  const [player, setPlayer] = useState<Player>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (MOCK && !me) return;
    let live = true;
    const load = async () => {
      try {
        if (MOCK) {
          const s = mockState(me!.pair.address);
          if (!live) return;
          setState(s);
          if (address) setPlayer(address === me!.pair.address ? mockPlayer(address) : mockRival(s, address));
          return;
        }
        const [s, p] = await Promise.all([getState(), address ? getPlayer(address) : Promise.resolve(undefined)]);
        if (!live) return;
        setState(s); setPlayer(p); setError('');
      } catch (e) { if (live) setError((e as Error).message); }
    };
    load();
    const id = setInterval(load, every);
    return () => { live = false; clearInterval(id); };
  }, [address, me?.pair.address, every]);
  return { state, player, error, me };
}

function mockRival(s: HarbourState, address: string): Player {
  const row = s.leaderboard.find((r) => r.address === address);
  return { registered: !!row, rank: row ? s.leaderboard.indexOf(row) + 1 : null, ...row, trades: s.trades.filter((t) => t.address === address), worthHistory: [] };
}
