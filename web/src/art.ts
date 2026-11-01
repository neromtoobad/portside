// Where things sit on the harbour scene (public/art/scene.webp, 2688×1520), in % of its width and height.
// Measured from the render; piers run left to right in the same order as the stocks.
export const SCENE = { w: 2688, h: 1520 };

export interface Pier {
  /** Top of the flagpole, where the good's signal flag flies. */
  pole: [number, number];
  /** Top of the cargo pile, where the price bubble floats. */
  cargo: [number, number];
  /** Water on the sea side of the quay, where the ship's hull comes to rest. */
  berth: [number, number];
}

export const PIERS: Pier[] = [
  { pole: [32.1, 32.5], cargo: [27.8, 46.1], berth: [37.1, 36.6] },
  { pole: [44.5, 37.3], cargo: [39.9, 49.7], berth: [49.5, 41.1] },
  { pole: [56.1, 42.0], cargo: [52.2, 55.2], berth: [61.1, 45.7] },
  { pole: [69.1, 46.5], cargo: [65.1, 60.2], berth: [74.1, 50.7] },
  { pole: [82.2, 51.3], cargo: [78.2, 65.6], berth: [87.2, 55.7] },
];

/** Ships appear past the top edge, a little to the right of their pier, and sail down onto the quay. */
export const horizonFor = (berth: [number, number]): [number, number] => [berth[0] + 10, -14];

/** Each stock's cargo, by ticker. */
export const CARGO: Record<string, string> = {
  NVDA: '/art/chips.webp', AAPL: '/art/phones.webp', TSLA: '/art/car.webp', AMZN: '/art/parcels.webp', META: '/art/headset.webp',
};

/** One sprite per event kind, in the same order as Harbour.sol's table. */
export const KIND_ART = ['/art/trophy.webp', '/art/rocket.webp', '/art/guild.webp', '/art/cloud.webp', '/art/ship.webp', '/art/sun.webp'];

/** A captain's face comes from their address, so everyone sees the same one. */
export function captainArt(address: string) {
  let h = 0;
  for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `/art/captain${h % 8}.webp`;
}
