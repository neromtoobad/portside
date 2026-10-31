// International Code of Signals flags, one per good. Drawn as SVG so they stay crisp at any size.
const NAVY = '#1d4f91', RED = '#c4412f', YEL = '#f2c230', WHITE = '#fffdf8';

const flags: Record<string, (w: number, h: number) => JSX.Element> = {
  // K: yellow hoist, blue fly
  COFFEE: (w, h) => (<><rect width={w / 2} height={h} fill={YEL} /><rect x={w / 2} width={w / 2} height={h} fill={NAVY} /></>),
  // B: red swallowtail
  SPICE: (w, h) => <path d={`M0 0H${w}L${w * 0.72} ${h / 2}L${w} ${h}H0Z`} fill={RED} />,
  // J: blue, white, blue bands
  SILK: (w, h) => (<><rect width={w} height={h} fill={NAVY} /><rect y={h / 3} width={w} height={h / 3} fill={WHITE} /></>),
  // C: blue, white, red, white, blue
  SALT: (w, h) => (<>{[NAVY, WHITE, RED, WHITE, NAVY].map((c, i) => <rect key={i} y={(h / 5) * i} width={w} height={h / 5 + 0.5} fill={c} />)}</>),
  // Y: red and yellow diagonals
  COPPER: (w, h) => (
    <>
      <defs>
        <pattern id="flag-y" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill={YEL} /><rect x="4" width="4" height="8" fill={RED} />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#flag-y)" />
    </>
  ),
};

export function Flag({ symbol, size = 34, waving = false }: { symbol: string; size?: number; waving?: boolean }) {
  const w = size, h = Math.round(size * 0.68);
  return (
    <svg className={`flag${waving ? ' waving' : ''}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${symbol} signal flag`}>
      {flags[symbol]?.(w, h)}
      <rect width={w} height={h} fill="none" stroke="#13283f" strokeWidth="1.5" />
    </svg>
  );
}
