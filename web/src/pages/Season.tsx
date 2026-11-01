import { Link } from '../router';
import { explorer, fmt, STARTING_PURSE, useClock, useHarbour } from '../data';
import { rankFor } from '../progress';
import { Face, Page } from './Site';

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 86_400), Math.floor((s % 86_400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}

export default function Season() {
  const { state, me } = useHarbour();
  const now = useClock(1000);
  const board = state?.leaderboard ?? [];
  const [d, h, m, s] = countdown((state?.seasonEndsAt ?? now) - now);
  const ended = state?.seasonEndsAt !== undefined && now >= state.seasonEndsAt;
  const podium = [board[1], board[0], board[2]];
  return (
    <Page state={state} className="season">
      <header className="page-head season-head">
        <div className="wrap">
          <span className="eyebrow">Season {state?.season ?? '–'}</span>
          <h1>The captains’ podium</h1>
          <p className="lede">Highest net worth when the season closes takes the Admiral’s flag.</p>
          <div className="clock" aria-label="Time left in the season">
            {ended ? <b className="ended">Season closed</b> : [['days', d], ['hours', h], ['min', m], ['sec', s]].map(([l, v]) => (
              <span key={l as string}><b>{String(v).padStart(2, '0')}</b><small>{l}</small></span>
            ))}
          </div>
        </div>
      </header>

      <section className="wrap podium">
        {podium.map((r, i) => {
          const place = [2, 1, 3][i];
          if (!r) return <div key={place} className={`step p${place} empty`}><span className="place">{place}</span><p>Open berth</p></div>;
          const rank = rankFor(r.worth);
          return (
            <Link to={`/captain/${r.address}`} key={r.address} className={`step p${place}`}>
              <Face address={r.address} tier={rank.tier} size={place === 1 ? 120 : 92} />
              <b>{r.name}</b>
              <small>{rank.name}</small>
              <span className="worth">{fmt(r.worth, 0)} <i>DUCAT</i></span>
              <span className="place">{place}</span>
            </Link>
          );
        })}
      </section>

      <section className="wrap season-grid">
        <div className="panel card">
          <h2>Full standings</h2>
          <table className="table">
            <thead><tr><th>#</th><th>Captain</th><th>Rank</th><th className="num">Net worth</th><th className="num">P&amp;L</th></tr></thead>
            <tbody>
              {board.map((r, i) => {
                const pnl = r.worth - STARTING_PURSE;
                return (
                  <tr key={r.address} className={r.address === me?.pair.address ? 'me' : ''}>
                    <td className="pos">{i + 1}</td>
                    <td><Link to={`/captain/${r.address}`} className="who-cell"><Face address={r.address} tier={rankFor(r.worth).tier} size={32} />{r.name}{r.address === me?.pair.address && ' (you)'}</Link></td>
                    <td>{rankFor(r.worth).name}</td>
                    <td className="num"><b>{fmt(r.worth)}</b></td>
                    <td className={`num ${pnl >= 0 ? 'up' : 'down'}`}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</td>
                  </tr>
                );
              })}
              {!board.length && <tr><td colSpan={5} className="empty">No captains yet. <Link to="/play">Be the first.</Link></td></tr>}
            </tbody>
          </table>
        </div>

        <aside className="side-col">
          <div className="panel card prize">
            <img src="/art/trophy.webp" alt="" />
            <h2>What’s at stake</h2>
            <ul>
              <li><b>1st</b> The Admiral’s flag and the top of the Hall of Fame</li>
              <li><b>2nd–3rd</b> A place on the podium for the season</li>
              <li><b>Every day</b> The day’s champion is written into an on-chain anchor</li>
            </ul>
            <p className="muted">No real money: it’s bragging rights, kept on Portaldot.</p>
          </div>

          <div className="panel card">
            <h2>Daily champions</h2>
            <ul className="champs">
              {(state?.anchors ?? []).map((a) => (
                <li key={a.root}>
                  <span className="day">{new Date(a.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  {a.top?.[0]
                    ? <Link to={`/captain/${a.top[0].address}`} className="who-cell"><Face address={a.top[0].address} size={28} />{a.top[0].name}<small>{fmt(a.top[0].worth, 0)}</small></Link>
                    : <span className="muted">{a.players} captains</span>}
                  <a href={explorer(a.proof)} target="_blank" rel="noreferrer" className="proof">anchor</a>
                </li>
              ))}
              {!state?.anchors.length && <li className="empty">The first day’s champion is anchored at midnight UTC.</li>}
            </ul>
          </div>
        </aside>
      </section>
    </Page>
  );
}
