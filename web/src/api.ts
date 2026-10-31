export interface Good { id: number; symbol: string; name: string; basePrice: number }
export interface HarbourEvent {
  season: number; round: number; good: number; kind: number; magnitude: number;
  entropy: string; proof: string; source: 'contract' | 'remark';
  title: string; line: string; dir: number; docked?: boolean; dockProof?: string; t?: number;
}
export interface Trade { address: string; hash: string; block: number; t: number; from: number; to: number; amountIn: number; amountOut: number }
export interface Standing { address: string; name: string; worth: number; holdings: Record<number, number> }
export interface HarbourState {
  now: number; roundSeconds: number; dockSeconds: number; ducat: number; goods: Good[];
  season: number; roundStartedAt: number; dockAt: number;
  event?: HarbourEvent; events: HarbourEvent[];
  prices: Record<number, { price: number; ducat: string; goods: string } | undefined>;
  history: Record<number, { t: number; p: number }[]>;
  leaderboard: Standing[]; trades: Trade[];
  anchors: { day: string; root: string; proof: string; players: number }[];
  players: number; mode: 'contract' | 'remark'; feeMode: 'ducat' | 'native';
}
export interface Player extends Partial<Standing> { registered: boolean; rank: number | null; trades: Trade[] }

export const API = import.meta.env.VITE_API ?? '';

export async function getState(): Promise<HarbourState> {
  const r = await fetch(`${API}/api/state`);
  if (!r.ok) throw new Error(`harbour office unreachable (${r.status})`);
  const s = await r.json();
  if (!Array.isArray(s?.goods) || !Array.isArray(s?.leaderboard)) throw new Error('harbour office sent an unexpected reply');
  return s;
}

export async function getPlayer(address: string): Promise<Player> {
  return (await fetch(`${API}/api/player/${address}`)).json();
}

export async function register(address: string, name: string): Promise<{ ok?: boolean; tx?: string; error?: string }> {
  const r = await fetch(`${API}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, name }) });
  return r.json();
}
