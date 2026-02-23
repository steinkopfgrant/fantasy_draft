// frontend/src/components/Lobby/LobbyScreen.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import socketService from '../../services/socket';
import WaitingRoom from './WaitingRoom';
import './Lobby.css';

// Redux imports
import { 
  fetchContests,
  fetchUserEntries,
  selectContests,
  selectUserEntries,
  selectContestLoading
} from '../../store/slices/contestSlice';

import { selectAuthUser } from '../../store/slices/authSlice';
import { showToast } from '../../store/slices/uiSlice';

const LobbyScreen = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  // Redux selectors
  const contestsRaw = useSelector(selectContests);
  const userEntriesRaw = useSelector(selectUserEntries);
  const loadingStates = useSelector(selectContestLoading);
  const user = useSelector(selectAuthUser);
  
  const isLoading = loadingStates?.contests || false;
  
  // Memoize arrays to prevent re-renders
  const contests = useMemo(() => {
    const contestList = contestsRaw || [];
    return contestList.filter(contest => contest.type !== 'bash');
  }, [contestsRaw]);
  
  const userEntriesArray = useMemo(() => userEntriesRaw || [], [userEntriesRaw]);
  
  const userEntries = useMemo(() => {
    const entriesObj = {};
    userEntriesArray.forEach(entry => {
      const contestId = entry.contestId || entry.contest_id || entry.contestID;
      if (contestId) entriesObj[contestId] = entry;
    });
    return entriesObj;
  }, [userEntriesArray]);
  
  // Local UI state
  const [pendingJoins, setPendingJoins] = useState(new Set());
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortByLocal] = useState('createdAt');
  const [filterBy, setFilterBy] = useState({ status: 'all', type: 'all', entryFee: 'all' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSport, setSelectedSport] = useState('all');
  const [activeDraft, setActiveDraft] = useState(null);
  const [waitingRoomData, setWaitingRoomData] = useState(null);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  
  // Refs - prevents double-fetch and duplicate socket handlers
  const hasFetchedRef = useRef(false);
  const socketHandlersSetRef = useRef(false);
  const roomPollingInterval = useRef(null);
  const rejoinHandledRef = useRef(false);
  const rejoinRoomIdRef = useRef(new URLSearchParams(window.location.search).get('rejoin'));
  // Track the current waiting room ID in a ref so socket handler always has fresh value
  const waitingRoomIdRef = useRef(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    waitingRoomIdRef.current = waitingRoomData?.roomId || null;
  }, [waitingRoomData]);
  
  // ============================================
  // ROOM POLLING (defined early so rejoin effect can reference it)
  // ============================================
  const startRoomPolling = useCallback((roomId) => {
    if (roomPollingInterval.current) clearInterval(roomPollingInterval.current);
    
    let errorCount = 0;
    
    const pollRoom = async () => {
      try {
        const response = await axios.get(`/api/contests/room/${roomId}/status`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          timeout: 5000
        });
        
        errorCount = 0;
        
        setWaitingRoomData(prev => {
          if (!prev || prev.roomId !== roomId) return prev;
          return {
            ...prev,
            currentPlayers: response.data.currentPlayers || prev.currentPlayers,
            players: response.data.players || prev.players || [],
            status: response.data.status || prev.status
          };
        });
        
        if (response.data.currentPlayers >= response.data.maxPlayers) {
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
        }
      } catch (error) {
        errorCount++;
        if (errorCount >= 3) {
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
          dispatch(showToast({ message: 'Lost connection to room. Please refresh.', type: 'error' }));
        }
      }
    };
    
    pollRoom();
    roomPollingInterval.current = setInterval(pollRoom, 2000);
  }, [dispatch]);
  
  // ============================================
  // SINGLE DATA FETCH ON MOUNT - NO HEALTH CHECK
  // ============================================
  useEffect(() => {
    if (!user?.id || hasFetchedRef.current) return;
    
    hasFetchedRef.current = true;
    console.log('🚀 Fetching lobby data for:', user.username);
    
    // Fetch both in parallel - no unnecessary health check
    Promise.all([
      dispatch(fetchContests()),
      dispatch(fetchUserEntries())
    ]).catch(err => console.error('❌ Fetch error:', err));
  }, [dispatch, user?.id, user?.username]);
  
  // Reset fetch flag on user change
  useEffect(() => {
    return () => { hasFetchedRef.current = false; };
  }, [user?.id]);
  
  // ============================================
  // REJOIN FROM TEAMS PAGE (query param: ?rejoin=roomId)
  // Uses window.location directly to avoid React re-render loops
  // ============================================
  useEffect(() => {
    const rejoinRoomId = rejoinRoomIdRef.current;
    if (!rejoinRoomId || !user?.id || rejoinHandledRef.current) return;
    
    rejoinHandledRef.current = true;
    
    // Clear URL without triggering React state change
    window.history.replaceState({}, '', window.location.pathname);
    
    console.log('🔄 Rejoin requested for room:', rejoinRoomId);
    
    const rejoinRoom = async () => {
      try {
        // Get room status
        const response = await axios.get(`/api/contests/room/${rejoinRoomId}/status`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          timeout: 5000
        });
        
        const roomStatus = response.data;
        console.log('📋 Room status response:', JSON.stringify(roomStatus));
        
        // Fetch user's entry for this room
        const entriesRes = await axios.get('/api/contests/my-entries', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const rawEntries = entriesRes.data?.entries || entriesRes.data || [];
        const entries = Array.isArray(rawEntries) ? rawEntries : [];
        
        const myEntry = entries.find(e => {
          const entryContestId = e.contest_id || e.contestId;
          const entryRoomId = e.draft_room_id || e.draftRoomId;
          return (entryRoomId === rejoinRoomId || entryContestId === roomStatus.contestId) && 
                 (e.status === 'pending' || e.status === 'drafting');
        });
        
        console.log('📋 My entry:', myEntry ? { id: myEntry.id, status: myEntry.status } : 'not found');
        
        // If user's entry is drafting, go straight to draft screen
        if (myEntry?.status === 'drafting') {
          console.log('🚀 Entry is drafting, navigating to DraftScreen');
          navigate(`/draft/${rejoinRoomId}`, { replace: true });
          return;
        }
        
        // If no entry found, user probably already withdrew
        if (!myEntry) {
          console.log('⚠️ No active entry found for this room');
          dispatch(showToast({ message: 'No active entry found for this room', type: 'info' }));
          return;
        }
        
        // Entry is pending — show the waiting room
        const contestsRes = await axios.get('/api/contests', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const contestsList = contestsRes.data?.contests || contestsRes.data || [];
        const contest = contestsList.find(c => c.id === roomStatus.contestId);
        
        console.log('✅ Setting up waiting room for room:', rejoinRoomId);
        
        setWaitingRoomData({
          contestId: roomStatus.contestId,
          contestName: contest?.name || 'Contest',
          contestType: contest?.type || 'cash',
          roomId: rejoinRoomId,
          entryId: myEntry.id,
          currentPlayers: roomStatus.currentPlayers || 0,
          maxPlayers: roomStatus.maxPlayers || 5,
          players: roomStatus.players || []
        });
        setIsInWaitingRoom(true);
        
        // Join socket room
        if (socketService.isConnected()) {
          socketService.emit('join-room', { roomId: rejoinRoomId, entryId: myEntry.id });
        }
        
        startRoomPolling(rejoinRoomId);
      } catch (error) {
        console.error('❌ Failed to rejoin room:', error);
        dispatch(showToast({ message: 'Failed to rejoin waiting room', type: 'error' }));
      }
    };
    
    rejoinRoom();
  }, [user?.id, dispatch, navigate, startRoomPolling]);
  
  // Reset rejoin flag when leaving waiting room
  useEffect(() => {
    if (!isInWaitingRoom) {
      rejoinHandledRef.current = false;
    }
  }, [isInWaitingRoom]);
  
  // ============================================
  // CHECK FOR ACTIVE DRAFTS
  // ============================================
  useEffect(() => {
    // ONLY match entries with 'drafting' status - NOT pending
    const draftingEntry = userEntriesArray.find(entry => {
      const roomId = entry.draft_room_id || entry.draftRoomId;
      return roomId && entry.status === 'drafting';
    });
    
    if (draftingEntry) {
      const roomId = draftingEntry.draft_room_id || draftingEntry.draftRoomId;
      const contest = contests.find(c => 
        c.id === draftingEntry.contest_id || c.id === draftingEntry.contestId
      );
      setActiveDraft({
        roomId,
        contestName: contest?.name || 'Draft',
        entryId: draftingEntry.id
      });
    } else {
      setActiveDraft(null);
    }
  }, [userEntriesArray, contests]);
  
  // Cleanup polling
  useEffect(() => {
    return () => {
      if (roomPollingInterval.current) clearInterval(roomPollingInterval.current);
    };
  }, []);
  
  useEffect(() => {
    if (!isInWaitingRoom && roomPollingInterval.current) {
      clearInterval(roomPollingInterval.current);
      roomPollingInterval.current = null;
    }
  }, [isInWaitingRoom]);
  
  // ============================================
  // JOIN CONTEST
  // ============================================
  const handleJoinContest = useCallback(async (contestId) => {
    try {
      const contest = contests.find(c => c.id === contestId || c._id === contestId);
      
      if (!contest) throw new Error('Contest not found');
      if (!user?.id) throw new Error('You must be logged in');
      if (contest.status !== 'open') throw new Error('Contest is not open');
      if (contest.currentEntries >= contest.maxEntries) throw new Error('Contest is full');
      if (contest.type === 'cash' && userEntries[contestId]) throw new Error('Already entered');
      
      if (contest.type === 'market') {
        const count = userEntriesArray.filter(e => 
          (e.contestId === contestId || e.contest_id === contestId) && e.status !== 'cancelled'
        ).length;
        if (count >= 150) throw new Error('Max 150 entries reached');
      }
      
      const actualContestId = contest.id || contest._id;
      setPendingJoins(prev => new Set(prev).add(actualContestId));
      
      try {
        const response = await axios.post(
          `/api/contests/enter/${actualContestId}`,
          {},
          { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, timeout: 10000 }
        );
        
        // Refresh data
        Promise.all([dispatch(fetchContests()), dispatch(fetchUserEntries())]);
        
        dispatch(showToast({ 
          message: contest.type === 'market' ? 'Joined MarketMaker!' : 'Joined contest!', 
          type: 'success' 
        }));
        
        if (response.data.entryId && response.data.draftRoomId) {
          const roomId = response.data.draftRoomId;
          const roomData = response.data.roomStatus || { currentPlayers: 1, maxPlayers: 5, players: [] };
          
          setWaitingRoomData({
            contestId: actualContestId,
            contestName: contest.name,
            contestType: contest.type,
            roomId,
            entryId: response.data.entryId,
            currentPlayers: roomData.currentPlayers,
            maxPlayers: roomData.maxPlayers || 5,
            players: roomData.players || []
          });
          setIsInWaitingRoom(true);
          
          if (socketService.isConnected()) {
            socketService.emit('join-room', { roomId, entryId: response.data.entryId });
            setTimeout(() => socketService.emit('check-active-drafts'), 500);
          }
          
          startRoomPolling(roomId);
        }
      } catch (error) {
        throw new Error(error.response?.data?.error || error.message || 'Failed to join');
      } finally {
        setPendingJoins(prev => {
          const newSet = new Set(prev);
          newSet.delete(actualContestId);
          return newSet;
        });
      }
    } catch (error) {
      dispatch(showToast({ message: error.message, type: 'error' }));
    }
  }, [dispatch, user, contests, userEntriesArray, userEntries, startRoomPolling]);
  
  // ============================================
  // LEAVE CONTEST
  // ============================================
  const handleLeaveContest = useCallback(async (contestId) => {
    try {
      if (!user?.id) return;
      
      const contest = contests.find(c => c.id === contestId);
      let entryToWithdraw;
      
      if (contest?.type === 'market') {
        const pending = userEntriesArray.filter(e => 
          (e.contestId === contestId || e.contest_id === contestId) && e.status === 'pending'
        );
        if (!pending.length) return;
        entryToWithdraw = pending[pending.length - 1];
      } else {
        entryToWithdraw = userEntries[contestId];
        if (!entryToWithdraw) return;
        if (contest && ['in_progress', 'completed'].includes(contest.status)) {
          dispatch(showToast({ message: 'Cannot leave started contest', type: 'error' }));
          return;
        }
      }
      
      await axios.post(
        `/api/contests/withdraw/${entryToWithdraw.id}`,
        {},
        { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, timeout: 10000 }
      );
      
      Promise.all([dispatch(fetchContests()), dispatch(fetchUserEntries())]);
      dispatch(showToast({ message: 'Left contest', type: 'success' }));
      
      if (isInWaitingRoom && waitingRoomData?.contestId === contestId) {
        if (roomPollingInterval.current) clearInterval(roomPollingInterval.current);
        setIsInWaitingRoom(false);
        setWaitingRoomData(null);
      }
    } catch (error) {
      dispatch(showToast({ message: error.response?.data?.error || 'Failed to leave', type: 'error' }));
    }
  }, [dispatch, user, contests, userEntriesArray, userEntries, isInWaitingRoom, waitingRoomData]);
  
  // ============================================
  // SOCKET HANDLERS
  // ============================================
  useEffect(() => {
    if (!user?.id || !socketService.isConnected() || socketHandlersSetRef.current) return;
    
    socketHandlersSetRef.current = true;
    const cleanups = [];
    
    cleanups.push(socketService.on('room-player-joined', (data) => {
      setWaitingRoomData(prev => {
        if (!prev || prev.roomId !== data.roomId) return prev;
        return { ...prev, players: data.players || [], currentPlayers: data.currentPlayers || prev.currentPlayers + 1 };
      });
    }));
    
    cleanups.push(socketService.on('draft-countdown', (data) => {
      setWaitingRoomData(prev => {
        if (!prev || prev.roomId !== data.roomId) return prev;
        dispatch(showToast({ message: `Draft starting in ${data.seconds}s!`, type: 'info' }));
        return { ...prev, draftStarting: true, countdown: data.seconds };
      });
    }));
    
    // FIXED: draft-starting handler - navigation moved OUTSIDE setState callback
    // Uses ref to get current waitingRoomId to avoid stale closure issues
    cleanups.push(socketService.on('draft-starting', (data) => {
      console.log('📢 Received draft-starting event:', data.roomId);
      console.log('📢 Current waiting room:', waitingRoomIdRef.current);
      
      // Check if this is the room we're waiting in
      const isMyWaitingRoom = waitingRoomIdRef.current === data.roomId;
      
      if (isMyWaitingRoom) {
        console.log(`✅ Draft starting for MY room: ${data.roomId}`);
        
        // Stop polling
        if (roomPollingInterval.current) {
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
        }
        
        // Get entryId before clearing state
        const entryId = waitingRoomData?.entryId;
        
        // Clear waiting room state
        setIsInWaitingRoom(false);
        setWaitingRoomData(null);
        waitingRoomIdRef.current = null;
        
        // Navigate to draft - OUTSIDE of setState callback
        navigate(`/draft/${data.roomId}`, {
          state: {
            draftData: {
              roomId: data.roomId,
              contestId: data.contestId,
              contestType: data.contestType,
              playerBoard: data.playerBoard,
              participants: data.participants,
              entryId: entryId,
              userDraftPosition: data.participants?.findIndex(p => p.userId === user.id) ?? -1
            }
          }
        });
      } else {
        console.log(`⏭️ Draft starting for different room: ${data.roomId}, my room is: ${waitingRoomIdRef.current}`);
      }
    }));
    
    cleanups.push(socketService.on('fire-sale-update', () => dispatch(fetchContests())));
    
    socketService.emit('check-active-drafts');
    
    return () => {
      cleanups.forEach(fn => fn && fn());
      socketHandlersSetRef.current = false;
    };
  }, [user?.id, dispatch, navigate, waitingRoomData]);
  
  // ============================================
  // FILTERS & SORTING
  // ============================================
  const filteredAndSortedContests = useMemo(() => {
    let filtered = [...contests];
    
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(s) || c.description?.toLowerCase().includes(s)
      );
    }
    
    if (selectedSport !== 'all') filtered = filtered.filter(c => c.sport === selectedSport);
    if (filterBy.status !== 'all') filtered = filtered.filter(c => c.status === filterBy.status);
    if (filterBy.type !== 'all') filtered = filtered.filter(c => c.type === filterBy.type);
    if (filterBy.entryFee === 'free') filtered = filtered.filter(c => c.entryFee === 0);
    if (filterBy.entryFee === 'paid') filtered = filtered.filter(c => c.entryFee > 0);
    
    if (activeTab === 'my-contests') {
      filtered = filtered.filter(c => {
        const cid = c.id || c._id;
        if (c.type === 'market') {
          return userEntriesArray.some(e => (e.contestId === cid || e.contest_id === cid) && e.status !== 'cancelled');
        }
        return userEntries[cid];
      });
    } else if (activeTab === 'available') {
      filtered = filtered.filter(c => {
        const cid = c.id || c._id;
        if (c.type === 'market') {
          const count = userEntriesArray.filter(e => (e.contestId === cid || e.contest_id === cid) && e.status !== 'cancelled').length;
          return count < 150 && c.status === 'open' && c.currentEntries < c.maxEntries;
        }
        return !userEntries[cid] && c.status === 'open' && c.currentEntries < c.maxEntries;
      });
    }
    
    // Fixed order: NBA Cash → NFL Cash → Market Mover
    const getContestOrder = (contest) => {
      const sport = (contest.sport || 'nfl').toLowerCase();
      const type = contest.type || '';
      
      if (type === 'cash' && sport === 'nba') return 0;
      if (type === 'cash' && sport === 'nfl') return 1;
      if (type === 'market') return 2;
      return 3;
    };
    
    filtered.sort((a, b) => {
      const orderDiff = getContestOrder(a) - getContestOrder(b);
      if (orderDiff !== 0) return orderDiff;
      
      switch (sortBy) {
        case 'startTime': return new Date(a.startTime || 0) - new Date(b.startTime || 0);
        case 'entryFee': return (b.entryFee || 0) - (a.entryFee || 0);
        case 'prizePool': return (b.prizePool || 0) - (a.prizePool || 0);
        default: return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
    });
    
    return filtered;
  }, [contests, searchTerm, selectedSport, filterBy, activeTab, sortBy, userEntries, userEntriesArray]);
  
  const contestStats = useMemo(() => {
    const stats = { total: contests.length, open: 0, inProgress: 0, userContests: 0, totalPrizePool: 0 };
    contests.forEach(c => {
      const cid = c.id || c._id;
      if (c.type === 'market') {
        if (userEntriesArray.some(e => (e.contestId === cid || e.contest_id === cid) && e.status !== 'cancelled')) stats.userContests++;
      } else if (userEntries[cid]) stats.userContests++;
      if (c.status === 'open') stats.open++;
      else if (c.status === 'in_progress') stats.inProgress++;
      stats.totalPrizePool += c.type === 'market' ? 120000 : (c.prizePool || c.prize_pool || 0);
    });
    return stats;
  }, [contests, userEntries, userEntriesArray]);
  
  // ============================================
  // UTILITIES
  // ============================================
  const formatTimeRemaining = useCallback((startTime) => {
    if (!startTime) return 'No start time';
    const diff = new Date(startTime) - new Date();
    if (diff < 0) return 'In Progress';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 24 ? `${Math.floor(hours/24)}d ${hours%24}h` : `${hours}h ${minutes}m`;
  }, []);
  
  const getFillPercentage = useCallback((c) => {
    const max = c.type === 'market' ? 5000 : (c.maxEntries || c.max_entries || 1);
    return ((c.currentEntries || c.current_entries || 0) / max) * 100;
  }, []);
  
  const getDraftRoomCount = useCallback((c) => {
    if (c.type === 'market') return 1000;
    return Math.ceil((c.maxEntries || c.max_entries || 0) / 5);
  }, []);
  
  const handleRefresh = useCallback(() => {
    Promise.all([dispatch(fetchContests()), dispatch(fetchUserEntries())]);
  }, [dispatch]);
  
  // ============================================
  // RENDER
  // ============================================
  if (!user) {
    return (
      <div className="lobby-container">
        <div className="empty-state">
          <h2>Please log in to view the contest lobby</h2>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    );
  }
  
  if (isLoading && contests.length === 0) {
    return (
      <div className="lobby-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h2>Loading Contest Lobby...</h2>
        </div>
      </div>
    );
  }
  
  if (isInWaitingRoom && waitingRoomData) {
    return (
      <WaitingRoom 
        roomData={waitingRoomData}
        onLeave={() => handleLeaveContest(waitingRoomData.contestId)}
        countdown={waitingRoomData.countdown}
        draftStarting={waitingRoomData.draftStarting}
        isAdmin={user?.username === 'aaaaaa' || user?.is_admin}
      />
    );
  }
  
  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
          {/* LEFT SIDE - Pools & Rules buttons stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => navigate('/pools')}
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                border: 'none', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px',
                fontWeight: '600', cursor: 'pointer', fontSize: '0.95rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}
            >
              🎱 Player Pools
            </button>
            <button
              onClick={() => navigate('/rules')}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px',
                fontWeight: '600', cursor: 'pointer', fontSize: '0.95rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}
            >
              📋 Rules & Scoring
            </button>
          </div>
          
          {/* CENTER - Title */}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: 0 }}>Contest Lobby</h1>
            <p style={{ margin: '0.25rem 0 0 0', color: '#8892b0', fontSize: '0.95rem' }}>
              Join exciting fantasy sports contests and compete for prizes!
            </p>
          </div>
          
          {/* RIGHT SIDE - Active Draft button */}
          {activeDraft ? (
            <button 
              onClick={() => navigate(`/draft/${activeDraft.roomId}`, { state: { entryId: activeDraft.entryId, rejoin: true } })}
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                border: 'none', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px',
                fontWeight: '600', cursor: 'pointer', fontSize: '0.95rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}
            >
              🔴 Rejoin Draft
            </button>
          ) : (
            <button disabled style={{
              background: 'rgba(55, 65, 81, 0.5)', border: '1px solid rgba(75, 85, 99, 0.5)',
              color: '#9ca3af', padding: '0.75rem 1.5rem', borderRadius: '8px',
              fontWeight: '600', cursor: 'not-allowed', fontSize: '0.95rem'
            }}>
              ⚪ No Active Drafts
            </button>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '20px', margin: '10px 0', fontSize: '14px', color: '#a0aec0' }}>
          <span>Total: {contestStats.total}</span>
          <span>Open: {contestStats.open}</span>
          <span>Live: {contestStats.inProgress}</span>
          <span>Your Contests: {contestStats.userContests}</span>
          <span>Total Prizes: ${contestStats.totalPrizePool.toLocaleString()}</span>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', margin: '10px 0', flexWrap: 'wrap' }}>
          <input 
            type="text" placeholder="Search contests..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', flex: 1, minWidth: '200px', background: 'rgba(255,255,255,0.05)', color: 'white' }}
          />
          <select value={sortBy} onChange={(e) => setSortByLocal(e.target.value)}
            style={{ padding: '8px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'white' }}>
            <option value="createdAt">Newest</option>
            <option value="startTime">Start Time</option>
            <option value="entryFee">Entry Fee</option>
            <option value="prizePool">Prize Pool</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)} className="btn btn-secondary">
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button onClick={handleRefresh} className="btn btn-secondary">Refresh</button>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', margin: '15px 0', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
          {['all', 'my-contests', 'available'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab ? '#667eea' : '#a0aec0',
                fontWeight: activeTab === tab ? 'bold' : 'normal'
              }}>
              {tab === 'my-contests' ? `My Contests (${contestStats.userContests})` : tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
        
        {showFilters && (
          <div style={{ display: 'flex', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', margin: '10px 0', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: '#a0aec0' }}>Sport:</label>
              <select value={selectedSport} onChange={(e) => setSelectedSport(e.target.value)}
                style={{ marginLeft: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                <option value="all">All</option><option value="NFL">NFL</option><option value="NBA">NBA</option>
              </select>
            </div>
            <div>
              <label style={{ color: '#a0aec0' }}>Status:</label>
              <select value={filterBy.status} onChange={(e) => setFilterBy({...filterBy, status: e.target.value})}
                style={{ marginLeft: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                <option value="all">All</option><option value="open">Open</option><option value="in_progress">In Progress</option>
              </select>
            </div>
            <div>
              <label style={{ color: '#a0aec0' }}>Type:</label>
              <select value={filterBy.type} onChange={(e) => setFilterBy({...filterBy, type: e.target.value})}
                style={{ marginLeft: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
                <option value="all">All</option><option value="cash">Cash</option><option value="market">MarketMaker</option>
              </select>
            </div>
          </div>
        )}
      </div>
      
      <div className="lobby-content">
        {filteredAndSortedContests.length > 0 ? (
          <div className="contests-grid">
            {filteredAndSortedContests.map(contest => {
              const contestId = contest.id || contest._id;
              const userEntry = userEntries[contestId];
              const isJoining = pendingJoins.has(contestId);
              const maxEntries = contest.type === 'market' ? 5000 : (contest.maxEntries || contest.max_entries || 1);
              const currentEntries = contest.currentEntries || contest.current_entries || 0;
              const isFull = currentEntries >= maxEntries;
              const hasStarted = ['in_progress', 'completed'].includes(contest.status);
              const fillPercentage = getFillPercentage(contest);
              const contestType = contest.type || 'standard';
              
              const userMarketEntries = contest.type === 'market' ? 
                userEntriesArray.filter(e => (e.contestId === contestId || e.contest_id === contestId) && e.status !== 'cancelled').length : 0;
              
              const canJoin = !isFull && !hasStarted && contest.status === 'open' && 
                (contest.type === 'market' ? userMarketEntries < 150 : !userEntry);
              
              return (
                <div key={contestId} className={`contest-card ${contestType} ${userEntry ? 'user-entered' : ''} ${isFull ? 'contest-full' : ''}`}>
                  {contestType === 'cash' && (
                    <div style={{
                      fontSize: '32px', fontWeight: '800', color: '#60a5fa', textAlign: 'center',
                      padding: '20px 10px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.05) 100%)',
                      borderRadius: '12px', marginBottom: '20px', letterSpacing: '3px', textTransform: 'uppercase'
                    }}>💵 CASH</div>
                  )}
                  
                  {contestType === 'market' && (
                    <div style={{
                      fontSize: '28px', fontWeight: '800', color: '#34d399', textAlign: 'center',
                      padding: '20px 10px', background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)',
                      borderRadius: '12px', marginBottom: '20px', letterSpacing: '2px', textTransform: 'uppercase',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                    }}>
                      📈 MARKETMAKER
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#a0aec0' }}>FIRE SALE TOURNAMENT</div>
                    </div>
                  )}
                  
                  <div className="contest-header">
                    <h3>{contest.name}</h3>
                    {(userEntry || userMarketEntries > 0) ? (
                      <span className="contest-type" style={{ background: '#48bb78', color: 'white' }}>Entered</span>
                    ) : (
                      <span className={`contest-type ${contestType}`}>{contestType === 'market' ? 'MARKET' : contestType.toUpperCase()}</span>
                    )}
                  </div>
                  
                  <div className="contest-details">
                    {contestType === 'market' && contest.fireSaleList?.length > 0 && (
                      <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '5px' }}>🔥 FIRE SALE ACTIVE</div>
                        <div style={{ fontSize: '11px', color: '#a0aec0' }}>{contest.fireSaleList.map(p => p.name).join(', ')}</div>
                      </div>
                    )}
                    
                    {contestType === 'market' && userMarketEntries > 0 && (
                      <div style={{ background: 'rgba(72,187,120,0.1)', border: '1px solid rgba(72,187,120,0.3)', borderRadius: '8px', padding: '8px', marginBottom: '10px', fontSize: '12px', color: '#48bb78' }}>
                        Your Entries: {userMarketEntries} / 150 max
                      </div>
                    )}
                    
                    <div className="detail-row"><span>Type:</span><span className="detail-value">{contestType === 'cash' ? 'Cash' : contestType === 'market' ? 'Tournament' : contestType}</span></div>
                    <div className="detail-row"><span>Sport:</span><span className="detail-value">{contest.sport === 'nba' ? '🏀 Basketball' : '🏈 Football'}</span></div>
                    {contest.slateName && (
                      <div className="detail-row"><span>Slate:</span><span className="detail-value" style={{ color: '#fbbf24', fontSize: '13px' }}>📅 {contest.slateName}</span></div>
                    )}
                    <div className="detail-row"><span>Entry Fee:</span><span className="detail-value">{contestType === 'cash' ? '$5' : contestType === 'market' ? '$25' : `$${contest.entryFee || 0}`}</span></div>
                    <div className="detail-row">
                      <span>Prize Pool:</span>
                      <span className="detail-value" style={{ color: contestType === 'market' ? '#fbbf24' : '#48bb78', fontSize: contestType === 'market' ? '20px' : '18px', fontWeight: 'bold' }}>
                        ${contestType === 'cash' ? '24' : contestType === 'market' ? '120,000' : (contest.prizePool || 0).toLocaleString()}
                      </span>
                    </div>
                    {contest.startTime && <div className="detail-row"><span>Starts:</span><span className="detail-value">{formatTimeRemaining(contest.startTime)}</span></div>}
                    <div className="detail-row"><span>Draft Rooms:</span><span className="detail-value">{getDraftRoomCount(contest).toLocaleString()}</span></div>
                    
                    <div style={{ marginTop: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#a0aec0' }}>
                        <span>{currentEntries} / {contestType === 'market' ? '5,000' : maxEntries} entries</span>
                        <span>{fillPercentage.toFixed(0)}% full</span>
                      </div>
                      <div className={`fill-bar ${isFull ? 'full' : ''}`}>
                        <div className="fill-progress" style={{ 
                          width: `${fillPercentage}%`,
                          background: contestType === 'market' ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)' : 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
                        }} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="contest-actions">
                    {contestType === 'market' ? (
                      <>
                        {userMarketEntries > 0 && <div style={{ marginBottom: '8px', fontSize: '12px', color: '#48bb78', textAlign: 'center' }}>You have {userMarketEntries} {userMarketEntries === 1 ? 'entry' : 'entries'}</div>}
                        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); handleJoinContest(contestId); }}
                          disabled={!canJoin || isJoining || userMarketEntries >= 150}>
                          {isJoining ? 'Joining...' : isFull ? 'Full' : contest.status !== 'open' ? 'Not Open' : userMarketEntries >= 150 ? 'Max Reached' : userMarketEntries > 0 ? 'Enter Again' : 'Join'}
                        </button>
                        {userMarketEntries > 0 && userMarketEntries < 150 && (
                          <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); handleLeaveContest(contestId); }} style={{ marginTop: '8px', fontSize: '12px' }}>
                            Withdraw Last
                          </button>
                        )}
                      </>
                    ) : (
                      userEntry ? (
                        <button className="btn" onClick={(e) => { e.stopPropagation(); handleLeaveContest(contestId); }} style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: 'white' }}>Withdraw</button>
                      ) : (
                        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); handleJoinContest(contestId); }} disabled={!canJoin || isJoining}>
                          {isJoining ? 'Joining...' : isFull ? 'Full' : contest.status !== 'open' ? 'Not Open' : 'Join Contest'}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No contests available</h3>
            <p>No contests match your current filters.</p>
            <button className="btn btn-primary" onClick={() => { setActiveTab('all'); setSearchTerm(''); setFilterBy({ status: 'all', type: 'all', entryFee: 'all' }); dispatch(fetchContests()); }}>
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyScreen;