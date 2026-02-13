import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './SettlementPanel.css';

const API = '/api/admin/settlement';

const getHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
});

// ============================================================
// SETTLEMENT PANEL - Slate-Based (V2 Upstream Controller)
// ============================================================
const SettlementPanel = () => {
  const [slates, setSlates] = useState([]);
  const [contests, setContests] = useState([]);
  const [activeSlate, setActiveSlate] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load slates from backend
  const loadSlates = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/slates`, { headers: getHeaders() });
      if (data.success) setSlates(data.slates);
    } catch (e) {
      console.error('Failed to load slates:', e);
    }
  }, []);

  // Load all contests 
  const loadContests = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/contests`, { headers: getHeaders() });
      if (data.success) setContests(data.contests);
    } catch (e) {
      console.error('Failed to load contests:', e);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadSlates(), loadContests()]);
      setLoading(false);
    };
    load();
  }, [loadSlates, loadContests]);

  // Create a new slate
  const createSlate = async (slateData) => {
    try {
      const { data } = await axios.post(`${API}/slates`, slateData, { headers: getHeaders() });
      if (data.success) {
        showMessage(`Slate "${slateData.name}" created${data.autoAssigned ? ` (${data.autoAssigned} contests auto-assigned)` : ''}`, 'success');
        setShowCreate(false);
        await loadSlates();
        await loadContests();
      } else {
        showMessage(data.error, 'error');
      }
    } catch (e) {
      showMessage(e.response?.data?.error || 'Failed to create slate', 'error');
    }
  };

  // Close a slate
  const closeSlate = async (slateId) => {
    try {
      const { data } = await axios.post(`${API}/slates/${slateId}/close`, {}, { headers: getHeaders() });
      if (data.success) {
        showMessage(data.message, 'success');
        await loadSlates();
      } else {
        showMessage(data.error, 'error');
      }
    } catch (e) {
      showMessage(e.response?.data?.error || 'Failed to close slate', 'error');
    }
  };

  // Delete a slate
  const deleteSlate = async (slateId, slateName) => {
    if (!window.confirm(`Delete slate "${slateName}"? Contests will be unassigned but not deleted.`)) return;
    try {
      const { data } = await axios.delete(`${API}/slates/${slateId}`, { headers: getHeaders() });
      if (data.success) {
        showMessage(data.message, 'success');
        await loadSlates();
        await loadContests();
      }
    } catch (e) {
      showMessage('Failed to delete slate', 'error');
    }
  };

  // Assign contests to a slate
  const assignContests = async (slateId, contestIds) => {
    try {
      const { data } = await axios.post(`${API}/slates/${slateId}/assign-contests`, 
        { contestIds }, { headers: getHeaders() });
      if (data.success) {
        showMessage(`Assigned ${data.assigned} contests`, 'success');
        setShowAssign(false);
        await loadSlates();
        await loadContests();
      }
    } catch (e) {
      showMessage('Failed to assign contests', 'error');
    }
  };

  // Quick stats
  const cashGames = contests.filter(c => c.type === 'cash');
  const unassigned = cashGames.filter(c => !c.slateId && c.status !== 'settled');

  return (
    <div className="settlement-panel">
      {/* Toast */}
      {message && (
        <div className={`settlement-toast settlement-toast-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="settlement-header">
        <div>
          <h1 className="settlement-title">Settlement</h1>
          <p className="settlement-subtitle">Manage slates, scores, and payouts</p>
        </div>
        {!activeSlate && (
          <div className="settlement-header-actions">
            <button className="btn-secondary" onClick={() => { loadSlates(); loadContests(); }}>
              🔄 Refresh
            </button>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + New Slate
            </button>
          </div>
        )}
      </div>

      {/* Detail View */}
      {activeSlate ? (
        <SlateDetail
          slate={activeSlate}
          onBack={() => { setActiveSlate(null); loadSlates(); loadContests(); }}
          onToast={showMessage}
        />
      ) : (
        <>
          {/* Active Slates */}
          {slates.length > 0 && (
            <div className="settlement-section">
              <div className="settlement-section-header">
                <h2>Slates</h2>
                {unassigned.length > 0 && (
                  <span className="unassigned-badge">
                    {unassigned.length} unassigned contest{unassigned.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="slates-grid">
                {slates.map(slate => (
                  <SlateCard
                    key={slate.id}
                    slate={slate}
                    onOpen={() => setActiveSlate(slate)}
                    onClose={() => closeSlate(slate.id)}
                    onDelete={() => deleteSlate(slate.id, slate.name)}
                    onAssign={() => { setActiveSlate(slate); setShowAssign(true); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {slates.length === 0 && !loading && (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>No slates yet</h3>
              <p>Create a slate to start a scoring period for a sport. All new cash games will automatically belong to the active slate.</p>
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                + Create Your First Slate
              </button>
            </div>
          )}

          {/* Quick Stats */}
          {contests.length > 0 && (
            <div className="settlement-section" style={{ marginTop: 32 }}>
              <h3 className="section-label">Contest Overview</h3>
              <div className="quick-stats-grid">
                <QuickStat label="Total Cash Games" value={cashGames.length} color="purple" />
                <QuickStat label="Open" value={cashGames.filter(c => c.status === 'open').length} color="green" />
                <QuickStat label="Closed / Ready" value={cashGames.filter(c => ['closed', 'completed', 'in_progress'].includes(c.status)).length} color="yellow" />
                <QuickStat label="Settled" value={cashGames.filter(c => c.status === 'settled').length} color="teal" />
                <QuickStat label="Unassigned" value={unassigned.length} color="pink" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Slate Modal */}
      {showCreate && (
        <CreateSlateModal
          onClose={() => setShowCreate(false)}
          onCreate={createSlate}
        />
      )}

      {/* Assign Contests Modal */}
      {showAssign && activeSlate && (
        <AssignContestsModal
          slate={activeSlate}
          contests={contests}
          onClose={() => { setShowAssign(false); }}
          onAssign={(ids) => assignContests(activeSlate.id, ids)}
        />
      )}
    </div>
  );
};

// ============================================================
// SLATE CARD
// ============================================================
const SlateCard = ({ slate, onOpen, onClose, onDelete, onAssign }) => {
  const totalContests = slate.contests.length;
  const settled = slate.contests.filter(c => c.status === 'settled').length;
  const totalEntries = slate.contests.reduce((s, c) => s + (c.currentEntries || 0), 0);
  const totalPrize = slate.contests.reduce((s, c) => s + (c.prizePool || 0), 0);
  const allSettled = settled === totalContests && totalContests > 0;
  const isActive = slate.status === 'active';
  const isClosed = slate.status === 'closed';

  return (
    <div
      className={`slate-card ${allSettled ? 'slate-card-settled' : ''} ${isActive ? 'slate-card-active' : ''}`}
      onClick={() => onOpen()}
    >
      <div className="slate-card-header">
        <div>
          <div className="slate-card-name">{slate.name}</div>
          <div className="slate-card-meta">
            {slate.sport.toUpperCase()} · Week {slate.week}
            {slate.gameStartTime && (
              <> · Starts {new Date(slate.gameStartTime).toLocaleString('en-US', { 
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
              })}</>
            )}
          </div>
        </div>
        <div className="slate-card-badges">
          <StatusBadge status={allSettled ? 'settled' : slate.scoresLocked ? 'locked' : slate.status} />
          <button className="slate-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete slate">×</button>
        </div>
      </div>

      <div className="slate-card-stats">
        <div className="slate-stat">
          <span className="slate-stat-label">Contests</span>
          <span className="slate-stat-value">{totalContests}</span>
        </div>
        <div className="slate-stat">
          <span className="slate-stat-label">Entries</span>
          <span className="slate-stat-value">{totalEntries}</span>
        </div>
        <div className="slate-stat">
          <span className="slate-stat-label">Prize Pool</span>
          <span className="slate-stat-value">${totalPrize.toLocaleString()}</span>
        </div>
        <div className="slate-stat">
          <span className="slate-stat-label">Settled</span>
          <span className={`slate-stat-value ${allSettled ? 'color-green' : settled > 0 ? 'color-yellow' : ''}`}>
            {settled}/{totalContests}
          </span>
        </div>
      </div>

      <div className="slate-card-actions" onClick={(e) => e.stopPropagation()}>
        {isActive && (
          <>
            <button className="btn-small btn-outline" onClick={onAssign}>+ Assign Contests</button>
            <button className="btn-small btn-warning" onClick={onClose}>🔒 Close Slate</button>
          </>
        )}
        {isClosed && !allSettled && (
          <button className="btn-small btn-primary" onClick={() => onOpen()}>Manage Scores</button>
        )}
      </div>
    </div>
  );
};

// ============================================================
// CREATE SLATE MODAL — No contest selection, just metadata
// ============================================================
const CreateSlateModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [sport, setSport] = useState('nba');
  const [week, setWeek] = useState(1);
  const [season, setSeason] = useState(2025);
  const [gameStartTime, setGameStartTime] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      sport,
      week: parseInt(week),
      season: parseInt(season),
      gameStartTime: gameStartTime || undefined
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Create New Slate</h2>
        <p className="modal-description">
          Create a new scoring period for a sport. All existing unassigned cash games for this sport
          will be auto-assigned, and any new cash games created will belong to this slate.
        </p>

        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Slate Name</label>
            <input
              className="form-input"
              placeholder="e.g., NBA Sat-Sun Feb 15-16"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Sport</label>
            <select className="form-input" value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="nba">NBA</option>
              <option value="nfl">NFL</option>
              <option value="mlb">MLB</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Week</label>
            <input className="form-input" type="number" value={week} onChange={(e) => setWeek(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Season</label>
            <input className="form-input" type="number" value={season} onChange={(e) => setSeason(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">First Game Start Time (optional)</label>
          <input
            className="form-input"
            type="datetime-local"
            value={gameStartTime}
            onChange={(e) => setGameStartTime(e.target.value)}
          />
          <span className="form-hint">Cash games will auto-close 5 minutes before this time</span>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={!name.trim()}
          >
            Create Slate
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// ASSIGN CONTESTS MODAL — Retroactive grouping
// ============================================================
const AssignContestsModal = ({ slate, contests, onClose, onAssign }) => {
  const [selected, setSelected] = useState(new Set());

  // Show unassigned cash games for this sport
  const eligible = contests.filter(c =>
    c.type === 'cash' &&
    c.sport === slate.sport &&
    !c.slateId &&
    c.status !== 'settled' &&
    c.status !== 'cancelled'
  );

  const toggle = (id) => {
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
        <h2 className="modal-title">Assign Contests to "{slate.name}"</h2>
        <p className="modal-description">
          Select unassigned {slate.sport.toUpperCase()} cash games to add to this slate.
        </p>

        <div className="form-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="form-label" style={{ margin: 0 }}>
            {selected.size}/{eligible.length} selected
          </span>
          <button className="btn-text" onClick={selectAll}>
            {selected.size === eligible.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="contest-list">
          {eligible.length === 0 ? (
            <div className="contest-list-empty">
              No unassigned {slate.sport.toUpperCase()} cash games found
            </div>
          ) : (
            eligible.map(c => (
              <div
                key={c.id}
                className={`contest-list-item ${selected.has(c.id) ? 'selected' : ''}`}
                onClick={() => toggle(c.id)}
              >
                <div className={`checkbox ${selected.has(c.id) ? 'checked' : ''}`}>
                  {selected.has(c.id) && '✓'}
                </div>
                <div className="contest-list-item-info">
                  <div className="contest-list-item-name">{c.name}</div>
                </div>
                <StatusBadge status={c.status} />
                <span className="contest-list-item-entries">{c.currentEntries}/{c.maxEntries}</span>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => onAssign(Array.from(selected))}
            disabled={selected.size === 0}
          >
            Assign {selected.size} Contest{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SLATE DETAIL VIEW — Scores + Contests + Settlement
// ============================================================
const SlateDetail = ({ slate, onBack, onToast }) => {
  const [tab, setTab] = useState('scores');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settlingAll, setSettlingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [csvMode, setCsvMode] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [settlementLog, setSettlementLog] = useState([]);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/slates/${slate.id}/players`, { headers: getHeaders() });
      if (data.success) {
        setPlayers(data.players || []);
      }
    } catch (e) {
      console.error('Failed to load players:', e);
    }
    setLoading(false);
  }, [slate.id]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  const setPlayerScore = async (player, score) => {
    try {
      await axios.post(`${API}/set-player-score`, {
        playerName: player.name,
        playerTeam: player.team,
        week: slate.week,
        season: slate.season,
        score: parseFloat(score)
      }, { headers: getHeaders() });

      setPlayers(prev => prev.map(p =>
        p.name === player.name && p.team === player.team
          ? { ...p, score: parseFloat(score) }
          : p
      ));
    } catch (e) {
      onToast('Failed to set score', 'error');
    }
  };

  const bulkRandomScores = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/slates/${slate.id}/bulk-random-scores`, {}, { headers: getHeaders() });
      if (data.success) {
        onToast(`Set random scores for ${data.playersScored} players`, 'success');
        await loadPlayers();
      }
    } catch (e) {
      onToast('Failed to set random scores', 'error');
    }
    setLoading(false);
  };

  const importCsv = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/import-csv`, {
        week: slate.week,
        season: slate.season,
        csv: csvText
      }, { headers: getHeaders() });
      if (data.success) {
        onToast(data.message, 'success');
        setCsvMode(false);
        setCsvText('');
        await loadPlayers();
      } else {
        onToast(data.error || 'Import failed', 'error');
      }
    } catch (e) {
      onToast('CSV import failed', 'error');
    }
    setLoading(false);
  };

  const lockScores = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/slates/${slate.id}/lock-scores`, {}, { headers: getHeaders() });
      if (data.success) {
        onToast(data.message, 'success');
        // Update local slate state
        slate.scoresLocked = true;
      } else {
        onToast(data.error, 'error');
      }
    } catch (e) {
      onToast('Failed to lock scores', 'error');
    }
    setLoading(false);
  };

  const settleAll = async () => {
    setSettlingAll(true);
    setTab('settle');
    const log = [];

    try {
      const { data } = await axios.post(`${API}/slates/${slate.id}/settle`, {
        types: ['cash'],
        force: true
      }, { headers: getHeaders() });

      if (data.success && data.results) {
        for (const result of data.results) {
          log.push(result);
        }
        onToast(data.message, data.settledCount > 0 ? 'success' : 'error');
      } else {
        onToast(data.error || 'Settlement failed', 'error');
      }
    } catch (e) {
      onToast('Settlement request failed', 'error');
    }

    setSettlementLog(log);
    setSettlingAll(false);
  };

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const scoredCount = players.filter(p => p.score !== null && p.score !== undefined).length;
  const unscoredCount = players.length - scoredCount;

  return (
    <div>
      {/* Header */}
      <div className="slate-detail-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div>
          <h2 className="slate-detail-title">{slate.name}</h2>
          <div className="slate-detail-meta">
            {slate.sport.toUpperCase()} · Week {slate.week} · {slate.contests.length} contests · {players.length} unique players
          </div>
        </div>
        <div className="slate-detail-actions">
          {!slate.scoresLocked && scoredCount > 0 && (
            <button className="btn-warning" onClick={lockScores} disabled={loading}>
              {loading ? 'Locking...' : `🔒 Lock Scores (${scoredCount} scored)`}
            </button>
          )}
          {slate.scoresLocked && (
            <button className="btn-primary" onClick={settleAll} disabled={settlingAll}>
              {settlingAll ? 'Settling...' : `⚡ Settle All Cash Games (${slate.contests.filter(c => c.status !== 'settled').length})`}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id: 'scores', label: `Player Scores (${players.length})` },
          { id: 'contests', label: `Contests (${slate.contests.length})` },
          { id: 'settle', label: 'Settlement Log' },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SCORES TAB */}
      {tab === 'scores' && (
        <div>
          <div className="score-toolbar">
            <input
              className="form-input score-search"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className={`score-count ${unscoredCount > 0 ? 'color-yellow' : 'color-green'}`}>
              {unscoredCount > 0 ? `${unscoredCount} unscored` : '✓ All scored'}
            </div>
            <button className="btn-secondary btn-small" onClick={() => setCsvMode(!csvMode)}>
              {csvMode ? 'Close CSV' : '📋 Import CSV'}
            </button>
            <button className="btn-small btn-test" onClick={bulkRandomScores} disabled={loading}>
              🎲 Random (Test)
            </button>
            <button className="btn-secondary btn-small" onClick={loadPlayers} disabled={loading}>🔄</button>
          </div>

          {csvMode && (
            <div className="csv-panel">
              <div className="csv-hint">Format: <code>PlayerName,Team,Points</code> (one per line)</div>
              <textarea
                className="form-input csv-textarea"
                placeholder={`Josh Allen,BUF,28.5\nSaquon Barkley,PHI,22.3\nJa'Marr Chase,CIN,31.2`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <div className="csv-actions">
                <button className="btn-primary btn-small" onClick={importCsv} disabled={loading}>Import Scores</button>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className="score-progress-bar">
            <div
              className={`score-progress-fill ${scoredCount === players.length ? 'complete' : ''}`}
              style={{ width: `${players.length > 0 ? (scoredCount / players.length) * 100 : 0}%` }}
            />
          </div>

          {loading ? (
            <div className="loading-state">Loading players...</div>
          ) : (
            <div className="table-container">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th style={{ width: 60 }}>Pos</th>
                    <th style={{ width: 60 }}>Team</th>
                    <th style={{ width: 80 }}>Drafted</th>
                    <th style={{ width: 160 }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <PlayerScoreRow
                      key={`${p.name}-${p.team}`}
                      player={p}
                      locked={slate.scoresLocked}
                      onSetScore={(score) => setPlayerScore(p, score)}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        {searchTerm ? 'No players match your search' : "No players found in this slate's contests"}
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
      {tab === 'contests' && (
        <div className="table-container">
          <table className="score-table">
            <thead>
              <tr>
                <th>Contest</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 80 }}>Entries</th>
                <th style={{ width: 100 }}>Prize Pool</th>
              </tr>
            </thead>
            <tbody>
              {slate.contests.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="contest-name">{c.name}</div>
                    <div className="contest-id">ID: {c.id.slice(0, 8)}...</div>
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="text-muted">{c.currentEntries}/{c.maxEntries}</td>
                  <td className="text-bright">${c.prizePool}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SETTLEMENT LOG TAB */}
      {tab === 'settle' && (
        <div>
          {settlementLog.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px' }}>
              <div className="empty-state-icon">⚡</div>
              <p>No settlements run yet. Lock scores first, then click "Settle All".</p>
            </div>
          ) : (
            <div className="table-container">
              {settlementLog.map((entry, i) => (
                <div key={i} className="settlement-log-entry">
                  <div className={`settlement-log-icon ${entry.status}`}>
                    {entry.status === 'settled' ? '✓' : entry.status === 'failed' ? '✗' : '⏳'}
                  </div>
                  <div className="settlement-log-info">
                    <div className="settlement-log-name">{entry.name}</div>
                    {entry.error && <div className="settlement-log-error">{entry.error}</div>}
                    {entry.winners !== undefined && (
                      <div className="settlement-log-winners">{entry.winners} winner(s) paid</div>
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
  );
};

// ============================================================
// PLAYER SCORE ROW
// ============================================================
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

  const posColors = {
    QB: 'pos-qb', PG: 'pos-qb',
    RB: 'pos-rb', SG: 'pos-rb',
    WR: 'pos-wr', SF: 'pos-wr',
    TE: 'pos-te', PF: 'pos-te',
    K: 'pos-k', C: 'pos-k',
    DEF: 'pos-def'
  };

  const hasScore = player.score !== null && player.score !== undefined;

  return (
    <tr>
      <td><span className="player-name">{player.name}</span></td>
      <td><span className={`pos-badge ${posColors[player.position] || ''}`}>{player.position}</span></td>
      <td className="text-muted">{player.team}</td>
      <td className="text-dim">{player.draftCount}×</td>
      <td>
        {locked ? (
          <span className={`score-display ${hasScore ? '' : 'no-score'}`}>
            {hasScore ? player.score.toFixed(1) : '—'}
          </span>
        ) : editing ? (
          <input
            ref={inputRef}
            className="form-input score-input"
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
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

// ============================================================
// SHARED COMPONENTS
// ============================================================
const StatusBadge = ({ status }) => (
  <span className={`status-badge status-${status}`}>
    {status}
  </span>
);

const QuickStat = ({ label, value, color }) => (
  <div className={`quick-stat quick-stat-${color}`}>
    <div className="quick-stat-label">{label}</div>
    <div className="quick-stat-value">{value}</div>
  </div>
);

export default SettlementPanel;