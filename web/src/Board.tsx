import { useEffect, useState } from 'react';
import type { HarbourEvent } from './api';

const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-%▲▼·:';

/** One row of split-flap tiles. Each tile flips through the alphabet until it lands on its letter. */
function FlapRow({ text, width, tone }: { text: string; width: number; tone?: 'up' | 'down' | 'dim' }) {
  const target = text.toUpperCase().padEnd(width).slice(0, width);
  const [shown, setShown] = useState(target);
  useEffect(() => {
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      setShown(target.split('').map((ch, i) => {
        const settle = 3 + i * 0.6;
        if (frame >= settle) return ch;
        return CHARS[(CHARS.indexOf(ch) + Math.floor(Math.random() * CHARS.length)) % CHARS.length];
      }).join(''));
      if (frame > 4 + width * 0.6) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [target, width]);
  return (
    <div className={`flaps ${tone ?? ''}`}>
      {shown.split('').map((ch, i) => <span key={i} className="flap">{ch}</span>)}
    </div>
  );
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 18 tiles on wide screens, 14 on phones (the longest headline, BUMPER HARVEST, is 14). */
function useTiles() {
  const narrow = () => typeof window !== 'undefined' && window.innerWidth < 600;
  const [tiles, setTiles] = useState(narrow() ? 14 : 18);
  useEffect(() => {
    const on = () => setTiles(narrow() ? 14 : 18);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return tiles;
}

export function Board({ event, goodName, dockIn, explorer }: { event?: HarbourEvent; goodName: string; dockIn: number; explorer: (h: string) => string }) {
  const tiles = useTiles();
  if (!event) return <section className="board"><FlapRow text="HARBOUR OPENING" width={tiles} /></section>;
  const arrow = event.dir > 0 ? '▲' : event.dir < 0 ? '▼' : '·';
  const move = event.dir === 0 ? 'NO CHANGE' : `${goodName} ${arrow} ${event.magnitude}%`;
  const docked = event.docked || event.dir === 0;
  return (
    <section className="board" aria-live="polite">
      <div className="board-meta">
        <span>Harbour board</span>
        <span>Round {event.round}</span>
      </div>
      <FlapRow text={event.title} width={tiles} />
      <FlapRow text={move} width={tiles} tone={event.dir > 0 ? 'up' : event.dir < 0 ? 'down' : 'dim'} />
      <div className="board-foot">
        <span className="board-line">{event.line}</span>
        <span className={`dock ${docked ? 'done' : ''}`}>
          {docked ? 'Ship docked · price moved' : dockIn > 0 ? <>Ship docks in <b>{mmss(dockIn)}</b> · trade before it lands</> : 'Ship docking now…'}
        </span>
      </div>
      <a className="proof" href={explorer(event.proof)} target="_blank" rel="noreferrer">
        Drawn on-chain ({event.source === 'contract' ? 'Harbour contract' : 'remark'}) · {event.proof.slice(0, 10)}…
      </a>
    </section>
  );
}
