// frontend/src/components/Leaderboard/LeaderboardScreen.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './LeaderboardScreen.css';

// Sport-specific positions (mirrors TeamsPage SPORT_CONFIG)
const SPORT_POSITIONS = {
  nfl: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  nba: ['PG', 'SG', 'SF', 'PF', 'C'],
  mlb: ['P', 'C', '1B', 'OF', 'FLEX']
};

const LeaderboardScreen = () => {
  const { contestId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `/api/contests/${contestId}/leaderboard`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        setData(response.data);
      } catch (err) {
        console.error('Leaderboard fetch error:', err);
        setError(err.response?.data?.error || 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [contestId]);

  // Currency-aware formatters
  const formatters = useMemo(() => {
    const isFree = data?.contest?.currency === 'tickets';
    return {
      isFree,
      symbol: isFree ? '🎟️ ' : '$',
      fmt: (n) => isFree
        ? Math.round(Number(n) || 0).toLocaleString()
        : (Number(n) || 0).toFixed(2)
    };
  }, [data]);

  const positions = useMemo(() => {
    const sport = (data?.contest?.sport || 'nfl').toLowerCase();
    return SPORT_POSITIONS[sport] || SPORT_POSITIONS.nfl;
  }, [data]);

  const handleRowClick = useCallback((entry) => {
    if (entry.roster && Object.keys(entry.roster).length > 0) {
      setSelectedEntry(entry);
    }
  }, []);

  if (loading) {
    return (
      <div className="leaderboard-screen">
        <div className="leaderboard-loading">
          <div className="spinner"></div>
          <p>Loading leaderboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaderboard-screen">
        <div className="leaderboard-error">
          <h2>Leaderboard unavailable</h2>
          <p>{error}</p>
          <button className="back-btn" onClick={() => navigate('/teams?tab=history')}>
            ← Back to My Teams
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { contest, topEntries, userEntries } = data;
  const showUserSection = userEntries.length > 0;
  const isSettled = contest.status === 'settled';
  const statusBadge = isSettled
    ? { text: 'SETTLED', cls: 'settled' }
    : { text: 'SCORED — AWAITING SETTLEMENT', cls: 'scored' };

  return (
    <div className="leaderboard-screen">
      <button className="back-btn" onClick={() => navigate('/teams?tab=history')}>
        ← Back to My Teams
      </button>

      <header className="leaderboard-header">
        <div className="header-top">
          <h1>{contest.name}</h1>
          <span className={`status-badge ${statusBadge.cls}`}>{statusBadge.text}</span>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">Total Entries</span>
            <span className="stat-value">{contest.totalEntries.toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Prize Pool</span>
            <span className="stat-value">
              {formatters.symbol}{formatters.fmt(contest.prizePool)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Entry Fee</span>
            <span className="stat-value">
              {formatters.symbol}{formatters.fmt(contest.entryFee)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Paid Places</span>
            <span className="stat-value">{contest.prizes.length}</span>
          </div>
        </div>
      </header>

      <section className="leaderboard-section">
        <h2 className="section-title">Top 100</h2>
        <LeaderboardTable
          entries={topEntries}
          formatters={formatters}
          onRowClick={handleRowClick}
        />
      </section>

      {showUserSection && (
        <section className="leaderboard-section user-section">
          <h2 className="section-title">
            Your Other Entries ({userEntries.length})
          </h2>
          <LeaderboardTable
            entries={userEntries}
            formatters={formatters}
            onRowClick={handleRowClick}
            allUserOwned
          />
        </section>
      )}

      {selectedEntry && (
        <RosterModal
          entry={selectedEntry}
          positions={positions}
          formatters={formatters}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
};

// ============================================================
// Sub-component: Table of leaderboard rows
// ============================================================
const LeaderboardTable = ({ entries, formatters, onRowClick, allUserOwned = false }) => (
  <div className="leaderboard-table">
    <div className="leaderboard-row leaderboard-row-header">
      <div className="col-rank">Rank</div>
      <div className="col-user">Player</div>
      <div className="col-points">Points</div>
      <div className="col-spent">Spent</div>
      <div className="col-prize">Prize</div>
    </div>
    {entries.map(entry => {
      const isUser = entry.isCurrentUser || allUserOwned;
      const rowClass = [
        'leaderboard-row',
        isUser ? 'is-current-user' : '',
        entry.rank === 1 ? 'is-first-place' : '',
        entry.prizeWon > 0 ? 'is-winner' : ''
      ].filter(Boolean).join(' ');

      return (
        <div
          key={entry.entryId}
          className={rowClass}
          onClick={() => onRowClick(entry)}
          role="button"
          tabIndex={0}
        >
          <div className="col-rank">
            {entry.rank === 1 && '🏆 '}
            #{entry.rank.toLocaleString()}
          </div>
          <div className="col-user">
            {entry.username}
            {isUser && <span className="you-tag">YOU</span>}
          </div>
          <div className="col-points">{entry.totalPoints.toFixed(1)}</div>
          <div className="col-spent">${entry.totalSpent.toFixed(0)}</div>
          <div className="col-prize">
            {entry.prizeWon > 0
              ? `${formatters.symbol}${formatters.fmt(entry.prizeWon)}`
              : '—'}
          </div>
        </div>
      );
    })}
  </div>
);

// ============================================================
// Sub-component: Roster popup
// ============================================================
const RosterModal = ({ entry, positions, formatters, onClose }) => (
  <div className="roster-modal-overlay" onClick={onClose}>
    <div className="roster-modal" onClick={e => e.stopPropagation()}>
      <button className="modal-close" onClick={onClose}>×</button>
      <div className="roster-modal-header">
        <h2>
          {entry.username}
          {entry.isCurrentUser && <span className="you-tag">YOU</span>}
        </h2>
        <div className="roster-modal-meta">
          <span>Rank #{entry.rank.toLocaleString()}</span>
          <span>·</span>
          <span>{entry.totalPoints.toFixed(1)} pts</span>
          <span>·</span>
          <span>${entry.totalSpent.toFixed(0)} spent</span>
          {entry.prizeWon > 0 && (
            <>
              <span>·</span>
              <span className="prize-won">
                Won {formatters.symbol}{formatters.fmt(entry.prizeWon)}
              </span>
            </>
          )}
        </div>
      </div>

      <table className="roster-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Player</th>
            <th>Team</th>
            <th className="num">Price</th>
            <th className="num">Points</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => {
            const player = entry.roster?.[pos];
            if (!player) {
              return (
                <tr key={pos}>
                  <td className="pos">{pos}</td>
                  <td className="empty" colSpan={4}>Empty</td>
                </tr>
              );
            }
            const points = Number(player.score || player.points || 0);
            const scoreClass = points > 20 ? 'high' : points < 8 ? 'low' : '';
            return (
              <tr key={pos}>
                <td className="pos">{pos}</td>
                <td className="name">{player.name}</td>
                <td className="team">{player.team || '—'}</td>
                <td className="num">${player.price || 0}</td>
                <td className={`num score ${scoreClass}`}>{points.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

export default LeaderboardScreen;