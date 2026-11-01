import { useEffect } from 'react';
import { usePath } from './router';
import Game from './Game';
import Home from './pages/Home';
import Guide from './pages/Guide';
import Season from './pages/Season';
import Profile from './pages/Profile';

const TITLES: Record<string, string> = { '/play': 'Play', '/guide': 'How to play', '/season': 'Season', '/portfolio': 'Portfolio' };

export default function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const captain = path.match(/^\/captain\/(\w+)$/)?.[1];
  useEffect(() => {
    const t = captain ? 'Captain' : TITLES[path];
    document.title = t ? `${t} · Portside` : 'Portside · Read the news. Beat the ship.';
  }, [path, captain]);

  if (path === '/play') return <Game />;
  if (path === '/guide') return <Guide />;
  if (path === '/season') return <Season />;
  if (path === '/portfolio') return <Profile />;
  if (captain) return <Profile key={captain} address={captain} />;
  return <Home />;
}
