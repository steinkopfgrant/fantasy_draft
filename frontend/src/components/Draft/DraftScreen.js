// frontend/src/components/Draft/DraftScreen.js
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { store } from '../../store/store';
import axios from 'axios';
import LiveDraftFeed from './LiveDraftFeed';
import { getStampComponent } from './Stamps/Stamp';
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
  addPick,
  selectDraft,
  selectCurrentTeam,
  selectMyTeam,
  selectAutoPick,
  clearDraftError
} from '../../store/slices/draftSlice';
import { selectAuthUser } from '../../store/slices/authSlice';
import socketService from '../../services/socket';
import './DraftScreen.css';
import './DraftScreen.mobile.css';
import {
  AutoDraftBar,
  MobileConfirmModal,
  MobileRosterBar,
  useIsMobile,
  useMobileSelection,
} from './DraftScreen.mobile.jsx';

// ==================== SPORT CONFIGURATION ====================
const SPORT_CONFIG = {
  nfl: {
    positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
    slotPriority: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
    flexEligible: ['RB', 'WR', 'TE'],
    budget: 15,
    rosterSize: 5,
  },
  nba: {
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    slotPriority: ['PG', 'SG', 'SF', 'PF', 'C'],
    flexEligible: [],  // NBA has no flex
    budget: 15,
    rosterSize: 5,
  },
  mlb: {
    positions: ['P', 'C', '1B', 'OF', 'FLEX'],
    slotPriority: ['P', 'C', '1B', 'OF', 'FLEX'],
    flexEligible: ['C', '1B', 'OF'],
    budget: 15,
    rosterSize: 5,
  },
};
// =============================================================

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
  const lastPickTimeRef = useRef(0);
  
  // Add state to prevent double picks
  const [isPicking, setIsPicking] = useState(false);
  const pickTimeoutRef = useRef(null);

  // ==================== MOBILE SUPPORT ====================
  const isMobile = useIsMobile();
  const {
    mobileSelectedPlayer,
    showConfirmModal,
    selectPlayer: mobileSelectPlayer,
    dismissModal,
    clearSelection,
  } = useMobileSelection();
  const autoPickTriggeredRef = useRef(0); // Timestamp debounce for auto-pick
  const timerSyncedForTurnRef = useRef(null); // Track which turn the timer was last synced for
  const mobileSelectedPlayerPrevRef = useRef(null); // Track previous selection for server sync
  const wasPlayerDraftedRef = useRef(false); // Track if clear was due to player being drafted (don't emit clear-pre-select)
  const isInitialMountRef = useRef(true); // Track initial mount to prevent false clear-pre-select
  // =========================================================

  // ==================== TIMER SYNC REFS ====================
  // These refs track server time for accurate timer synchronization
  const turnStartedAtRef = useRef(null);      // When the current turn started (server timestamp)
  const serverTimeOffsetRef = useRef(0);       // Difference between server and client time
  const timeLimitRef = useRef(30);             // Current turn's time limit
  const timerIntervalRef = useRef(null);       // Interval for timer updates
  const lastSyncTimeRef = useRef(0);           // Last time we synced with server
  // ==========================================================

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

  // Get sport configuration - check draft state and contest data
  // Detect sport from draftState, contestData, OR infer from playerBoard
  const inferSportFromBoard = (board) => {
    if (!board || !Array.isArray(board) || board.length === 0) return null;
    const firstPlayer = board[0]?.[0] || board[0];
    if (!firstPlayer) return null;
    const pos = (firstPlayer.position || '').toUpperCase();
    if (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) return 'nba';
    if (['QB', 'RB', 'WR', 'TE'].includes(pos)) return 'nfl';
    return null;
  };
  
  const sport = inferSportFromBoard(playerBoard) || contestData?.sport || contestData?.contestSport || draftState?.sport || 'nfl';
  const sportConfig = SPORT_CONFIG[sport] || SPORT_CONFIG.nfl;
  
  console.log('🏀 SPORT DETECTION:', { 
    draftStateSport: draftState?.sport, 
    contestDataSport: contestData?.sport,
    inferredSport: inferSportFromBoard(playerBoard),
    finalSport: sport 
  });

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

  // SORTED TEAMS: Always sort by draftPosition for consistent display
  // This prevents visual bugs when disconnect/reconnect events reorder the teams array
  const sortedTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    
    console.log('🔢 sortedTeams input:', teams.map(t => ({
      name: t.name || t.username,
      draftPosition: t.draftPosition,
      userId: t.userId?.substring(0, 8)
    })));
    
    const sorted = [...teams].sort((a, b) => {
      const posA = a.draftPosition ?? 999;
      const posB = b.draftPosition ?? 999;
      return posA - posB;
    });
    
    console.log('🔢 sortedTeams output:', sorted.map(t => ({
      name: t.name || t.username,
      draftPosition: t.draftPosition
    })));
    
    return sorted;
  }, [teams]);

  // Track which stamps are unique in the room (only 1 user has it)
  const uniqueStamps = useMemo(() => {
    if (!teams) return new Set();
    const stampCounts = {};
    teams.forEach(team => {
      const stamp = team.equipped_stamp || 'default';
      stampCounts[stamp] = (stampCounts[stamp] || 0) + 1;
    });
    return new Set(
      Object.entries(stampCounts)
        .filter(([, count]) => count === 1)
        .map(([stamp]) => stamp)
    );
  }, [teams]);

  // MEMOIZED: Read localStorage pre-selection once per render, not per cell
  // This prevents 30+ localStorage reads per render cycle
  const localStoragePreSelection = useMemo(() => {
    if (!isMobile || mobileSelectedPlayer || !roomId) return null;
    try {
      const saved = localStorage.getItem(`preselect_${roomId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return null;
  }, [isMobile, mobileSelectedPlayer, roomId]);

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

  // ==================== TIMER SYNC FUNCTIONS ====================
  
  // Calculate the actual time remaining based on server timestamp
  const calculateTimeRemaining = useCallback(() => {
    if (!turnStartedAtRef.current || !timeLimitRef.current) {
      return timeLimitRef.current || 30;
    }
    
    // Get current time adjusted for server offset
    const adjustedNow = Date.now() + serverTimeOffsetRef.current;
    const elapsed = Math.floor((adjustedNow - turnStartedAtRef.current) / 1000);
    const remaining = Math.max(0, timeLimitRef.current - elapsed);
    
    return remaining;
  }, []);

  // Update timer from server data
  const syncTimerFromServer = useCallback((data) => {
    const { turnStartedAt, serverTime, timeLimit, timeRemaining: serverTimeRemaining, currentTurn: syncedTurn } = data;
    
    // Calculate server time offset if we have serverTime
    if (serverTime) {
      const newOffset = serverTime - Date.now();
      // Only update offset if it's significantly different (> 100ms)
      if (Math.abs(newOffset - serverTimeOffsetRef.current) > 100) {
        serverTimeOffsetRef.current = newOffset;
        console.log(`⏱️ Server time offset updated: ${newOffset}ms`);
      }
    }
    
    // Store turn start time
    if (turnStartedAt) {
      turnStartedAtRef.current = turnStartedAt;
      console.log(`⏱️ Turn started at: ${new Date(turnStartedAt).toISOString()}`);
    }
    
    // Store time limit
    if (timeLimit !== undefined) {
      timeLimitRef.current = timeLimit;
      console.log(`⏱️ Time limit: ${timeLimit}s`);
    }
    
    // CRITICAL: Track which turn this timer sync is for
    if (syncedTurn !== undefined) {
      timerSyncedForTurnRef.current = syncedTurn;
      console.log(`⏱️ Timer synced for turn: ${syncedTurn}`);
    }
    
    // Calculate and dispatch the actual time remaining
    const calculatedRemaining = calculateTimeRemaining();
    
    // Use server's timeRemaining as fallback if we don't have turnStartedAt
    const finalRemaining = turnStartedAtRef.current ? calculatedRemaining : (serverTimeRemaining || 30);
    
    console.log(`⏱️ Timer sync: calculated=${calculatedRemaining}s, server=${serverTimeRemaining}s, using=${finalRemaining}s, turn=${syncedTurn}`);
    
    dispatch(updateTimer(finalRemaining));
    lastSyncTimeRef.current = Date.now();
    
    return finalRemaining;
  }, [calculateTimeRemaining, dispatch]);

  // Start the timer interval that calculates from server timestamp
  const startTimerInterval = useCallback(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    // Start new interval that calculates time from server timestamp
    // Use a shorter interval (250ms) to catch up faster after tab becomes active
    timerIntervalRef.current = setInterval(() => {
      if (status !== 'active') {
        return;
      }
      
      // ALWAYS recalculate from timestamp - this handles background throttling
      const remaining = calculateTimeRemaining();
      dispatch(updateTimer(remaining));
      
      // Re-sync with server every 10 seconds OR if we detect we might be stale
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTimeRef.current;
      
      // If more than 10 seconds since last sync, or if remaining seems wrong, re-sync
      if (timeSinceLastSync > 10000) {
        console.log('⏱️ Requesting timer re-sync from server...');
        socketService.emit('get-draft-state', { roomId });
        lastSyncTimeRef.current = now;
      }
    }, 250); // Run 4x per second for smoother updates and faster recovery
    
    console.log('⏱️ Started server-synced timer interval (250ms)');
  }, [status, calculateTimeRemaining, dispatch, roomId]);

  // Stop the timer interval
  const stopTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      console.log('⏱️ Stopped timer interval');
    }
  }, []);

  // =============================================================

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
    const availableSlots = sportConfig.positions.filter(slot => 
      !getPlayerFromRoster(roster, slot)
    );
    
    console.log(`📋 Available slots:`, availableSlots);
    
    if (availableSlots.length === 0) {
      console.log(`❌ No available slots for auto-pick`);
      return null;
    }
    
    // CORRECT PRIORITY: Use sport-specific slot priority (matching server logic)
    const slotPriority = sportConfig.slotPriority;
    const prioritizedSlots = slotPriority.filter(slot => availableSlots.includes(slot));
    
    console.log(`🎯 Prioritized slots:`, prioritizedSlots);
    
    // For each priority slot, find the MOST EXPENSIVE affordable player
    for (const targetSlot of prioritizedSlots) {
      let bestPlayer = null;
      let bestRow = -1;
      let bestCol = -1;
      let highestPrice = -1;
      
      // Scan player board for eligible players for this slot
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
          
          // Check if player can fill this specific slot
          let canFillSlot = false;
          if (targetSlot === playerPosition) {
            canFillSlot = true;
          } else if (targetSlot === 'FLEX' && sportConfig.flexEligible.includes(playerPosition)) {
            canFillSlot = true;
          }
          
          if (!canFillSlot) {
            continue;
          }
          
          // Pick the MOST EXPENSIVE player for this slot
          if (player.price > highestPrice) {
            bestPlayer = player;
            bestRow = row;
            bestCol = col;
            highestPrice = player.price;
          }
        }
      }
      
      // If we found a player for this slot, return it
      if (bestPlayer) {
        console.log(`✅ Auto-pick selected: ${bestPlayer.name} (${bestPlayer.position}) -> ${targetSlot} for $${highestPrice}`);
        return {
          row: bestRow,
          col: bestCol,
          player: bestPlayer,
          targetSlot,
          price: highestPrice
        };
      }
    }
    
    console.log(`❌ No eligible auto-pick found`);
    return null;
  }, [standardizeSlotName, sportConfig]);

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
        if (key === 'picks' || !['QB', 'RB', 'WR', 'TE', 'FLEX', 'PG', 'SG', 'SF', 'PF', 'C'].includes(standardizeSlotName(key))) {
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
    
    // ✅ FIX: If a DIFFERENT room was initialized, reset the module tracking
    if (moduleInitializedRoomId && moduleInitializedRoomId !== roomId) {
      console.log('🔄 Different room from module tracking, allowing re-initialization', {
        moduleRoomId: moduleInitializedRoomId,
        newRoomId: roomId
      });
      moduleInitializedRoomId = null;
      moduleLastInitTime = 0;
    }
    
    if (recentlyInitialized) {
      console.log('⏭️ Recently initialized this room, skipping (module-level protection)');
      // Just request fresh state
      if (socketConnected) {
        socketService.emit('get-draft-state', { roomId });
      }
      return;
    }

    // ✅ FIX: Check if we already have valid draft state for THIS SPECIFIC room
    // This prevents re-initialization on React remounts but ALLOWS re-init for different rooms
    const currentDraftState = store.getState().draft;
    const existingRoomId = currentDraftState?.roomId || currentDraftState?.contestData?.roomId;
    const isCorrectRoom = existingRoomId === roomId;
    
    const hasExistingDraftState = currentDraftState && 
      currentDraftState.status && 
      currentDraftState.status !== 'idle' &&
      currentDraftState.status !== 'error' &&
      currentDraftState.playerBoard &&
      currentDraftState.playerBoard.length > 0 &&
      isCorrectRoom; // ✅ CRITICAL: Must be for the SAME room!
    
    // ✅ FIX: If we have state for a DIFFERENT room, reset it first
    if (currentDraftState && 
        currentDraftState.status !== 'idle' && 
        existingRoomId && 
        !isCorrectRoom) {
      console.log('🔄 Different room detected, resetting draft state', {
        existingRoomId,
        newRoomId: roomId
      });
      dispatch(resetDraft());
    }
    
    if (hasExistingDraftState) {
      console.log('✅ Draft state already exists for THIS room, skipping re-initialization', {
        status: currentDraftState.status,
        hasBoardData: currentDraftState.playerBoard?.length > 0,
        teams: currentDraftState.teams?.length,
        roomId: existingRoomId
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
      
      // Stop timer interval on unmount
      stopTimerInterval();
      
      if (autoPickTimeoutRef.current) {
        clearTimeout(autoPickTimeoutRef.current);
      }
      
      if (pickTimeoutRef.current) {
        clearTimeout(pickTimeoutRef.current);
      }
      
      // DON'T reset draft or leave room on unmount - this causes issues with remounts
      // Only do this when actually navigating away (handled by route change)
    };
  }, [roomId, user, navigate, toast, dispatch, socketConnected, currentUserId, stopTimerInterval]);

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
        
        // RESTORE PRE-SELECTION from localStorage on initial join
        try {
          const savedPreSelect = localStorage.getItem(`preselect_${roomId}`);
          if (savedPreSelect && currentUserId) {
            const player = JSON.parse(savedPreSelect);
            console.log('📱 Found saved pre-selection on init:', player.name);
            
            // Re-emit to server to ensure it's stored
            socketService.emit('pre-select', {
              roomId,
              userId: currentUserId,
              player
            });
            console.log('📱 Re-emitted pre-select to server on init');
            
            // Restore UI selection on mobile with retry
            if (isMobile) {
              const restoreUI = (attempt) => {
                if (attempt > 5 || !mobileSelectPlayer) return;
                console.log(`📱 Restoring mobile selection UI on init (attempt ${attempt})`);
                mobileSelectPlayer(player, player.row, player.col);
              };
              setTimeout(() => restoreUI(1), 500);
              setTimeout(() => restoreUI(2), 1000);
              setTimeout(() => restoreUI(3), 2000);
            }
          }
        } catch (e) {
          console.warn('Failed to restore pre-selection on init:', e);
        }
      }, 500);
    }
  }, [socketConnected, status, contestData, entryId, roomId, dispatch, currentUserId, isMobile, mobileSelectPlayer]);

  // Request draft state when socket connects and we're ready
  useEffect(() => {
    if (socketConnected && roomId && hasJoinedRef.current) {
      console.log('🔄 Socket ready, requesting current draft state...');
      requestDraftState();
    }
  }, [socketConnected, roomId, requestDraftState]);

  // CRITICAL FIX: Auto-refresh draft state on socket reconnection (mobile disconnect/reconnect)
  useEffect(() => {
    if (!roomId) return;
    
    const handleReconnection = (data) => {
      console.log('🔄 Socket reconnected, refreshing draft state...', data);
      
      // CRITICAL: Reset socket handlers ref so they get re-registered
      socketHandlersRef.current = false;
      
      // CRITICAL: Reset initial mount ref so the sync useEffect skips
      // the next render cycle (prevents clearing server-side pre-selection)
      isInitialMountRef.current = true;
      
      // Small delay to ensure socket is fully re-authenticated
      setTimeout(() => {
        if (hasJoinedRef.current && mountedRef.current) {
          console.log('📡 Requesting fresh draft state after reconnection');
          
          // Re-join the draft room
          socketService.emit('join-draft-room', { roomId, rejoin: true });
          
          // Request fresh draft state
          requestDraftState();
          
          // RESTORE PRE-SELECTION from localStorage if we had one
          try {
            const savedPreSelect = localStorage.getItem(`preselect_${roomId}`);
            if (savedPreSelect && currentUserId) {
              const player = JSON.parse(savedPreSelect);
              console.log('📱 Restoring pre-selection from localStorage:', player.name);
              
              // Re-emit to server
              socketService.emit('pre-select', {
                roomId,
                userId: currentUserId,
                player
              });
              console.log('📱 Re-emitted pre-select to server after reconnect');
              
              // Restore UI with retry - board may not be ready yet
              if (isMobile && mobileSelectPlayer) {
                const restoreUI = (attempt) => {
                  if (attempt > 5) {
                    console.log('📱 Giving up on UI restore after 5 attempts');
                    return;
                  }
                  console.log(`📱 Restoring mobile selection UI (attempt ${attempt})`);
                  mobileSelectPlayer(player, player.row, player.col);
                };
                // Try immediately, then retry in case board wasn't ready
                restoreUI(1);
                setTimeout(() => restoreUI(2), 500);
                setTimeout(() => restoreUI(3), 1500);
              }
            }
          } catch (e) {
            console.warn('Failed to restore pre-selection from localStorage:', e);
          }
        }
      }, 500);
    };
    
    // Handle disconnect - reset handlers ref so they re-register on reconnect
    const handleDisconnect = (reason) => {
      console.log('📴 Socket disconnected, will re-register handlers on reconnect:', reason);
      socketHandlersRef.current = false;
    };
    
    // Listen for socket events
    socketService.on('reconnect', handleReconnection);
    socketService.on('disconnect', handleDisconnect);
    
    // Also listen for the authenticated event after reconnection
    const handleReauthenticated = (data) => {
      console.log('🔐 Re-authenticated after reconnect, refreshing draft...', data);
      if (hasJoinedRef.current && mountedRef.current) {
        // Reset handlers ref in case it wasn't reset
        socketHandlersRef.current = false;
        setTimeout(() => {
          requestDraftState();
        }, 300);
      }
    };
    
    socketService.on('authenticated', handleReauthenticated);
    
    return () => {
      socketService.off('reconnect', handleReconnection);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('authenticated', handleReauthenticated);
    };
  }, [roomId, requestDraftState, currentUserId, isMobile, mobileSelectPlayer]);

  // FIXED: Enhanced Socket event handlers with better roster preservation and TIMER SYNC
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

    // ENHANCED handleDraftState with ULTRA-ROBUST budget preservation and TIMER SYNC
    const handleDraftState = (data) => {
      console.log('📨 Draft state received:', data);
      
      if (data.roomId !== roomId) return;

      // CRITICAL: Get current state FIRST before using it
      const currentState = store.getState().draft;

      // CRITICAL: Skip team updates during active OR completed draft
      // Teams should ONLY be updated via player-picked events to preserve roster data
      // Once completed, handleDraftComplete already set the teams correctly
      const isActiveDraft = data.status === 'active' || (data.currentTurn > 0 && data.currentTurn < 25);
      const isCompletedDraft = data.status === 'completed' || currentState.status === 'completed';
      
      if ((isActiveDraft || isCompletedDraft) && currentState.teams?.length > 0) {
        console.log(`⏭️ Draft ${isCompletedDraft ? 'completed' : 'active'} - preserving teams, only updating turn/timer`);
        dispatch(updateDraftState({
          currentTurn: data.currentTurn,
          currentPick: data.currentPick || (data.currentTurn + 1),
          status: data.status || currentState.status,
          timeRemaining: data.timeRemaining || 30,
          timeLimit: data.timeLimit || 30,
          playerBoard: data.playerBoard || currentState.playerBoard
        }));
        return;
      }
      
      // ==================== TIMER SYNC ====================
      // Sync timer from server data
      if (data.turnStartedAt || data.serverTime || data.timeLimit) {
        syncTimerFromServer(data);
      } else if (data.currentTurn !== undefined) {
        // Even without timer fields, update the turn sync ref
        timerSyncedForTurnRef.current = data.currentTurn;
        console.log(`⏱️ Timer synced for turn (state update): ${data.currentTurn}`);
      }
      // ====================================================
      
      // Enhanced teams processing with ULTRA-ROBUST budget preservation
      const teamsData = data.teams || data.entries || data.participants || [];
      let processedTeams = [];
      
      if (Array.isArray(teamsData) && teamsData.length > 0) {
        console.log('🔄 Processing', teamsData.length, 'teams');
        
        // CRITICAL: Sort teams by draftPosition FIRST to ensure consistent ordering
        // This prevents visual bugs when server returns teams in different order
        const sortedTeamsData = [...teamsData].sort((a, b) => {
          const posA = a.draftPosition ?? 999;
          const posB = b.draftPosition ?? 999;
          return posA - posB;
        });
        
        console.log('🔄 Teams sorted by draftPosition:', sortedTeamsData.map(t => ({
          name: t.name || t.username,
          draftPosition: t.draftPosition
        })));
        
        processedTeams = sortedTeamsData.map((team, index) => {
          const teamUserId = getUserId(team);
          const teamEntryId = team.entryId || team.entry_id || team.id;
          
          // Find existing team to preserve roster and budget data
          const existingTeam = currentState.teams?.find(t => getUserId(t) === teamUserId);
          
          // Process new roster with enhanced logic
          const rawRoster = team.roster || team.picks || [];
          const newRoster = processRosterData(rawRoster);
          
          // Intelligent merging - ALWAYS merge, never overwrite with less data
          let finalRoster = {};
          const existingRosterCount = Object.values(existingTeam?.roster || {}).filter(p => p?.name).length;
          const newRosterCount = Object.values(newRoster || {}).filter(p => p?.name).length;
          // Intelligent roster merging
          if (existingRosterCount > 0 || newRosterCount > 0) {
            if (existingRosterCount >= newRosterCount) {
              // Existing has more or equal - prioritize existing, merge in any new
              finalRoster = mergeRosterData(existingTeam?.roster || {}, newRoster);
              console.log(`🔀 Roster merge: kept existing (${existingRosterCount} players) + merged new (${newRosterCount} players)`);
            } else {
              // New has more - prioritize new, merge in any existing
              finalRoster = mergeRosterData(newRoster, existingTeam?.roster || {});
              console.log(`🔀 Roster merge: used new (${newRosterCount} players) + merged existing (${existingRosterCount} players)`);
            }
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
      
      // Calculate time remaining from server sync or use provided value
      const syncedTimeRemaining = data.turnStartedAt ? calculateTimeRemaining() : 
        (data.timeRemaining !== undefined ? data.timeRemaining : 
        (data.timeLimit !== undefined ? data.timeLimit : 30));
      
      dispatch(updateDraftState({
        ...data,
        teams: shouldUpdateTeams ? processedTeams : undefined,
        status: data.status || (data.currentTurn > 0 ? 'active' : 'waiting'),
        currentDrafter: data.currentDrafter || data.currentPlayer || null,
        isMyTurn: calculatedIsMyTurn || false,
        playerBoard: data.playerBoard || currentState.playerBoard,
        timeRemaining: syncedTimeRemaining
      }));
    };

    // UPDATED: handleDraftTurn with TIMER SYNC
    const handleDraftTurn = (data) => {
      console.log('🎯 Draft turn:', data);
      if (data.roomId !== roomId) return;
      
      // ==================== TIMER SYNC ====================
      // Reset timer refs for new turn
      if (data.turnStartedAt || data.serverTime || data.timeLimit) {
        syncTimerFromServer(data);
      } else {
        // Fallback: reset timer to full time limit
        turnStartedAtRef.current = Date.now();
        timeLimitRef.current = data.timeLimit || data.timeRemaining || 30;
        // CRITICAL: Also update turn sync ref in fallback
        if (data.currentTurn !== undefined) {
          timerSyncedForTurnRef.current = data.currentTurn;
          console.log(`⏱️ Timer synced for turn (fallback): ${data.currentTurn}`);
        }
      }
      // ====================================================
      
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

    // FIXED: Enhanced player picked handler with duplicate prevention and TIMER SYNC
    const handlePlayerPicked = (data) => {
      console.log('✅ Player picked event:', data);
      
      if (data.roomId !== roomId) return;
      
      // Mark time of pick for debouncing draft-state updates
      lastPickTimeRef.current = Date.now();
      
      // CRITICAL: Prevent duplicate picks
      // This can happen when pre-select and auto-pick both fire
      const incomingTurn = data.currentTurn !== undefined ? data.currentTurn : data.turn;
      const incomingPickNumber = data.pickNumber || (incomingTurn !== undefined ? incomingTurn + 1 : null);
      
      if (incomingPickNumber) {
        // Check if we already have a pick for this pickNumber
        const existingPick = picks?.find(p => p.pickNumber === incomingPickNumber && p.player);
        if (existingPick) {
          console.log(`⚠️ Ignoring duplicate player-picked event for pick ${incomingPickNumber} - already have ${existingPick.player?.name}`);
          return;
        }
      }
      
      // Clear picking state
      setIsPicking(false);
      if (pickTimeoutRef.current) {
        clearTimeout(pickTimeoutRef.current);
        pickTimeoutRef.current = null;
      }
      
      // ==================== TIMER SYNC ====================
      // Sync timer for the next turn
      if (data.turnStartedAt || data.serverTime) {
        syncTimerFromServer(data);
      }
      // ====================================================
      
      // CRITICAL: Add pick to picks array for LiveDraftFeed real-time updates
      const pickNumber = data.pickNumber || data.currentTurn + 1 || (picks?.length || 0) + 1;
      dispatch(addPick({
        pickNumber,
        turn: data.currentTurn,
        player: data.player,
        rosterSlot: data.roster_slot || data.slot || data.position,
        teamIndex: data.teamIndex,
        userId: data.userId || data.user_id,
        isAutoPick: data.isAutoPick,
        timestamp: data.timestamp || new Date().toISOString()
      }));
      
      // CRITICAL: Resolve teamIndex robustly - fallback to userId lookup
      let resolvedTeamIndex = data.teamIndex;
      if (resolvedTeamIndex === undefined && data.draftPosition !== undefined) {
        resolvedTeamIndex = data.draftPosition;
      }
      if (resolvedTeamIndex === undefined) {
        const pickedUserId = data.userId || data.user_id;
        const liveTeams = store.getState().draft.teams;
        if (pickedUserId && liveTeams) {
          const idx = liveTeams.findIndex(t => getUserId(t) === pickedUserId);
          if (idx !== -1) resolvedTeamIndex = idx;
        }
      }
      console.log('🔍 Resolved teamIndex:', resolvedTeamIndex, 'from:', { teamIndex: data.teamIndex, draftPosition: data.draftPosition, userId: data.userId });

      // CRITICAL: Update player board to mark as drafted
      // Look up equipped_stamp by userId (order-independent) from event payload
      const stampUserId = data.userId || data.user_id;
      const eventTeamForStamp = data.teams?.find(t => 
        (t.userId || t.user_id || t.id) === stampUserId
      );
      
      if (data.row !== undefined && data.col !== undefined) {
        dispatch(updatePlayerBoardCell({
          row: data.row,
          col: data.col,
          updates: {
            drafted: true,
            draftedBy: resolvedTeamIndex,
            draftedAtTurn: data.currentTurn || currentTurn,
            pickNumber: pickNumber,
            draftedToPosition: data.roster_slot || data.slot || data.position,
            // Store equipped_stamp directly on cell for first-render timing
            equippedStamp: eventTeamForStamp?.equipped_stamp || store.getState().draft.teams?.[resolvedTeamIndex]?.equipped_stamp || null
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
      
      // ==================== TIMER SYNC ====================
      if (data.turnStartedAt || data.serverTime) {
        syncTimerFromServer(data);
      }
      // ====================================================
      
      // CRITICAL: Add a skip marker to the picks array so LiveDraftFeed knows this turn was skipped
      const skippedPickNumber = data.skippedTurn !== undefined ? data.skippedTurn + 1 : 
                                data.currentTurn !== undefined ? data.currentTurn : 
                                (picks?.length || 0) + 1;
      
      dispatch(addPick({
        pickNumber: skippedPickNumber,
        turn: data.skippedTurn || (data.currentTurn - 1),
        skipped: true,
        isSkipped: true,
        reason: data.reason || 'no_budget',
        userId: data.userId || data.skippedUserId,
        teamIndex: data.teamIndex,
        timestamp: new Date().toISOString()
      }));
      
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
        const countdownValue = data.countdown || data.countdownTime || data.time || data.seconds || 5;
        dispatch(updateDraftState({
          status: 'countdown',
          countdownTime: countdownValue
        }));
      }
    };

    // ✅ FIXED handleDraftComplete function with saving logic
    const handleDraftComplete = async (data) => {
      console.log('🎉🎉🎉 DRAFT COMPLETE EVENT RECEIVED 🎉🎉🎉');
      console.log('Data:', data);
      console.log('Room ID match:', data.roomId === roomId);
      console.log('Entry ID from Redux:', entryId);
      
      // Stop timer on draft complete
      stopTimerInterval();
      
      if (data.roomId === roomId) {
        // CRITICAL: Read teams from Redux store, NOT from closure (stale closure fix)
        const currentReduxState = store.getState().draft;
        const currentTeams = currentReduxState.teams || [];
        const backendTeams = data.teams || data.entries || [];
        
        // Check if Redux teams have actual roster data (not just empty objects)
        const reduxHasRosters = currentTeams.some(team => 
          team.roster && Object.values(team.roster).some(p => p?.name)
        );
        const backendHasRosters = backendTeams.some(team =>
          team.roster && Object.values(team.roster).some(p => p?.name)
        );
        
        console.log('📊 handleDraftComplete teams check:', {
          reduxTeamsCount: currentTeams.length,
          backendTeamsCount: backendTeams.length,
          reduxHasRosters,
          backendHasRosters,
          reduxTeam0RosterKeys: currentTeams[0]?.roster ? Object.keys(currentTeams[0].roster) : 'none',
          backendTeam0RosterKeys: backendTeams[0]?.roster ? Object.keys(backendTeams[0].roster) : 'none'
        });
        
        // FIXED: Use whichever source has actual roster data
        // Prefer Redux if it has rosters (from player-picked events), otherwise use backend
        const sourceTeams = reduxHasRosters ? currentTeams : (backendHasRosters ? backendTeams : currentTeams);
        
        console.log('📊 Source teams for completion:', sourceTeams.map(t => ({
          name: t.name || t.username,
          rosterKeys: t.roster ? Object.keys(t.roster) : [],
          rosterPlayers: t.roster ? Object.values(t.roster).filter(p => p?.name).map(p => p.name) : []
        })));
        
        const completedTeams = sourceTeams.map((team, index) => {
          // Find matching backend team for any additional data
          const backendTeam = backendTeams.find(t => getUserId(t) === getUserId(team)) || backendTeams[index] || {};
          
          // Preserve existing roster from Redux, or process backend roster
          const existingRoster = team.roster || {};
          const hasExistingRoster = Object.values(existingRoster).some(p => p?.name);
          
          console.log(`📊 Team ${team.name || team.username} roster check:`, {
            hasExistingRoster,
            existingKeys: Object.keys(existingRoster),
            backendKeys: backendTeam.roster ? Object.keys(backendTeam.roster) : []
          });
          
          return {
            ...team,
            ...backendTeam, // Merge any backend data
            userId: getUserId(team),
            entryId: team.entryId || team.entry_id || backendTeam.entryId || backendTeam.entry_id || team.id,
            // CRITICAL: Keep existing roster if it has data
            roster: hasExistingRoster ? existingRoster : processRosterData(backendTeam.roster || backendTeam.picks || {}),
            budget: team.budget !== undefined ? team.budget : 15,
            bonus: team.bonus || 0,
            color: team.color || ['green', 'red', 'blue', 'yellow', 'purple'][index % 5]
          };
        });
        
        // Preserve sport from current state or infer from playerBoard/roster
const inferSport = () => {
  if (currentReduxState?.sport) return currentReduxState.sport;
  if (currentReduxState?.contestData?.sport) return currentReduxState.contestData.sport;
  if (data.sport) return data.sport;
  
  // Infer from playerBoard
  const board = currentReduxState?.playerBoard || data.playerBoard;
  if (board?.[0]?.[0]?.position) {
    const pos = board[0][0].position.toUpperCase();
    if (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) return 'nba';
    if (['QB', 'RB', 'WR', 'TE'].includes(pos)) return 'nfl';
  }
  
  // Infer from roster keys
  const anyRoster = sourceTeams[0]?.roster;
  if (anyRoster) {
    const keys = Object.keys(anyRoster).map(k => k.toUpperCase());
    if (keys.some(k => ['PG', 'SG', 'SF', 'PF', 'C'].includes(k))) return 'nba';
  }
  
  return 'nfl';
};
const completedSport = inferSport();
console.log('🏀 Inferred sport for completion:', completedSport);
        
        console.log('📊 Completed teams with rosters:', completedTeams.map(t => ({
          name: t.name,
          rosterPlayers: Object.values(t.roster || {}).filter(p => p?.name).map(p => p.name)
        })));
        
        dispatch(updateDraftState({
          status: 'completed',
          showResults: true,
          teams: completedTeams,
          sport: completedSport
        }));
        
        console.log('🏀 Draft complete - sport preserved:', completedSport);
        
        // ✅ CRITICAL: SAVE THE COMPLETED DRAFT TO BACKEND
        try {
          const myTeam = completedTeams.find(t => getUserId(t) === currentUserId);
          // Read entryId from Redux store too (stale closure fix)
          const reduxEntryId = currentReduxState.entryId;
          const myEntryId = reduxEntryId || myTeam?.entryId || data.entryId;
          
          console.log('💾 Attempting to save draft...');
          console.log('My team:', myTeam);
          console.log('Entry ID options:', {
            fromRedux: reduxEntryId,
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
              entryId: reduxEntryId,
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

    // UPDATED: handleTimerUpdate with TIMER SYNC
    const handleTimerUpdate = (data) => {
      if (data.roomId === roomId) {
        // ==================== TIMER SYNC ====================
        if (data.turnStartedAt || data.serverTime) {
          syncTimerFromServer(data);
        } else if (data.timeRemaining !== undefined) {
          // Fallback to direct time remaining
          dispatch(updateTimer(data.timeRemaining));
        }
        // ====================================================
      }
    };

    // NEW: Handle timer-sync event specifically for re-syncing stalled timers
    const handleTimerSync = (data) => {
      console.log('⏱️ Timer sync event received:', data);
      if (data.roomId === roomId) {
        syncTimerFromServer(data);
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
    socketService.on('timer-sync', handleTimerSync);

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
      socketService.off('timer-sync', handleTimerSync);
    };
  }, [socketConnected, roomId, dispatch, getUserId, currentUserId, processRosterData, mergeRosterData, standardizeSlotName, toast, teams, currentTurn, picks, calculateTotalSpent, requestDraftState, entryId, syncTimerFromServer, stopTimerInterval, calculateTimeRemaining, draftState, contestData, sport]);

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
    if (sportConfig.flexEligible.length > 0 && !getPlayerFromRoster(roster, 'FLEX') && sportConfig.flexEligible.includes(playerPos)) {
      availableSlots.push('FLEX');
    }

    return availableSlots;
  };

  // AUTO-PICK: Handle auto-pick when timer expires
  const handleAutoPick = useCallback(() => {
    if (!actualIsMyTurn || isPicking) {
      console.log(`🤖 Auto-pick cancelled: actualIsMyTurn=${actualIsMyTurn}, isPicking=${isPicking}`);
      return;
    }
    
    // Synchronous ref-based debounce to prevent double picks
    const now = Date.now();
    if (autoPickTriggeredRef.current > now - 2000) {
      console.log(`🤖 Auto-pick debounced (fired ${now - autoPickTriggeredRef.current}ms ago)`);
      return;
    }
    autoPickTriggeredRef.current = now;
    
    if (!myTeam || !playerBoard) {
      console.log(`🤖 Auto-pick cancelled: missing team or player board`);
      return;
    }
    
    console.log(`🤖 Frontend auto-pick triggered for ${myTeam.name} at turn ${currentTurn}`);
    
    // MOBILE: Check if user has a pre-selected player (in Redux state OR localStorage)
    let preSelectedPlayer = mobileSelectedPlayer;
    
    // If no Redux state, check localStorage (for reconnect scenario)
    if (!preSelectedPlayer && isMobile && roomId) {
      try {
        const savedPreSelect = localStorage.getItem(`preselect_${roomId}`);
        if (savedPreSelect) {
          preSelectedPlayer = JSON.parse(savedPreSelect);
          console.log(`🤖 Mobile: Found pre-selection in localStorage: ${preSelectedPlayer.name}`);
        }
      } catch (e) {
        console.warn('Failed to read pre-selection from localStorage:', e);
      }
    }
    
    if (isMobile && preSelectedPlayer) {
      const currentPlayerState = playerBoard[preSelectedPlayer.row]?.[preSelectedPlayer.col];
      
      // If player was drafted by someone else, clear selection immediately
      if (!currentPlayerState || currentPlayerState.drafted) {
        console.log(`🤖 Mobile: Pre-selected player ${preSelectedPlayer.name} was already drafted, clearing and using algorithm`);
        wasPlayerDraftedRef.current = true; // Don't emit clear-pre-select, backend handles this
        clearSelection();
        // Clear localStorage too
        try { localStorage.removeItem(`preselect_${roomId}`); } catch (e) {}
        // DON'T return - fall through to algorithm
      } else {
        // Player is still available - draft them
        console.log(`🤖 Mobile: Auto-drafting pre-selected player: ${preSelectedPlayer.name} at [${preSelectedPlayer.row}][${preSelectedPlayer.col}]`);
        wasPlayerDraftedRef.current = true; // Don't emit clear-pre-select, we're using the pre-selection
        clearSelection();
        // Clear localStorage too
        try { localStorage.removeItem(`preselect_${roomId}`); } catch (e) {}
        selectPlayer(preSelectedPlayer.row, preSelectedPlayer.col);
        return;
      }
    }
    
    // Desktop / no mobile selection / pre-selection was invalid: Use algorithm
    const autoPick = findAutoPick(myTeam, playerBoard);
    
    if (autoPick) {
      console.log(`🤖 Auto-selecting: ${autoPick.player.name} -> ${autoPick.targetSlot}`);
      selectPlayer(autoPick.row, autoPick.col);
    } else {
      console.log(`🤖 No valid auto-pick available, skipping turn`);
      dispatch(skipTurn({ roomId, reason: 'no_valid_autopick' }));
    }
  }, [actualIsMyTurn, isPicking, myTeam, playerBoard, findAutoPick, selectPlayer, dispatch, roomId, isMobile, mobileSelectedPlayer, clearSelection, currentTurn]);

  // Handle skip turn
  const handleSkipTurn = useCallback(() => {
    if (!actualIsMyTurn || isPicking) return;
    dispatch(skipTurn({ roomId, reason: 'manual_skip' }));
  }, [actualIsMyTurn, roomId, dispatch, isPicking]);

  // ==================== MOBILE HANDLERS ====================
  
  // RESTORE PRE-SELECTION VISUAL from localStorage
  // If we have no visual selection but localStorage has one (e.g. after reconnect),
  // restore the highlight. This runs once when conditions are met.
  const preSelectRestoredRef = useRef(false);
  useEffect(() => {
    // Skip if not mobile or already have selection or missing data
    if (!isMobile || mobileSelectedPlayer || !playerBoard || !roomId) {
      return;
    }
    
    // Only attempt restore once per mount
    if (preSelectRestoredRef.current) {
      return;
    }
    
    try {
      const savedPreSelect = localStorage.getItem(`preselect_${roomId}`);
      if (!savedPreSelect) return;
      
      const player = JSON.parse(savedPreSelect);
      const boardPlayer = playerBoard[player.row]?.[player.col];
      
      // Only restore if the player hasn't been drafted
      if (boardPlayer && !boardPlayer.drafted) {
        console.log('📱 [Restore] Restoring pre-selection visual:', player.name);
        preSelectRestoredRef.current = true;
        mobileSelectPlayer(player, player.row, player.col);
        // Dismiss the confirm modal - we just want the highlight, not the popup
        setTimeout(() => dismissModal(), 50);
      }
    } catch (e) {
      // Ignore errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, mobileSelectedPlayer, playerBoard, roomId]); // Intentionally exclude mobileSelectPlayer/dismissModal to prevent re-running
  
  // Reset restore flag when roomId changes (new draft)
  useEffect(() => {
    preSelectRestoredRef.current = false;
  }, [roomId]);

  // Clear mobile selection when the selected player gets drafted by someone else
  // NOTE: Don't emit clear-pre-select here - backend will handle its own cleanup
  useEffect(() => {
    if (!mobileSelectedPlayer || !playerBoard) return;
    
    const { row, col } = mobileSelectedPlayer;
    const currentPlayerState = playerBoard[row]?.[col];
    
    if (currentPlayerState?.drafted) {
      console.log('📱 Pre-selected player was drafted by someone else, clearing selection (no server emit)');
      wasPlayerDraftedRef.current = true; // Mark as drafted, don't emit clear-pre-select
      clearSelection();
    }
  }, [playerBoard, mobileSelectedPlayer, clearSelection]);

  // Also clear selection when picks array changes (backup check)
  // NOTE: Don't emit clear-pre-select here - the pick succeeded, backend already used the pre-selection
  useEffect(() => {
    if (!mobileSelectedPlayer || !picks || picks.length === 0) return;
    
    // Check if the most recent pick matches our selection
    const lastPick = picks[picks.length - 1];
    if (lastPick?.player?.name === mobileSelectedPlayer.name) {
      console.log('📱 Pre-selected player appears in picks, clearing selection (no server emit)');
      wasPlayerDraftedRef.current = true; // Mark as drafted, don't emit clear-pre-select
      clearSelection();
    }
  }, [picks, mobileSelectedPlayer, clearSelection]);

  // SYNC PRE-SELECTION STATE TO SERVER
  // When selection changes, emit to server so autoPick can use it if user disconnects
  // BUT: Don't emit clear-pre-select if the player was drafted (backend handles cleanup)
  // AND: Don't emit on initial mount/reconnect (would clear valid server-side pre-selection)
  // NOTE: We do NOT clear localStorage here - that happens only when pre-selection is actually used
  useEffect(() => {
    // Skip on initial mount - this prevents clearing server-side pre-selection on reconnect
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      mobileSelectedPlayerPrevRef.current = mobileSelectedPlayer;
      return;
    }
    
    const wasSelected = mobileSelectedPlayerPrevRef.current;
    mobileSelectedPlayerPrevRef.current = mobileSelectedPlayer;
    
    // If we HAD a selection and now we don't, check if we should clear on server
    if (wasSelected && !mobileSelectedPlayer && roomId && currentUserId) {
      // Only emit clear-pre-select if user intentionally cleared (not because player was drafted)
      if (wasPlayerDraftedRef.current) {
        console.log('📱 Skipping clear-pre-select - player was drafted, backend handles cleanup');
        wasPlayerDraftedRef.current = false; // Reset for next selection
      } else {
        // User intentionally cleared - clear server (localStorage cleared elsewhere when actually used)
        socketService.emit('clear-pre-select', {
          roomId,
          userId: currentUserId
        });
        console.log('📱 Emitted clear-pre-select to server');
      }
    }
  }, [mobileSelectedPlayer, roomId, currentUserId]);

  // Handle mobile player tap - opens confirmation modal
  // Allow tapping anytime for preview/pre-selection, not just on turn
  const handleMobilePlayerTap = useCallback((player, rowIndex, colIndex) => {
    
    if (player.drafted || isPicking) {
      console.log('📱 Tap blocked - drafted or picking');
      return;
    }
    
    // Get matchup info for the modal
    const playerWithMeta = {
      ...player,
      row: rowIndex,
      col: colIndex,
      matchup: player.matchup || null
    };
    
    mobileSelectPlayer(playerWithMeta, rowIndex, colIndex);
    
    // EMIT PRE-SELECTION TO SERVER for persistence across disconnect
    if (roomId && currentUserId) {
      const preSelectData = {
        roomId,
        userId: currentUserId,
        player: {
          name: player.name,
          team: player.team,
          position: player.position,
          price: player.price,
          row: rowIndex,
          col: colIndex
        }
      };
      socketService.emit('pre-select', preSelectData);
      
      // ALSO save to localStorage for persistence across page refresh/reconnect
      try {
        localStorage.setItem(`preselect_${roomId}`, JSON.stringify(preSelectData.player));
      } catch (e) {
        console.warn('Failed to save pre-select to localStorage:', e);
      }
    } else {
      console.log('📱 CANNOT emit pre-select - missing:', { roomId, currentUserId });
    }
  }, [isPicking, mobileSelectPlayer, roomId, currentUserId]);

  // Handle mobile draft confirmation
  const handleMobileConfirm = useCallback((player) => {
    if (!player || isPicking || !actualIsMyTurn) return;
    
    console.log('📱 Mobile confirm - drafting:', player.name);
    wasPlayerDraftedRef.current = true; // Don't emit clear-pre-select, backend clears on make-pick
    clearSelection(); // Clear BEFORE pick to prevent race conditions
    dismissModal();
    selectPlayer(player.row, player.col);
  }, [isPicking, actualIsMyTurn, dismissModal, selectPlayer, clearSelection]);

  // Handle player card click (desktop vs mobile)
  const handlePlayerCardClick = useCallback((player, rowIndex, colIndex) => {
    
    if (player.drafted || isPicking) return;
    
    if (isMobile) {
      // Mobile: Always allow tap for preview/pre-selection
      handleMobilePlayerTap(player, rowIndex, colIndex);
    } else {
      // Desktop: Only allow on your turn
      if (actualIsMyTurn) {
        selectPlayer(rowIndex, colIndex);
      }
    }
  }, [isMobile, actualIsMyTurn, isPicking, handleMobilePlayerTap, selectPlayer]);
  
  // ===========================================================

  // Handle return to lobby
  const handleReturnToLobby = useCallback(() => {
    // Reset module-level tracking when intentionally leaving
    moduleInitializedRoomId = null;
    moduleLastInitTime = 0;
    stopTimerInterval();
    dispatch(resetDraft());
    navigate('/lobby');
  }, [navigate, dispatch, stopTimerInterval]);

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

  // ==================== TIMER EFFECT - Server-Synced ====================
  // Start/stop timer interval based on draft status
  useEffect(() => {
    if (status === 'active') {
      startTimerInterval();
    } else {
      stopTimerInterval();
    }
    
    return () => {
      stopTimerInterval();
    };
  }, [status, startTimerInterval, stopTimerInterval]);

  // CRITICAL: Handle mobile wake from lock/app switch - multiple fallbacks
  // Includes heartbeat that detects JS pause (most reliable for app switching)
  useEffect(() => {
    let lastActiveAt = Date.now();
    let lastHeartbeat = Date.now();
    let refreshInProgress = false;
    let heartbeatInterval = null;
    
    const forceRefresh = async (source) => {
      // Debounce - don't refresh more than once per 2 seconds
      if (refreshInProgress) {
        console.log(`👁️ [${source}] Refresh already in progress, skipping`);
        return;
      }
      
      const timeSinceActive = Date.now() - lastActiveAt;
      console.log(`👁️ [${source}] Wake detected after ${Math.round(timeSinceActive/1000)}s`);
      
      refreshInProgress = true;
      lastActiveAt = Date.now();
      lastHeartbeat = Date.now();
      
      // Skip if not in a draft
      if (!roomId || !hasJoinedRef.current) {
        console.log(`👁️ [${source}] Not in active draft, skipping`);
        refreshInProgress = false;
        return;
      }
      
      console.log(`👁️ [${source}] Forcing full refresh...`);
      
      // 1. Recalculate timer immediately
      if (turnStartedAtRef.current) {
        const remaining = calculateTimeRemaining();
        dispatch(updateTimer(remaining));
      }
      
      // 2. Restart timer interval
      stopTimerInterval();
      if (status === 'active') {
        startTimerInterval();
      }
      
      // 3. Force socket reconnect if stale for a while
      if (timeSinceActive > 10000) {
        console.log(`👁️ [${source}] Stale for >10s, forcing socket reconnect...`);
        socketService.disconnect();
        await new Promise(r => setTimeout(r, 200));
        socketService.connect();
        await new Promise(r => setTimeout(r, 500));
      }
      
      // 4. Request fresh state
      const requestState = () => {
        if (socketService.isConnected()) {
          socketService.emit('get-draft-state', { roomId });
          lastSyncTimeRef.current = Date.now();
        }
      };
      
      requestState();
      // Retry once more after a delay in case socket wasn't ready
      setTimeout(requestState, 1000);
      
      // Allow another refresh after 2 seconds
      setTimeout(() => {
        refreshInProgress = false;
      }, 2000);
    };
    
    // HEARTBEAT: Detects JS pause from app switching
    // If interval was supposed to run every 1s but 3+ seconds passed, we were paused
    const startHeartbeat = () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      heartbeatInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - lastHeartbeat;
        
        // If more than 3 seconds since last heartbeat, JS was paused
        if (elapsed > 3000) {
          console.log(`💓 Heartbeat detected ${Math.round(elapsed/1000)}s gap - JS was paused`);
          forceRefresh('heartbeat');
        }
        
        lastHeartbeat = now;
      }, 1000);
    };
    
    startHeartbeat();
    
    // Track when we're active
    const markActive = () => {
      lastActiveAt = Date.now();
      lastHeartbeat = Date.now();
    };
    
    // Event handlers
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('👁️ Tab hidden');
      } else {
        forceRefresh('visibilitychange');
      }
    };
    
    const handleFocus = () => forceRefresh('focus');
    const handlePageShow = (e) => {
      forceRefresh(e.persisted ? 'pageshow-bfcache' : 'pageshow');
    };
    
    // Touch/click as last resort - user is definitely back
    const handleInteraction = () => {
      const timeSinceActive = Date.now() - lastActiveAt;
      if (timeSinceActive > 3000) {
        forceRefresh('interaction');
      } else {
        markActive();
      }
    };
    
    // Register all event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction);
    document.addEventListener('mousemove', markActive, { passive: true });
    document.addEventListener('touchmove', markActive, { passive: true });
    
    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('mousemove', markActive);
      document.removeEventListener('touchmove', markActive);
    };
  }, [status, roomId, calculateTimeRemaining, dispatch, startTimerInterval, stopTimerInterval]);
  // =====================================================================

  // BACKGROUND PAUSE: Toggle class on body to pause CSS animations when hidden
  // Also force reload if user has been away too long (MOBILE ONLY)
  const hiddenAtRef = useRef(null);
  useEffect(() => {
    const handleBackgroundToggle = () => {
      if (document.visibilityState === 'hidden') {
        document.body.classList.add('app-backgrounded');
        hiddenAtRef.current = Date.now();
      } else {
        document.body.classList.remove('app-backgrounded');
        
        // MOBILE ONLY: If gone for more than 60 seconds, force reload for clean state
        if (isMobile && hiddenAtRef.current && (Date.now() - hiddenAtRef.current > 60000)) {
          console.log('📱 Away for 60s+, forcing reload for fresh state...');
          window.location.reload();
          return;
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleBackgroundToggle);
    return () => {
      document.removeEventListener('visibilitychange', handleBackgroundToggle);
      document.body.classList.remove('app-backgrounded');
    };
  }, [isMobile]);
  
  // MOBILE STALL DETECTION: If timer shows 0 for more than 5 seconds without turn advancing, force refresh
  useEffect(() => {
    if (status !== 'active' || timeRemaining > 0) return;
    
    const stallCheckTimer = setTimeout(() => {
      console.log('⚠️ Timer at 0 for 5+ seconds - possible UI stall, requesting fresh state...');
      
      if (socketService.isConnected()) {
        socketService.emit('get-draft-state', { roomId });
        lastSyncTimeRef.current = Date.now();
      } else {
        console.log('⚠️ Socket disconnected during stall check, attempting reconnect...');
        socketService.connect();
      }
    }, 5000);
    
    return () => clearTimeout(stallCheckTimer);
  }, [status, timeRemaining, roomId]);

  // Handle countdown timer decrement (5, 4, 3, 2, 1)
  useEffect(() => {
    if (status === 'countdown' && countdownTime > 0) {
      const timer = setTimeout(() => {
        dispatch(updateDraftState({ countdownTime: countdownTime - 1 }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, countdownTime, dispatch]);

  // AUTO-PICK: Enhanced timer handler with auto-pick
  // Uses isPicking as primary guard, ref as debounce for rapid re-renders
  useEffect(() => {
    if (actualIsMyTurn && status === 'active' && timeRemaining === 0 && !isPicking) {
      // CRITICAL: Only auto-pick if timer was synced for the CURRENT turn
      // This prevents instant auto-picks when turn changes but timer hasn't been reset yet
      if (timerSyncedForTurnRef.current !== currentTurn) {
        console.log(`⏰ Skipping auto-pick - timer not synced for turn ${currentTurn} (synced for turn ${timerSyncedForTurnRef.current})`);
        return;
      }
      
      // Debounce: Don't fire if we just fired in the last 500ms
      const now = Date.now();
      if (autoPickTriggeredRef.current > now - 500) {
        console.log(`⏰ Auto-pick debounced (fired ${now - autoPickTriggeredRef.current}ms ago)`);
        return;
      }
      
      console.log(`⏰ Timer hit 0 at turn ${currentTurn}, actualIsMyTurn=${actualIsMyTurn}, triggering auto-pick`);
      console.log(`⏰ Mobile selected player: ${mobileSelectedPlayer ? mobileSelectedPlayer.name : 'none'}`);
      autoPickTriggeredRef.current = now;
      handleAutoPick();
    }
  }, [actualIsMyTurn, status, timeRemaining, isPicking, handleAutoPick, currentTurn, mobileSelectedPlayer]);

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
    // Use sortedTeams to ensure consistent display regardless of disconnect/reconnect order
    if (!sortedTeams || sortedTeams.length === 0) return null;
    
    const pickNumber = (currentTurn || 0) + 1;
    const round = Math.ceil(pickNumber / sortedTeams.length);
    const expectedTeamIndex = getTeamForPick(pickNumber, sortedTeams.length);
    const expectedTeam = sortedTeams[expectedTeamIndex];
    
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
            if (upcomingPick > sortedTeams.length * 5) return null; // Don't show picks beyond the draft
            const upcomingTeamIndex = getTeamForPick(upcomingPick, sortedTeams.length);
            const upcomingTeam = sortedTeams[upcomingTeamIndex];
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

  // Render results state
  console.log('🔍 RENDER CHECK - status:', status, 'showResults:', showResults, 'currentTurn:', currentTurn);
  if ((showResults || (status === 'completed' && currentTurn > 0)) && status !== 'countdown') {
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
              {sportConfig.positions.map(slot => {
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
      {/* Countdown overlay - shows on top of board */}
      {status === 'countdown' && countdownTime > 0 && (
        <div className="countdown-overlay">
          <div className="countdown-modal">
            <h2>Draft Starting!</h2>
            <div className="countdown-number">{countdownTime}</div>
            <p>Get ready to pick...</p>
          </div>
        </div>
      )}

      {/* MOBILE: Auto-draft bar shows selected player */}
      {isMobile && (
        <AutoDraftBar 
          selectedPlayer={mobileSelectedPlayer}
          visible={!!mobileSelectedPlayer}
          isMyTurn={actualIsMyTurn}
        />
      )}

      {/* LIVE DRAFT FEED - Replaces old DebugDraftOrder */}
      <LiveDraftFeed 
        teams={teams}
        currentTurn={currentTurn}
        picks={picks}
        currentUserId={currentUserId}
        getUserId={getUserId}
        sport={sport}
      />
      
      <div className="draft-header">
        <div className={`timer ${actualIsMyTurn ? 'my-turn' : ''} ${timeRemaining <= 10 ? 'warning' : ''}`}>
          Draft Timer: <span className={`time-value ${showLowTimeWarning ? 'low-time' : ''}`}>{Math.max(0, timeRemaining ?? 30)}s</span>
        </div>
        
        <div className="on-the-clock">
          On The Clock: <span className={actualIsMyTurn ? 'you' : ''}>{currentDrafter?.username || currentDrafter?.name || (sortedTeams?.length > 0 && currentTurn !== undefined ? (sortedTeams[getTeamForPick(currentTurn + 1, sortedTeams.length)]?.name || sortedTeams[getTeamForPick(currentTurn + 1, sortedTeams.length)]?.username) : null) || '...'}</span>
        </div>
        
        <div className="header-budget">
          Your Budget: <span>${safeMyTeam ? (safeMyTeam.budget + (safeMyTeam.bonus || 0)) : 15}</span>
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
                
                // Hide color border if drafter has a unique stamp in the room
                const drafterStamp = teams?.[player.draftedBy]?.equipped_stamp || 'default';
                const hasUniqueStamp = uniqueStamps.has(drafterStamp);
                
                // Check if this is the mobile-selected player
                // Uses memoized localStorage read to avoid 30+ reads per render
                const isMobileSelected = isMobile && (
                  (mobileSelectedPlayer?.row === rowIndex && mobileSelectedPlayer?.col === colIndex) ||
                  (localStoragePreSelection?.row === rowIndex && localStoragePreSelection?.col === colIndex)
                );
                
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`player-card 
                      ${player.drafted ? 'drafted' : ''} 
                      ${(draftedByColor && !hasUniqueStamp) ? `drafted-by-${draftedByColor}` : ''}
                      ${isAutoSuggestion ? 'auto-suggestion' : ''}
                      ${actualIsMyTurn && !player.drafted && !isPicking ? 'clickable' : ''}
                      ${isPicking ? 'disabled' : ''}
                      ${isMobileSelected ? 'mobile-selected' : ''}
                    `}
                    onClick={() => handlePlayerCardClick(player, rowIndex, colIndex)}
                    style={{ 
                      cursor: (!player.drafted && !isPicking && (isMobile || actualIsMyTurn)) ? 'pointer' : 'default',
                      position: 'relative'
                    }}
                  >
                    <div className={`position-badge ${standardizeSlotName(player.originalPosition || player.position)}`}>
                      {standardizeSlotName(player.originalPosition || player.position)}
                    </div>
                    <div className="player-name">
                      {isMobile ? (
                        <>
                          <span className="first-name">{player.name.split(' ')[0]}</span>
                          <span className="last-name">{player.name.split(' ').slice(1).join(' ') || player.name.split(' ')[0]}</span>
                        </>
                      ) : (
                        player.name
                      )}
                    </div>
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
                    {player.drafted && (() => {
                      // Fallback: use draftedByColor to find team index if draftedBy is undefined
                      let teamIndex = player.draftedBy;
                      if (teamIndex === undefined && draftedByColor) {
                        const colorMap = { green: 0, red: 1, blue: 2, yellow: 3, purple: 4 };
                        teamIndex = colorMap[draftedByColor];
                      }
                      const draftedByTeam = teams?.[teamIndex];
                      console.log('🔍 STAMP DEBUG:', {
                        draftedBy: player.draftedBy,
                        draftedByTeam: draftedByTeam?.username,
                        equipped_stamp: draftedByTeam?.equipped_stamp,
                      });
                      const stampId = draftedByTeam?.equipped_stamp || player.equippedStamp;
                      const StampComponent = stampId 
                        ? getStampComponent(stampId)
                        : null;
                      console.log('🔍 StampComponent:', StampComponent);
                      
                      // If they have a stamp, render it
                      if (StampComponent) {
                        console.log('🎨 RENDERING STAMP:', draftedByTeam?.equipped_stamp, 'for', player.name);
                        return (
                          <StampComponent
                            player={{
                              name: player.name,
                              team: player.team,
                              position: player.position,
                              price: player.price
                            }} 
                            pickNumber={player.pickNumber || getTeamPickNumber(player.draftedBy)}
                            showDrafted={true}
                          />
                        );
                      }
                      
                      // Otherwise render the default game piece
                      return (
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
                      );
                    })()}
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
        {/* Mobile: Compact roster bar */}
        {isMobile ? (
          <MobileRosterBar 
            roster={safeMyTeam?.roster}
            budget={safeMyTeam?.budget}
            bonus={safeMyTeam?.bonus}
            positions={sportConfig.positions}
          />
        ) : (
          /* Desktop: Full team view */
          <>
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
                    {sportConfig.positions.map(slot => (
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
          </>
        )}
      </div>

      {/* MOBILE: Confirmation modal */}
      {isMobile && (
        <MobileConfirmModal
          player={mobileSelectedPlayer}
          visible={showConfirmModal}
          onConfirm={handleMobileConfirm}
          onDismiss={dismissModal}
          isMyTurn={actualIsMyTurn}
          timeRemaining={timeRemaining}
        />
      )}

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