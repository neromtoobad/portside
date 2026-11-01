import { Link } from '../router';
import { CARGO, KIND_ART } from '../art';
import { useHarbour } from '../data';
import { RANKS } from '../progress';
import { BADGES } from '../missions';
import { Page } from './Site';

const KINDS = [
  { kind: 0, title: 'Earnings beat', what: 'Profits came in above forecast.', dir: 1 },
  { kind: 1, title: 'Launch sell-out', what: 'A new product is flying off the shelves.', dir: 1 },
  { kind: 2, title: 'Whale buying', what: 'A big fund is scooping up shares.', dir: 1 },
  { kind: 3, title: 'Supply storm', what: 'Shipments are stuck behind a storm.', dir: -1 },
  { kind: 4, title: 'Rival fleet', what: 'Competitors flooded the port with cheaper stock.', dir: -1 },
  { kind: 5, title: 'Calm seas', what: 'A quiet round. No price news.', dir: 0 },
];

const TOC = [
  ['start', 'Quick start'], ['round', 'A round, minute by minute'], ['news', 'Reading the news'], ['trading', 'Buying and selling'],
  ['score', 'Net worth and ranks'], ['streaks', 'Streaks, missions, badges'], ['rumours', 'Rumours'], ['fair', 'Fair play'], ['words', 'Glossary'],
];

export default function Guide() {
  const { state } = useHarbour();
  const round = state?.roundSeconds ?? 300, dock = state?.dockSeconds ?? 45, lead = state?.rumour?.leadSeconds ?? 60;
  const mark = (s: number) => `${(s / round) * 100}%`;
  const min = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const marks: [number, string, string][] = [
    [0, 'News posted, the ship sets sail. Trading window opens.', 'trade'],
    [dock, 'Ship docks and the price moves by the posted amount.', 'dock'],
    [round / 2, 'Tide: prices drift a quarter of the way back to normal.', ''],
    [round - lead, 'Rumour holders hear the next ship.', 'rumour'],
    [round, 'Next round begins.', ''],
  ];
  return (
    <Page state={state} className="guide">
      <header className="page-head">
        <div className="wrap">
          <span className="eyebrow">Guide</span>
          <h1>How to play Portside</h1>
          <p className="lede">Everything you need in five minutes: one headline per round, one ship, one decision.</p>
        </div>
      </header>
      <div className="wrap guide-body">
        <nav className="toc" aria-label="On this page">
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          <Link to="/play" className="btn go wide">Play now</Link>
        </nav>
        <article className="doc">
          <section id="start">
            <h2>Quick start</h2>
            <ol className="quick">
              <li><b>Open the harbour.</b> Press Play, pick a captain’s name, and you get 1,000 DUCAT and a wallet in your browser. No sign-up, no gas.</li>
              <li><b>Read the news card.</b> Top left. It names one stock and how far it will move: “Earnings beat, Nvidia ▲ 12%”.</li>
              <li><b>Trade before the ship docks.</b> Good news: buy that stock. Bad news: sell it if you hold it. You have {dock} seconds.</li>
              <li><b>Watch it land.</b> The price moves by the posted amount when the ship docks, and you see what it did for you.</li>
            </ol>
          </section>

          <section id="round">
            <h2>A round, minute by minute</h2>
            <p>Each round is {min(round)} long. Here is what happens and when.</p>
            <div className="timeline">
              <div className="tl-bar">
                <span className="tl-zone trade" style={{ left: 0, width: mark(dock) }} />
                <span className="tl-zone rumour" style={{ left: mark(round - lead), width: mark(lead) }} />
              </div>
              <div className="tl-marks">
                {marks.map(([at], i) => <span key={i} style={{ left: mark(at) }} />)}
              </div>
              <ol className="tl-list">
                {marks.map(([at, what, tone], i) => <li key={i} className={tone}><b>{min(at)}</b>{what}</li>)}
              </ol>
            </div>
            <p>The tide matters: after a big move, prices drift back toward normal, so a stock that just jumped often gives some of it back. Selling into the move is usually the smart play.</p>
          </section>

          <section id="news">
            <h2>Reading the news</h2>
            <p>There are six kinds of headline. Three push a stock up, two push it down, and one is a quiet round. The size of the move, from 5% to 29%, is on the card.</p>
            <div className="kinds">
              {KINDS.map((k) => (
                <div key={k.kind} className="kind-row">
                  <img src={KIND_ART[k.kind]} alt="" />
                  <div><b>{k.title}</b><span>{k.what}</span></div>
                  <em className={k.dir > 0 ? 'up' : k.dir < 0 ? 'down' : 'flat'}>{k.dir > 0 ? 'Price up ▲' : k.dir < 0 ? 'Price down ▼' : 'No move'}</em>
                </div>
              ))}
            </div>
            <div className="stocks-row">
              {(state?.goods ?? []).map((g) => <span key={g.id}><img src={CARGO[g.symbol]} alt="" />{g.symbol}<small>{g.name}</small></span>)}
            </div>
          </section>

          <section id="trading">
            <h2>Buying and selling</h2>
            <ul>
              <li><b>Buy</b> spends DUCAT for shares of a stock. <b>Sell</b> turns shares back into DUCAT. Tap a price bubble on the harbour or a card in the dock row.</li>
              <li>Every trade is a real swap on a pool, so big trades move the price against you. The trade panel shows the <b>price impact</b> before you confirm.</li>
              <li>The pool keeps a 0.3% fee. Network fees are covered by the harbour.</li>
              <li>Other captains trade the same pools. You’ll see their faces pop up on the piers as they trade.</li>
            </ul>
          </section>

          <section id="score">
            <h2>Net worth and ranks</h2>
            <p>Your score is your <b>net worth</b>: DUCAT in your purse plus your shares at today’s prices. You start with 1,000. Your rank grows with it.</p>
            <div className="ranks">
              {RANKS.map((r, i) => <div key={r.name} className={`rank-chip tier-${i}`}><b>{r.name}</b><span>{r.min ? `${r.min.toLocaleString()}+` : 'start'}</span></div>)}
            </div>
            <p>The season podium on the <Link to="/season">Season page</Link> shows the top three. Each day’s standings are anchored on Portaldot.</p>
          </section>

          <section id="streaks">
            <h2>Streaks, missions, badges</h2>
            <p>A <b>right call</b> is trading the news stock the right way before its ship docks: buying before good news, or selling before bad news. Right calls in a row build your <b>streak</b>. Rounds you sit out don’t break it; a wrong call does.</p>
            <p>Every day brings <b>three missions</b>, the same for every captain. Finish all three for the Shipshape badge. Track them in the game’s Missions tab or on your <Link to="/portfolio">Portfolio</Link>.</p>
            <div className="badge-grid">
              {BADGES.map((b) => <div key={b.id} className={`medal tone-${b.tone}`}><span><img src={b.icon} alt="" /></span><b>{b.name}</b><small>{b.how}</small></div>)}
            </div>
          </section>

          <section id="rumours">
            <h2>Rumours</h2>
            <p>The next round’s headline is drawn on-chain {lead} seconds before the round begins. A <b>rumour ticket</b> lets you hear it then, while everyone else waits for the board.</p>
            <ul>
              <li>A ticket costs <b>{state?.rumour?.price ?? 25} DUCAT</b>, paid to the harbourmaster from the news card. You can buy <b>{state?.rumour?.perDay ?? 2} a day</b>.</li>
              <li>Your ticket is used at the next rumour window. If you buy during a window, you hear that one straight away.</li>
              <li>It’s a head start, not a sure thing: other captains can still trade, and calm seas are possible.</li>
            </ul>
          </section>

          <section id="fair">
            <h2>Fair play</h2>
            <p>The keeper commits to a secret seed before each round and reveals it to the Harbour contract, which mixes in the block hash and draws the stock, the kind of news and the size. Because the block hash isn’t known until the reveal, nobody, the keeper included, can know a headline in advance. Every news card links to its proof.</p>
            <p>Prices are pools on Portaldot’s native DEX. When a ship docks, the keeper moves that pool by the posted amount in a public transaction. Daily standings are anchored as a Merkle root, so any result can be checked.</p>
          </section>

          <section id="words">
            <h2>Glossary</h2>
            <dl className="glossary">
              <dt>DUCAT</dt><dd>The harbour’s coin. Testnet only, no real value.</dd>
              <dt>Dock</dt><dd>The moment the ship lands and the news moves the price.</dd>
              <dt>Tide</dt><dd>Halfway through a round, every price drifts a quarter of the way back toward normal.</dd>
              <dt>Price impact</dt><dd>How much your own trade moves the pool price.</dd>
              <dt>Right call</dt><dd>Trading the news stock the right way before its ship docks.</dd>
              <dt>Anchor</dt><dd>A daily on-chain fingerprint of the standings.</dd>
            </dl>
          </section>
          <Link to="/play" className="btn go big">Open the harbour</Link>
        </article>
      </div>
    </Page>
  );
}
