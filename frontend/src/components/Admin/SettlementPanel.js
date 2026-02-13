// frontend/src/components/Admin/SettlementPanel.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './SettlementPanel.css';

const SettlementPanel = () => {
  // ==================== STATE ====================
  const [slates, setSlates] = useState([]);
  const [contests, setContests] = useState([]);
  const [activeSlate, setActiveSlate] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Slate detail state
  const [slateTab, setSlateTab] = useState('scores'); // scores | contests | settle
  const [slatePlayers, setSlatePlayers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [settlementLog, setSettlementLog] = useState([]);
  const [settlingAll, setSettlingAll] = useState(false);

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // ==================== DATA LOADING ====================

  const fetchSlates = useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/settlement/slates', getAuthHeader());
      if (response.data.success) {
        setSlates(response.data.slates);
      }
    } catch (err) {
      // Slates table might not exist yet - that's ok
      console.log('Slates not available yet:', err.response?.data?.error || err.message);
      setSlates([]);
    }
  }, []);

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
    fetchSlates();
    fetchContests();
  }, [fetchSlates, fetchContests]);

  // ==================== SLATE DETAIL LOADING ====================

  const loadSlatePlayers = useCallback(async (slate) => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/admin/settlement/slates/${slate.id}/players`,
        getAuthHeader()
      );
      if (response.data.success) {
        setSlatePlayers(response.data.players);
      }
    } catch (err) {
      setError('Failed to load slate players');
    } finally {
      setLoading(false);
    }
  }, []);

  const openSlate = (slate) => {
    setActiveSlate(slate);
    setSlateTab('scores');
    setSettlementLog([]);
    setSearchTerm('');
    setCsvMode(false);
    loadSlatePlayers(slate);
  };

  // ==================== SLATE CRUD ====================

  const createSlate = async (formData) => {
    try {
      setLoading(true);
      const response = await axios.post(
        '/api/admin/settlement/slates',
        formData,
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Slate "${formData.name}" created with ${formData.contestIds.length} contests`);
        setShowCreateModal(false);
        fetchSlates();
        fetchContests();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create slate');
    } finally {
      setLoading(false);
    }
  };

  const deleteSlate = async (slateId) => {
    if (!window.confirm('Delete this slate? Contests will NOT be deleted.')) return;
    try {
      await axios.delete(`/api/admin/settlement/slates/${slateId}`, getAuthHeader());
      setSuccess('Slate deleted');
      fetchSlates();
      fetchContests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete slate');
    }
  };

  // ==================== SCORE MANAGEMENT ====================

  const setPlayerScore = async (player, score) => {
    if (!activeSlate) return;
    try {
      await axios.post('/api/admin/settlement/set-player-score', {
        playerName: player.name,
        playerTeam: player.team,
        week: activeSlate.week,
        season: activeSlate.season,
        score: parseFloat(score)
      }, getAuthHeader());

      setSlatePlayers(prev =>
        prev.map(p =>
          p.name === player.name && p.team === player.team
            ? { ...p, score: parseFloat(score) }
            : p
        )
      );
    } catch (err) {
      setError('Failed to set score: ' + (err.response?.data?.error || err.message));
    }
  };

  const bulkRandomScores = async () => {
    if (!activeSlate) return;
    if (!window.confirm('Set random scores for all players in this slate?')) return;

    try {
      setLoading(true);
      const response = await axios.post(
        `/api/admin/settlement/slates/${activeSlate.id}/bulk-random-scores`,
        {},
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Randomized scores for ${response.data.playersScored} players`);
        loadSlatePlayers(activeSlate);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set random scores');
    } finally {
      setLoading(false);
    }
  };

  const importCsv = async () => {
    if (!activeSlate || !csvText.trim()) return;
    try {
      setLoading(true);
      const response = await axios.post('/api/admin/settlement/import-csv', {
        week: activeSlate.week,
        season: activeSlate.season,
        csv: csvText
      }, getAuthHeader());
      if (response.data.success) {
        setSuccess(response.data.message);
        setCsvMode(false);
        setCsvText('');
        loadSlatePlayers(activeSlate);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'CSV import failed');
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOCK & SETTLE ====================

  const lockScores = async () => {
    if (!activeSlate) return;
    if (!window.confirm('Lock scores for this slate? This will finalize all player scores and recalculate contest entries.')) return;

    try {
      setLoading(true);
      const response = await axios.post(
        `/api/admin/settlement/slates/${activeSlate.id}/lock-scores`,
        {},
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(response.data.message);
        // Update local state
        setActiveSlate(prev => ({ ...prev, scoresLocked: true }));
        fetchSlates();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to lock scores');
    } finally {
      setLoading(false);
    }
  };

  const settleSlate = async () => {
    if (!activeSlate) return;
    setSettlingAll(true);
    setSlateTab('settle');

    try {
      const response = await axios.post(
        `/api/admin/settlement/slates/${activeSlate.id}/settle`,
        { types: ['cash'], force: true },
        getAuthHeader()
      );

      if (response.data.success) {
        setSettlementLog(response.data.results || []);
        setSuccess(response.data.message);
        fetchSlates();
        fetchContests();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Settlement failed');
    } finally {
      setSettlingAll(false);
    }
  };

  const settleSingleContest = async (contestId) => {
    if (!activeSlate) return;
    try {
      setLoading(true);
      const response = await axios.post(
        `/api/admin/settlement/settle/${contestId}`,
        { force: true, week: activeSlate.week, season: activeSlate.season },
        getAuthHeader()
      );
      if (response.data.success) {
        setSuccess(`Contest settled successfully`);
        fetchSlates();
        fetchContests();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to settle contest');
    } finally {
      setLoading(false);
    }
  };

  // ==================== AUTO-CLEAR MESSAGES ====================

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t); }
  }, [success]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  // ==================== COMPUTED VALUES ====================

  const scoredCount = slatePlayers.filter(p => p.score !== null && p.score !== undefined).length;
  const unscoredCount = slatePlayers.length - scoredCount;
  const filteredPlayers = slatePlayers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Contest stats
  const cashContests = contests.filter(c => c.type === 'cash');
  const unassignedContests = contests.filter(c =>
    c.type === 'cash' && !c.slate && c.status !== 'settled' && c.currentEntries > 0
  );

  // ==================== RENDER ====================

  return (
    <div className="settlement-panel">
      {/* Messages */}
      {error && <div className="message error">{error}</div>}
      {success && <div className="message success">{success}</div>}

      {activeSlate ? (
        // ==================== SLATE DETAIL VIEW ====================
        <div className="slate-detail">
          <div className="slate-detail-header">
            <button className="btn-back" onClick={() => { setActiveSlate(null); fetchSlates(); fetchContests(); }}>
              ← Back
            </button>
            <div className="slate-detail-info">
              <h1>{activeSlate.name}</h1>
              <p>{activeSlate.sport?.toUpperCase()} · Week {activeSlate.week} · {activeSlate.contests?.length || 0} contests · {slatePlayers.length} players</p>
            </div>
            <div className="slate-detail-actions">
              {!activeSlate.scoresLocked && scoredCount > 0 && (
                <button className="btn-action btn-warning" onClick={lockScores} disabled={loading}>
                  {loading ? 'Locking...' : `🔒 Lock Scores (${scoredCount} scored)`}
                </button>
              )}
              {activeSlate.scoresLocked && (
                <button className="btn-action btn-settle" onClick={settleSlate} disabled={settlingAll}>
                  {settlingAll ? 'Settling...' : `⚡ Settle All Cash Games (${(activeSlate.contests || []).filter(c => c.status !== 'settled').length})`}
                </button>
              )}
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="slate-tabs">
            {[
              { id: 'scores', label: `Player Scores (${slatePlayers.length})` },
              { id: 'contests', label: `Contests (${(activeSlate.contests || []).length})` },
              { id: 'settle', label: 'Settlement Log' }
            ].map(t => (
              <button
                key={t.id}
                className={slateTab === t.id ? 'active' : ''}
                onClick={() => setSlateTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* SCORES TAB */}
          {slateTab === 'scores' && (
            <div className="scores-tab-content">
              {/* Toolbar */}
              <div className="scores-toolbar">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <span className={`score-status ${unscoredCount > 0 ? 'pending' : 'complete'}`}>
                  {unscoredCount > 0 ? `${unscoredCount} unscored` : '✓ All scored'}
                </span>
                <button className="btn-small" onClick={() => setCsvMode(!csvMode)}>
                  {csvMode ? 'Close CSV' : '📋 Import CSV'}
                </button>
                <button className="btn-small btn-test" onClick={bulkRandomScores} disabled={loading}>
                  🎲 Random (Test)
                </button>
                <button className="btn-small" onClick={() => loadSlatePlayers(activeSlate)} disabled={loading}>
                  🔄
                </button>
              </div>

              {/* CSV Import */}
              {csvMode && (
                <div className="csv-import-box">
                  <p className="csv-hint">
                    Format: <code>PlayerName,Team,Points</code> (one per line)
                  </p>
                  <textarea
                    className="csv-textarea"
                    placeholder={'Josh Allen,BUF,28.5\nSaquon Barkley,PHI,22.3\nJa\'Marr Chase,CIN,31.2'}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                  />
                  <div className="csv-actions">
                    <button className="btn-action" onClick={importCsv} disabled={loading}>
                      Import Scores
                    </button>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="score-progress-bar">
                <div
                  className={`score-progress-fill ${scoredCount === slatePlayers.length && slatePlayers.length > 0 ? 'complete' : ''}`}
                  style={{ width: `${slatePlayers.length > 0 ? (scoredCount / slatePlayers.length) * 100 : 0}%` }}
                />
              </div>

              {/* Player table */}
              {loading && slatePlayers.length === 0 ? (
                <div className="loading">Loading players...</div>
              ) : (
                <div className="scores-table-container">
                  <table className="scores-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th style={{ width: 60 }}>Pos</th>
                        <th style={{ width: 60 }}>Team</th>
                        <th style={{ width: 70 }}>Drafted</th>
                        <th style={{ width: 160 }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map(p => (
                        <PlayerScoreRow
                          key={`${p.name}-${p.team}`}
                          player={p}
                          locked={activeSlate.scoresLocked}
                          onSetScore={(score) => setPlayerScore(p, score)}
                        />
                      ))}
                      {filteredPlayers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="empty-message">
                            {searchTerm ? 'No players match your search' : 'No players found in this slate'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CONTESTS TAB */}
          {slateTab === 'contests' && (
            <div className="contests-table-container">
              <table className="contests-table">
                <thead>
                  <tr>
                    <th>Contest</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th style={{ width: 80 }}>Entries</th>
                    <th style={{ width: 100 }}>Prize Pool</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeSlate.contests || []).map(c => (
                    <tr key={c.id}>
                      <td>
                        <div className="contest-name">{c.name}</div>
                        <div className="contest-id">ID: {c.id?.slice(0, 8)}...</div>
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="text-muted">{c.currentEntries}/{c.maxEntries}</td>
                      <td className="text-bold">${c.prizePool}</td>
                      <td>
                        {c.status !== 'settled' ? (
                          <button
                            className="btn-small btn-settle-single"
                            onClick={() => settleSingleContest(c.id)}
                            disabled={loading}
                          >
                            Settle
                          </button>
                        ) : (
                          <span className="settled-check">✓ Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SETTLEMENT LOG TAB */}
          {slateTab === 'settle' && (
            <div className="settlement-log">
              {settlementLog.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">⚡</div>
                  <p>No settlements run yet. Lock scores first, then click "Settle All".</p>
                </div>
              ) : (
                <div className="log-entries">
                  {settlementLog.map((entry, i) => (
                    <div key={i} className={`log-entry log-${entry.status}`}>
                      <div className={`log-icon ${entry.status}`}>
                        {entry.status === 'settled' ? '✓' : entry.status === 'failed' ? '✗' : '⏳'}
                      </div>
                      <div className="log-content">
                        <div className="log-name">{entry.name}</div>
                        {entry.error && <div className="log-error">{entry.error}</div>}
                        {entry.winners !== undefined && (
                          <div className="log-winners">{entry.winners} winner(s) paid</div>
                        )}
                      </div>
                      <StatusBadge status={entry.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // ==================== SLATES OVERVIEW ====================
        <>
          <div className="panel-header">
            <div className="panel-header-left">
              <h1>Settlement</h1>
              <p>Manage slates, scores, and payouts</p>
            </div>
            <div className="panel-header-right">
              <button className="btn-refresh" onClick={() => { fetchSlates(); fetchContests(); }} disabled={loading}>
                🔄 Refresh
              </button>
              <button className="btn-action btn-primary" onClick={() => setShowCreateModal(true)}>
                + New Slate
              </button>
            </div>
          </div>

          {/* Active Slates */}
          {slates.length > 0 && (
            <div className="slates-section">
              <div className="section-header">
                <h2>Active Slates</h2>
                {unassignedContests.length > 0 && (
                  <span className="unassigned-badge">
                    {unassignedContests.length} unassigned contest{unassignedContests.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="slates-grid">
                {slates.map(slate => (
                  <SlateCard
                    key={slate.id}
                    slate={slate}
                    onOpen={() => openSlate(slate)}
                    onDelete={() => deleteSlate(slate.id)}
                    onSettle={() => openSlate(slate)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {slates.length === 0 && !loading && (
            <div className="empty-state large">
              <div className="empty-icon">📋</div>
              <h3>No slates yet</h3>
              <p>Create a slate to group your cash games together. Set scores once and settle everything in one click.</p>
              <button className="btn-action btn-primary" onClick={() => setShowCreateModal(true)}>
                + Create Your First Slate
              </button>
            </div>
          )}

          {/* Quick stats */}
          {contests.length > 0 && (
            <div className="stats-section">
              <h3 className="stats-label">Contest Overview</h3>
              <div className="stats-grid">
                <QuickStat label="Total Cash Games" value={cashContests.length} color="purple" />
                <QuickStat label="Open" value={cashContests.filter(c => c.status === 'open').length} color="green" />
                <QuickStat label="Closed / Ready" value={cashContests.filter(c => ['closed', 'completed', 'in_progress'].includes(c.status)).length} color="yellow" />
                <QuickStat label="Settled" value={cashContests.filter(c => c.status === 'settled').length} color="teal" />
                <QuickStat label="Market Movers" value={contests.filter(c => c.type === 'market').length} color="pink" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Slate Modal */}
      {showCreateModal && (
        <CreateSlateModal
          contests={contests}
          onClose={() => setShowCreateModal(false)}
          onCreate={createSlate}
          loading={loading}
        />
      )}
    </div>
  );
};

// ==================== SUB-COMPONENTS ====================

const StatusBadge = ({ status }) => (
  <span className={`status-badge status-${status}`}>
    {status?.replace('_', ' ').toUpperCase()}
  </span>
);

const QuickStat = ({ label, value, color }) => (
  <div className={`quick-stat stat-${color}`}>
    <div className="quick-stat-label">{label}</div>
    <div className="quick-stat-value">{value}</div>
  </div>
);

const SlateCard = ({ slate, onOpen, onDelete, onSettle }) => {
  const contests = slate.contests || [];
  const totalContests = contests.length;
  const settled = contests.filter(c => c.status === 'settled').length;
  const ready = contests.filter(c => ['closed', 'completed', 'in_progress'].includes(c.status)).length;
  const totalEntries = contests.reduce((s, c) => s + (c.currentEntries || 0), 0);
  const totalPrize = contests.reduce((s, c) => s + (c.prizePool || 0), 0);
  const allSettled = settled === totalContests && totalContests > 0;

  return (
    <div className={`slate-card ${allSettled ? 'settled' : ''}`} onClick={onOpen}>
      <button className="slate-delete" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete slate">×</button>

      <div className="slate-card-header">
        <div>
          <div className="slate-card-name">{slate.name}</div>
          <div className="slate-card-meta">{slate.sport?.toUpperCase()} · Wk {slate.week} · {slate.season}</div>
        </div>
        <StatusBadge status={allSettled ? 'settled' : slate.scoresLocked ? 'locked' : 'open'} />
      </div>

      <div className="slate-card-stats">
        <div className="slate-stat"><div className="slate-stat-label">Contests</div><div className="slate-stat-value">{totalContests}</div></div>
        <div className="slate-stat"><div className="slate-stat-label">Entries</div><div className="slate-stat-value">{totalEntries}</div></div>
        <div className="slate-stat"><div className="slate-stat-label">Prize Pool</div><div className="slate-stat-value">${totalPrize}</div></div>
        <div className="slate-stat"><div className="slate-stat-label">Settled</div><div className={`slate-stat-value ${allSettled ? 'text-green' : settled > 0 ? 'text-yellow' : ''}`}>{settled}/{totalContests}</div></div>
      </div>

      {!allSettled && (
        <div className="slate-card-actions">
          <button className="btn-small" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            Manage Scores
          </button>
          {slate.scoresLocked && (
            <button className="btn-small btn-settle-single" onClick={(e) => { e.stopPropagation(); onSettle(); }}>
              Settle All ({ready})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const PlayerScoreRow = ({ player, locked, onSetScore }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(player.score ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setValue(player.score ?? ''); }, [player.score]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const save = () => {
    if (value !== '' && !isNaN(parseFloat(value))) {
      onSetScore(parseFloat(value));
    }
    setEditing(false);
  };

  const hasScore = player.score !== null && player.score !== undefined;

  return (
    <tr>
      <td className="player-name-cell">{player.name}</td>
      <td><span className={`pos-badge pos-${player.position}`}>{player.position}</span></td>
      <td className="text-muted">{player.team}</td>
      <td className="text-muted draft-count">{player.draftCount}×</td>
      <td>
        {locked ? (
          <span className={`score-display ${hasScore ? '' : 'no-score'}`}>
            {hasScore ? player.score.toFixed(1) : '—'}
          </span>
        ) : editing ? (
          <input
            ref={inputRef}
            className="score-input"
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            onBlur={save}
          />
        ) : (
          <div className={`score-clickable ${hasScore ? '' : 'no-score'}`} onClick={() => setEditing(true)}>
            {hasScore ? player.score.toFixed(1) : '—'}
          </div>
        )}
      </td>
    </tr>
  );
};

const CreateSlateModal = ({ contests, onClose, onCreate, loading }) => {
  const [name, setName] = useState('');
  const [sport, setSport] = useState('nba');
  const [week, setWeek] = useState(1);
  const [season, setSeason] = useState(2025);
  const [selected, setSelected] = useState(new Set());

  // Only show eligible contests (cash, not settled, has entries, not already in a slate)
  const eligible = contests.filter(c =>
    c.type === 'cash' &&
    c.status !== 'settled' &&
    c.currentEntries > 0 &&
    !c.slate
  );

  const toggleContest = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map(c => c.id)));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Create New Slate</h2>

        <div className="modal-form-row">
          <div className="form-group flex-2">
            <label>Slate Name</label>
            <input
              type="text"
              placeholder="e.g., NBA Sat-Sun Feb 15-16"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group flex-1">
            <label>Sport</label>
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="nba">NBA</option>
              <option value="nfl">NFL</option>
              <option value="mlb">MLB</option>
            </select>
          </div>
        </div>

        <div className="modal-form-row">
          <div className="form-group flex-1">
            <label>Week</label>
            <input type="number" value={week} min={1} max={25} onChange={(e) => setWeek(parseInt(e.target.value))} />
          </div>
          <div className="form-group flex-1">
            <label>Season</label>
            <input type="number" value={season} min={2024} max={2030} onChange={(e) => setSeason(parseInt(e.target.value))} />
          </div>
        </div>

        <div className="modal-contests-header">
          <label>Select Contests ({selected.size}/{eligible.length})</label>
          <button className="btn-link" onClick={selectAll}>
            {selected.size === eligible.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="modal-contest-list">
          {eligible.length === 0 ? (
            <div className="empty-message">No eligible cash game contests found</div>
          ) : (
            eligible.map(c => (
              <div
                key={c.id}
                className={`modal-contest-item ${selected.has(c.id) ? 'selected' : ''}`}
                onClick={() => toggleContest(c.id)}
              >
                <div className={`checkbox ${selected.has(c.id) ? 'checked' : ''}`}>
                  {selected.has(c.id) && '✓'}
                </div>
                <div className="modal-contest-name">{c.name}</div>
                <StatusBadge status={c.status} />
                <span className="text-muted">{c.currentEntries}/{c.maxEntries}</span>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="btn-action btn-primary"
            onClick={() => onCreate({ name: name || `${sport.toUpperCase()} Slate`, sport, week, season, contestIds: Array.from(selected) })}
            disabled={selected.size === 0 || !name || loading}
          >
            Create Slate ({selected.size} contests)
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettlementPanel;