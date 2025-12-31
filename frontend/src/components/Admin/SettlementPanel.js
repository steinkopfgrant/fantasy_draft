// frontend/src/components/Admin/SettlementPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './SettlementPanel.css';

const SettlementPanel = () => {
  const [contests, setContests] = useState([]);
  const [selectedContest, setSelectedContest] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('contests');
  
  // Player score form
  const [playerScoreForm, setPlayerScoreForm] = useState({
    playerName: '',
    playerTeam: '',
    week: 1,
    season: 2024,
    score: 0
  });

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Fetch contests
  const fetchContests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/settlement/contests', getAuthHeader());
      if (response.data.success) {
        setContests(response.data.contests);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch contests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

  // Fetch leaderboard for a contest
  const fetchLeaderboard = async (contestId) => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/admin/settlement/leaderboard/${contestId}?limit=100`,
        getAuthHeader()
      );
      if (response.data.success) {
        setLeaderboard(response.data.leaderboard);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch leaderboard');
    } finally {
      setLoading(false);
    }
  };

  // Preview settlement
  const fetchPreview = async (contestId) => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/admin/settlement/preview/${contestId}`,
        getAuthHeader()
      );
      if (response.data.success) {
        setPreview(response.data.preview);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch preview');
    } finally {
      setLoading(false);
    }
  };

  // Calculate scores for a contest
  const calculateScores = async (contestId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(
        `/api/admin/settlement/calculate-scores/${contestId}`,
        { week: 1, season: 2024 },
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Calculated scores for ${response.data.results.length} entries`);
        fetchLeaderboard(contestId);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to calculate scores');
    } finally {
      setLoading(false);
    }
  };

  // Settle a contest
  const settleContest = async (contestId, force = false) => {
    if (!window.confirm(`Are you sure you want to settle this contest? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(
        `/api/admin/settlement/settle/${contestId}`,
        { force },
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess('Contest settled successfully!');
        fetchContests();
        setSelectedContest(null);
        setPreview(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to settle contest');
    } finally {
      setLoading(false);
    }
  };

  // Set player score
  const setPlayerScore = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(
        '/api/admin/settlement/set-player-score',
        playerScoreForm,
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Score set for ${playerScoreForm.playerName}: ${playerScoreForm.score} pts`);
        setPlayerScoreForm({ ...playerScoreForm, playerName: '', playerTeam: '', score: 0 });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set player score');
    } finally {
      setLoading(false);
    }
  };

  // Finalize week scores
  const finalizeWeek = async () => {
    if (!window.confirm('Mark all player scores for this week as final?')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(
        '/api/admin/settlement/finalize-week',
        { week: playerScoreForm.week, season: playerScoreForm.season },
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Finalized ${response.data.count} player scores for Week ${playerScoreForm.week}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to finalize week');
    } finally {
      setLoading(false);
    }
  };

  // Select a contest
  const handleSelectContest = (contest) => {
    setSelectedContest(contest);
    setLeaderboard([]);
    setPreview(null);
    setContestPlayers([]);
    fetchLeaderboard(contest.id);
  };

  // Fetch players drafted in a contest
  const [contestPlayers, setContestPlayers] = useState([]);
  
  const fetchContestPlayers = async (contestId) => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/admin/settlement/contest-players/${contestId}`,
        getAuthHeader()
      );
      if (response.data.success) {
        setContestPlayers(response.data.players);
        setSuccess(`Found ${response.data.uniquePlayers} unique players in ${response.data.totalEntries} entries`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch contest players');
    } finally {
      setLoading(false);
    }
  };

  // Bulk set scores for a contest
  const bulkSetScores = async (contestId) => {
    if (!window.confirm('Set random fantasy scores for ALL players in this contest?')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(
        '/api/admin/settlement/bulk-set-scores',
        { 
          contestId, 
          week: playerScoreForm.week, 
          season: playerScoreForm.season,
          randomize: true 
        },
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Set scores for ${response.data.playersScored} players! Now click "Calculate Scores".`);
        fetchContestPlayers(contestId);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to bulk set scores');
    } finally {
      setLoading(false);
    }
  };

  // Clear messages after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const getStatusBadge = (status) => {
    const colors = {
      open: '#10b981',
      in_progress: '#f59e0b',
      completed: '#3b82f6',
      settled: '#8b5cf6',
      cancelled: '#ef4444'
    };
    return (
      <span 
        className="status-badge"
        style={{ backgroundColor: colors[status] || '#6b7280' }}
      >
        {status?.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="settlement-panel">
      <div className="panel-header">
        <h1>⚙️ Settlement Admin Panel</h1>
        <p>Manage contest scoring and payouts</p>
      </div>

      {/* Messages */}
      {error && <div className="message error">{error}</div>}
      {success && <div className="message success">{success}</div>}

      {/* Tabs */}
      <div className="panel-tabs">
        <button 
          className={activeTab === 'contests' ? 'active' : ''} 
          onClick={() => setActiveTab('contests')}
        >
          📋 Contests
        </button>
        <button 
          className={activeTab === 'scores' ? 'active' : ''} 
          onClick={() => setActiveTab('scores')}
        >
          📊 Player Scores
        </button>
      </div>

      {/* Contests Tab */}
      {activeTab === 'contests' && (
        <div className="panel-content">
          <div className="contests-section">
            <div className="section-header">
              <h2>All Contests</h2>
              <button onClick={fetchContests} disabled={loading} className="btn-refresh">
                🔄 Refresh
              </button>
            </div>

            {loading && !contests.length ? (
              <div className="loading">Loading contests...</div>
            ) : (
              <div className="contests-table-container">
                <table className="contests-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Entries</th>
                      <th>Prize Pool</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contests.map(contest => (
                      <tr 
                        key={contest.id} 
                        className={selectedContest?.id === contest.id ? 'selected' : ''}
                        onClick={() => handleSelectContest(contest)}
                      >
                        <td>{contest.name}</td>
                        <td>
                          <span className={`type-badge ${contest.type}`}>
                            {contest.type?.toUpperCase()}
                          </span>
                        </td>
                        <td>{getStatusBadge(contest.status)}</td>
                        <td>{contest.currentEntries} / {contest.maxEntries}</td>
                        <td>${contest.prizePool?.toLocaleString()}</td>
                        <td>
                          <button 
                            className="btn-small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectContest(contest);
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected Contest Details */}
          {selectedContest && (
            <div className="contest-details">
              <div className="details-header">
                <h2>{selectedContest.name}</h2>
                {getStatusBadge(selectedContest.status)}
              </div>

              <div className="details-grid">
                <div className="detail-item">
                  <label>Type</label>
                  <span>{selectedContest.type?.toUpperCase()}</span>
                </div>
                <div className="detail-item">
                  <label>Entries</label>
                  <span>{selectedContest.currentEntries} / {selectedContest.maxEntries}</span>
                </div>
                <div className="detail-item">
                  <label>Prize Pool</label>
                  <span>${selectedContest.prizePool?.toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <label>Settled At</label>
                  <span>{selectedContest.settledAt ? new Date(selectedContest.settledAt).toLocaleString() : 'Not settled'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                <button 
                  onClick={() => fetchContestPlayers(selectedContest.id)}
                  disabled={loading}
                  className="btn-action btn-info"
                >
                  👥 View Players
                </button>
                <button 
                  onClick={() => bulkSetScores(selectedContest.id)}
                  disabled={loading || selectedContest.status === 'settled'}
                  className="btn-action btn-warning"
                >
                  🎲 Bulk Set Random Scores
                </button>
                <button 
                  onClick={() => fetchLeaderboard(selectedContest.id)}
                  disabled={loading}
                  className="btn-action"
                >
                  📊 View Leaderboard
                </button>
                <button 
                  onClick={() => calculateScores(selectedContest.id)}
                  disabled={loading || selectedContest.status === 'settled'}
                  className="btn-action"
                >
                  🔢 Calculate Scores
                </button>
                <button 
                  onClick={() => fetchPreview(selectedContest.id)}
                  disabled={loading || selectedContest.status === 'settled'}
                  className="btn-action"
                >
                  👁️ Preview Settlement
                </button>
                <button 
                  onClick={() => settleContest(selectedContest.id)}
                  disabled={loading || selectedContest.status === 'settled'}
                  className="btn-action btn-settle"
                >
                  💰 Settle Contest
                </button>
              </div>

              {/* Contest Players */}
              {contestPlayers.length > 0 && (
                <div className="players-section">
                  <h3>👥 Players Drafted ({contestPlayers.length} unique)</h3>
                  <div className="players-grid">
                    {contestPlayers.map((player, idx) => (
                      <div key={idx} className="player-chip">
                        <span className="player-pos">{player.position}</span>
                        <span className="player-name">{player.name}</span>
                        <span className="player-team">{player.team}</span>
                        <span className="player-count">x{player.draftCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leaderboard */}
              {leaderboard.length > 0 && (
                <div className="leaderboard-section">
                  <h3>📊 Leaderboard ({leaderboard.length} entries)</h3>
                  <div className="leaderboard-table-container">
                    <table className="leaderboard-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>User</th>
                          <th>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((entry, idx) => (
                          <tr key={entry.entryId} className={idx < 3 ? `top-${idx + 1}` : ''}>
                            <td className="rank">
                              {idx === 0 && '🥇'}
                              {idx === 1 && '🥈'}
                              {idx === 2 && '🥉'}
                              {idx > 2 && `#${entry.rank}`}
                            </td>
                            <td>{entry.username}</td>
                            <td className="score">{entry.totalPoints?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Settlement Preview */}
              {preview && (
                <div className="preview-section">
                  <h3>👁️ Settlement Preview</h3>
                  <div className="preview-stats">
                    <div className="stat">
                      <label>Total Entries</label>
                      <span>{preview.totalEntries}</span>
                    </div>
                    <div className="stat">
                      <label>Total Payout</label>
                      <span>${preview.totalPayout?.toLocaleString()}</span>
                    </div>
                    <div className="stat">
                      <label>Expected Pool</label>
                      <span>${preview.expectedPool?.toLocaleString()}</span>
                    </div>
                    <div className="stat">
                      <label>Difference</label>
                      <span className={preview.difference < 0 ? 'negative' : ''}>
                        ${preview.difference?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  <h4>Top Payouts</h4>
                  <div className="preview-table-container">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>User</th>
                          <th>Score</th>
                          <th>Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview?.slice(0, 20).map((entry, idx) => (
                          <tr key={idx} className={entry.payout > 0 ? 'winner' : ''}>
                            <td>#{entry.rank}</td>
                            <td>{entry.username}</td>
                            <td>{entry.totalPoints?.toFixed(2)}</td>
                            <td className="payout">
                              {entry.payout > 0 ? `$${entry.payout.toLocaleString()}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="preview-actions">
                    <button 
                      onClick={() => settleContest(selectedContest.id)}
                      disabled={loading}
                      className="btn-settle-confirm"
                    >
                      ✅ Confirm & Settle Contest
                    </button>
                    <button 
                      onClick={() => setPreview(null)}
                      className="btn-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Player Scores Tab */}
      {activeTab === 'scores' && (
        <div className="panel-content">
          <div className="scores-section">
            <h2>📊 Set Player Scores</h2>
            <p className="section-desc">Manually set player fantasy points for testing or corrections</p>

            <form onSubmit={setPlayerScore} className="score-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Player Name</label>
                  <input
                    type="text"
                    value={playerScoreForm.playerName}
                    onChange={(e) => setPlayerScoreForm({...playerScoreForm, playerName: e.target.value})}
                    placeholder="e.g. Josh Allen"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Team</label>
                  <input
                    type="text"
                    value={playerScoreForm.playerTeam}
                    onChange={(e) => setPlayerScoreForm({...playerScoreForm, playerTeam: e.target.value})}
                    placeholder="e.g. BUF"
                    maxLength={4}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Week</label>
                  <input
                    type="number"
                    value={playerScoreForm.week}
                    onChange={(e) => setPlayerScoreForm({...playerScoreForm, week: parseInt(e.target.value)})}
                    min={1}
                    max={18}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Season</label>
                  <input
                    type="number"
                    value={playerScoreForm.season}
                    onChange={(e) => setPlayerScoreForm({...playerScoreForm, season: parseInt(e.target.value)})}
                    min={2020}
                    max={2030}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Fantasy Points</label>
                  <input
                    type="number"
                    value={playerScoreForm.score}
                    onChange={(e) => setPlayerScoreForm({...playerScoreForm, score: parseFloat(e.target.value)})}
                    step={0.1}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" disabled={loading} className="btn-submit">
                  💾 Set Player Score
                </button>
                <button 
                  type="button" 
                  onClick={finalizeWeek}
                  disabled={loading}
                  className="btn-finalize"
                >
                  ✅ Finalize Week {playerScoreForm.week}
                </button>
              </div>
            </form>

            <div className="quick-scores">
              <h3>Quick Score Entry</h3>
              <p>Common players for testing:</p>
              <div className="quick-buttons">
                {[
                  { name: 'Josh Allen', team: 'BUF', score: 28.5 },
                  { name: 'Patrick Mahomes', team: 'KC', score: 24.2 },
                  { name: 'Lamar Jackson', team: 'BAL', score: 31.8 },
                  { name: 'Saquon Barkley', team: 'PHI', score: 22.4 },
                  { name: 'Derrick Henry', team: 'BAL', score: 19.6 },
                  { name: 'Ja\'Marr Chase', team: 'CIN', score: 26.3 },
                  { name: 'CeeDee Lamb', team: 'DAL', score: 18.9 },
                  { name: 'Travis Kelce', team: 'KC', score: 14.5 },
                ].map(player => (
                  <button
                    key={player.name}
                    onClick={() => setPlayerScoreForm({
                      ...playerScoreForm,
                      playerName: player.name,
                      playerTeam: player.team,
                      score: player.score
                    })}
                    className="quick-btn"
                  >
                    {player.name} ({player.team})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettlementPanel;