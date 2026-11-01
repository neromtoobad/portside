// Chrome shared by the site pages (everything except the game screen itself).
import type { ReactNode } from 'react';
import { Link, usePath } from '../router';
import type { HarbourState } from '../api';
import { captainArt } from '../art';
import { explorer, short } from '../data';

const LINKS = [
  { to: '/guide', label: 'Guide' },
  { to: '/season', label: 'Season' },
  { to: '/portfolio', label: 'Portfolio' },
];

export function SiteNav() {
  const path = usePath();
  return (
    <header className="site-nav">
      <Link to="/" className="wordmark" aria-label="Portside home">Portside</Link>
      <nav>
        {LINKS.map((l) => <Link key={l.to} to={l.to} className={path.startsWith(l.to) ? 'on' : ''}>{l.label}</Link>)}
      </nav>
      <Link to="/play" className="btn go">Play now</Link>
    </header>
  );
}

export function SiteFooter({ state }: { state?: HarbourState }) {
  return (
    <footer className="site-foot">
      <div className="site-foot-inner">
        <div>
          <span className="wordmark">Portside</span>
          <p>A harbour stock exchange on Portaldot. Built for the Portaldot Hacker House 2026.</p>
        </div>
        <div className="cols">
          <div><b>Play</b><Link to="/play">Open the harbour</Link><Link to="/guide">Guide</Link><Link to="/season">Season</Link><Link to="/portfolio">Portfolio</Link></div>
          <div><b>On-chain</b>
            {state?.contract && <span className="mono" title={state.contract}>Harbour {short(state.contract)}</span>}
            <a href="https://node-console.portaldot.dev/" target="_blank" rel="noreferrer">Portaldot explorer</a>
            {state?.event && <a href={explorer(state.event.proof)} target="_blank" rel="noreferrer">Latest news proof</a>}
            {state?.anchors[0] && <a href={explorer(state.anchors[0].proof)} target="_blank" rel="noreferrer">Latest standings anchor</a>}
          </div>
        </div>
      </div>
      <p className="fine">Game prices are DUCAT pools on the Portaldot testnet, not market data. Not affiliated with Nvidia, Apple, Tesla, Amazon or Meta. No real money is involved.</p>
    </footer>
  );
}

export function Page({ children, state, className = '' }: { children: ReactNode; state?: HarbourState; className?: string }) {
  return (
    <div className={`site ${className}`}>
      <SiteNav />
      <main>{children}</main>
      <SiteFooter state={state} />
    </div>
  );
}

export function Face({ address, tier, size = 40 }: { address: string; tier?: number; size?: number }) {
  return <img className={`face-img ${tier !== undefined ? `tier-${tier}` : ''}`} src={captainArt(address)} alt="" width={size} height={size} style={{ width: size, height: size }} />;
}

/** A small line chart for prices or net worth. */
export function Spark({ points, w = 120, h = 36, color }: { points: number[]; w?: number; h?: number; color?: string }) {
  if (points.length < 2) return <svg className="spark" width={w} height={h} />;
  const lo = Math.min(...points), hi = Math.max(...points);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (p: number) => h - 3 - ((p - lo) / (hi - lo || 1)) * (h - 6);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const c = color ?? (points[points.length - 1] >= points[0] ? 'var(--up)' : 'var(--down)');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={c} opacity="0.1" />
      <path d={d} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
