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
  selectContestLoading,
  selectContestErrors
} from '../../store/slices/contestSlice';

import { 
  selectSocketStatus
} from '../../store/slices/socketSlice';

import { 
  selectAuthUser
} from '../../store/slices/authSlice';

import { showToast } from '../../store/slices/uiSlice';

const LobbyScreen = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  // Redux selectors
  const contestsRaw = useSelector(selectContests);
  const userEntriesRaw = useSelector(selectUserEntries);
  const loadingStates = useSelector(selectContestLoading);
  const contestErrorsObj = useSelector(selectContestErrors);
  const socketStatusObj = useSelector(selectSocketStatus);
  const user = useSelector(selectAuthUser);
  
  // Extract the actual values we need
  const isLoading = loadingStates?.contests || false;
  const isSocketConnected = socketStatusObj?.connected && socketStatusObj?.authenticated;
  
  // Memoize arrays to prevent re-renders
  // FIXED: Filter out 'bash' type contests entirely (Daily Bash is deprecated)
  const contests = useMemo(() => {
    const contestList = contestsRaw || [];
    // Filter out any bash type contests - they are deprecated
    return contestList.filter(contest => contest.type !== 'bash');
  }, [contestsRaw]);
  
  const userEntriesArray = useMemo(() => userEntriesRaw || [], [userEntriesRaw]);
  
  // Convert userEntries array to object keyed by contestId for easier lookup
  const userEntries = useMemo(() => {
    const entriesObj = {};
    userEntriesArray.forEach(entry => {
      const contestId = entry.contestId || entry.contest_id || entry.contestID;
      if (contestId) {
        entriesObj[contestId] = entry;
      }
    });
    return entriesObj;
  }, [userEntriesArray]);
  
  // Local UI state
  const [hasInitialized, setHasInitialized] = useState(false);
  const [pendingJoins, setPendingJoins] = useState(new Set());
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortByLocal] = useState('createdAt');
  const [filterBy, setFilterBy] = useState({
    status: 'all',
    type: 'all',
    entryFee: 'all'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSport, setSelectedSport] = useState('all');
  const [serverError, setServerError] = useState(false);
  
  // Active draft for rejoin button
  const [activeDraft, setActiveDraft] = useState(null);
  
  // Waiting room state
  const [waitingRoomData, setWaitingRoomData] = useState(null);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  
  // Refs
  const socketEventHandlersRef = useRef(null);
  const roomPollingInterval = useRef(null);
  const socketReconnectAttempts = useRef(0);
  const maxSocketReconnectAttempts = 3;
  
  // Server health check utility
  const checkServerHealth = useCallback(async () => {
    try {
      const response = await axios.get('/health', {
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setServerError(false);
      return response.data?.healthy !== false;
    } catch (error) {
      console.error('Server health check failed:', error);
      setServerError(true);
      return false;
    }
  }, []);
  
  // Initialize socket connection with retry logic
  useEffect(() => {
    const initializeSocket = async () => {
      const token = localStorage.getItem('token');
      
      if (!user || !token) {
        return;
      }
      
      if (socketService.isConnected()) {
        socketReconnectAttempts.current = 0;
        return;
      }
      
      if (socketReconnectAttempts.current >= maxSocketReconnectAttempts) {
        console.log('🔌 Max socket reconnection attempts reached');
        return;
      }
      
      console.log('🔌 Initializing socket connection...');
      try {
        await socketService.connect(token);
        console.log('✅ Socket connected successfully');
        socketReconnectAttempts.current = 0;
      } catch (error) {
        console.error('❌ Failed to connect socket:', error);
        socketReconnectAttempts.current++;
        
        // Retry after delay
        if (socketReconnectAttempts.current < maxSocketReconnectAttempts) {
          setTimeout(() => {
            initializeSocket();
          }, 2000 * socketReconnectAttempts.current);
        }
      }
    };
    
    initializeSocket();
  }, [user]);
  
  // Initialize and fetch data with error handling
  useEffect(() => {
    if (user?.id && !hasInitialized) {
      setHasInitialized(true);
      
      console.log('🚀 Fetching data for user:', user.username);
      
      const fetchData = async () => {
        try {
          // Check server health first
          const isHealthy = await checkServerHealth();
          if (!isHealthy) {
            dispatch(showToast({ 
              message: 'Server is experiencing issues. Some features may be unavailable.', 
              type: 'warning' 
            }));
          }
          
          const promises = [
            dispatch(fetchContests()),
            dispatch(fetchUserEntries())
          ];
          
          const results = await Promise.allSettled(promises);
          
          // Check if any requests failed
          const failedRequests = results.filter(r => r.status === 'rejected');
          if (failedRequests.length > 0) {
            console.error('Some data fetches failed:', failedRequests);
          }
        } catch (error) {
          console.error('❌ Failed to fetch data:', error);
        }
      };
      
      fetchData();
    }
  }, [dispatch, hasInitialized, user, checkServerHealth]);
  
  // Check for active drafts to show rejoin button
  // FIXED: Check both draft_room_id (snake_case) and draftRoomId (camelCase)
  useEffect(() => {
    const draftingEntry = userEntriesArray.find(entry => {
      const roomId = entry.draft_room_id || entry.draftRoomId;
      return roomId && !['completed', 'cancelled'].includes(entry.status);
    });
    
    if (draftingEntry) {
      const roomId = draftingEntry.draft_room_id || draftingEntry.draftRoomId;
      const contest = contests.find(c => 
        c.id === draftingEntry.contest_id || c.id === draftingEntry.contestId
      );
      console.log('🔄 Found active draft entry:', {
        entryId: draftingEntry.id,
        roomId,
        status: draftingEntry.status,
        contestName: contest?.name
      });
      setActiveDraft({
        roomId: roomId,
        contestName: contest?.name || 'Draft',
        entryId: draftingEntry.id
      });
    } else {
      setActiveDraft(null);
    }
  }, [userEntriesArray, contests]);
  
  // Enhanced polling with error handling and backoff
  const startRoomPolling = useCallback((roomId) => {
    // Clear any existing polling
    if (roomPollingInterval.current) {
      clearInterval(roomPollingInterval.current);
      roomPollingInterval.current = null;
    }
    
    console.log('🔄 Starting room polling for:', roomId);
    
    let errorCount = 0;
    const maxErrors = 3;
    let pollingDelay = 2000;
    
    const pollRoom = async () => {
      try {
        const response = await axios.get(
          `/api/contests/room/${roomId}/status`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            timeout: 5000
          }
        );
        
        // Reset error count and delay on success
        errorCount = 0;
        pollingDelay = 2000;
        setServerError(false);
        
        console.log('Room poll response:', {
          roomId: response.data.roomId,
          currentPlayers: response.data.currentPlayers,
          maxPlayers: response.data.maxPlayers,
          status: response.data.status
        });
        
        setWaitingRoomData(prev => {
          if (!prev || prev.roomId !== roomId) {
            return prev; // Don't update if room changed
          }
          return {
            ...prev,
            currentPlayers: response.data.currentPlayers || prev.currentPlayers,
            players: response.data.players || prev.players || [],
            status: response.data.status || prev.status
          };
        });
        
        // Stop polling if room is full
        if (response.data.currentPlayers >= response.data.maxPlayers) {
          console.log('🎉 Room is full! Stopping polling...');
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error polling room status (${errorCount}/${maxErrors}):`, error.message);
        
        // Handle specific error types
        if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
          setServerError(true);
        }
        
        // Stop polling after max errors
        if (errorCount >= maxErrors) {
          console.error('Max polling errors reached, stopping room polling');
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
          
          // Only show error if still in waiting room
          if (isInWaitingRoom) {
            dispatch(showToast({
              message: 'Lost connection to game room. Please refresh to rejoin.',
              type: 'error'
            }));
          }
        } else {
          // Exponential backoff
          pollingDelay = Math.min(pollingDelay * 1.5, 10000);
        }
      }
    };
    
    // Initial poll
    pollRoom();
    
    // Set up interval
    roomPollingInterval.current = setInterval(pollRoom, pollingDelay);
  }, [dispatch, isInWaitingRoom]);
  
  // Cleanup polling on unmount or when leaving waiting room
  useEffect(() => {
    return () => {
      if (roomPollingInterval.current) {
        clearInterval(roomPollingInterval.current);
        roomPollingInterval.current = null;
      }
    };
  }, []);
  
  // Stop polling when leaving waiting room
  useEffect(() => {
    if (!isInWaitingRoom && roomPollingInterval.current) {
      clearInterval(roomPollingInterval.current);
      roomPollingInterval.current = null;
    }
  }, [isInWaitingRoom]);
  
  // Join contest handler with server health check
  const handleJoinContest = useCallback(async (contestId) => {
    try {
      console.log('🎮 Attempting to join contest:', contestId);
      
      // Check server health first
      const serverHealthy = await checkServerHealth();
      if (!serverHealthy) {
        throw new Error('Server is not responding. Please try again later.');
      }
      
      const contest = contests.find(c => c.id === contestId || c._id === contestId);
      
      if (!contest) {
        throw new Error('Contest not found');
      }
      
      if (!user?.id) {
        throw new Error('You must be logged in to join contests');
      }
      
      if (contest.status !== 'open') {
        throw new Error('Contest is not open for entries');
      }
      
      if (contest.currentEntries >= contest.maxEntries) {
        throw new Error('Contest is full');
      }
      
      // For cash games, check if already entered
      if (contest.type === 'cash' && userEntries[contestId]) {
        throw new Error('You are already in this cash game');
      }
      
      // For MarketMaker, check entry limit
      if (contest.type === 'market') {
        const userMarketEntries = userEntriesArray.filter(entry => 
          (entry.contestId === contestId || entry.contest_id === contestId) && 
          entry.status !== 'cancelled'
        );
        
        if (userMarketEntries.length >= 150) {
          throw new Error('Maximum 150 entries per user for MarketMaker tournaments');
        }
        
        console.log(`MarketMaker: User has ${userMarketEntries.length}/150 entries`);
      }
      
      const actualContestId = contest.id || contest._id;
      
      setPendingJoins(prev => new Set(prev).add(actualContestId));
      
      try {
        const response = await axios.post(
          `/api/contests/enter/${actualContestId}`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            timeout: 10000
          }
        );
        
        console.log('📋 Contest entry response:', response.data);
        
        // Refresh data
        await Promise.allSettled([
          dispatch(fetchContests()),
          dispatch(fetchUserEntries())
        ]);
        
        dispatch(showToast({ 
          message: contest.type === 'market' ? 
            'Joined MarketMaker Tournament! FIRE SALE rules active.' : 
            'Successfully joined contest!', 
          type: 'success' 
        }));
        
        // Set up waiting room
        if (response.data.entryId && response.data.draftRoomId) {
          const roomId = response.data.draftRoomId;
          
          const roomData = response.data.roomStatus || {
            currentPlayers: 1,
            maxPlayers: 5,
            players: []
          };
          
          const waitingRoomInfo = {
            contestId: actualContestId,
            contestName: contest.name,
            contestType: contest.type,
            roomId,
            entryId: response.data.entryId,
            currentPlayers: roomData.currentPlayers,
            maxPlayers: roomData.maxPlayers || 5,
            players: roomData.players || []
          };
          
          console.log('🚪 Setting waiting room data:', waitingRoomInfo);
          setWaitingRoomData(waitingRoomInfo);
          setIsInWaitingRoom(true);
          
          // Join socket room
          if (socketService.isConnected()) {
            socketService.emit('join-room', {
              roomId: roomId,
              entryId: response.data.entryId
            });
            
            setTimeout(() => {
              socketService.emit('check-active-drafts');
            }, 500);
          }
          
          // Start polling
          startRoomPolling(roomId);
        }
        
      } catch (error) {
        console.error('❌ Join failed:', error);
        
        // Handle specific error cases
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to server. Please check your connection.');
        } else if (error.response?.status === 500) {
          throw new Error('Server error. Please try again later.');
        } else {
          throw new Error(error.response?.data?.error || error.message || 'Failed to join contest');
        }
      } finally {
        setPendingJoins(prev => {
          const newSet = new Set(prev);
          newSet.delete(actualContestId);
          return newSet;
        });
      }
      
    } catch (error) {
      console.error('❌ Error joining contest:', error);
      
      dispatch(showToast({ 
        message: error.message || 'Failed to join contest', 
        type: 'error' 
      }));
    }
  }, [dispatch, user, contests, userEntriesArray, userEntries, startRoomPolling, checkServerHealth]);
  
  // Leave contest handler
  const handleLeaveContest = useCallback(async (contestId) => {
    try {
      console.log('🚪 Attempting to leave contest:', contestId);
      
      if (!user?.id) {
        console.error('No user ID available');
        return;
      }
      
      // Check server health
      const serverHealthy = await checkServerHealth();
      if (!serverHealthy) {
        dispatch(showToast({ 
          message: 'Server is not responding. Please try again later.', 
          type: 'error' 
        }));
        return;
      }
      
      const contest = contests.find(c => c.id === contestId);
      
      // For MarketMaker, find the most recent pending entry
      if (contest?.type === 'market') {
        const userMarketEntries = userEntriesArray.filter(entry => 
          (entry.contestId === contestId || entry.contest_id === contestId) && 
          entry.status === 'pending'
        );
        
        if (userMarketEntries.length === 0) {
          console.log('No pending entries to withdraw');
          return;
        }
        
        // Withdraw the most recent pending entry
        const entryToWithdraw = userMarketEntries[userMarketEntries.length - 1];
        
        try {
          await axios.post(
            `/api/contests/withdraw/${entryToWithdraw.id}`,
            {},
            {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              timeout: 10000
            }
          );
          
          await Promise.allSettled([
            dispatch(fetchContests()),
            dispatch(fetchUserEntries())
          ]);
          
          dispatch(showToast({ 
            message: 'Left contest successfully', 
            type: 'success' 
          }));
          
        } catch (error) {
          console.error('Leave failed:', error);
          throw new Error(error.response?.data?.error || 'Failed to leave contest');
        }
      } else {
        // For non-MarketMaker contests
        const userEntry = userEntries[contestId];
        if (!userEntry) {
          console.log('No entry found for contest:', contestId);
          return;
        }
        
        if (contest && (contest.status === 'in_progress' || contest.status === 'completed')) {
          dispatch(showToast({ 
            message: 'Cannot leave a contest that has already started', 
            type: 'error' 
          }));
          return;
        }
        
        try {
          await axios.post(
            `/api/contests/withdraw/${userEntry.id}`,
            {},
            {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              timeout: 10000
            }
          );
          
          await Promise.allSettled([
            dispatch(fetchContests()),
            dispatch(fetchUserEntries())
          ]);
          
          dispatch(showToast({ 
            message: 'Left contest successfully', 
            type: 'success' 
          }));
          
        } catch (error) {
          console.error('Leave failed:', error);
          throw new Error(error.response?.data?.error || 'Failed to leave contest');
        }
      }
      
      // Clean up waiting room if leaving current contest
      if (isInWaitingRoom && waitingRoomData?.contestId === contestId) {
        if (roomPollingInterval.current) {
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
        }
        setIsInWaitingRoom(false);
        setWaitingRoomData(null);
      }
      
    } catch (error) {
      console.error('❌ Error leaving contest:', error);
      dispatch(showToast({ 
        message: error.message || 'Failed to leave contest', 
        type: 'error' 
      }));
    }
  }, [dispatch, user, contests, userEntriesArray, userEntries, isInWaitingRoom, waitingRoomData, checkServerHealth]);
  
  // Socket event handlers - fixed dependencies
  useEffect(() => {
    if (!socketService || !user?.id) {
      return;
    }
    
    // Skip if handlers already set up
    if (socketEventHandlersRef.current) {
      return;
    }
    
    if (!socketService.isConnected()) {
      return;
    }
    
    console.log('🔌 Setting up socket event handlers in LobbyScreen');
    socketEventHandlersRef.current = true;
    
    const cleanupFunctions = [];
    
    try {
      // Room status update handler with rate limiting
      let lastRoomUpdate = 0;
      const cleanupRoomStatus = socketService.on('room-status-update', (data) => {
        const now = Date.now();
        if (now - lastRoomUpdate < 500) {
          return; // Rate limit updates
        }
        lastRoomUpdate = now;
        
        console.log('📊 Room status update:', data);
        
        if (data.roomStatus && waitingRoomData && data.roomId === waitingRoomData.roomId) {
          setWaitingRoomData(prev => {
            if (!prev || prev.roomId !== data.roomId) {
              return prev;
            }
            return {
              ...prev,
              currentPlayers: data.roomStatus.currentPlayers,
              players: data.roomStatus.entries || data.roomStatus.players || [],
              status: data.roomStatus.status
            };
          });
        }
      });
      cleanupFunctions.push(cleanupRoomStatus);
      
      const cleanupRoomPlayerJoined = socketService.on('room-player-joined', (data) => {
        console.log('🆕 Room player joined event:', data);
        setWaitingRoomData(prev => {
          if (!prev || prev.roomId !== data.roomId) {
            return prev;
          }
          return {
            ...prev,
            players: data.players || [],
            currentPlayers: data.currentPlayers || prev.currentPlayers + 1
          };
        });
      });
      cleanupFunctions.push(cleanupRoomPlayerJoined);
      
      const cleanupRoomPlayerLeft = socketService.on('room-player-left', (data) => {
        console.log('👋 Room player left event:', data);
        if (waitingRoomData && data.roomId === waitingRoomData.roomId) {
          startRoomPolling(data.roomId);
        }
      });
      cleanupFunctions.push(cleanupRoomPlayerLeft);
      
      const cleanupDraftCountdown = socketService.on('draft-countdown', (data) => {
        console.log('⏰ DRAFT COUNTDOWN RECEIVED:', data);
        setWaitingRoomData(prev => {
          if (!prev || prev.roomId !== data.roomId) {
            return prev;
          }
          
          dispatch(showToast({ 
            message: data.message || `Draft starting in ${data.seconds} seconds!`, 
            type: 'info' 
          }));
          
          return {
            ...prev,
            draftStarting: true,
            countdown: data.seconds
          };
        });
      });
      cleanupFunctions.push(cleanupDraftCountdown);
      
      const cleanupDraftStarting = socketService.on('draft-starting', (data) => {
        console.log('🚀 DRAFT STARTING RECEIVED:', data);
        
        if (waitingRoomData && data.roomId === waitingRoomData.roomId) {
          console.log('✅ This is our draft! Navigating...');
          
          // Clean up polling
          if (roomPollingInterval.current) {
            clearInterval(roomPollingInterval.current);
            roomPollingInterval.current = null;
          }
          
          setIsInWaitingRoom(false);
          setWaitingRoomData(null);
          
          navigate(`/draft/${data.roomId}`, {
            state: {
              draftData: {
                roomId: data.roomId,
                contestId: data.contestId,
                contestType: data.contestType,
                playerBoard: data.playerBoard,
                participants: data.participants,
                entryId: waitingRoomData.entryId,
                userDraftPosition: data.participants?.findIndex(p => p.userId === user.id) ?? -1
              }
            }
          });
        }
      });
      cleanupFunctions.push(cleanupDraftStarting);
      
      const cleanupFireSaleUpdate = socketService.on('fire-sale-update', (data) => {
        console.log('🔥 FIRE SALE update:', data);
        dispatch(fetchContests());
      });
      cleanupFunctions.push(cleanupFireSaleUpdate);
      
    } catch (error) {
      console.error('Error setting up socket handlers:', error);
    }
    
    // Check for active drafts on connection
    if (socketService.isConnected()) {
      console.log('🔍 Checking for active drafts...');
      socketService.emit('check-active-drafts');
    }
    
    return () => {
      console.log('Cleaning up LobbyScreen socket listeners');
      cleanupFunctions.forEach(cleanup => {
        if (typeof cleanup === 'function') {
          try {
            cleanup();
          } catch (error) {
            console.error('Error cleaning up socket listener:', error);
          }
        }
      });
      socketEventHandlersRef.current = null;
    };
  }, [user?.id, dispatch, navigate]); // Fixed dependencies - removed waitingRoomData
  
  // Update waiting room navigation when data changes
  useEffect(() => {
    if (!waitingRoomData || !socketService.isConnected()) {
      return;
    }
    
    const handleDraftStarting = (data) => {
      if (data.roomId === waitingRoomData.roomId) {
        console.log('✅ Draft starting for current room');
        
        if (roomPollingInterval.current) {
          clearInterval(roomPollingInterval.current);
          roomPollingInterval.current = null;
        }
        
        setIsInWaitingRoom(false);
        setWaitingRoomData(null);
        
        navigate(`/draft/${data.roomId}`, {
          state: {
            draftData: {
              roomId: data.roomId,
              contestId: data.contestId,
              contestType: data.contestType,
              playerBoard: data.playerBoard,
              participants: data.participants,
              entryId: waitingRoomData.entryId,
              userDraftPosition: data.participants?.findIndex(p => p.userId === user.id) ?? -1
            }
          }
        });
      }
    };
    
    const cleanup = socketService.on('draft-starting', handleDraftStarting);
    
    return () => {
      if (cleanup) cleanup();
    };
  }, [waitingRoomData, navigate, user?.id]);
  
  // Filter and sort contests
  const filteredAndSortedContests = useMemo(() => {
    let filtered = [...contests];
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(contest => 
        contest.name?.toLowerCase().includes(searchLower) ||
        contest.description?.toLowerCase().includes(searchLower) ||
        contest.sport?.toLowerCase().includes(searchLower)
      );
    }
    
    if (selectedSport !== 'all') {
      filtered = filtered.filter(contest => contest.sport === selectedSport);
    }
    
    if (filterBy.status !== 'all') {
      filtered = filtered.filter(contest => contest.status === filterBy.status);
    }
    
    if (filterBy.type !== 'all') {
      filtered = filtered.filter(contest => contest.type === filterBy.type);
    }
    
    if (filterBy.entryFee !== 'all') {
      if (filterBy.entryFee === 'free') {
        filtered = filtered.filter(contest => contest.entryFee === 0);
      } else if (filterBy.entryFee === 'paid') {
        filtered = filtered.filter(contest => contest.entryFee > 0);
      }
    }
    
    if (activeTab === 'my-contests') {
      filtered = filtered.filter(contest => {
        const contestId = contest.id || contest._id;
        if (contest.type === 'market') {
          return userEntriesArray.some(entry => 
            (entry.contestId === contestId || entry.contest_id === contestId) &&
            entry.status !== 'cancelled'
          );
        }
        return userEntries[contestId];
      });
    } else if (activeTab === 'available') {
      filtered = filtered.filter(contest => {
        const contestId = contest.id || contest._id;
        if (contest.type === 'market') {
          const userMarketEntries = userEntriesArray.filter(entry => 
            (entry.contestId === contestId || entry.contest_id === contestId) &&
            entry.status !== 'cancelled'
          ).length;
          return userMarketEntries < 150 && 
            contest.status === 'open' &&
            contest.currentEntries < contest.maxEntries;
        }
        return !userEntries[contestId] && 
          contest.status === 'open' &&
          contest.currentEntries < contest.maxEntries;
      });
    }
    
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'createdAt':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case 'startTime':
          return new Date(a.startTime || 0) - new Date(b.startTime || 0);
        case 'entryFee':
          return (b.entryFee || 0) - (a.entryFee || 0);
        case 'prizePool':
          return (b.prizePool || 0) - (a.prizePool || 0);
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [contests, searchTerm, selectedSport, filterBy, activeTab, sortBy, userEntries, userEntriesArray]);
  
  // Calculate contest statistics
  const contestStats = useMemo(() => {
    const stats = {
      total: contests.length,
      open: 0,
      inProgress: 0,
      userContests: 0,
      totalPrizePool: 0
    };
    
    contests.forEach(contest => {
      const contestId = contest.id || contest._id;
      
      if (contest.type === 'market') {
        const hasEntries = userEntriesArray.some(entry => 
          (entry.contestId === contestId || entry.contest_id === contestId) &&
          entry.status !== 'cancelled'
        );
        if (hasEntries) stats.userContests++;
      } else if (userEntries[contestId]) {
        stats.userContests++;
      }
      
      if (contest.status === 'open') stats.open++;
      else if (contest.status === 'in_progress') stats.inProgress++;
      
      const prizeAmount = contest.type === 'market' ? 120000 : (contest.prizePool || contest.prize_pool || 0);
      stats.totalPrizePool += prizeAmount;
    });
    
    return stats;
  }, [contests, userEntries, userEntriesArray]);
  
  // Format time remaining
  const formatTimeRemaining = useCallback((startTime) => {
    if (!startTime) return 'No start time';
    
    const now = new Date();
    const start = new Date(startTime);
    const diff = start - now;
    
    if (diff < 0) return 'In Progress';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    
    return `${hours}h ${minutes}m`;
  }, []);
  
  // Get fill percentage for contest
  const getFillPercentage = useCallback((contest) => {
    const maxEntries = contest.type === 'market' ? 5000 : (contest.maxEntries || contest.max_entries || 1);
    const currentEntries = contest.currentEntries || contest.current_entries || 0;
    return (currentEntries / maxEntries) * 100;
  }, []);
  
  // Get number of draft rooms for contest
  const getDraftRoomCount = useCallback((contest) => {
    if (contest.type === 'market') {
      return 1000;
    }
    const maxEntries = contest.maxEntries || contest.max_entries || 0;
    return Math.ceil(maxEntries / 5);
  }, []);
  
  if (!user) {
    return (
      <div className="lobby-container">
        <div className="empty-state">
          <h2>Please log in to view the contest lobby</h2>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }
  
  if (isLoading && contests.length === 0 && !hasInitialized) {
    return (
      <div className="lobby-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h2>Loading Contest Lobby...</h2>
          <p>Please wait while we fetch the latest contests.</p>
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
      />
    );
  }
  
  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <h1>Contest Lobby</h1>
        <p>Join exciting fantasy sports contests and compete for prizes!</p>
        
        {user && (
          <div className="user-balance">
            {activeDraft ? (
              <button 
                onClick={() => navigate(`/draft/${activeDraft.roomId}`, {
                  state: { entryId: activeDraft.entryId, rejoin: true }
                })}
                className="rejoin-draft-btn active"
              >
                <span className="rejoin-icon">🔴</span>
                Rejoin Draft
              </button>
            ) : (
              <button 
                className="rejoin-draft-btn inactive"
                disabled
              >
                <span className="rejoin-icon">⚪</span>
                No Active Drafts
              </button>
            )}
          </div>
        )}
        
        {serverError && (
          <div style={{
            padding: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            marginBottom: '10px',
            color: '#f87171'
          }}>
            ⚠️ Server connection issues detected. Some features may be unavailable.
          </div>
        )}
        
        {/* Rules & Scoring Button - in empty space above stats */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          padding: '1rem 0',
          marginBottom: '0.5rem'
        }}>
          <button
            onClick={() => navigate('/rules')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
              boxShadow: '0 2px 10px rgba(102, 126, 234, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(102, 126, 234, 0.3)';
            }}
          >
            📋 Rules & Scoring
          </button>
        </div>
        
        <div className="header-stats" style={{ display: 'flex', gap: '20px', margin: '10px 0', fontSize: '14px', color: '#a0aec0' }}>
          <span>Total: {contestStats.total}</span>
          <span>Open: {contestStats.open}</span>
          <span>Live: {contestStats.inProgress}</span>
          <span>Your Contests: {contestStats.userContests}</span>
          <span>Total Prizes: ${contestStats.totalPrizePool.toLocaleString()}</span>
        </div>
        
        <div className="header-controls" style={{ display: 'flex', gap: '10px', margin: '10px 0', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Search contests..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', flex: 1, minWidth: '200px', background: 'rgba(255, 255, 255, 0.05)', color: 'white' }}
          />
          <select 
            value={sortBy} 
            onChange={(e) => setSortByLocal(e.target.value)}
            style={{ padding: '8px', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', color: 'white' }}
          >
            <option value="createdAt">Newest</option>
            <option value="startTime">Start Time</option>
            <option value="entryFee">Entry Fee</option>
            <option value="prizePool">Prize Pool</option>
          </select>
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className="btn btn-secondary"
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button 
            onClick={async () => {
              const isHealthy = await checkServerHealth();
              if (isHealthy) {
                dispatch(fetchContests());
                dispatch(fetchUserEntries());
              } else {
                dispatch(showToast({
                  message: 'Cannot refresh - server is not responding',
                  type: 'error'
                }));
              }
            }} 
            className="btn btn-secondary"
            disabled={serverError}
          >
            Refresh
          </button>
        </div>
        
        <div className="header-tabs" style={{ display: 'flex', gap: '10px', margin: '15px 0', borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
          {['all', 'my-contests', 'available'].map(tab => (
            <button 
              key={tab}
              className={activeTab === tab ? 'active' : ''} 
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                position: 'relative',
                color: activeTab === tab ? '#667eea' : '#a0aec0',
                fontWeight: activeTab === tab ? 'bold' : 'normal'
              }}
            >
              {tab === 'my-contests' ? `My Contests (${contestStats.userContests})` : 
               tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
        
        {showFilters && (
          <div className="header-filters" style={{
            display: 'flex',
            gap: '15px',
            padding: '15px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            margin: '10px 0',
            flexWrap: 'wrap'
          }}>
            <div className="filter-group">
              <label style={{ color: '#a0aec0' }}>Sport:</label>
              <select 
                value={selectedSport} 
                onChange={(e) => setSelectedSport(e.target.value)}
                style={{ marginLeft: '8px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)' }}
              >
                <option value="all">All Sports</option>
                <option value="NFL">NFL</option>
                <option value="NBA">NBA</option>
                <option value="MLB">MLB</option>
                <option value="NHL">NHL</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label style={{ color: '#a0aec0' }}>Status:</label>
              <select 
                value={filterBy.status} 
                onChange={(e) => setFilterBy({...filterBy, status: e.target.value})}
                style={{ marginLeft: '8px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)' }}
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label style={{ color: '#a0aec0' }}>Type:</label>
              <select 
                value={filterBy.type} 
                onChange={(e) => setFilterBy({...filterBy, type: e.target.value})}
                style={{ marginLeft: '8px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)' }}
              >
                <option value="all">All Types</option>
                <option value="cash">Cash</option>
                <option value="market">MarketMaker</option>
                <option value="firesale">Fire Sale</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label style={{ color: '#a0aec0' }}>Entry Fee:</label>
              <select 
                value={filterBy.entryFee} 
                onChange={(e) => setFilterBy({...filterBy, entryFee: e.target.value})}
                style={{ marginLeft: '8px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)' }}
              >
                <option value="all">All Fees</option>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
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
              const hasStarted = contest.status === 'in_progress' || contest.status === 'completed';
              const fillPercentage = getFillPercentage(contest);
              const draftRoomCount = getDraftRoomCount(contest);
              const contestType = contest.type || 'standard';
              
              // Count user's entries for MarketMaker
              const userMarketEntries = contest.type === 'market' ? 
                userEntriesArray.filter(entry => 
                  (entry.contestId === contestId || entry.contest_id === contestId) && 
                  entry.status !== 'cancelled'
                ).length : 0;
              
              // Determine if user can join
              const canJoin = (() => {
                if (isFull || hasStarted || contest.status !== 'open' || serverError) {
                  return false;
                }
                
                if (contest.type === 'market') {
                  return userMarketEntries < 150;
                } else if (contest.type === 'cash') {
                  return !userEntry;
                } else {
                  return !userEntry;
                }
              })();
              
              return (
                <div 
                  key={contestId} 
                  className={`contest-card ${contestType} ${userEntry ? 'user-entered' : ''} ${isFull ? 'contest-full' : ''}`}
                >
                  {/* Cash game label */}
                  {contestType === 'cash' && (
                    <div style={{
                      fontSize: '32px',
                      fontWeight: '800',
                      color: '#60a5fa',
                      textAlign: 'center',
                      padding: '20px 10px',
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
                      borderRadius: '12px',
                      marginBottom: '20px',
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                      textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      💵 CASH
                    </div>
                  )}
                  
                  {/* MarketMaker label */}
                  {contestType === 'market' && (
                    <div style={{
                      fontSize: '28px',
                      fontWeight: '800',
                      color: '#34d399',
                      textAlign: 'center',
                      padding: '20px 10px',
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)',
                      borderRadius: '12px',
                      marginBottom: '20px',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      📈 MARKETMAKER
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#a0aec0',
                        letterSpacing: '1px'
                      }}>
                        FIRE SALE TOURNAMENT
                      </div>
                    </div>
                  )}
                  
                  <div className="contest-header">
                    <h3>{contest.name}</h3>
                    {(userEntry || userMarketEntries > 0) && (
                      <span className="contest-type" style={{
                        background: '#48bb78',
                        color: 'white'
                      }}>
                        Entered
                      </span>
                    )}
                    {!userEntry && userMarketEntries === 0 && (
                      <span className={`contest-type ${contestType}`}>
                        {contestType === 'market' ? 'MARKET' : contestType.toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="contest-details">
                    {contest.description && (
                      <p style={{ color: '#a0aec0', fontSize: '14px', margin: '10px 0' }}>
                        {contest.description}
                      </p>
                    )}
                    
                    {/* FIRE SALE status - Shows all player names */}
                    {contestType === 'market' && contest.fireSaleList && contest.fireSaleList.length > 0 && (
                      <div style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '8px',
                        padding: '10px',
                        marginBottom: '10px'
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '5px' }}>
                          🔥 FIRE SALE ACTIVE
                        </div>
                        <div style={{ fontSize: '11px', color: '#a0aec0' }}>
                          {contest.fireSaleList.map(p => p.name).join(', ')}
                        </div>
                      </div>
                    )}
                    
                    {/* User's entry count for MarketMaker */}
                    {contestType === 'market' && userMarketEntries > 0 && (
                      <div style={{
                        background: 'rgba(72, 187, 120, 0.1)',
                        border: '1px solid rgba(72, 187, 120, 0.3)',
                        borderRadius: '8px',
                        padding: '8px',
                        marginBottom: '10px',
                        fontSize: '12px',
                        color: '#48bb78'
                      }}>
                        Your Entries: {userMarketEntries} / 150 max
                      </div>
                    )}
                    
                    <div className="detail-row">
                      <span>Type:</span>
                      <span className="detail-value">
                        {contestType === 'cash' ? 'Cash' : 
                         contestType === 'market' ? 'Tournament' :
                         contestType === 'firesale' ? 'Fire Sale' :
                         contestType.charAt(0).toUpperCase() + contestType.slice(1)}
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span>Sport:</span>
                      <span className="detail-value">Football</span>
                    </div>
                    
                    <div className="detail-row">
                      <span>Entry Fee:</span>
                      <span className="detail-value">
                        {contestType === 'cash' ? '$5' : 
                         contestType === 'market' ? '$25' :
                         contest.entryFee === 0 ? 'FREE' : `$${contest.entryFee || contest.entry_fee || 0}`}
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span>Prize Pool:</span>
                      <span className="detail-value" style={{ 
                        color: contestType === 'market' ? '#fbbf24' : '#48bb78', 
                        fontSize: contestType === 'market' ? '20px' : '18px',
                        fontWeight: 'bold' 
                      }}>
                        ${contestType === 'cash' ? '24' : 
                          contestType === 'market' ? '120,000' :
                          (contest.prizePool || contest.prize_pool || 0).toLocaleString()}
                      </span>
                    </div>
                    
                    {contest.startTime && (
                      <div className="detail-row">
                        <span>Starts:</span>
                        <span className="detail-value">
                          {formatTimeRemaining(contest.startTime)}
                        </span>
                      </div>
                    )}
                    
                    <div className="detail-row">
                      <span>Draft Rooms:</span>
                      <span className="detail-value">
                        {contestType === 'market' ? '1,000' : draftRoomCount}
                      </span>
                    </div>
                    
                    <div style={{ marginTop: '15px' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        fontSize: '13px',
                        color: '#a0aec0'
                      }}>
                        <span>
                          {currentEntries} / {contestType === 'market' ? '5,000' : maxEntries} entries
                        </span>
                        <span>{fillPercentage.toFixed(0)}% full</span>
                      </div>
                      <div className={`fill-bar ${isFull ? 'full' : ''}`}>
                        <div 
                          className="fill-progress"
                          style={{ 
                            width: `${fillPercentage}%`,
                            background: contestType === 'market' ? 
                              'linear-gradient(90deg, #10b981 0%, #34d399 100%)' :
                              'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Contest actions */}
                  <div className="contest-actions">
                    {contestType === 'market' ? (
                      <>
                        {userMarketEntries > 0 && (
                          <div style={{
                            marginBottom: '8px',
                            fontSize: '12px',
                            color: '#48bb78',
                            textAlign: 'center'
                          }}>
                            You have {userMarketEntries} {userMarketEntries === 1 ? 'entry' : 'entries'}
                          </div>
                        )}
                        <button 
                          className="btn btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinContest(contestId);
                          }}
                          disabled={!canJoin || isJoining || userMarketEntries >= 150}
                          style={{
                            background: userMarketEntries >= 150 ? 
                              'rgba(107, 114, 128, 0.5)' : '',
                            cursor: userMarketEntries >= 150 ? 
                              'not-allowed' : 'pointer'
                          }}
                        >
                          {isJoining ? 'Joining...' : 
                           serverError ? 'Server Offline' :
                           isFull ? 'Contest Full' : 
                           contest.status !== 'open' ? 'Not Open' : 
                           userMarketEntries >= 150 ? 'Max Entries Reached' :
                           userMarketEntries > 0 ? 'Enter Again' : 'Join Contest'}
                        </button>
                        {userMarketEntries > 0 && userMarketEntries < 150 && (
                          <button 
                            className="btn btn-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLeaveContest(contestId);
                            }}
                            disabled={serverError}
                            style={{
                              marginTop: '8px',
                              fontSize: '12px'
                            }}
                          >
                            Withdraw Last Entry
                          </button>
                        )}
                        {canJoin && userMarketEntries < 150 && (
                          <div style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            color: '#a0aec0',
                            textAlign: 'center'
                          }}>
                            Multi-Entry: Up to 150 entries allowed
                          </div>
                        )}
                      </>
                    ) : (
                      userEntry ? (
                        <button 
                          className="btn btn-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLeaveContest(contestId);
                          }}
                          disabled={serverError}
                        >
                          {serverError ? 'Server Offline' : 'Leave Contest'}
                        </button>
                      ) : (
                        <button 
                          className="btn btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinContest(contestId);
                          }}
                          disabled={!canJoin || isJoining}
                        >
                          {isJoining ? 'Joining...' : 
                           serverError ? 'Server Offline' :
                           isFull ? 'Contest Full' : 
                           contest.status !== 'open' ? 'Not Open' : 
                           'Join Contest'}
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
            <button 
              className="btn btn-primary"
              onClick={() => {
                setActiveTab('all');
                setSearchTerm('');
                setFilterBy({ status: 'all', type: 'all', entryFee: 'all' });
                dispatch(fetchContests());
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyScreen;