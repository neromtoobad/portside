import { useState } from 'react';
import { Link } from '../router';
import { CARGO, KIND_ART } from '../art';
import { roundChange } from '../Harbour';
import { fmt, mmss, priceDigits, useClock, useHarbour, explorer, short } from '../data';
import { rankFor } from '../progress';
import { Face, Page, Spark } from './Site';

const FEATURES = [
  { art: '/art/ship.webp', title: 'Dock drama', text: 'A ten-second countdown, a splash when the ship lands, and a result the moment the price moves: called it, dodged it or missed the boat.' },
  { art: '/art/headset.webp', title: 'Rumours', text: 'Spend a little DUCAT to hear the next ship a minute before the board posts it. Two a day, so use them well.' },
  { art: '/art/trophy.webp', title: 'Daily missions', text: 'Three new missions every day, like selling before a fall or trading three different stocks.' },
  { art: '/art/rocket.webp', title: 'Ranks, streaks, badges', text: 'Climb from Deckhand to Admiral, build a streak of right calls, and fill a cabinet of twelve badges.' },
  { art: '/art/chips.webp', title: 'Your portfolio', text: 'Shares, average cost and profit for every stock, plus a chart of your net worth through the season.' },
  { art: '/art/guild.webp', title: 'Fair by design', text: 'News is drawn by the Harbour contract with commit-reveal. Prices are real pools. Daily standings are anchored on-chain.' },
];

const FAQ = [
  ['Is this real money?', 'No. You play with DUCAT, the harbour’s own coin on the Portaldot testnet. Everyone starts with 1,000.'],
  ['Are these real stock prices?', 'No. Each stock is a pool on Portaldot’s DEX with its own game price in DUCAT. It moves with the harbour news and with what captains buy and sell, not with the real market.'],
  ['Do I need a wallet or gas?', 'No. The site makes a wallet in your browser and the harbour pays your network fees. You can copy your recovery phrase from the game at any time.'],
  ['Who decides the news?', 'The Harbour contract. The keeper commits to a secret seed, reveals it each round, and the contract mixes in the block hash, so nobody can know a headline before it is drawn. Every headline links to its proof.'],
  ['How do I win a season?', 'Finish with the highest net worth: your DUCAT plus the value of your shares. The top three go on the season podium, and each day’s standings are anchored on Portaldot.'],
];

export default function Home() {
  const { state, me } = useHarbour();
  const now = useClock(1000);
  const [open, setOpen] = useState(0);
  const ev = state?.event;
  const good = ev ? state!.goods[ev.good] : undefined;
  const sailing = ev && ev.dir !== 0 && !ev.docked;
  const roundEnd = state ? state.roundStartedAt + state.roundSeconds * 1000 : 0;
  const span = state ? Math.max(1, state.dockAt - state.roundStartedAt) : 1;
  const progress = !state || ev?.docked ? 100 : Math.min(100, Math.max(0, ((now - state.roundStartedAt) / span) * 100));

  return (
    <Page state={state} className="home">
      <section className="hero">
        <img className="hero-art" src="/art/scene-1600.webp" alt="" />
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="eyebrow"><i className="live-dot" /> Live on Portaldot testnet{state ? ` · Season ${state.season}` : ''}</span>
            <h1>Read the news.<br />Beat the ship.</h1>
            <p>Portside is a stock-trading game in a busy harbour. Every few minutes a ship sails in with news about <b>Nvidia, Apple, Tesla, Amazon or Meta</b>. Trade before it docks and the price moves your way.</p>
            <div className="hero-cta">
              <Link to="/play" className="btn go big">Play now, it’s free</Link>
              <Link to="/guide" className="btn ghost big">How to play</Link>
            </div>
            <ul className="hero-stats">
              <li><b>{state?.players ?? '–'}</b><span>captains</span></li>
              <li><b>{ev ? `#${ev.round}` : '–'}</b><span>round</span></li>
              <li><b>{state ? mmss(roundEnd - now) : '–'}</b><span>next ship</span></li>
              <li><b>1,000</b><span>DUCAT to start</span></li>
            </ul>
          </div>

          {state && ev && (
            <aside className="panel live-card" aria-live="polite">
              <div className="live-top"><span>Now at the harbour</span><span>Round {ev.round}</span></div>
              <div className="live-news">
                <img src={KIND_ART[ev.kind]} alt="" />
                <div>
                  <h3>{ev.title}{ev.dir !== 0 && '!'}</h3>
                  {ev.dir !== 0
                    ? <span className={`move ${ev.dir > 0 ? 'up' : 'down'}`}>{good?.name} {ev.dir > 0 ? '▲' : '▼'} {ev.magnitude}%</span>
                    : <span className="move flat">No price news</span>}
                  <p>{ev.line}</p>
                </div>
              </div>
              {ev.dir !== 0 && (
                <div className={`voyage ${sailing ? '' : 'done'}`}>
                  <div className="track"><span style={{ width: `${progress}%` }} /></div>
                  <p>{sailing ? <>Ship docks in <b>{mmss(state.dockAt - now)}</b></> : <>Docked · {good?.name} moved {ev.dir > 0 ? '+' : '−'}{ev.magnitude}%</>}</p>
                </div>
              )}
              <ul className="live-board">
                {state.goods.map((g) => {
                  const p = state.prices[g.id]?.price ?? 0, ch = roundChange(state, g.id);
                  return (
                    <li key={g.id}>
                      <img src={CARGO[g.symbol]} alt="" />
                      <span className="sym">{g.symbol}</span>
                      <Spark points={(state.history[g.id] ?? []).slice(-40).map((x) => x.p)} w={70} h={22} />
                      <b>{fmt(p, priceDigits(p))}</b>
                      <i className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '+' : ''}{fmt(ch, 1)}%</i>
                    </li>
                  );
                })}
              </ul>
              <Link to="/play" className="btn go wide">Trade this round</Link>
            </aside>
          )}
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2>How a round works</h2>
          <p className="lede">A round lasts {state ? Math.round(state.roundSeconds / 60) : 5} minutes. The whole game is reading one headline and acting before the ship lands.</p>
          <ol className="steps-row">
            <li><img src="/art/ship.webp" alt="" /><b>1. News is posted</b><span>A ship sets sail with news about one stock: an earnings beat, a supply storm, a rival fleet.</span></li>
            <li><img src="/art/chips.webp" alt="" /><b>2. Trade before it docks</b><span>You have {state?.dockSeconds ?? 45} seconds. Buy before good news, sell before bad news.</span></li>
            <li><img src="/art/trophy.webp" alt="" /><b>3. The price moves</b><span>When the ship docks, that stock jumps or sinks by the posted amount. Right call, right money.</span></li>
            <li><img src="/art/guild.webp" alt="" /><b>4. Climb the board</b><span>Your net worth sets your rank. Missions, streaks and badges keep score of how you got there.</span></li>
          </ol>
        </div>
      </section>

      {state && (
        <section className="band tint">
          <div className="wrap">
            <h2>Five piers, five stocks</h2>
            <p className="lede">Each stock has its own pier and its own pool on Portaldot’s DEX. Prices are in DUCAT and move with the harbour, not the real market.</p>
            <div className="piers">
              {state.goods.map((g) => {
                const p = state.prices[g.id]?.price ?? 0, h = (state.history[g.id] ?? []).map((x) => x.p);
                const ch = h.length ? (p / h[0] - 1) * 100 : 0;
                return (
                  <Link to="/play" key={g.id} className="pier-card">
                    <img src={CARGO[g.symbol]} alt="" />
                    <div><span className="sym">{g.symbol}</span><b>{g.name}</b></div>
                    <Spark points={h.slice(-60)} w={140} h={40} />
                    <div className="pier-price"><b>{fmt(p, priceDigits(p))}</b><i className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'} {fmt(Math.abs(ch), 1)}%</i></div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="band">
        <div className="wrap">
          <h2>More than a price chart</h2>
          <div className="features">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature"><img src={f.art} alt="" /><h3>{f.title}</h3><p>{f.text}</p></article>
            ))}
          </div>
        </div>
      </section>

      {state && (
        <section className="band tint">
          <div className="wrap split">
            <div>
              <h2>Captains’ board</h2>
              <p className="lede">Net worth is DUCAT plus the value of your shares. Season {state.season} ends {state.seasonEndsAt ? new Date(state.seasonEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : 'soon'}.</p>
              <Link to="/season" className="btn ghost">See the season</Link>
            </div>
            <ol className="mini-board">
              {state.leaderboard.slice(0, 5).map((r, i) => (
                <li key={r.address} className={r.address === me?.pair.address ? 'me' : ''}>
                  <span className="pos">{i + 1}</span>
                  <Face address={r.address} tier={rankFor(r.worth).tier} size={40} />
                  <Link to={`/captain/${r.address}`} className="who">{r.name}<small>{rankFor(r.worth).name}</small></Link>
                  <b>{fmt(r.worth, 0)}</b>
                </li>
              ))}
              {!state.leaderboard.length && <li className="empty">No captains yet. Be the first.</li>}
            </ol>
          </div>
        </section>
      )}

      <section className="band">
        <div className="wrap">
          <h2>Built on Portaldot</h2>
          <div className="proofs">
            <div><b>Real pools</b><p>Every stock trades against DUCAT on <code>pallet-asset-conversion</code>. Your Buy button signs a real swap in your browser.</p></div>
            <div><b>News you can check</b><p>The Harbour contract draws each headline with commit-reveal and the block hash.{ev && <> Latest: <a href={explorer(ev.proof)} target="_blank" rel="noreferrer">{short(ev.proof)}</a></>}</p></div>
            <div><b>Standings on-chain</b><p>Each day the keeper anchors a Merkle root of the board.{state?.anchors[0] && <> Latest: <a href={explorer(state.anchors[0].proof)} target="_blank" rel="noreferrer">{state.anchors[0].day}</a></>}</p></div>
          </div>
        </div>
      </section>

      <section className="band tint">
        <div className="wrap narrow">
          <h2>Questions</h2>
          <div className="faq">
            {FAQ.map(([q, a], i) => (
              <div key={q} className={`faq-item ${open === i ? 'open' : ''}`}>
                <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>{q}<span>{open === i ? '−' : '+'}</span></button>
                {open === i && <p>{a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-band">
        <img src="/art/ship.webp" alt="" />
        <div>
          <h2>{state ? <>The next ship leaves in {mmss(roundEnd - now)}</> : 'A ship is coming into port'}</h2>
          <p>Pick a captain’s name and you’re trading in ten seconds.</p>
        </div>
        <Link to="/play" className="btn go big">Play now</Link>
      </section>
    </Page>
  );
}
