// frontend/src/components/Admin/AdminPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './AdminPanel.css';

const AdminPanel = ({ user, showToast }) => {
  const [activeTab, setActiveTab] = useState('sim');
  const [contestId, setContestId] = useState('');
  const [logs, setLogs] = useState([]);
  const [contests, setContests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState({});
  const [stats, setStats] = useState({ open: 0, closed: 0, settled: 0, entries: 0, lineups: 0 });
  const [readyToSettle, setReadyToSettle] = useState([]);
  const [draftCount, setDraftCount] = useState(3);
  
  // Money tab state
  const [moneyData, setMoneyData] = useState(null);
  const [reconcileData, setReconcileData] = useState(null);
  const [userLookup, setUserLookup] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [userTransactions, setUserTransactions] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Simulation state
  const [simStatus, setSimStatus] = useState(null);
  const [mmCount, setMmCount] = useState(100);
  const [balanceAmount, setBalanceAmount] = useState(1000);

  const isAdmin = user?.username === 'GoVikes' || user?.role === 'admin' || user?.is_admin || user?.username === 'aaaaaa';

  const addLog = useCallback((message, type = 'info') => {
    setLogs(prev => [{ message, type, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [contestsRes, usersRes] = await Promise.all([
        axios.get('/api/contests'),
        axios.get('/api/users')
      ]);
      setContests(contestsRes.data || []);
      setUsers(usersRes.data.users || []);
      
      // Calculate stats from contests
      const all = contestsRes.data || [];
      setStats({
        open: all.filter(c => c.status === 'open').length,
        closed: all.filter(c => c.status === 'closed').length,
        settled: all.filter(c => c.status === 'settled').length,
        entries: all.reduce((sum, c) => sum + (c.currentEntries || 0), 0),
        lineups: 0
      });
      
      // Get ready to settle
      const closed = all.filter(c => c.status === 'closed');
      setReadyToSettle(closed.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        prizePool: c.prizePool || c.prize_pool,
        entryCount: c.currentEntries || c.current_entries
      })));
    } catch (error) {
      console.error('Fetch error:', error);
    }
  }, []);

  const fetchSimStatus = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/sim/status');
      setSimStatus(res.data);
    } catch (err) {
      console.error('Sim status error:', err);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
      fetchSimStatus();
    }
  }, [isAdmin, fetchAll, fetchSimStatus]);

  // ============ SIMULATION OPERATIONS ============

  const runCashGameSim = async () => {
    setLoading(prev => ({ ...prev, cashSim: true }));
    addLog('🚀 Starting cash game simulation...');
    
    try {
      const res = await axios.post('/api/admin/sim/cash-game');
      if (res.data.success) {
        addLog(`✅ ${res.data.message}`, 'success');
        res.data.entries?.forEach(e => {
          addLog(`   ${e.username}: ${e.playerCount} players`, 'success');
        });
      }
    } catch (err) {
      addLog(`❌ ${err.response?.data?.error || err.message}`, 'error');
    }
    
    setLoading(prev => ({ ...prev, cashSim: false }));
    fetchAll();
    fetchSimStatus();
  };

  const runMarketMoverSim = async () => {
    setLoading(prev => ({ ...prev, mmSim: true }));
    addLog(`🚀 Starting Market Mover simulation (${mmCount} entries)...`);
    
    try {
      const res = await axios.post('/api/admin/sim/market-mover', { count: mmCount });
      if (res.data.success) {
        addLog(`✅ ${res.data.message}`, 'success');
        addLog(`   ${res.data.stats.actualEntries} entries in ${res.data.stats.draftRooms} rooms`, 'success');
        if (res.data.stats.failedRooms > 0) {
          addLog(`   ⚠️ ${res.data.stats.failedRooms} rooms failed`, 'warning');
        }
      }
    } catch (err) {
      addLog(`❌ ${err.response?.data?.error || err.message}`, 'error');
    }
    
    setLoading(prev => ({ ...prev, mmSim: false }));
    fetchAll();
    fetchSimStatus();
  };

  const closeMarketMover = async () => {
    setLoading(prev => ({ ...prev, closeMM: true }));
    
    try {
      const res = await axios.post('/api/admin/sim/close-mm');
      addLog(`✅ ${res.data.message}`, 'success');
    } catch (err) {
      addLog(`❌ ${err.response?.data?.error || err.message}`, 'error');
    }
    
    setLoading(prev => ({ ...prev, closeMM: false }));
    fetchAll();
    fetchSimStatus();
  };

  const addBalanceToAll = async () => {
    setLoading(prev => ({ ...prev, balance: true }));
    
    try {
      const res = await axios.post('/api/admin/sim/add-balance', { amount: balanceAmount });
      addLog(`✅ ${res.data.message}`, 'success');
    } catch (err) {
      addLog(`❌ ${err.response?.data?.error || err.message}`, 'error');
    }
    
    setLoading(prev => ({ ...prev, balance: false }));
    fetchAll();
    fetchSimStatus();
  };

  // ============ BATCH OPERATIONS ============
  
  const runBatchDrafts = async () => {
    setLoading(prev => ({ ...prev, drafts: true }));
    addLog(`🚀 Starting ${draftCount} drafts...`);
    
    let successCount = 0;
    
    for (let i = 0; i < draftCount; i++) {
      try {
        // Find open cash game
        const contestsRes = await axios.get('/api/contests');
        const openContest = contestsRes.data.find(c => c.status === 'open' && c.type === 'cash');
        
        if (!openContest) {
          addLog(`Draft ${i + 1}: No open cash game available`, 'error');
          continue;
        }
        
        addLog(`Draft ${i + 1}: Filling ${openContest.name}...`);
        
        // Fill lobby
        await axios.post(`/api/debug/fill-lobby/${openContest.id}`, { includeMe: true });
        await new Promise(r => setTimeout(r, 500));
        
        // Auto draft
        await axios.post(`/api/debug/auto-draft/${openContest.id}`, { strategy: 'balanced' });
        
        addLog(`Draft ${i + 1}: ✅ Complete!`, 'success');
        successCount++;
        
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        addLog(`Draft ${i + 1}: ❌ ${error.response?.data?.error || error.message}`, 'error');
      }
    }
    
    addLog(`🏁 Completed ${successCount}/${draftCount} drafts`, successCount > 0 ? 'success' : 'error');
    setLoading(prev => ({ ...prev, drafts: false }));
    fetchAll();
  };

  const settleAllContests = async () => {
    setLoading(prev => ({ ...prev, settle: true }));
    addLog('💰 Settling all closed contests...');
    
    let successCount = 0;
    
    for (const contest of readyToSettle) {
      try {
        await axios.post(`/api/admin/settlement/settle/${contest.id}`);
        addLog(`  ✅ ${contest.name} settled`, 'success');
        successCount++;
      } catch (error) {
        addLog(`  ❌ ${contest.name}: ${error.response?.data?.error || error.message}`, 'error');
      }
    }
    
    addLog(`🏁 Settled ${successCount}/${readyToSettle.length} contests`, 'success');
    setLoading(prev => ({ ...prev, settle: false }));
    fetchAll();
    fetchSimStatus();
  };

  const resetTestData = async () => {
    if (!window.confirm('Delete ALL entries, lineups, and results? Contests will be reset to open.')) return;
    
    setLoading(prev => ({ ...prev, reset: true }));
    addLog('🧹 Resetting test data...');
    
    try {
      // Use the debug reset endpoint
      await axios.post('/api/debug/reset');
      addLog('✅ Test data reset!', 'success');
    } catch (error) {
      addLog(`❌ ${error.response?.data?.error || error.message}`, 'error');
    }
    
    setLoading(prev => ({ ...prev, reset: false }));
    fetchAll();
    fetchSimStatus();
  };

  const settleSingleContest = async (id, name) => {
    setLoading(prev => ({ ...prev, [id]: true }));
    
    try {
      await axios.post(`/api/admin/settlement/settle/${id}`);
      addLog(`✅ ${name} settled!`, 'success');
    } catch (error) {
      addLog(`❌ ${name}: ${error.response?.data?.error || error.message}`, 'error');
    }
    
    setLoading(prev => ({ ...prev, [id]: false }));
    fetchAll();
    fetchSimStatus();
  };

// ============ MONEY OPERATIONS ============

  const fetchMoneyStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, withdrawalsRes] = await Promise.all([
        axios.get('/api/admin/payments/stats', { headers }),
        axios.get('/api/admin/payments/withdrawals?status=pending', { headers })
      ]);
      setMoneyData(statsRes.data.stats);
      setPendingWithdrawals(withdrawalsRes.data.withdrawals || []);
    } catch (err) {
      addLog('Failed to fetch money stats: ' + err.message, 'error');
    }
  };

  const runReconciliation = async () => {
    setLoading(prev => ({ ...prev, reconcile: true }));
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/admin/payments/reconcile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReconcileData(res.data);
      addLog(res.data.healthy ? '✅ Reconciliation: HEALTHY' : `⚠️ Reconciliation: ${res.data.mismatchCount} mismatches`, res.data.healthy ? 'success' : 'warning');
    } catch (err) {
      addLog('Reconciliation failed: ' + err.message, 'error');
    }
    setLoading(prev => ({ ...prev, reconcile: false }));
  };

  const lookupUser = async () => {
    if (!userLookup.trim()) return;
    setLoading(prev => ({ ...prev, userLookup: true }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Find user from users list
      const found = users.find(u => u.username?.toLowerCase() === userLookup.toLowerCase());
      if (!found) {
        addLog(`User "${userLookup}" not found`, 'error');
        setUserDetail(null);
        setUserTransactions([]);
        setLoading(prev => ({ ...prev, userLookup: false }));
        return;
      }
      
      setUserDetail(found);
      
      // Fetch their transactions
      const txRes = await axios.get(`/api/admin/payments/transactions?userId=${found.id}&limit=20`, { headers });
      setUserTransactions(txRes.data.transactions || []);
      addLog(`Loaded ${txRes.data.transactions?.length || 0} transactions for ${found.username}`, 'success');
    } catch (err) {
      addLog('User lookup failed: ' + err.message, 'error');
    }
    setLoading(prev => ({ ...prev, userLookup: false }));
  };

  const adjustUserBalance = async () => {
    if (!userDetail || !adjustAmount || !adjustReason) {
      addLog('Need user, amount, and reason for adjustment', 'error');
      return;
    }
    if (!window.confirm(`Adjust ${userDetail.username}'s balance by $${adjustAmount}?\nReason: ${adjustReason}`)) return;
    
    setLoading(prev => ({ ...prev, adjust: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/admin/payments/manual-adjustment', {
        userId: userDetail.id,
        amount: parseFloat(adjustAmount),
        reason: adjustReason
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      addLog(`✅ Adjusted ${userDetail.username} by $${adjustAmount}: ${adjustReason}`, 'success');
      setAdjustAmount('');
      setAdjustReason('');
      
      // Refresh
      await fetchAll();
      lookupUser();
    } catch (err) {
      addLog('Adjustment failed: ' + (err.response?.data?.error || err.message), 'error');
    }
    setLoading(prev => ({ ...prev, adjust: false }));
  };

  const handleWithdrawal = async (id, action, reason = '') => {
    setLoading(prev => ({ ...prev, [`wd_${id}`]: true }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      if (action === 'approve') {
        await axios.post(`/api/admin/payments/withdrawals/${id}/approve`, {}, { headers });
        addLog(`✅ Withdrawal ${id.slice(0,8)} approved`, 'success');
      } else if (action === 'reject') {
        const rejectReason = reason || prompt('Rejection reason:');
        if (!rejectReason) { setLoading(prev => ({ ...prev, [`wd_${id}`]: false })); return; }
        await axios.post(`/api/admin/payments/withdrawals/${id}/reject`, { reason: rejectReason }, { headers });
        addLog(`❌ Withdrawal ${id.slice(0,8)} rejected`, 'warning');
      }
      
      fetchMoneyStats();
    } catch (err) {
      addLog('Withdrawal action failed: ' + (err.response?.data?.error || err.message), 'error');
    }
    setLoading(prev => ({ ...prev, [`wd_${id}`]: false }));
  };



  // ============ SINGLE CONTEST OPERATIONS ============
  
  const createTestUsers = async () => {
    setLoading(prev => ({ ...prev, users: true }));
    try {
      await axios.post('/api/debug/create-test-users', { count: 8 });
      addLog('✅ Created test users', 'success');
      fetchAll();
    } catch (error) {
      addLog('❌ Failed to create test users', 'error');
    }
    setLoading(prev => ({ ...prev, users: false }));
  };

  const fillLobby = async () => {
    if (!contestId) return addLog('Enter a contest ID first', 'error');
    setLoading(prev => ({ ...prev, fill: true }));
    try {
      await axios.post(`/api/debug/fill-lobby/${contestId}`, { includeMe: true });
      addLog('✅ Lobby filled!', 'success');
    } catch (error) {
      addLog(`❌ ${error.response?.data?.error || 'Failed'}`, 'error');
    }
    setLoading(prev => ({ ...prev, fill: false }));
  };

  const autoDraft = async () => {
    if (!contestId) return addLog('Enter a contest ID first', 'error');
    setLoading(prev => ({ ...prev, draft: true }));
    try {
      await axios.post(`/api/debug/auto-draft/${contestId}`, { strategy: 'balanced' });
      addLog('✅ Draft completed!', 'success');
      fetchAll();
    } catch (error) {
      addLog(`❌ ${error.response?.data?.error || 'Failed'}`, 'error');
    }
    setLoading(prev => ({ ...prev, draft: false }));
  };

  const giveBonus = async (userId) => {
    try {
      await axios.post('/api/auth/give-bonus', { userId, amount: 100, reason: 'Admin bonus' });
      addLog('✅ Gave $100 bonus', 'success');
      fetchAll();
    } catch (error) {
      addLog('❌ Failed to give bonus', 'error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-panel">
        <div style={{ textAlign: 'center', padding: '4rem', color: '#f56565' }}>
          <h2>Access Denied</h2>
          <p>You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <p style={{ color: '#64ffda', fontSize: '0.9rem' }}>Logged in as: {user?.username}</p>
        <div className="admin-tabs">
          {['sim', 'dev', 'money', 'contests', 'users', 'logs'].map(tab => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => { setActiveTab(tab); if (tab === 'money') fetchMoneyStats(); }}>
              {tab === 'sim' ? '🎮 Simulator' : tab === 'dev' ? '🔧 Dev Tools' : tab === 'money' ? '💰 Money' : tab === 'logs' ? `Logs (${logs.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-content">
        
        {/* ============ SIMULATOR TAB ============ */}
        {activeTab === 'sim' && (
          <div className="sim-tab">
            <h2 style={{ color: '#64ffda', marginBottom: '1.5rem' }}>🎮 Contest Simulator</h2>
            <p style={{ color: '#8892b0', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Run realistic simulations with real user accounts. Balances are deducted, lineups saved to actual accounts.
            </p>
            
            {/* Status Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <StatusCard 
                title="Real Users" 
                value={simStatus?.users?.total || 0}
                subtitle={`${simStatus?.users?.cashGameEligible || 0} cash / ${simStatus?.users?.mmEligible || 0} MM`}
              />
              <StatusCard 
                title="Max MM Entries" 
                value={simStatus?.users?.maxMMEntries || 0}
                subtitle={`${simStatus?.users?.total || 0} users × 150`}
              />
              <StatusCard 
                title="Cash Game" 
                value={simStatus?.contests?.cashGame ? 'Ready' : 'None'}
                subtitle={simStatus?.contests?.cashGame?.name || 'Create one first'}
                color={simStatus?.contests?.cashGame ? '#48bb78' : '#f56565'}
              />
              <StatusCard 
                title="Market Mover" 
                value={simStatus?.contests?.marketMover ? `${simStatus.contests.marketMover.currentEntries}` : 'None'}
                subtitle={simStatus?.contests?.marketMover?.name || 'Create one first'}
                color={simStatus?.contests?.marketMover ? '#48bb78' : '#f56565'}
              />
            </div>

            {/* User Balances */}
            {simStatus?.users?.userList && (
              <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#8892b0', marginBottom: '0.75rem', fontSize: '1rem' }}>💵 User Balances</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {simStatus.users.userList.map(u => (
                    <span key={u.username} style={{ 
                      background: parseFloat(u.balance) >= 25 ? 'rgba(72, 187, 120, 0.15)' : 'rgba(245, 101, 101, 0.15)', 
                      padding: '0.25rem 0.6rem', 
                      borderRadius: '4px', 
                      fontSize: '0.85rem', 
                      color: parseFloat(u.balance) >= 25 ? '#48bb78' : '#f56565' 
                    }}>
                      {u.username}: ${u.balance.toFixed(2)}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#8892b0' }}>Add $</span>
                  <input
                    type="number"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(parseInt(e.target.value) || 0)}
                    style={{ ...inputStyle, width: '80px' }}
                  />
                  <button onClick={addBalanceToAll} disabled={loading.balance} style={smallBtnStyle}>
                    {loading.balance ? '...' : 'Add to All Users'}
                  </button>
                </div>
              </div>
            )}

            {/* Simulation Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              
              {/* Cash Game Sim */}
              <div style={cardStyle}>
                <h3 style={{ color: '#48bb78', marginBottom: '0.5rem' }}>💰 Cash Game Sim</h3>
                <p style={{ color: '#8892b0', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Pick 5 real users, deduct $5 each, auto-draft, close contest. Lineups saved to real accounts.
                </p>
                <button 
                  onClick={runCashGameSim} 
                  disabled={loading.cashSim || !simStatus?.contests?.cashGame}
                  style={buttonStyle('#48bb78', loading.cashSim || !simStatus?.contests?.cashGame)}
                >
                  {loading.cashSim ? 'Running...' : 'Run Cash Game'}
                </button>
                {!simStatus?.contests?.cashGame && (
                  <p style={{ color: '#f56565', fontSize: '0.75rem', marginTop: '0.5rem' }}>No open cash game available</p>
                )}
              </div>

              {/* Market Mover Sim */}
              <div style={cardStyle}>
                <h3 style={{ color: '#f6ad55', marginBottom: '0.5rem' }}>🚀 Market Mover Sim</h3>
                <p style={{ color: '#8892b0', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Create entries distributed across users (150 max/user), group into rooms of 5, auto-draft all.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ color: '#8892b0' }}>Entries:</span>
                  <input
                    type="number"
                    value={mmCount}
                    onChange={(e) => setMmCount(parseInt(e.target.value) || 100)}
                    style={{ ...inputStyle, width: '80px' }}
                  />
                  <span style={{ color: '#64ffda', fontSize: '0.75rem' }}>
                    max: {simStatus?.users?.maxMMEntries || 0}
                  </span>
                </div>
                <button 
                  onClick={runMarketMoverSim} 
                  disabled={loading.mmSim || !simStatus?.contests?.marketMover}
                  style={buttonStyle('#f6ad55', loading.mmSim || !simStatus?.contests?.marketMover)}
                >
                  {loading.mmSim ? 'Running...' : `Create ${mmCount} Entries`}
                </button>
                <button 
                  onClick={closeMarketMover}
                  disabled={loading.closeMM || !simStatus?.contests?.marketMover}
                  style={{ ...smallBtnStyle, marginTop: '0.5rem', width: '100%' }}
                >
                  {loading.closeMM ? '...' : 'Close MM for Settlement'}
                </button>
              </div>
            </div>

            {/* Ready to Settle */}
            {readyToSettle.length > 0 && (
              <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#f6ad55', marginBottom: '1rem' }}>⚖️ Ready to Settle ({readyToSettle.length})</h3>
                {readyToSettle.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                    <div>
                      <span style={{ color: '#e6f1ff' }}>{c.name}</span>
                      <span style={{ color: '#8892b0', marginLeft: '1rem', fontSize: '0.85rem' }}>
                        {c.type} • {c.entryCount} entries • ${c.prizePool}
                      </span>
                    </div>
                    <button
                      onClick={() => settleSingleContest(c.id, c.name)}
                      disabled={loading[c.id]}
                      style={{ padding: '0.4rem 1rem', background: '#64ffda', color: '#0a192f', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      {loading[c.id] ? '...' : 'Settle'}
                    </button>
                  </div>
                ))}
                <button 
                  onClick={settleAllContests} 
                  disabled={loading.settle || readyToSettle.length === 0} 
                  style={{ ...buttonStyle('#f6ad55', loading.settle), marginTop: '0.5rem' }}
                >
                  {loading.settle ? 'Settling...' : 'Settle All'}
                </button>
              </div>
            )}

            {/* Quick Links */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <a href="/teams" style={linkStyle}>📊 Teams</a>
              <a href="/lobby" style={linkStyle}>🎮 Lobby</a>
              <a href="/admin/settlement" style={linkStyle}>⚙️ Settlement Panel</a>
              <button onClick={() => { fetchAll(); fetchSimStatus(); }} style={linkStyle}>🔄 Refresh</button>
            </div>

            {/* Activity Log */}
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#8892b0', fontWeight: '600' }}>📝 Activity Log</span>
                <button onClick={() => setLogs([])} style={{ background: 'none', border: '1px solid #4a5568', color: '#8892b0', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>
              </div>
              {logs.length === 0 ? (
                <p style={{ color: '#4a5568', fontStyle: 'italic' }}>No activity yet</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ color: log.type === 'error' ? '#f56565' : log.type === 'success' ? '#48bb78' : log.type === 'warning' ? '#f6ad55' : '#8892b0', fontSize: '0.8rem', fontFamily: 'monospace', padding: '0.15rem 0' }}>
                    <span style={{ color: '#4a5568' }}>[{log.timestamp}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ============ DEV TOOLS TAB ============ */}
        {activeTab === 'dev' && (
          <div className="dev-tools-tab">
            
            {/* Stats Row */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
              <StatBadge label="Open" value={stats.open} color="#48bb78" />
              <StatBadge label="Closed" value={stats.closed} color="#f6ad55" />
              <StatBadge label="Settled" value={stats.settled} color="#64ffda" />
              <StatBadge label="Users" value={users.length} color="#8892b0" />
            </div>

            {/* Main Batch Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              
              {/* Blast Drafts */}
              <div style={cardStyle}>
                <h3 style={{ color: '#48bb78', marginBottom: '1rem' }}>🚀 Blast Drafts (Test Bots)</h3>
                <p style={{ color: '#8892b0', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Fill + complete {draftCount} cash game drafts using test_user bots
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ color: '#8892b0' }}>Count:</span>
                  <input
                    type="number" min="1" max="10" value={draftCount}
                    onChange={(e) => setDraftCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                    style={inputStyle}
                  />
                </div>
                <button onClick={runBatchDrafts} disabled={loading.drafts} style={buttonStyle('#48bb78', loading.drafts)}>
                  {loading.drafts ? 'Running...' : `Run ${draftCount} Drafts`}
                </button>
              </div>

              {/* Reset */}
              <div style={cardStyle}>
                <h3 style={{ color: '#f56565', marginBottom: '1rem' }}>🧹 Reset Test Data</h3>
                <p style={{ color: '#8892b0', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Clear all entries, lineups, results. Keeps contests & users.
                </p>
                <button onClick={resetTestData} disabled={loading.reset} style={buttonStyle('#f56565', loading.reset)}>
                  {loading.reset ? 'Resetting...' : 'Reset All Data'}
                </button>
              </div>
            </div>

            {/* Quick Links */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
              <a href="/teams" style={linkStyle}>📊 Teams</a>
              <a href="/teams?tab=history" style={linkStyle}>📈 History</a>
              <a href="/lobby" style={linkStyle}>🎮 Lobby</a>
              <a href="/admin/settlement" style={linkStyle}>⚙️ Settlement</a>
            </div>

            {/* Ready to Settle List */}
            {readyToSettle.length > 0 && (
              <div style={{ ...cardStyle, marginBottom: '2rem' }}>
                <h3 style={{ color: '#f6ad55', marginBottom: '1rem' }}>📋 Ready to Settle ({readyToSettle.length})</h3>
                {readyToSettle.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#e6f1ff' }}>{c.name} <span style={{ color: '#8892b0', fontSize: '0.8rem' }}>• ${c.prizePool}</span></span>
                    <button onClick={() => settleSingleContest(c.id, c.name)} disabled={loading[c.id]} style={{ padding: '0.3rem 0.75rem', background: '#64ffda', color: '#0a192f', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
                      {loading[c.id] ? '...' : 'Settle'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Single Contest Tools */}
            <div style={{ ...cardStyle, background: 'rgba(17, 34, 64, 0.4)' }}>
              <h3 style={{ color: '#8892b0', marginBottom: '1rem' }}>🔧 Single Contest (Manual)</h3>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input
                  type="text" value={contestId} onChange={(e) => setContestId(e.target.value)}
                  placeholder="Contest ID" style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
                />
                {contestId && <span style={{ color: '#64ffda', fontSize: '0.8rem' }}>{contestId.slice(0, 8)}...</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <SmallBtn onClick={createTestUsers} loading={loading.users}>Create Test Users</SmallBtn>
                <SmallBtn onClick={fillLobby} loading={loading.fill} disabled={!contestId}>Fill Lobby</SmallBtn>
                <SmallBtn onClick={autoDraft} loading={loading.draft} disabled={!contestId}>Auto Draft</SmallBtn>
              </div>
            </div>

            {/* Activity Log */}
            <div style={{ marginTop: '2rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#8892b0', fontWeight: '600' }}>📝 Log</span>
                <button onClick={() => setLogs([])} style={{ background: 'none', border: '1px solid #4a5568', color: '#8892b0', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>Clear</button>
              </div>
              {logs.length === 0 ? (
                <p style={{ color: '#4a5568', fontStyle: 'italic' }}>No activity</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ color: log.type === 'error' ? '#f56565' : log.type === 'success' ? '#48bb78' : '#8892b0', fontSize: '0.8rem', fontFamily: 'monospace', padding: '0.15rem 0' }}>
                    <span style={{ color: '#4a5568' }}>[{log.timestamp}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

{/* ============ MONEY TAB ============ */}
        {activeTab === 'money' && (
          <div className="money-tab">
            {/* System Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <StatusCard title="Total User Balances" value={`$${moneyData?.totalUserBalances?.toFixed(2) || '0.00'}`} color="#f6ad55" />
              <StatusCard title="Today's Deposits" value={`$${moneyData?.deposits?.today?.toFixed(2) || '0.00'}`} color="#48bb78" />
              <StatusCard title="Month Deposits" value={`$${moneyData?.deposits?.thisMonth?.toFixed(2) || '0.00'}`} color="#48bb78" />
              <StatusCard title="Pending Withdrawals" value={`${moneyData?.pendingWithdrawals?.count || 0} ($${moneyData?.pendingWithdrawals?.total?.toFixed(2) || '0.00'})`} color="#f56565" />
            </div>

            {/* Reconciliation */}
            <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: '#64ffda', margin: 0 }}>🔍 Reconciliation</h3>
                <button onClick={runReconciliation} disabled={loading.reconcile} style={{ padding: '0.5rem 1.5rem', background: loading.reconcile ? '#4a5568' : '#64ffda', color: '#0a192f', border: 'none', borderRadius: '6px', cursor: loading.reconcile ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                  {loading.reconcile ? 'Checking...' : 'Run Check'}
                </button>
              </div>
              {reconcileData && (
                <div>
                  <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '1rem', background: reconcileData.healthy ? 'rgba(72, 187, 120, 0.15)' : 'rgba(245, 101, 101, 0.15)', border: `1px solid ${reconcileData.healthy ? '#48bb78' : '#f56565'}` }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: '700', color: reconcileData.healthy ? '#48bb78' : '#f56565' }}>
                      {reconcileData.healthy ? '✅ HEALTHY — All balances match' : `⚠️ ${reconcileData.mismatchCount} MISMATCHES FOUND`}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ color: '#8892b0', fontSize: '0.8rem' }}>Deposits: <span style={{ color: '#48bb78' }}>${parseFloat(reconcileData.system?.total_deposits || 0).toFixed(2)}</span></div>
                    <div style={{ color: '#8892b0', fontSize: '0.8rem' }}>Withdrawals: <span style={{ color: '#f56565' }}>${parseFloat(reconcileData.system?.total_withdrawals || 0).toFixed(2)}</span></div>
                    <div style={{ color: '#8892b0', fontSize: '0.8rem' }}>Entry Fees: <span style={{ color: '#f6ad55' }}>${parseFloat(reconcileData.system?.total_entry_fees || 0).toFixed(2)}</span></div>
                    <div style={{ color: '#8892b0', fontSize: '0.8rem' }}>Payouts: <span style={{ color: '#48bb78' }}>${parseFloat(reconcileData.system?.total_payouts || 0).toFixed(2)}</span></div>
                    <div style={{ color: '#8892b0', fontSize: '0.8rem' }}>System Δ: <span style={{ color: Math.abs(reconcileData.system?.systemDiscrepancy) < 1 ? '#48bb78' : '#f56565' }}>${reconcileData.system?.systemDiscrepancy?.toFixed(2)}</span></div>
                  </div>
                  {!reconcileData.healthy && reconcileData.mismatches?.slice(0, 10).map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                      <span style={{ color: '#e6f1ff' }}>{m.username}</span>
                      <span style={{ color: '#8892b0' }}>Balance: ${parseFloat(m.current_balance).toFixed(2)}</span>
                      <span style={{ color: '#f56565' }}>Δ ${parseFloat(m.discrepancy).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* User Lookup */}
            <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#64ffda', marginBottom: '1rem' }}>👤 User Lookup</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  value={userLookup}
                  onChange={(e) => setUserLookup(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookupUser()}
                  placeholder="Enter username..."
                  style={{ ...inputStyle, width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem' }}
                />
                <button onClick={lookupUser} disabled={loading.userLookup} style={{ padding: '0.5rem 1.5rem', background: '#64ffda', color: '#0a192f', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {loading.userLookup ? '...' : 'Look Up'}
                </button>
              </div>

              {userDetail && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div><div style={{ color: '#8892b0', fontSize: '0.7rem' }}>USERNAME</div><div style={{ color: '#e6f1ff', fontWeight: '600' }}>{userDetail.username}</div></div>
                    <div><div style={{ color: '#8892b0', fontSize: '0.7rem' }}>BALANCE</div><div style={{ color: '#48bb78', fontWeight: '600' }}>${parseFloat(userDetail.balance || 0).toFixed(2)}</div></div>
                    <div><div style={{ color: '#8892b0', fontSize: '0.7rem' }}>TICKETS</div><div style={{ color: '#f6ad55', fontWeight: '600' }}>{userDetail.tickets || 0}</div></div>
                    <div><div style={{ color: '#8892b0', fontSize: '0.7rem' }}>STATE</div><div style={{ color: '#e6f1ff', fontWeight: '600' }}>{userDetail.state || 'N/A'}</div></div>
                    <div><div style={{ color: '#8892b0', fontSize: '0.7rem' }}>ID</div><div style={{ color: '#4a5568', fontSize: '0.7rem' }}>{userDetail.id?.slice(0, 12)}...</div></div>
                  </div>

                  {/* Adjust Balance */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="Amount (+/-)" style={{ ...inputStyle, width: '100px', textAlign: 'left' }} />
                    <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Reason for adjustment" style={{ ...inputStyle, width: '100%', flex: 1, textAlign: 'left', minWidth: '150px' }} />
                    <button onClick={adjustUserBalance} disabled={loading.adjust || !adjustAmount || !adjustReason} style={{ padding: '0.5rem 1rem', background: (!adjustAmount || !adjustReason) ? '#4a5568' : '#f6ad55', color: '#0a192f', border: 'none', borderRadius: '6px', cursor: (!adjustAmount || !adjustReason) ? 'not-allowed' : 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      {loading.adjust ? '...' : 'Adjust'}
                    </button>
                  </div>

                  {/* Transaction History */}
                  <h4 style={{ color: '#8892b0', marginBottom: '0.5rem' }}>Recent Transactions</h4>
                  {userTransactions.length === 0 ? (
                    <p style={{ color: '#4a5568', fontStyle: 'italic', fontSize: '0.85rem' }}>No transactions found</p>
                  ) : (
                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      {userTransactions.map((tx, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: i % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'transparent', borderRadius: '4px', fontSize: '0.8rem', alignItems: 'center' }}>
                          <span style={{ color: '#8892b0', minWidth: '70px' }}>{tx.type}</span>
                          <span style={{ color: parseFloat(tx.amount) >= 0 ? '#48bb78' : '#f56565', fontWeight: '600', minWidth: '80px', textAlign: 'right' }}>{parseFloat(tx.amount) >= 0 ? '+' : ''}${parseFloat(tx.amount).toFixed(2)}</span>
                          <span style={{ color: '#4a5568', minWidth: '80px', textAlign: 'right' }}>→ ${parseFloat(tx.balanceAfter || 0).toFixed(2)}</span>
                          <span style={{ color: '#4a5568', fontSize: '0.7rem', minWidth: '80px', textAlign: 'right' }}>{new Date(tx.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pending Withdrawals */}
            <div style={cardStyle}>
              <h3 style={{ color: '#f56565', marginBottom: '1rem' }}>💸 Pending Withdrawals ({pendingWithdrawals.length})</h3>
              {pendingWithdrawals.length === 0 ? (
                <p style={{ color: '#4a5568', fontStyle: 'italic' }}>No pending withdrawals</p>
              ) : (
                pendingWithdrawals.map(w => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                    <div>
                      <span style={{ color: '#e6f1ff', fontWeight: '600' }}>{w.username}</span>
                      <span style={{ color: '#f6ad55', marginLeft: '1rem', fontWeight: '700' }}>${parseFloat(w.amount).toFixed(2)}</span>
                      <span style={{ color: '#4a5568', marginLeft: '1rem', fontSize: '0.75rem' }}>{new Date(w.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleWithdrawal(w.id, 'approve')} disabled={loading[`wd_${w.id}`]} style={{ padding: '0.3rem 0.75rem', background: '#48bb78', color: '#0a192f', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}>
                        {loading[`wd_${w.id}`] ? '...' : 'Approve'}
                      </button>
                      <button onClick={() => handleWithdrawal(w.id, 'reject')} disabled={loading[`wd_${w.id}`]} style={{ padding: '0.3rem 0.75rem', background: '#f56565', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


        {/* ============ CONTESTS TAB ============ */}
        {activeTab === 'contests' && (
          <div className="contests-tab">
            <h2>All Contests</h2>
            <div className="table-container">
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Entries</th><th>Actions</th></tr></thead>
                <tbody>
                  {contests.map(c => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.type}</td>
                      <td><span className={`status ${c.status}`}>{c.status}</span></td>
                      <td>{c.currentEntries}/{c.maxEntries}</td>
                      <td><button onClick={() => setContestId(c.id)} className="btn-sm">Select</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============ USERS TAB ============ */}
        {activeTab === 'users' && (
          <div className="users-tab">
            <h2>All Users</h2>
            <div className="table-container">
              <table>
                <thead><tr><th>Username</th><th>Balance</th><th>Tickets</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>${u.balance?.toFixed(2)}</td>
                      <td>{u.tickets}</td>
                      <td><button onClick={() => giveBonus(u.id)} className="btn-sm">+$100</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============ LOGS TAB ============ */}
        {activeTab === 'logs' && (
          <div className="logs-tab">
            <h2>Activity Logs</h2>
            <button onClick={() => setLogs([])} className="clear-logs">Clear Logs</button>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p className="no-logs">No logs yet</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`log-entry log-${log.type}`}>
                    <span className="log-time">{log.timestamp}</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ HELPER COMPONENTS ============

const StatusCard = ({ title, value, subtitle, color = '#64ffda' }) => (
  <div style={{ background: 'rgba(17, 34, 64, 0.6)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
    <div style={{ color: '#8892b0', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{title}</div>
    <div style={{ color, fontSize: '1.25rem', fontWeight: '700' }}>{value}</div>
    {subtitle && <div style={{ color: '#4a5568', fontSize: '0.7rem', marginTop: '0.25rem' }}>{subtitle}</div>}
  </div>
);

const StatBadge = ({ label, value, color }) => (
  <div style={{ background: 'rgba(17, 34, 64, 0.6)', padding: '0.75rem 1.25rem', borderRadius: '8px', textAlign: 'center' }}>
    <div style={{ color, fontSize: '1.5rem', fontWeight: '700' }}>{value}</div>
    <div style={{ color: '#8892b0', fontSize: '0.75rem', textTransform: 'uppercase' }}>{label}</div>
  </div>
);

const SmallBtn = ({ onClick, loading, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={loading || disabled}
    style={{
      padding: '0.4rem 0.75rem',
      background: (loading || disabled) ? '#4a5568' : 'rgba(100, 255, 218, 0.15)',
      color: (loading || disabled) ? '#8892b0' : '#64ffda',
      border: '1px solid rgba(100, 255, 218, 0.3)',
      borderRadius: '6px',
      cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
      fontSize: '0.85rem'
    }}
  >
    {loading ? '...' : children}
  </button>
);

// ============ STYLES ============

const cardStyle = {
  background: 'rgba(17, 34, 64, 0.6)',
  borderRadius: '12px',
  padding: '1.25rem',
  border: '1px solid rgba(100, 255, 218, 0.1)'
};

const inputStyle = {
  padding: '0.5rem',
  background: '#0a192f',
  border: '1px solid #64ffda',
  borderRadius: '4px',
  color: '#e6f1ff',
  width: '60px',
  textAlign: 'center'
};

const buttonStyle = (color, disabled) => ({
  width: '100%',
  padding: '0.7rem 1rem',
  background: disabled ? '#4a5568' : color,
  color: '#0a192f',
  border: 'none',
  borderRadius: '8px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: '600',
  fontSize: '0.95rem'
});

const smallBtnStyle = {
  padding: '0.5rem 1rem',
  background: 'rgba(100, 255, 218, 0.2)',
  border: '1px solid rgba(100, 255, 218, 0.3)',
  borderRadius: '6px',
  color: '#64ffda',
  cursor: 'pointer'
};

const linkStyle = {
  padding: '0.4rem 0.8rem',
  background: 'rgba(100, 255, 218, 0.1)',
  border: '1px solid rgba(100, 255, 218, 0.3)',
  borderRadius: '6px',
  color: '#64ffda',
  textDecoration: 'none',
  fontSize: '0.85rem'
};

export default AdminPanel;