// frontend/src/hooks/useDraft.js
import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';

export const useDraft = (contestData) => {
  const [draftState, setDraftState] = useState({
    status: 'waiting',
    currentTurn: 0,
    draftOrder: [],
    users: [],
    picks: [],
    myPosition: -1,
    timeLeft: 30,
    countdownTime: 0,
    connectedPlayers: 0,
    totalPlayers: 5
  });
  
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const isPickingRef = useRef(false);

  useEffect(() => {
    if (!contestData?.contestId) return;
    
    initializeDraft();
    
    return () => {
      cleanup();
    };
  }, [contestData?.contestId]);

  const initializeDraft = useCallback(() => {
    try {
      console.log('Initializing draft with data:', contestData);
      const token = localStorage.getItem('token');
      socketService.connect(token);
      socketService.joinDraft(contestData.contestId, contestData.entryId);
      
      setupEventListeners();
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [contestData]);

  const setupEventListeners = () => {
    // Initial draft state
    socketService.onDraftState((state) => {
      console.log('Received draft state:', state);
      updateDraftState(state);
    });
    
    // Draft state updates
    socketService.socket.on('draft-state-update', (state) => {
      console.log('Received draft state update:', state);
      updateDraftState(state);
    });
    
    // Draft position update
    socketService.socket.on('draft-position-update', (data) => {
      console.log('Received draft position update:', data);
      setDraftState(prev => ({
        ...prev,
        myPosition: data.draftPosition
      }));
    });
    
    // Countdown events
    socketService.socket.on('countdown-started', (data) => {
      console.log('Countdown started!', data);
      setDraftState(prev => ({
        ...prev,
        status: 'countdown',
        countdownTime: data.countdownTime,
        draftOrder: data.draftOrder || prev.draftOrder,
        users: data.users || prev.users
      }));
      
      if (data.users) {
        initializeTeamsFromUsers(data.users);
      }
    });
    
    socketService.socket.on('countdown-update', (data) => {
      setDraftState(prev => ({
        ...prev,
        countdownTime: data.countdownTime
      }));
    });
    
    socketService.socket.on('countdown-cancelled', (data) => {
      console.log('Countdown cancelled:', data);
      setDraftState(prev => ({
        ...prev,
        status: 'waiting',
        countdownTime: 0
      }));
      alert(data.message);
    });
    
    // User events
    socketService.onUserJoined((data) => {
      console.log('User joined:', data);
      setDraftState(prev => ({
        ...prev,
        connectedPlayers: data.connectedPlayers || prev.connectedPlayers
      }));
    });
    
    socketService.onUserDisconnected((data) => {
      console.log('User disconnected:', data);
      setDraftState(prev => ({
        ...prev,
        connectedPlayers: data.connectedPlayers || prev.connectedPlayers
      }));
    });
    
    // Draft events
    socketService.onDraftStarted((data) => {
      console.log('Draft started!', data);
      setDraftState(prev => ({
        ...prev,
        status: 'active',
        currentTurn: 0,
        timeLeft: 30,
        draftOrder: data.draftOrder || prev.draftOrder
      }));
      startPickTimer();
    });
    
    socketService.onPickMade((data) => {
      console.log('Pick made:', data);
      handlePickMade(data);
      isPickingRef.current = false;
    });
    
    socketService.socket.on('turn-skipped', (data) => {
      console.log('Turn skipped:', data);
      handleTurnSkipped(data);
      isPickingRef.current = false;
    });
    
    socketService.onDraftComplete((data) => {
      console.log('Draft complete!', data);
      setDraftState(prev => ({ 
        ...prev, 
        status: 'completed',
        results: data.results 
      }));
      cleanup();
    });
    
    socketService.onError((error) => {
      console.error('Socket error:', error);
      setError(error.message);
      isPickingRef.current = false;
    });
  };

  const updateDraftState = (state) => {
    setDraftState(prev => ({
      ...prev,
      ...state,
      myPosition: state.userDraftPosition !== undefined ? state.userDraftPosition : prev.myPosition
    }));
    
    if (state.users && state.status !== 'waiting') {
      initializeTeamsFromUsers(state.users);
    }
  };

  const initializeTeamsFromUsers = (users) => {
    const teamColors = ['green', 'red', 'blue', 'yellow', 'purple'];
    
    // Sort users by draft position
    const sortedUsers = [...users]
      .filter(u => u.position !== undefined && u.position !== -1)
      .sort((a, b) => a.position - b.position);
    
    const newTeams = sortedUsers.map((user) => ({
      name: user.username,
      username: user.username,
      color: user.teamColor || teamColors[user.position],
      teamColor: user.teamColor || teamColors[user.position],
      userId: user.userId,
      draftPosition: user.position,
      position: user.position,
      isHuman: true,
      roster: user.roster || {},
      budget: user.budget ?? 15,
      bonus: user.bonus || 0,
      connected: user.connected
    }));
    
    setTeams(newTeams);
    
    // Update my position if found
    const myUser = users.find(u => u.userId === contestData?.userId);
    if (myUser && myUser.position !== undefined && myUser.position !== -1) {
      setDraftState(prev => ({
        ...prev,
        myPosition: myUser.position
      }));
    }
  };

  const handlePickMade = (data) => {
    const { pick, currentTurn } = data;
    
    // Update draft state
    setDraftState(prev => ({
      ...prev,
      picks: [...prev.picks, pick],
      currentTurn: currentTurn,
      timeLeft: 30
    }));
    
    // Update team that made the pick
    if (pick.type !== 'skip') {
      setTeams(prevTeams => {
        const newTeams = [...prevTeams];
        const teamIndex = newTeams.findIndex(t => t.userId === pick.userId);
        
        if (teamIndex !== -1 && pick.player && pick.rosterSlot) {
          const team = newTeams[teamIndex];
          if (!team.roster) team.roster = {};
          team.roster[pick.rosterSlot] = pick.player;
          team.budget -= pick.player.price;
          
          // Handle kingpin bonus if applicable
          if (contestData?.type === 'kingpin' && pick.bonus) {
            team.bonus += pick.bonus;
          }
        }
        
        return newTeams;
      });
    }
    
    resetPickTimer();
  };

  const handleTurnSkipped = (data) => {
    setDraftState(prev => ({
      ...prev,
      currentTurn: data.currentTurn,
      timeLeft: 30
    }));
    resetPickTimer();
  };

  const startPickTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setDraftState(prev => {
        if (prev.timeLeft <= 1) {
          if (isMyTurn()) {
            // Will trigger auto-pick in parent component
          }
          return { ...prev, timeLeft: 30 };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
  };

  const resetPickTimer = () => {
    setDraftState(prev => ({ ...prev, timeLeft: 30 }));
  };

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (socketService.socket) {
      socketService.disconnect();
    }
  };

  const isMyTurn = useCallback(() => {
    const { status, draftOrder, currentTurn, myPosition } = draftState;
    if (status !== 'active' || myPosition === -1) return false;
    if (!draftOrder || draftOrder.length === 0) return false;
    return draftOrder[currentTurn] === myPosition;
  }, [draftState]);

  const makePick = useCallback((row, col, player, rosterSlot) => {
    if (isPickingRef.current) {
      console.log('Already processing a pick');
      return;
    }
    
    if (!isMyTurn()) {
      setError('Not your turn!');
      return;
    }
    
    isPickingRef.current = true;
    console.log(`Making pick: ${player.name} to ${rosterSlot} slot`);
    socketService.makePick(row, col, player, rosterSlot);
  }, [isMyTurn]);

  const skipTurn = useCallback(() => {
    if (isPickingRef.current) {
      console.log('Already processing');
      return;
    }
    
    isPickingRef.current = true;
    console.log('Skipping turn');
    socketService.skipTurn();
  }, []);

  return {
    draftState,
    teams,
    error,
    loading,
    isMyTurn,
    makePick,
    skipTurn
  };
};