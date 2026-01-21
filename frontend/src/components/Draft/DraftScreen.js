// frontend/src/components/Draft/DraftScreen.js
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { store } from '../../store/store';
import axios from 'axios';
import LiveDraftFeed from './LiveDraftFeed';
import {
  initializeDraft,
  joinDraftRoom,
  leaveDraftRoom,
  makePick,
  skipTurn,
  setSelectedPlayer,
  setAutoPickEnabled,
  setShowAutoPickSuggestion,
  setCurrentViewTeam,
  resetDraft,
  updateDraftState,
  updateTeamRoster,
  updatePlayerBoardCell,
  updateTimer,
  clearSelectedPlayer,
  updatePlayerBoard,
  selectDraft,
  selectCurrentTeam,
  selectMyTeam,
  selectAutoPick,
  clearDraftError
} from '../../store/slices/draftSlice';
import { selectAuthUser } from '../../store/slices/authSlice';
import socketService from '../../services/socket';
import './DraftScreen.css';

// Module-level tracking to survive React remounts
let moduleInitializedRoomId = null;
let moduleLastInitTime = 0;

const DraftScreen = ({ showToast }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const mountedRef = useRef(true);
  const autoPickTimeoutRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const initializationAttemptedRef = useRef(false);
  const socketHandlersRef = useRef(false);
  
  // Add state to prevent double picks
  const [isPicking, setIsPicking] = useState(false);
  const pickTimeoutRef = useRef(null);

  // Create a fallback toast function
  const toast = useCallback((message, type) => {
    if (showToast) {
      showToast(message, type);
    } else {
      console.log(`[${type?.toUpperCase() || 'INFO'}] ${message}`);
      if (type === 'error') {
        alert(message);
      }
    }
  }, [showToast]);

  // Redux selectors
  const user = useSelector(selectAuthUser);
  const draftState = useSelector(state => state.draft);
  const {
    status,
    playerBoard,
    currentTurn,
    currentPick,
    draftOrder,
    picks,
    timeRemaining,
    timerInitialized,  // FIX: Add timerInitialized from Redux
    currentDrafter,
    currentDrafterPosition,
    userDraftPosition,
    users,
    connectedPlayers,
    entryCount,
    countdownTime,
    contestData,
    entryId,
    contestType,
    myRoster,
    budget,
    bonus,
    teams,
    selectedPlayer,
    isMyTurn,
    showResults,
    currentViewTeam,
    autoPickEnabled,
    showAutoPickSuggestion,
    autoPickSuggestion,
    error
  } = draftState;

  const socketConnected = useSelector(state => state.socket.connected);

  // Standardized user ID getter
  const getUserId = useCallback((userObj) => {
    if (!userObj) return null;
    return userObj.id || userObj._id || userObj.userId || userObj.user_id;
  }, []);

  // Standardized current user ID
  const currentUserId = getUserId(user);

  // Calculate isMyTurn with standardized logic
  const calculatedIsMyTurn = currentDrafter && currentUserId && 
    getUserId(currentDrafter) === currentUserId;
  const actualIsMyTurn = isMyTurn || calculatedIsMyTurn;
  
  // Find my team with standardized logic
  const myTeam = Array.isArray(teams) ? teams.find(team => {
    return getUserId(team) === currentUserId;
  }) : null;

  // FIXED: Standardize slot names to uppercase
  const standardizeSlotName = useCallback((slot) => {
    return (slot || '').toString().toUpperCase();
  }, []);

  // Helper to calculate total spent from roster
  const calculateTotalSpent = useCallback((roster) => {
    if (!roster) return 0;
    return Object.values(roster).reduce((total, player) => {
      if (player && player.price !== undefined) {
        return total + player.price;
      }
      return total;
    }, 0);
  }, []);

  // Emergency budget validation function
  const validateAndFixBudget = useCallback((team) => {
    if (!team || !team.roster) return team;
    
    const totalSpent = Object.values(team.roster).reduce((sum, player) => {
      return sum + (player?.price || 0);
    }, 0);
    
    const calculatedBudget = Math.max(0, 15 - totalSpent);
    const currentBudget = team.budget !== undefined ? team.budget : 15;
    
    // If budget is way off from what it should be, fix it
    if (totalSpent > 0 && currentBudget === 15) {
      console.warn('🚨 EMERGENCY BUDGET FIX:', {
        team: team.name,
        totalSpent,
        wrongBudget: currentBudget,
        correctedBudget: calculatedBudget
      });
      return {
        ...team,
        budget: calculatedBudget
      };
    }
    
    return team;
  }, []);

  // Prevent infinite re-renders by throttling debug logs
  const debugLogThrottle = useRef(0);
  const lastStateHash = useRef('');

  // Create a simple hash of critical state to detect actual changes
  const createStateHash = useCallback(() => {
    if (!teams || !teams[0]) return 'empty';
    const firstTeam = teams[0];
    const rosterKeys = Object.keys(firstTeam.roster || {}).sort();
    const budget = firstTeam.budget;
    return `${rosterKeys.join(',')}-${budget}-${currentTurn}-${status}`;
  }, [teams, currentTurn, status]);

  // Only log debug info when state actually changes
  useEffect(() => {
    const currentHash = createStateHash();
    const now = Date.now();
    
    if (currentHash !== lastStateHash.current && now - debugLogThrottle.current > 1000) {
      debugLogThrottle.current = now;
      lastStateHash.current = currentHash;
      
      console.log('🐛 Draft State Debug:', {
        socketConnected,
        status,
        isMyTurn: actualIsMyTurn,
        isPicking,
        myTeam: myTeam ? {
          name: myTeam.name,
          rosterKeys: Object.keys(myTeam.roster || {}),
          rosterPlayers: Object.values(myTeam.roster || {}).map(p => p?.name).filter(Boolean),
          budget: myTeam.budget,
          hash: currentHash
        } : null,
        currentUserId,
        entryId
      });
    }
  }, [createStateHash, socketConnected, status, actualIsMyTurn, myTeam, currentUserId, isPicking, entryId]);

  // Add state comparison to prevent unnecessary socket calls
  const lastSocketRequestTime = useRef(0);
  const requestDraftState = useCallback(() => {
    const now = Date.now();
    if (now - lastSocketRequestTime.current > 500) { // Throttle to max 2 requests per second
      lastSocketRequestTime.current = now;
      socketService.emit('get-draft-state', { roomId });
    }
  }, [roomId]);

  // SNAKE DRAFT: Calculate which team should draft at a given pick number (1-based)
  const getTeamForPick = useCallback((pickNumber, totalTeams = 5) => {
    if (pickNumber < 1) return 0;
    
    const round = Math.ceil(pickNumber / totalTeams);
    const positionInRound = ((pickNumber - 1) % totalTeams) + 1;
    
    let teamIndex;
    if (round % 2 === 1) {
      // Odd rounds: forward order (1, 2, 3, 4, 5)
      teamIndex = positionInRound - 1;
    } else {
      // Even rounds: reverse order (5, 4, 3, 2, 1)
      teamIndex = totalTeams - positionInRound;
    }
    
    console.log(`🎯 Pick ${pickNumber}: Round ${round}, Position ${positionInRound}, Team ${teamIndex + 1}`);
    return teamIndex;
  }, []);

  // SNAKE DRAFT: Calculate all pick numbers for a given team (0-based team index)
  const getPicksForTeam = useCallback((teamIndex, totalTeams = 5, totalRounds = 5) => {
    const picks = [];
    
    for (let round = 1; round <= totalRounds; round++) {
      let pickInRound;
      if (round % 2 === 1) {
        // Odd rounds: forward order
        pickInRound = teamIndex + 1;
      } else {
        // Even rounds: reverse order
        pickInRound = totalTeams - teamIndex;
      }
      
      const pickNumber = (round - 1) * totalTeams + pickInRound;
      picks.push(pickNumber);
    }
    
    console.log(`📋 Team ${teamIndex + 1} picks:`, picks);
    return picks;
  }, []);

  // SNAKE DRAFT: Validate if current turn matches expected snake draft order
  const validateDraftOrder = useCallback((currentTurn, teams) => {
    if (!teams || teams.length === 0) return true;
    
    const pickNumber = currentTurn + 1; // Convert 0-based to 1-based
    const expectedTeamIndex = getTeamForPick(pickNumber, teams.length);
    const actualDraftingTeam = teams.find(team => 
      getUserId(team) === getUserId(currentDrafter)
    );
    
    if (!actualDraftingTeam) return false;
    
    const actualTeamIndex = teams.indexOf(actualDraftingTeam);
    const isCorrectOrder = expectedTeamIndex === actualTeamIndex;
    
    console.log(`🔍 Draft Order Check:`, {
      pickNumber,
      expectedTeamIndex: expectedTeamIndex + 1,
      actualTeamIndex: actualTeamIndex + 1,
      isCorrect: isCorrectOrder
    });
    
    return isCorrectOrder;
  }, [getTeamForPick, getUserId, currentDrafter]);

  // AUTO-PICK: Find the cheapest eligible player for auto-pick, prioritizing TE
  const findAutoPick = useCallback((team, playerBoard) => {
    console.log(`🤖 Finding auto-pick for team:`, team.name);
    
    if (!playerBoard || !Array.isArray(playerBoard)) {
      console.log(`❌ No player board available for auto-pick`);
      return null;
    }
    
    const roster = team.roster || {};
    const totalBudget = Math.max(0, team.budget || 0) + (team.bonus || 0);
    
    console.log(`💰 Auto-pick budget: $${totalBudget}`);
    
    // Get available slots for the team
    const availableSlots = ['QB', 'RB', 'WR', 'TE', 'FLEX'].filter(slot => 
      !getPlayerFromRoster(roster, slot)
    );
    
    console.log(`📋 Available slots:`, availableSlots);
    
    if (availableSlots.length === 0) {
      console.log(`❌ No available slots for auto-pick`);
      return null;
    }
    
    // Priority order: TE first, then others
    const slotPriority = ['TE', 'QB', 'RB', 'WR', 'FLEX'];
    const prioritizedSlots = slotPriority.filter(slot => availableSlots.includes(slot));
    
    console.log(`🎯 Prioritized slots:`, prioritizedSlots);
    
    let bestPick = null;
    let lowestPrice = Infinity;
    
    // Scan player board for eligible players
    for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        
        // Skip if player is invalid or already drafted
        if (!player || !player.name || player.drafted || !player.position) {
          continue;
        }
        
        // Skip if player is too expensive
        if (player.price > totalBudget) {
          continue;
        }
        
        const playerPosition = standardizeSlotName(player.position);
        
        // Check if player can fill any of our prioritized slots
        const canFillSlot = prioritizedSlots.some(slot => {
          if (slot === playerPosition) return true;
          if (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPosition)) return true;
          return false;
        });
        
        if (!canFillSlot) {
          continue;
        }
        
        // Find the highest priority slot this player can fill
        const targetSlot = prioritizedSlots.find(slot => {
          if (slot === playerPosition) return true;
          if (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPosition)) return true;
          return false;
        });
        
        // Prioritize TE, then by lowest price
        const isTE = playerPosition === 'TE';
        const isBetterPick = !bestPick || 
          (isTE && standardizeSlotName(bestPick.player.position) !== 'TE') ||
          (isTE === (standardizeSlotName(bestPick.player.position) === 'TE') && player.price < lowestPrice);
        
        if (isBetterPick) {
          bestPick = {
            row,
            col,
            player,
            targetSlot,
            price: player.price
          };
          lowestPrice = player.price;
          
          console.log(`🎯 New best auto-pick: ${player.name} (${playerPosition}) for ${targetSlot} - $${player.price}`);
        }
      }
    }
    
    if (bestPick) {
      console.log(`✅ Auto-pick selected: ${bestPick.player.name} (${bestPick.player.position}) -> ${bestPick.targetSlot} for $${bestPick.price}`);
    } else {
      console.log(`❌ No eligible auto-pick found`);
    }
    
    return bestPick;
  }, [standardizeSlotName]);

  // SNAKE DRAFT: Get expected next drafter
  const getExpectedNextDrafter = useCallback((currentTurn, teams) => {
    if (!teams || teams.length === 0) return null;
    
    const nextPickNumber = currentTurn + 1;
    const nextTeamIndex = getTeamForPick(nextPickNumber, teams.length);
    
    return teams[nextTeamIndex] || null;
  }, [getTeamForPick]);

  // FIXED: Enhanced roster lookup - FLEX ONLY SHOWS DEDICATED FLEX PICKS
  const getPlayerFromRoster = useCallback((roster, slot) => {
    console.log(`🔍 getPlayerFromRoster called:`, {
      slot,
      rosterExists: !!roster,
      rosterType: typeof roster,
      rosterKeys: roster ? Object.keys(roster) : 'no roster',
      standardSlot: standardizeSlotName(slot)
    });
    
    if (!roster || !slot) {
      console.log(`❌ Missing roster or slot:`, { roster: !!roster, slot });
      return null;
    }
    
    const standardSlot = standardizeSlotName(slot);
    
    // Strategy 1: Direct uppercase lookup (primary method)
    if (roster[standardSlot] && roster[standardSlot].name) {
      console.log(`✅ Found via uppercase: ${standardSlot} = ${roster[standardSlot].name}`);
      return roster[standardSlot];
    }
    
    // Strategy 2: Direct original case lookup
    if (roster[slot] && roster[slot].name) {
      console.log(`✅ Found via original case: ${slot} = ${roster[slot].name}`);
      return roster[slot];
    }
    
    // Strategy 3: Lowercase lookup
    const lowerSlot = slot.toLowerCase();
    if (roster[lowerSlot] && roster[lowerSlot].name) {
      console.log(`✅ Found via lowercase: ${lowerSlot} = ${roster[lowerSlot].name}`);
      return roster[lowerSlot];
    }
    
    // FIXED Strategy 4: Position-based search - SKIP FOR FLEX
    // Only check position match for non-FLEX slots
    if (standardSlot !== 'FLEX') {
      const entries = Object.entries(roster);
      for (const [key, player] of entries) {
        if (player && player.position && 
            standardizeSlotName(player.position) === standardSlot) {
          console.log(`✅ Found via position match: ${key} (${player.position}) = ${player.name}`);
          return player;
        }
      }
    }
    
    // FIXED Strategy 5: FLEX-specific logic - Only show dedicated FLEX picks
    if (standardSlot === 'FLEX') {
      console.log(`🔧 Looking for dedicated FLEX player`);
      
      // ONLY look for dedicated FLEX entries - don't auto-fill from other positions
      if (roster['FLEX'] && roster['FLEX'].name) {
        console.log(`✅ Found dedicated FLEX: ${roster['FLEX'].name}`);
        return roster['FLEX'];
      }
      
      if (roster['flex'] && roster['flex'].name) {
        console.log(`✅ Found dedicated flex: ${roster['flex'].name}`);
        return roster['flex'];
      }
      
      if (roster['Flex'] && roster['Flex'].name) {
        console.log(`✅ Found dedicated Flex: ${roster['Flex'].name}`);
        return roster['Flex'];
      }
      
      console.log(`❌ No dedicated FLEX player found (requires separate pick)`);
      return null;
    }
    
    console.log(`❌ No player found for slot: ${slot} (checked: ${standardSlot}, ${slot}, ${lowerSlot}, position-based)`);
    return null;
  }, [standardizeSlotName]);

  // CRITICAL FIX: Enhanced roster processing that preserves slot assignments
  const processRosterData = useCallback((roster) => {
    if (!roster) {
      console.log('🔧 processRosterData: no roster provided');
      return {};
    }
    
    console.log('🔧 processRosterData input:', {
      type: typeof roster,
      isArray: Array.isArray(roster),
      keys: typeof roster === 'object' && !Array.isArray(roster) ? Object.keys(roster) : 'not object'
    });
    
    const standardizedRoster = {};
    
    // Handle array format
    if (Array.isArray(roster)) {
      console.log('🔧 Processing array roster with', roster.length, 'items');
      roster.forEach((item, index) => {
        if (item && typeof item === 'object' && item.name) {
          // For arrays, we need the slot info
          const slot = standardizeSlotName(item.slot || item.roster_slot || item.position);
          standardizedRoster[slot] = {
            name: item.name,
            position: item.position || item.originalPosition || slot,
            team: item.team || '',
            price: item.price || item.value || item.salary || 0,
            value: item.value || item.price || item.salary || 0,
            playerId: item.playerId || item._id || item.id || `player-${index}`
          };
          console.log(`✅ Array: ${slot} slot = ${item.name} (${item.position} player)`);
        }
      });
      return standardizedRoster;
    }
    
    // Handle object format
    if (typeof roster === 'object') {
      console.log('🔧 Processing object roster');
      Object.entries(roster).forEach(([key, value]) => {
        // Skip null/undefined values or non-player entries
        if (!value || value === null || value === undefined) {
          console.log(`⏭️ Skipping null/undefined value for key: ${key}`);
          return;
        }
        
        // Skip non-player keys like 'picks'
        if (key === 'picks' || !['QB', 'RB', 'WR', 'TE', 'FLEX'].includes(standardizeSlotName(key))) {
          console.log(`⏭️ Skipping non-roster key: ${key}`);
          return;
        }
        
        // If value is a valid player object
        if (typeof value === 'object' && value.name && typeof value.name === 'string') {
          // CRITICAL FIX: Use the roster slot KEY, not the player's position!
          const slot = standardizeSlotName(key);
          standardizedRoster[slot] = {
            name: value.name,
            position: value.position || value.originalPosition || slot, // Keep actual position for display
            team: value.team || '',
            price: value.price || value.value || value.salary || 0,
            value: value.value || value.price || value.salary || 0,
            playerId: value.playerId || value._id || value.id || `${value.name}-${Date.now()}`
          };
          console.log(`✅ Object: ${slot} slot = ${value.name} (${value.position || 'unknown'} player)`);
        } else {
          console.log(`⏭️ Skipping invalid player for key ${key}:`, typeof value, value);
        }
      });
    }
    
    console.log('🔧 processRosterData result:', {
      outputKeys: Object.keys(standardizedRoster),
      outputCount: Object.keys(standardizedRoster).length,
      slots: Object.entries(standardizedRoster).map(([slot, p]) => `${slot}: ${p.name} (${p.position})`)
    });
    
    return standardizedRoster;
  }, [standardizeSlotName]);

    // FIXED: Enhanced roster merging with duplicate prevention
    const mergeRosterData = useCallback((oldRoster, newRoster) => {
    const current = processRosterData(oldRoster) || {};
    const incoming = processRosterData(newRoster) || {};
    
    // Start with current to preserve existing data
    const merged = { ...current };
    
    // Add new valid players - WITH DUPLICATE CHECK
    Object.entries(incoming).forEach(([position, player]) => {
      if (player && player.name && typeof player.name === 'string' && player.name.trim()) {
        // CRITICAL: Check if this player is already in merged roster under different slot
        const playerAlreadyInRoster = Object.entries(merged).some(([existingSlot, existingPlayer]) => 
          existingSlot !== position && existingPlayer && existingPlayer.name && existingPlayer.name === player.name
        );
        
        if (playerAlreadyInRoster) {
          console.log(`⏭️ Skipping duplicate player: ${player.name} (already in roster under different slot)`);
          return;
        }
        
        merged[position] = player;
        console.log(`🔄 Merged: ${position} = ${player.name}`);
      }
    });
    
    console.log('🔄 Merge result:', {
      currentCount: Object.keys(current).length,
      incomingCount: Object.keys(incoming).length,
      mergedCount: Object.keys(merged).length
    });
    
    return merged;
  }, [processRosterData]);

  // Simplified helper function to calculate pick number for a team
  const getTeamPickNumber = (teamIndex) => {
    if (!teams || !teams[teamIndex]) return '';
    const team = teams[teamIndex];
    const rosterCount = Object.keys(team.roster || {}).filter(key => 
      team.roster[key] && team.roster[key].name
    ).length;
    return rosterCount || '';
  };

  // Initialize draft on mount - with remount protection
  useEffect(() => {
    console.log('=== DRAFT SCREEN MOUNTED ===', { roomId, status, hasJoined: hasJoinedRef.current });
    
    // Reset mountedRef on each mount
    mountedRef.current = true;
    
    if (!user || !roomId) {
      console.error('Missing user or roomId', { user, roomId });
      toast('Missing required data', 'error');
      navigate('/lobby');
      return;
    }

    // CRITICAL: Module-level check to prevent rapid re-initialization
    const now = Date.now();
    const recentlyInitialized = moduleInitializedRoomId === roomId && (now - moduleLastInitTime) < 5000;
    
    if (recentlyInitialized) {
      console.log('⏭️ Recently initialized this room, skipping (module-level protection)');
      // Just request fresh state
      if (socketConnected) {
        socketService.emit('get-draft-state', { roomId });
      }
      return;
    }

    // CRITICAL: Check if we already have valid draft state for this room
    // This prevents re-initialization on React remounts
    const currentDraftState = store.getState().draft;
    const hasExistingDraftState = currentDraftState && 
      currentDraftState.status && 
      currentDraftState.status !== 'idle' &&
      currentDraftState.status !== 'error' &&
      currentDraftState.playerBoard &&
      currentDraftState.playerBoard.length > 0;
    
    if (hasExistingDraftState) {
      console.log('✅ Draft state already exists, skipping re-initialization', {
        status: currentDraftState.status,
        hasBoardData: currentDraftState.playerBoard?.length > 0,
        teams: currentDraftState.teams?.length
      });
      
      // Update module tracking
      moduleInitializedRoomId = roomId;
      moduleLastInitTime = now;
      
      // Just request fresh state from server without full re-init
      if (socketConnected) {
        socketService.emit('get-draft-state', { roomId });
      }
      return;
    }

    if (initializationAttemptedRef.current) {
      console.log('⏭️ Initialization already attempted, skipping');
      return;
    }
    
    initializationAttemptedRef.current = true;
    moduleInitializedRoomId = roomId;
    moduleLastInitTime = now;
    console.log('🚀 Starting draft initialization...');

    dispatch(initializeDraft({ roomId, userId: currentUserId }))
      .unwrap()
      .then((result) => {
        console.log('✅ Draft initialized successfully');
        console.log('Init result:', result);
        hasJoinedRef.current = false;
        
        if (socketConnected && mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) {
              socketService.emit('get-draft-state', { roomId });
            }
          }, 100);
        }
      })
      .catch((error) => {
        console.error('❌ Failed to initialize draft:', error);
        const errorMessage = error?.message || error?.error || 'Unknown error';
        toast(`Failed to initialize draft: ${errorMessage}`, 'error');
        
        // Reset module tracking on error
        moduleInitializedRoomId = null;
        
        if (mountedRef.current) {
          navigate('/lobby');
        }
      });

    return () => {
      console.log('=== DRAFT SCREEN UNMOUNTING ===');
      mountedRef.current = false;
      hasJoinedRef.current = false;
      socketHandlersRef.current = false;
      initializationAttemptedRef.current = false; // Reset for potential remount
      
      if (autoPickTimeoutRef.current) {
        clearTimeout(autoPickTimeoutRef.current);
      }
      
      if (pickTimeoutRef.current) {
        clearTimeout(pickTimeoutRef.current);
      }
      
      // DON'T reset draft or leave room on unmount - this causes issues with remounts
      // Only do this when actually navigating away (handled by route change)
    };
  }, [roomId, user, navigate, toast, dispatch, socketConnected, currentUserId]);

  // Handle socket connection and join room when ready
  useEffect(() => {
    if (socketConnected && status === 'initialized' && contestData && entryId && !hasJoinedRef.current) {
      console.log('🔌 Socket connected, joining draft room');
      console.log('Contest data:', contestData);
      console.log('Entry ID:', entryId);
      
      hasJoinedRef.current = true;
      
      dispatch(joinDraftRoom({
        contestId: contestData.contestId,
        entryId: entryId,
        roomId: roomId
      }));
      
      socketService.emit('join-draft', {
        contestId: contestData.contestId,
        entryId: entryId,
        roomId: roomId
      });
      
      setTimeout(() => {
        socketService.emit('get-draft-state', { roomId });
      }, 500);
    }
  }, [socketConnected, status, contestData, entryId, roomId, dispatch]);

  // Request draft state when socket connects and we're ready
  useEffect(() => {
    if (socketConnected && roomId && hasJoinedRef.current) {
      console.log('🔄 Socket ready, requesting current draft state...');
      requestDraftState();
    }
  }, [socketConnected, roomId, requestDraftState]);

  // FIXED: Enhanced Socket event handlers with better roster preservation
  useEffect(() => {
    if (!socketConnected || !roomId) return;
    
    // Allow re-setup of handlers if they were cleaned up
    if (socketHandlersRef.current) {
      console.log('⏭️ Socket handlers already set up');
      return;
    }

    console.log('🎮 Setting up draft socket event handlers');
    socketHandlersRef.current = true;
    
    // Stop room-status-update spam
    socketService.on('room-status-update', () => {});

    // ENHANCED handleDraftState with ULTRA-ROBUST budget preservation
    const handleDraftState = (data) => {
      console.log('📨 Draft state received:', data);
      
      if (data.roomId !== roomId) return;

      const currentState = store.getState().draft;
      
      // Enhanced teams processing with ULTRA-ROBUST budget preservation
      const teamsData = data.teams || data.entries || data.participants || [];
      let processedTeams = [];
      
      if (Array.isArray(teamsData) && teamsData.length > 0) {
        console.log('🔄 Processing', teamsData.length, 'teams');
        
        processedTeams = teamsData.map((team, index) => {
          const teamUserId = getUserId(team);
          const teamEntryId = team.entryId || team.entry_id || team.id;
          
          // Find existing team to preserve roster and budget data
          const existingTeam = currentState.teams?.find(t => getUserId(t) === teamUserId);
          
          // Process new roster with enhanced logic
          const rawRoster = team.roster || team.picks || [];
          const newRoster = processRosterData(rawRoster);
          
          // Intelligent merging
          let finalRoster = {};
          if (existingTeam?.roster && Object.keys(existingTeam.roster).length > 0) {
            finalRoster = mergeRosterData(existingTeam.roster, newRoster);
          } else {
            finalRoster = newRoster;
          }
          
          // ULTRA-ROBUST BUDGET CALCULATION - NEVER RESET FROM $0
          let finalBudget = 15; // Default budget
          let finalBonus = team.bonus || existingTeam?.bonus || 0;
          
          // Calculate roster spend
          const rosterSpend = Object.values(finalRoster).reduce((total, player) => {
            if (player && typeof player === 'object' && player.price !== undefined) {
              return total + (player.price || 0);
            }
            return total;
          }, 0);
          
          const calculatedBudget = Math.max(0, 15 - rosterSpend);
          
          // ABSOLUTE PRIORITY: Preserve $0 budgets at all costs
          if (existingTeam?.budget === 0) {
            finalBudget = 0;
            console.log(`💰 ${team.name}: ABSOLUTE $0 PROTECTION`);
          } 
          // HIGH PRIORITY: If roster shows full spend, force $0
          else if (rosterSpend >= 15) {
            finalBudget = 0;
            console.log(`💰 ${team.name}: FORCED $0 (spent $${rosterSpend})`);
          }
          // MEDIUM PRIORITY: Server budget (with protection)
          else if (team.budget !== undefined && typeof team.budget === 'number') {
            const serverBudget = team.budget;
            
            // NEVER allow reset from $0 to positive
            if (existingTeam?.budget === 0 && serverBudget > 0) {
              finalBudget = 0;
              console.log(`💰 ${team.name}: BLOCKED server reset from $0 to $${serverBudget}`);
            }
            // Accept reasonable server budgets
            else if (Math.abs(serverBudget - calculatedBudget) <= 1 || finalBonus > 0) {
              finalBudget = Math.max(0, serverBudget);
              console.log(`💰 ${team.name}: Server budget $${serverBudget}`);
            }
            // Server budget is wrong
            else {
              finalBudget = calculatedBudget;
              console.log(`💰 ${team.name}: Server wrong, calculated $${calculatedBudget}`);
            }
          }
          // LOW PRIORITY: Existing budget
          else if (existingTeam?.budget !== undefined) {
            const existingBudget = existingTeam.budget;
            
            if (existingBudget === 0 || (existingBudget < 1 && rosterSpend > 0)) {
              finalBudget = 0;
              console.log(`💰 ${team.name}: Preserving low budget $${existingBudget}`);
            } else if (Math.abs(existingBudget - calculatedBudget) <= 1) {
              finalBudget = Math.max(0, existingBudget);
              console.log(`💰 ${team.name}: Keeping existing $${existingBudget}`);
            } else {
              finalBudget = calculatedBudget;
              console.log(`💰 ${team.name}: Existing wrong, calculated $${calculatedBudget}`);
            }
          }
          // FALLBACK: Calculate from roster
          else {
            finalBudget = calculatedBudget;
            console.log(`💰 ${team.name}: Fresh calculation $${calculatedBudget}`);
          }
          
          // FINAL SAFETY CHECKS
          finalBudget = Math.max(0, finalBudget);
          
          // Emergency correction if $15 with roster
          if (finalBudget === 15 && rosterSpend > 0) {
            finalBudget = Math.max(0, 15 - rosterSpend);
            console.log(`💰 ${team.name}: EMERGENCY fix $15→$${finalBudget}`);
          }
          
          // Additional safety for high player counts
          const playerCount = Object.values(finalRoster).filter(p => p?.name).length;
          if (playerCount >= 4 && finalBudget > 5 && rosterSpend > 10) {
            const correctedBudget = Math.max(0, 15 - rosterSpend);
            if (correctedBudget < finalBudget) {
              finalBudget = correctedBudget;
              console.log(`💰 ${team.name}: Multi-player correction $${finalBudget}`);
            }
          }
          
          return {
            ...team,
            userId: teamUserId,
            entryId: teamEntryId, // ✅ PRESERVE ENTRY ID
            name: team.name || team.username || team.teamName || `Team ${index + 1}`,
            roster: finalRoster,
            budget: finalBudget,
            bonus: finalBonus,
            color: team.color || existingTeam?.color || ['green', 'red', 'blue', 'yellow', 'purple'][index % 5],
            draftPosition: team.draftPosition !== undefined ? team.draftPosition : 
                          existingTeam?.draftPosition !== undefined ? existingTeam.draftPosition : index
          };
        });
      }
      
      // Update state intelligently
      const shouldUpdateTeams = processedTeams.length > 0;
      
      // Calculate isMyTurn with fallback to snake draft order
      let calculatedIsMyTurn = data.isMyTurn || 
        (data.currentDrafter && getUserId(data.currentDrafter) === currentUserId);
      
      // FALLBACK: If currentDrafter is missing but we have teams and currentTurn, calculate from draft order
      if (!calculatedIsMyTurn && shouldUpdateTeams && data.currentTurn !== undefined && data.status === 'active') {
        const pickNumber = (data.currentTurn || 0) + 1;
        const totalTeams = processedTeams.length;
        const round = Math.ceil(pickNumber / totalTeams);
        const positionInRound = ((pickNumber - 1) % totalTeams) + 1;
        const expectedTeamIndex = round % 2 === 1 
          ? positionInRound - 1 
          : totalTeams - positionInRound;
        const expectedTeam = processedTeams[expectedTeamIndex];
        
        if (expectedTeam && getUserId(expectedTeam) === currentUserId) {
          calculatedIsMyTurn = true;
          console.log('🎯 FALLBACK isMyTurn calculation: true (from snake draft order)');
        }
      }
      
      dispatch(updateDraftState({
        ...data,
        teams: shouldUpdateTeams ? processedTeams : undefined,
        status: data.status || (data.currentTurn > 0 ? 'active' : 'waiting'),
        currentDrafter: data.currentDrafter || data.currentPlayer || null,
        isMyTurn: calculatedIsMyTurn || false,
        playerBoard: data.playerBoard || currentState.playerBoard,
        timeRemaining: data.timeRemaining !== undefined ? data.timeRemaining : 
               (data.timeLimit !== undefined ? data.timeLimit : 30)
      }));
    };

    const handleDraftTurn = (data) => {
      console.log('🎯 Draft turn:', data);
      if (data.roomId !== roomId) return;
      
      dispatch(updateDraftState({
        status: 'active',
        currentPick: data.currentPick || 1,
        currentTurn: data.currentTurn !== undefined ? data.currentTurn : 0,
        currentDrafter: data.currentPlayer || data.currentDrafter,
        timeRemaining: data.timeLimit || data.timeRemaining || 30,
        isMyTurn: (data.currentPlayer && getUserId(data.currentPlayer) === currentUserId) || 
                  (data.currentDrafter && getUserId(data.currentDrafter) === currentUserId) || 
                  false
      }));
    };

    // FIXED: Enhanced player picked handler with duplicate prevention
    const handlePlayerPicked = (data) => {
      console.log('✅ Player picked event:', data);
      
      if (data.roomId !== roomId) return;
      
      // Clear picking state
      setIsPicking(false);
      if (pickTimeoutRef.current) {
        clearTimeout(pickTimeoutRef.current);
        pickTimeoutRef.current = null;
      }
      
      // CRITICAL: Update player board to mark as drafted
      if (data.row !== undefined && data.col !== undefined) {
        dispatch(updatePlayerBoardCell({
          row: data.row,
          col: data.col,
          updates: {
            drafted: true,
            draftedBy: data.teamIndex !== undefined ? data.teamIndex : data.draftPosition,
            draftedAtTurn: data.currentTurn || currentTurn,
            pickNumber: data.pickNumber || (picks?.length || 0) + 1,
            draftedToPosition: data.roster_slot || data.slot || data.position
          }
        }));
      }
      
      // IMPORTANT: Only update roster if this is NOT our own pick
      // (we already did optimistic update for our picks)
      // EXCEPTION: Autopicks need roster updates since no optimistic update was done
      const pickedUserId = data.userId || data.user_id || getUserId(data);
      const isMyPick = pickedUserId === currentUserId;
      const isAutoPick = data.isAutoPick === true;
      
      if ((!isMyPick || isAutoPick) && data.player && data.player.name && (data.roster_slot || data.slot || data.position)) {
        const teamIndex = teams?.findIndex(t => getUserId(t) === pickedUserId);
        const slot = standardizeSlotName(data.roster_slot || data.slot || data.position);
        
        if (teamIndex >= 0 && slot) {
          // Check if this player is already in the roster to avoid double updates
          const existingRoster = teams[teamIndex]?.roster || {};
          const existingPlayer = existingRoster[slot];
          
          if (!existingPlayer || existingPlayer.name !== data.player.name) {
            dispatch(updateTeamRoster({
              teamIndex,
              position: slot,
              player: {
                name: data.player.name,
                position: data.player.position || slot,
                team: data.player.team || '',
                price: data.player.price || data.player.value || 0,
                value: data.player.value || data.player.price || 0,
                playerId: data.player._id || data.player.id || data.player.playerId
              }
            }));
          } else {
            console.log('⚠️ Skipping roster update - player already in roster');
          }
        }
      } else if (isMyPick && !isAutoPick) {
        console.log('📝 Skipping roster update for own pick (already optimistically updated)');
      }
      
      // Update draft state
      dispatch(updateDraftState({
        currentTurn: data.currentTurn,
        currentPick: data.currentPick || (data.currentTurn + 1),
        currentDrafter: data.nextDrafter || data.nextPlayer || null,
        isMyTurn: (data.nextDrafter && getUserId(data.nextDrafter) === currentUserId) || 
                  (data.nextPlayer && getUserId(data.nextPlayer) === currentUserId) || 
                  false,
        timeRemaining: data.timeLimit || data.timeRemaining || 30
      }));
    };

    const handlePickSuccess = (data) => {
      console.log('✅ Pick success:', data);
      setIsPicking(false);
      if (pickTimeoutRef.current) {
        clearTimeout(pickTimeoutRef.current);
        pickTimeoutRef.current = null;
      }
    };

    const handlePickError = (error) => {
      console.error('❌ Pick error:', error);
      setIsPicking(false);
      if (pickTimeoutRef.current) {
        clearTimeout(pickTimeoutRef.current);
        pickTimeoutRef.current = null;
      }
      toast(error.message || 'Pick failed', 'error');
    };

    const handleTurnSkipped = (data) => {
      console.log('⏭️ Turn skipped:', data);
      if (data.roomId !== roomId) return;
      
      dispatch(updateDraftState({
        currentTurn: data.currentTurn,
        currentPick: data.currentPick || (data.currentTurn + 1),
        currentDrafter: data.nextPlayer || data.nextDrafter || null,
        isMyTurn: (data.nextPlayer && getUserId(data.nextPlayer) === currentUserId) || 
                  (data.nextDrafter && getUserId(data.nextDrafter) === currentUserId) || 
                  false,
        timeRemaining: data.timeLimit || data.timeRemaining || 30
      }));
    };

    const handleDraftCountdown = (data) => {
      console.log('⏰ Draft countdown:', data);
      if (data.roomId === roomId) {
        dispatch(updateDraftState({
          status: 'countdown',
          countdownTime: data.countdown
        }));
      }
    };

    // ✅ FIXED handleDraftComplete function with saving logic
    const handleDraftComplete = async (data) => {
      console.log('🎉🎉🎉 DRAFT COMPLETE EVENT RECEIVED 🎉🎉🎉');
      console.log('Data:', data);
      console.log('Room ID match:', data.roomId === roomId);
      console.log('Entry ID from Redux:', entryId);
      
      if (data.roomId === roomId) {
        const completedTeams = (data.teams || data.entries || teams || []).map((team, index) => ({
          ...team,
          userId: getUserId(team),
          entryId: team.entryId || team.entry_id || team.id, // ✅ PRESERVE ENTRY ID
          roster: processRosterData(team.roster || team.picks || {}),
          budget: team.budget !== undefined ? team.budget : 15,
          bonus: team.bonus || 0,
          color: team.color || ['green', 'red', 'blue', 'yellow', 'purple'][index % 5]
        }));
        
        dispatch(updateDraftState({
          status: 'completed',
          showResults: true,
          teams: completedTeams
        }));
        
        // ✅ CRITICAL: SAVE THE COMPLETED DRAFT TO BACKEND
        try {
          const myTeam = completedTeams.find(t => getUserId(t) === currentUserId);
          const myEntryId = entryId || myTeam?.entryId || data.entryId;
          
          console.log('💾 Attempting to save draft...');
          console.log('My team:', myTeam);
          console.log('Entry ID options:', {
            fromRedux: entryId,
            fromTeam: myTeam?.entryId,
            fromData: data.entryId,
            using: myEntryId
          });
          
          if (myTeam && myTeam.roster && myEntryId) {
            console.log('💾 Saving completed draft to backend...');
            console.log('Entry ID:', myEntryId);
            console.log('Roster:', myTeam.roster);
            console.log('Total Spent:', 15 - (myTeam.budget || 0));
            
            const token = localStorage.getItem('token');
            if (!token) {
              console.error('❌ No auth token found');
              toast('Authentication required to save draft', 'error');
              return;
            }
            
            const response = await axios.post(
              `/api/contests/draft/${myEntryId}/complete`,
              {
                roster: myTeam.roster,
                totalSpent: 15 - (myTeam.budget || 0)
              },
              {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              }
            );
            
            console.log('✅ Draft saved successfully:', response.data);
            toast('Draft completed and saved!', 'success');
          } else {
            console.error('❌ Cannot save draft - missing data:', {
              hasMyTeam: !!myTeam,
              hasRoster: !!(myTeam?.roster),
              hasEntryId: !!myEntryId,
              myTeam,
              entryId,
              allTeams: completedTeams
            });
            toast('Draft completed but could not save - missing entry ID', 'warning');
          }
        } catch (error) {
          console.error('❌ Error saving draft:', error.response?.data || error.message);
          console.error('Full error:', error);
          toast('Draft completed but failed to save', 'warning');
        }
      }
    };

    const handleTimerUpdate = (data) => {
      if (data.roomId === roomId && data.timeRemaining !== undefined) {
        dispatch(updateTimer(data.timeRemaining));
      }
    };

    // Register all event handlers
    socketService.on('draft-state', handleDraftState);
    socketService.on('draft-turn', handleDraftTurn);
    socketService.on('player-picked', handlePlayerPicked);
    socketService.on('pick-success', handlePickSuccess);
    socketService.on('pick-error', handlePickError);
    socketService.on('turn-skipped', handleTurnSkipped);
    socketService.on('draft-countdown', handleDraftCountdown);
    socketService.on('draft-complete', handleDraftComplete);
    socketService.on('timer-update', handleTimerUpdate);

    return () => {
      console.log('🧹 Cleaning up draft socket event handlers');
      socketHandlersRef.current = false;
      socketService.off('draft-state', handleDraftState);
      socketService.off('draft-turn', handleDraftTurn);
      socketService.off('player-picked', handlePlayerPicked);
      socketService.off('pick-success', handlePickSuccess);
      socketService.off('pick-error', handlePickError);
      socketService.off('turn-skipped', handleTurnSkipped);
      socketService.off('draft-countdown', handleDraftCountdown);
      socketService.off('draft-complete', handleDraftComplete);
      socketService.off('timer-update', handleTimerUpdate);
    };
  }, [socketConnected, roomId, dispatch, getUserId, currentUserId, processRosterData, mergeRosterData, standardizeSlotName, toast, teams, currentTurn, picks, calculateTotalSpent, requestDraftState, entryId]);

  // Show toast messages for errors
  useEffect(() => {
    if (error && mountedRef.current) {
      toast(error, 'error');
    }
  }, [error, toast]);

  // FIXED: Enhanced player selection with better budget validation
  const selectPlayer = useCallback((row, col) => {
    console.log('=== SELECT PLAYER CALLED ===', { row, col, isPicking });
    
    if (isPicking) {
      console.log('❌ Already processing a pick, ignoring...');
      return;
    }
    
    if (!playerBoard || !playerBoard[row] || !playerBoard[row][col]) {
      console.error('❌ Invalid player board position:', { row, col });
      return;
    }
    
    const player = playerBoard[row][col];
    
    if (!player || typeof player !== 'object' || !player.name || player.price === undefined) {
      console.error('❌ Invalid player data:', player);
      toast('Invalid player data', 'error');
      return;
    }
    
    // CRITICAL: Check if player is already drafted
    if (player.drafted === true) {
      console.log('❌ Player already drafted:', player.name);
      toast('This player has already been drafted!', 'error');
      return;
    }
    
    if (!actualIsMyTurn) {
      toast("It's not your turn!", 'error');
      return;
    }
    
    if (!myTeam) {
      console.error('❌ Could not find my team');
      toast('Error: Could not find your team', 'error');
      return;
    }
    
    // Apply emergency budget fix
    const fixedMyTeam = validateAndFixBudget(myTeam);
    
    const availableSlots = getAvailableSlots(fixedMyTeam, player);
    if (!availableSlots || availableSlots.length === 0) {
      toast(`No available slots for ${player.name}!`, 'error');
      return;
    }
    
    // FIXED: Enhanced budget validation
    const totalBudget = Math.max(0, fixedMyTeam.budget || 0) + (fixedMyTeam.bonus || 0);
    
    // Double-check budget by calculating from roster
    const currentSpent = calculateTotalSpent(fixedMyTeam.roster);
    const calculatedBudget = Math.max(0, 15 - currentSpent) + (fixedMyTeam.bonus || 0);
    
    // Use the more conservative budget estimate
    const actualBudget = Math.min(totalBudget, calculatedBudget);
    
    if (player.price > actualBudget) {
      console.log('💰 Budget check failed:', {
        playerPrice: player.price,
        totalBudget,
        calculatedBudget,
        actualBudget,
        currentSpent
      });
      toast(`Not enough budget! You have $${actualBudget}`, 'error');
      return;
    }
    
    const rosterSlot = standardizeSlotName(availableSlots[0]);
    console.log('✅ Selected roster slot:', rosterSlot);
    
    // Set picking state
    setIsPicking(true);
    
    // Timeout to reset picking state
    pickTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Pick timeout (10s) - resetting picking state');
      setIsPicking(false);
      toast('Pick timed out, please try again', 'error');
    }, 10000);
    
    // CRITICAL: Optimistic update - mark player as drafted IMMEDIATELY
    const teamIndex = teams.findIndex(t => getUserId(t) === currentUserId);
    
    // Update player board to mark as drafted (optimistic)
    dispatch(updatePlayerBoardCell({
      row,
      col,
      updates: {
        drafted: true,
        draftedBy: teamIndex,
        draftedAtTurn: currentTurn,
        pickNumber: (picks?.length || 0) + 1,
        draftedToPosition: rosterSlot
      }
    }));
    
    // Update team roster (optimistic)
    if (teamIndex >= 0) {
      dispatch(updateTeamRoster({
        teamIndex,
        position: rosterSlot,
        player: {
          name: player.name,
          position: standardizeSlotName(player.position || player.originalPosition),
          team: player.team || '',
          price: player.price,
          value: player.price,
          playerId: player._id || player.id || player.playerId || `${row}-${col}`
        }
      }));
    }
    
    // CRITICAL FIX: Only dispatch makePick action - NO direct socket.emit!
    // The makePick thunk will handle the socket emission
    const playerId = player._id || player.id || player.playerId || 
                    player.name?.replace(/\s+/g, '-').toLowerCase() || `${row}-${col}`;
    
    dispatch(makePick({
      roomId,
      playerId: playerId,
      playerData: player,
      position: rosterSlot,
      row,
      col,
      slot: rosterSlot,
      roster_slot: rosterSlot
    }));
    
  }, [actualIsMyTurn, playerBoard, teams, currentUserId, roomId, dispatch, toast, myTeam, isPicking, standardizeSlotName, getUserId, currentTurn, picks, calculateTotalSpent, validateAndFixBudget]);

  // Get available slots for a player
  const getAvailableSlots = (team, player) => {
    const playerPos = standardizeSlotName(player.originalPosition || player.position);
    const availableSlots = [];
    const roster = team.roster || {};

    // Check if primary position is available
    if (!getPlayerFromRoster(roster, playerPos)) {
      availableSlots.push(playerPos);
    }

    // Check if FLEX is available for eligible positions
    if (!getPlayerFromRoster(roster, 'FLEX') && ['RB', 'WR', 'TE'].includes(playerPos)) {
      availableSlots.push('FLEX');
    }

    return availableSlots;
  };

  // AUTO-PICK: Handle auto-pick when timer expires
  const handleAutoPick = useCallback(() => {
    if (!actualIsMyTurn || isPicking) {
      console.log(`🤖 Auto-pick cancelled: not my turn or already picking`);
      return;
    }
    
    if (!myTeam || !playerBoard) {
      console.log(`🤖 Auto-pick cancelled: missing team or player board`);
      return;
    }
    
    console.log(`🤖 Timer expired - triggering auto-pick for ${myTeam.name}`);
    
    const autoPick = findAutoPick(myTeam, playerBoard);
    
    if (autoPick) {
      console.log(`🤖 Auto-selecting: ${autoPick.player.name} -> ${autoPick.targetSlot}`);
      selectPlayer(autoPick.row, autoPick.col);
    } else {
      console.log(`🤖 No valid auto-pick available, skipping turn`);
      dispatch(skipTurn({ roomId, reason: 'no_valid_autopick' }));
    }
  }, [actualIsMyTurn, isPicking, myTeam, playerBoard, findAutoPick, selectPlayer, dispatch, roomId]);

  // Handle skip turn
  const handleSkipTurn = useCallback(() => {
    if (!actualIsMyTurn || isPicking) return;
    dispatch(skipTurn({ roomId, reason: 'manual_skip' }));
  }, [actualIsMyTurn, roomId, dispatch, isPicking]);

  // Handle return to lobby
  const handleReturnToLobby = useCallback(() => {
    // Reset module-level tracking when intentionally leaving
    moduleInitializedRoomId = null;
    moduleLastInitTime = 0;
    dispatch(resetDraft());
    navigate('/lobby');
  }, [navigate, dispatch]);

  // Handle team navigation in results view
  const handlePrevTeam = useCallback(() => {
    dispatch(setCurrentViewTeam(
      currentViewTeam > 0 ? currentViewTeam - 1 : teams.length - 1
    ));
  }, [currentViewTeam, teams, dispatch]);

  const handleNextTeam = useCallback(() => {
    dispatch(setCurrentViewTeam(
      currentViewTeam < teams.length - 1 ? currentViewTeam + 1 : 0
    ));
  }, [currentViewTeam, teams, dispatch]);

  // Handle auto-pick toggle
  const handleAutoPickToggle = useCallback((e) => {
    dispatch(setAutoPickEnabled(e.target.checked));
  }, [dispatch]);

  // Handle suggestion toggle
  const handleSuggestionToggle = useCallback((e) => {
    dispatch(setShowAutoPickSuggestion(e.target.checked));
  }, [dispatch]);

  // Handle timer countdown - FIX: Only run if server has initialized timer
  useEffect(() => {
    if (status === 'active' && timeRemaining > 0 && timerInitialized) {
      const timer = setInterval(() => {
        dispatch(updateTimer(Math.max(0, timeRemaining - 1)));
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [status, timeRemaining, timerInitialized, dispatch]);

  // AUTO-PICK: Enhanced timer handler with auto-pick
  useEffect(() => {
    if (actualIsMyTurn && status === 'active' && timeRemaining === 0 && !isPicking) {
      console.log('⏰ Timer expired, triggering auto-pick');
      handleAutoPick();
    }
  }, [actualIsMyTurn, status, timeRemaining, isPicking, handleAutoPick]);

  // SNAKE DRAFT: Draft order validation effect
  useEffect(() => {
    if (status === 'active' && currentTurn !== undefined && teams && teams.length > 0) {
      const isValidOrder = validateDraftOrder(currentTurn, teams);
      if (!isValidOrder) {
        console.warn(`⚠️ Draft order mismatch detected at turn ${currentTurn + 1}`);
      }
    }
  }, [status, currentTurn, teams, validateDraftOrder]);

  // FIXED: Enhanced roster slot component with memoization
  const RosterSlot = React.memo(({ slot, myTeamRoster }) => {
    const slotPlayer = useMemo(() => {
      return getPlayerFromRoster(myTeamRoster, slot);
    }, [myTeamRoster, slot]);
    
    // Only log when player actually changes
    const prevPlayerName = useRef(slotPlayer?.name);
    
    useEffect(() => {
      if (prevPlayerName.current !== slotPlayer?.name) {
        console.log(`🎯 ROSTER SLOT ${slot} CHANGED:`, {
          from: prevPlayerName.current || 'empty',
          to: slotPlayer?.name || 'empty'
        });
        prevPlayerName.current = slotPlayer?.name;
      }
    }, [slot, slotPlayer?.name]);
    
    return (
      <div className="roster-slot">
        <div className="slot-header">
          <span className="slot-label">{slot}</span>
          {slotPlayer && <span className="slot-price">${slotPlayer.price || slotPlayer.value || 0}</span>}
        </div>
        {slotPlayer ? (
          <div className="player-filled">
            <span className="player-name">{slotPlayer.name}</span>
            <span className="player-team">{slotPlayer.team || 'N/A'}</span>
            <span className="player-position">{slotPlayer.position || slot}</span>
          </div>
        ) : (
          <div className="empty-slot">
            <span>Empty</span>
          </div>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison function
    const prevPlayer = getPlayerFromRoster(prevProps.myTeamRoster, prevProps.slot);
    const nextPlayer = getPlayerFromRoster(nextProps.myTeamRoster, nextProps.slot);
    
    return (
      prevProps.slot === nextProps.slot &&
      prevPlayer?.name === nextPlayer?.name &&
      prevPlayer?.price === nextPlayer?.price
    );
  });

  RosterSlot.displayName = 'RosterSlot';

  // SNAKE DRAFT: Display current draft order info
  const DraftOrderInfo = () => {
    if (!teams || teams.length === 0) return null;
    
    const pickNumber = (currentTurn || 0) + 1;
    const round = Math.ceil(pickNumber / teams.length);
    const expectedTeamIndex = getTeamForPick(pickNumber, teams.length);
    const expectedTeam = teams[expectedTeamIndex];
    
    return (
      <div className="draft-order-info">
        <div className="current-pick-info">
          <span>Pick {pickNumber} - Round {round}</span>
          <span>Expected: {expectedTeam?.name || 'Unknown'}</span>
          {currentDrafter && (
            <span className={getUserId(currentDrafter) === getUserId(expectedTeam) ? 'correct' : 'incorrect'}>
              Actual: {currentDrafter.name || currentDrafter.username}
            </span>
          )}
        </div>
        
        {/* Show next few picks */}
        <div className="upcoming-picks">
          <span>Upcoming:</span>
          {[1, 2, 3].map(offset => {
            const upcomingPick = pickNumber + offset;
            if (upcomingPick > teams.length * 5) return null; // Don't show picks beyond the draft
            const upcomingTeamIndex = getTeamForPick(upcomingPick, teams.length);
            const upcomingTeam = teams[upcomingTeamIndex];
            return (
              <span key={offset} className="upcoming-pick">
                {upcomingPick}: {upcomingTeam?.name || '?'}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Render error state
  if (status === 'error') {
    return (
      <div className="draft-container">
        <div className="error-screen">
          <h1>Error Loading Draft</h1>
          <p>{error || 'An unknown error occurred'}</p>
          <button onClick={handleReturnToLobby} className="back-button">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Render loading state
  if (status === 'loading' || status === 'initializing' || (status === 'initialized' && !socketConnected)) {
    return (
      <div className="draft-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>
            {status === 'initializing' ? 'Initializing draft...' : 
             status === 'initialized' && !socketConnected ? 'Connecting to draft server...' :
             'Loading draft...'}
          </p>
        </div>
      </div>
    );
  }

  // Render waiting state
  if (status === 'waiting') {
    return (
      <div className="draft-container">
        <div className="waiting-screen">
          <h1>Waiting for Draft to Start</h1>
          <div className="status-text">
            Waiting for all players to join...
            <div className="player-count">
              {connectedPlayers}/{entryCount || 5} Connected
            </div>
          </div>
          
          <div className="connected-users">
            {users.map((user, index) => (
              <div key={getUserId(user) || index} className="user-status">
                <span>{user.username}</span>
                <span className={user.connected ? 'connected' : 'disconnected'}>
                  {user.connected ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
          
          <button onClick={handleReturnToLobby} className="back-button">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Render countdown state
  if (status === 'countdown') {
    return (
      <div className="draft-container">
        <div className="countdown-screen">
          <h1>Draft Starting Soon!</h1>
          <div className="countdown-timer">
            <div className="countdown-number">{countdownTime}</div>
          </div>
          <p>Get ready to draft!</p>
          
          <div className="draft-order-preview">
            <h3>Draft Order:</h3>
            <div className="users-list">
              {teams && teams.map((team, index) => {
                const isMyTeam = getUserId(team) === currentUserId;
                const teamPicks = getPicksForTeam(index, teams.length, 5);
                return (
                  <div key={getUserId(team) || index} className={`user-item ${isMyTeam ? 'current-user' : ''}`}>
                    <span className="position">{index + 1}.</span>
                    <span className={`username team-${team.color}`}>
                      {team.name} {isMyTeam && '(You)'}
                    </span>
                    <span className="picks-preview">Picks: {teamPicks.join(', ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render results state
  if (showResults || status === 'completed') {
    return (
      <div className="draft-container">
        <div className="results-screen">
          <h1>Draft Complete!</h1>
          
          <div className="team-viewer">
            <div className="team-navigation">
              <button 
                onClick={handlePrevTeam}
                disabled={!teams || teams.length <= 1}
              >
                ←
              </button>
              <h2 className={`team-name team-${teams?.[currentViewTeam]?.color}`}>
                {teams?.[currentViewTeam]?.name}
                {getUserId(teams?.[currentViewTeam]) === currentUserId && ' (Your Team)'}
              </h2>
              <button 
                onClick={handleNextTeam}
                disabled={!teams || teams.length <= 1}
              >
                →
              </button>
            </div>
            
            <div className="roster-display">
              {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => {
                const player = getPlayerFromRoster(teams?.[currentViewTeam]?.roster, slot);
                return (
                  <div key={slot} className="roster-slot">
                    <span className="slot-label">{slot}:</span>
                    {player ? (
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <span className="player-details">
                          {player.team} - ${player.price || player.value || 0}
                        </span>
                      </div>
                    ) : (
                      <span className="empty-slot">Empty</span>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="team-summary">
              <p>Total Spent: ${15 - (teams?.[currentViewTeam]?.budget !== undefined ? teams?.[currentViewTeam]?.budget : 15)}</p>
              <p>Budget Remaining: ${teams?.[currentViewTeam]?.budget !== undefined ? teams?.[currentViewTeam]?.budget : 15}</p>
              {(teams?.[currentViewTeam]?.bonus || 0) > 0 && (
                <p>Bonus Earned: ${teams?.[currentViewTeam]?.bonus}</p>
              )}
            </div>
          </div>
          
          <button onClick={handleReturnToLobby} className="return-button">
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Apply emergency budget fix to myTeam before rendering
  const safeMyTeam = myTeam ? validateAndFixBudget(myTeam) : null;

  // LOW TIME WARNING: Determine if we should show the pulsing red border
  const showLowTimeWarning = actualIsMyTurn && status === 'active' && timeRemaining <= 10 && timeRemaining > 0;

  // Render active draft
  return (
    <div className={`draft-container ${showLowTimeWarning ? 'low-time-warning' : ''}`}>
      {/* LIVE DRAFT FEED - Replaces old DebugDraftOrder */}
      <LiveDraftFeed 
        teams={teams}
        currentTurn={currentTurn}
        picks={picks}
        currentUserId={currentUserId}
        getUserId={getUserId}
      />
      
      <div className="draft-header">
        <div className="timer-section">
          <div className={`timer ${actualIsMyTurn ? 'my-turn' : ''} ${timeRemaining <= 10 ? 'warning' : ''}`}>
            Time: <span className={`time-value ${showLowTimeWarning ? 'low-time' : ''}`}>{timeRemaining || 30}s</span>
          </div>
          {actualIsMyTurn && <div className="turn-indicator">Your Turn!</div>}
        </div>
        
        <div className="draft-info">
          <DraftOrderInfo />
          <span>Budget: ${safeMyTeam ? (safeMyTeam.budget + (safeMyTeam.bonus || 0)) : 15}</span>
        </div>
        
        <div className="controls">
          <label>
            <input 
              type="checkbox" 
              checked={autoPickEnabled}
              onChange={handleAutoPickToggle}
            />
            Auto-pick
          </label>
          <label>
            <input 
              type="checkbox" 
              checked={showAutoPickSuggestion}
              onChange={handleSuggestionToggle}
            />
            Show suggestions
          </label>
        </div>
      </div>

      {/* PLAYER BOARD */}
      <div className={`player-board ${showLowTimeWarning ? 'low-time-warning' : ''}`}>
        {playerBoard && playerBoard.length > 0 ? (
          playerBoard.map((row, rowIndex) => (
            <div key={rowIndex} className="price-row">
              <div className={`price-label ${rowIndex === 5 ? 'wildcards' : ''}`}>
                {rowIndex === 5 ? 'Wildcards' : `$${5 - rowIndex}`}
              </div>
              {row.map((player, colIndex) => {
                const isAutoSuggestion = autoPickSuggestion && 
                  autoPickSuggestion.row === rowIndex && 
                  autoPickSuggestion.col === colIndex;
                
                const teamColors = ['green', 'red', 'blue', 'yellow', 'purple'];
                const draftedByColor = player.drafted && player.draftedBy !== undefined 
                  ? teamColors[player.draftedBy] 
                  : null;
                
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`player-card 
                      ${player.drafted ? 'drafted' : ''} 
                      ${draftedByColor ? `drafted-by-${draftedByColor}` : ''}
                      ${isAutoSuggestion ? 'auto-suggestion' : ''}
                      ${actualIsMyTurn && !player.drafted && !isPicking ? 'clickable' : ''}
                      ${isPicking ? 'disabled' : ''}
                    `}
                    onClick={() => {
                      if (!isPicking && !player.drafted && actualIsMyTurn) {
                        selectPlayer(rowIndex, colIndex);
                      }
                    }}
                    style={{ 
                      cursor: actualIsMyTurn && !player.drafted && !isPicking ? 'pointer' : 'default',
                      position: 'relative'
                    }}
                  >
                    <div className={`position-badge ${standardizeSlotName(player.position)}`}>
                      {standardizeSlotName(player.position)}
                    </div>
                    <div className="player-name">{player.name}</div>
                    <div className="player-team">{player.team} - ${player.price}</div>
                    <div className="actual-position-badge">
                      {standardizeSlotName(player.originalPosition || player.position)}
                    </div>
                    {player.matchup && (
                      <div className="player-matchup">{player.matchup}</div>
                    )} 
                    {isAutoSuggestion && (
                      <div className="suggestion-indicator">⭐ Best Pick</div>
                    )}
                    {player.drafted && (
                      <>
                        {draftedByColor && (
                          <div className={`game-piece ${draftedByColor}`}>
                            <div className="piece-inner">
                              {player.pickNumber || getTeamPickNumber(player.draftedBy)}
                            </div>
                          </div>
                        )}
                        
                        {player.draftedToPosition && (
                          <div className="drafted-position">{standardizeSlotName(player.draftedToPosition)}</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="no-board-message">
            <p>Loading player board...</p>
          </div>
        )}
      </div>

      {/* MY TEAM SECTION */}
      <div className="my-team-section">
        <div className="my-team-container">
          {safeMyTeam ? (
            <div className="team-card my-team">
              <div className="team-header">
                <h3>Your Team - {safeMyTeam.name}</h3>
                <div className="budget-info">
                  <span className="budget">Budget: ${safeMyTeam.budget || 15}</span>
                  {(safeMyTeam.bonus || 0) > 0 && <span className="bonus">Bonus: +${safeMyTeam.bonus}</span>}
                  <span className="total">Total: ${(safeMyTeam.budget || 15) + (safeMyTeam.bonus || 0)}</span>
                </div>
              </div>
              
              <div className="roster">
                {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => (
                  <RosterSlot 
                    key={slot} 
                    slot={slot} 
                    myTeamRoster={safeMyTeam.roster || {}} 
                  />
                ))}
              </div>
              
              <div className="team-summary">
                <div className="summary-item">
                  <span>Spent:</span>
                  <span>${15 - (safeMyTeam.budget || 15)}</span>
                </div>
                <div className="summary-item">
                  <span>Remaining:</span>
                  <span>${(safeMyTeam.budget || 15) + (safeMyTeam.bonus || 0)}</span>
                </div>
                <div className="summary-item">
                  <span>Roster Slots:</span>
                  <span>{Object.keys(safeMyTeam.roster || {}).length}/5</span>
                </div>
                <div className="summary-item">
                  <span>Valid Players:</span>
                  <span>{Object.values(safeMyTeam.roster || {}).filter(p => p && p.name).length}/5</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="loading-team">
              <p>Loading your team...</p>
            </div>
          )}
        </div>
        
        {/* Current drafter info */}
        {currentDrafter && (
          <div className="current-drafter-info">
            <p>Currently drafting: <strong>{currentDrafter.username || currentDrafter.name || 'Unknown'}</strong></p>
          </div>
        )}
        
        {/* Team legend */}
        <div className="team-legend">
          <p>Team Colors:</p>
          <div className="legend-items">
            {teams && teams.map((team, index) => {
              const isMe = getUserId(team) === currentUserId;
              return (
                <div key={index} className="legend-item">
                  <div className={`legend-piece ${team.color}`}></div>
                  <span className="legend-text">
                    {team.name} {isMe && '(You)'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Picking overlay */}
      {isPicking && (
        <div className="picking-overlay">
          <div className="picking-spinner"></div>
          <p>Processing your pick...</p>
        </div>
      )}
    </div>
  );
};

export default DraftScreen;