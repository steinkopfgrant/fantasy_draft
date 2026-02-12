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
    flexEligible: [],
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

const TEAM_COLORS = ['green', 'red', 'blue', 'yellow', 'purple'];
const VALID_ROSTER_KEYS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'PG', 'SG', 'SF', 'PF', 'C', 'P', '1B', 'OF']);
// =============================================================

// Module-level tracking to survive React remounts
let moduleInitializedRoomId = null;
let moduleLastInitTime = 0;

const DraftScreen = ({ showToast }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // ==================== REFS ====================
  const mountedRef = useRef(true);
  const autoPickTimeoutRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const initializationAttemptedRef = useRef(false);
  const socketHandlersRef = useRef(false);
  const lastPickTimeRef = useRef(0);
  const picksRef = useRef([]);
  const teamsRef = useRef([]);
  const currentTurnRef = useRef(0);
  const autoPickTriggeredRef = useRef(0);
  const timerSyncedForTurnRef = useRef(null);
  const mobileSelectedPlayerPrevRef = useRef(null);
  const wasPlayerDraftedRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const debugLogThrottle = useRef(0);
  const lastStateHash = useRef('');
  const lastSocketRequestTime = useRef(0);
  const preSelectRestoredRef = useRef(false);
  const hiddenAtRef = useRef(null);

  // Timer sync refs
  const turnStartedAtRef = useRef(null);
  const serverTimeOffsetRef = useRef(0);
  const timeLimitRef = useRef(30);
  const timerIntervalRef = useRef(null);
  const lastSyncTimeRef = useRef(0);

  // Pick state
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

  // ==================== TOAST HELPER ====================
  const toast = useCallback((message, type) => {
    if (showToast) {
      showToast(message, type);
    } else {
      console.log(`[${type?.toUpperCase() || 'INFO'}] ${message}`);
      if (type === 'error') alert(message);
    }
  }, [showToast]);

  // ==================== REDUX SELECTORS ====================
  const user = useSelector(selectAuthUser);
  const draftState = useSelector(state => state.draft);
  const {
    status, playerBoard, currentTurn, currentPick, draftOrder, picks,
    timeRemaining, currentDrafter, currentDrafterPosition, userDraftPosition,
    users, connectedPlayers, entryCount, countdownTime, contestData, entryId,
    contestType, myRoster, budget, bonus, teams, selectedPlayer, isMyTurn,
    showResults, currentViewTeam, autoPickEnabled, showAutoPickSuggestion,
    autoPickSuggestion, error
  } = draftState;

  const socketConnected = useSelector(state => state.socket.connected);

  // ==================== CORE HELPERS ====================
  const getUserId = useCallback((userObj) => {
    if (!userObj) return null;
    return userObj.id || userObj._id || userObj.userId || userObj.user_id;
  }, []);

  const currentUserId = getUserId(user);

  const standardizeSlotName = useCallback((slot) => {
    return (slot || '').toString().toUpperCase();
  }, []);

  // ==================== SPORT DETECTION ====================
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

  // ==================== DERIVED STATE ====================
  const calculatedIsMyTurn = currentDrafter && currentUserId &&
    getUserId(currentDrafter) === currentUserId;
  const actualIsMyTurn = isMyTurn || calculatedIsMyTurn;

  const myTeam = useMemo(() => {
    if (!Array.isArray(teams)) return null;
    return teams.find(team => getUserId(team) === currentUserId) || null;
  }, [teams, getUserId, currentUserId]);

  const sortedTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    return [...teams].sort((a, b) => (a.draftPosition ?? 999) - (b.draftPosition ?? 999));
  }, [teams]);

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

  const localStoragePreSelection = useMemo(() => {
    if (!isMobile || mobileSelectedPlayer || !roomId) return null;
    try {
      const saved = localStorage.getItem(`preselect_${roomId}`);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  }, [isMobile, mobileSelectedPlayer, roomId]);

  // ==================== BUDGET / ROSTER HELPERS ====================
  const calculateTotalSpent = useCallback((roster) => {
    if (!roster) return 0;
    return Object.values(roster).reduce((total, player) => {
      return total + (player?.price || 0);
    }, 0);
  }, []);

  const validateAndFixBudget = useCallback((team) => {
    if (!team?.roster) return team;
    const totalSpent = Object.values(team.roster).reduce((sum, p) => sum + (p?.price || 0), 0);
    const calculatedBudget = Math.max(0, 15 - totalSpent);
    const currentBudget = team.budget !== undefined ? team.budget : 15;

    if (totalSpent > 0 && currentBudget === 15) {
      return { ...team, budget: calculatedBudget };
    }
    return team;
  }, []);

  // ==================== ROSTER LOOKUP ====================
  const getPlayerFromRoster = useCallback((roster, slot) => {
    if (!roster || !slot) return null;
    const standardSlot = standardizeSlotName(slot);

    // Direct lookups
    if (roster[standardSlot]?.name) return roster[standardSlot];
    if (roster[slot]?.name) return roster[slot];
    const lowerSlot = slot.toLowerCase();
    if (roster[lowerSlot]?.name) return roster[lowerSlot];

    // Position-based search (skip for FLEX)
    if (standardSlot !== 'FLEX') {
      for (const [, player] of Object.entries(roster)) {
        if (player?.position && standardizeSlotName(player.position) === standardSlot) {
          return player;
        }
      }
    }

    // FLEX: Only return dedicated FLEX entries
    if (standardSlot === 'FLEX') {
      return roster['FLEX'] || roster['flex'] || roster['Flex'] || null;
    }

    return null;
  }, [standardizeSlotName]);

  // ==================== ROSTER PROCESSING ====================
  const processRosterData = useCallback((roster) => {
    if (!roster) return {};
    const standardizedRoster = {};

    if (Array.isArray(roster)) {
      roster.forEach((item, index) => {
        if (item?.name) {
          const slot = standardizeSlotName(item.slot || item.roster_slot || item.position);
          standardizedRoster[slot] = {
            name: item.name,
            position: item.position || item.originalPosition || slot,
            team: item.team || '',
            price: item.price || item.value || item.salary || 0,
            value: item.value || item.price || item.salary || 0,
            playerId: item.playerId || item._id || item.id || `player-${index}`
          };
        }
      });
      return standardizedRoster;
    }

    if (typeof roster === 'object') {
      Object.entries(roster).forEach(([key, value]) => {
        if (!value || typeof value !== 'object' || !value.name) return;
        if (!VALID_ROSTER_KEYS.has(standardizeSlotName(key))) return;

        const slot = standardizeSlotName(key);
        standardizedRoster[slot] = {
          name: value.name,
          position: value.position || value.originalPosition || slot,
          team: value.team || '',
          price: value.price || value.value || value.salary || 0,
          value: value.value || value.price || value.salary || 0,
          playerId: value.playerId || value._id || value.id || `${value.name}-${Date.now()}`
        };
      });
    }

    return standardizedRoster;
  }, [standardizeSlotName]);

  const mergeRosterData = useCallback((oldRoster, newRoster) => {
    const current = processRosterData(oldRoster) || {};
    const incoming = processRosterData(newRoster) || {};
    const merged = { ...current };

    Object.entries(incoming).forEach(([position, player]) => {
      if (!player?.name?.trim()) return;

      // Prevent duplicates across slots
      const alreadyExists = Object.entries(merged).some(([existingSlot, existingPlayer]) =>
        existingSlot !== position && existingPlayer?.name === player.name
      );
      if (alreadyExists) return;

      merged[position] = player;
    });

    return merged;
  }, [processRosterData]);

  // ==================== SNAKE DRAFT HELPERS ====================
  const getTeamForPick = useCallback((pickNumber, totalTeams = 5) => {
    if (pickNumber < 1) return 0;
    const round = Math.ceil(pickNumber / totalTeams);
    const positionInRound = ((pickNumber - 1) % totalTeams) + 1;
    return round % 2 === 1
      ? positionInRound - 1
      : totalTeams - positionInRound;
  }, []);

  const getPicksForTeam = useCallback((teamIndex, totalTeams = 5, totalRounds = 5) => {
    const picks = [];
    for (let round = 1; round <= totalRounds; round++) {
      const pickInRound = round % 2 === 1 ? teamIndex + 1 : totalTeams - teamIndex;
      picks.push((round - 1) * totalTeams + pickInRound);
    }
    return picks;
  }, []);

  const validateDraftOrder = useCallback((turn, teamsArr) => {
    if (!teamsArr?.length) return true;
    const pickNumber = turn + 1;
    const expectedTeamIndex = getTeamForPick(pickNumber, teamsArr.length);
    const actualDraftingTeam = teamsArr.find(team => getUserId(team) === getUserId(currentDrafter));
    if (!actualDraftingTeam) return false;
    return expectedTeamIndex === teamsArr.indexOf(actualDraftingTeam);
  }, [getTeamForPick, getUserId, currentDrafter]);

  const getExpectedNextDrafter = useCallback((turn, teamsArr) => {
    if (!teamsArr?.length) return null;
    return teamsArr[getTeamForPick(turn + 1, teamsArr.length)] || null;
  }, [getTeamForPick]);

  const getTeamPickNumber = (teamIndex) => {
    if (!teams?.[teamIndex]) return '';
    const roster = teams[teamIndex].roster || {};
    return Object.values(roster).filter(p => p?.name).length || '';
  };

  // ==================== AUTO-PICK ALGORITHM ====================
  const findAutoPick = useCallback((team, board) => {
    if (!board || !Array.isArray(board)) return null;

    const roster = team.roster || {};
    const totalBudget = Math.max(0, team.budget || 0) + (team.bonus || 0);
    const availableSlots = sportConfig.positions.filter(slot => !getPlayerFromRoster(roster, slot));

    if (availableSlots.length === 0) return null;

    const prioritizedSlots = sportConfig.slotPriority.filter(slot => availableSlots.includes(slot));

    for (const targetSlot of prioritizedSlots) {
      let bestPlayer = null, bestRow = -1, bestCol = -1, highestPrice = -1;

      for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
          const player = board[row][col];
          if (!player?.name || player.drafted || !player.position || player.price > totalBudget) continue;

          const playerPosition = standardizeSlotName(player.position);
          const canFillSlot = targetSlot === playerPosition ||
            (targetSlot === 'FLEX' && sportConfig.flexEligible.includes(playerPosition));

          if (canFillSlot && player.price > highestPrice) {
            bestPlayer = player;
            bestRow = row;
            bestCol = col;
            highestPrice = player.price;
          }
        }
      }

      if (bestPlayer) {
        console.log(`🤖 Auto-pick: ${bestPlayer.name} (${bestPlayer.position}) → ${targetSlot} for $${highestPrice}`);
        return { row: bestRow, col: bestCol, player: bestPlayer, targetSlot, price: highestPrice };
      }
    }

    return null;
  }, [standardizeSlotName, sportConfig, getPlayerFromRoster]);

  // ==================== THROTTLED STATE REQUEST ====================
  const requestDraftState = useCallback(() => {
    const now = Date.now();
    if (now - lastSocketRequestTime.current > 500) {
      lastSocketRequestTime.current = now;
      socketService.emit('get-draft-state', { roomId });
    }
  }, [roomId]);

  // ==================== TIMER SYNC FUNCTIONS ====================
  const calculateTimeRemaining = useCallback(() => {
    if (!turnStartedAtRef.current || !timeLimitRef.current) {
      return timeLimitRef.current || 30;
    }
    const adjustedNow = Date.now() + serverTimeOffsetRef.current;
    const elapsed = Math.floor((adjustedNow - turnStartedAtRef.current) / 1000);
    return Math.max(0, timeLimitRef.current - elapsed);
  }, []);

  const syncTimerFromServer = useCallback((data) => {
    const { turnStartedAt, serverTime, timeLimit, timeRemaining: serverTimeRemaining, currentTurn: syncedTurn } = data;

    if (serverTime) {
      const newOffset = serverTime - Date.now();
      if (Math.abs(newOffset - serverTimeOffsetRef.current) > 100) {
        serverTimeOffsetRef.current = newOffset;
      }
    }

    if (turnStartedAt) turnStartedAtRef.current = turnStartedAt;
    if (timeLimit !== undefined) timeLimitRef.current = timeLimit;
    if (syncedTurn !== undefined) timerSyncedForTurnRef.current = syncedTurn;

    const calculatedRemaining = calculateTimeRemaining();
    const finalRemaining = turnStartedAtRef.current ? calculatedRemaining : (serverTimeRemaining || 30);

    dispatch(updateTimer(finalRemaining));
    lastSyncTimeRef.current = Date.now();
    return finalRemaining;
  }, [calculateTimeRemaining, dispatch]);

  const startTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    timerIntervalRef.current = setInterval(() => {
      if (status !== 'active') return;

      const remaining = calculateTimeRemaining();
      dispatch(updateTimer(remaining));

      // Re-sync with server every 3 seconds
      if (Date.now() - lastSyncTimeRef.current > 3000) {
        socketService.emit('get-draft-state', { roomId });
        lastSyncTimeRef.current = Date.now();
      }
    }, 250);
  }, [status, calculateTimeRemaining, dispatch, roomId]);

  const stopTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // ==================== STATE HASH FOR DEBUG ====================
  const createStateHash = useCallback(() => {
    if (!teams?.[0]) return 'empty';
    const rosterKeys = Object.keys(teams[0].roster || {}).sort();
    return `${rosterKeys.join(',')}-${teams[0].budget}-${currentTurn}-${status}`;
  }, [teams, currentTurn, status]);

  // Sync refs for socket handlers
  useEffect(() => { picksRef.current = picks; }, [picks]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { currentTurnRef.current = currentTurn; }, [currentTurn]);

  // Debug logging (throttled, only on actual state changes)
  useEffect(() => {
    const currentHash = createStateHash();
    const now = Date.now();
    if (currentHash !== lastStateHash.current && now - debugLogThrottle.current > 1000) {
      debugLogThrottle.current = now;
      lastStateHash.current = currentHash;
      console.log('🐛 Draft State:', {
        status, isMyTurn: actualIsMyTurn, isPicking, currentUserId, entryId,
        myTeam: myTeam ? { name: myTeam.name, budget: myTeam.budget, players: Object.values(myTeam.roster || {}).map(p => p?.name).filter(Boolean) } : null,
      });
    }
  }, [createStateHash, status, actualIsMyTurn, myTeam, currentUserId, isPicking, entryId]);

  // ==================== INITIALIZATION ====================
  useEffect(() => {
    console.log('=== DRAFT SCREEN MOUNTED ===', { roomId, status });
    mountedRef.current = true;

    if (!user || !roomId) {
      toast('Missing required data', 'error');
      navigate('/lobby');
      return;
    }

    const now = Date.now();

    // FIX 1: Reset module tracking if switching rooms
    if (moduleInitializedRoomId && moduleInitializedRoomId !== roomId) {
      console.log('🔄 Different room, resetting module tracking');
      moduleInitializedRoomId = null;
      moduleLastInitTime = 0;
    }

    // FIX 2: Reduced cooldown (was 5000ms, now 1500ms)
    const recentlyInitialized = moduleInitializedRoomId === roomId && (now - moduleLastInitTime) < 1500;

    if (recentlyInitialized) {
      console.log('⏭️ Recently initialized this room, requesting fresh state only');
      if (socketConnected) socketService.emit('get-draft-state', { roomId });
      return;
    }

    // FIX 3: If existing state is for a DIFFERENT room, reset it
    const currentDraftState = store.getState().draft;
    const existingRoomId = currentDraftState?.roomId || currentDraftState?.contestData?.roomId;

    if (currentDraftState?.status !== 'idle' && existingRoomId && existingRoomId !== roomId) {
      console.log('🔄 Stale state from different room, resetting');
      dispatch(resetDraft());
    }

    // FIX 3 CONTINUED: Removed the hasExistingDraftState early return.
    // Since we now properly resetDraft() on unmount, we always do a full init.
    // This prevents stale state when bouncing between drafts via notifications.

    if (initializationAttemptedRef.current) {
      console.log('⏭️ Initialization already attempted');
      return;
    }

    initializationAttemptedRef.current = true;
    moduleInitializedRoomId = roomId;
    moduleLastInitTime = now;
    console.log('🚀 Starting draft initialization...');

    dispatch(initializeDraft({ roomId, userId: currentUserId }))
      .unwrap()
      .then((result) => {
        console.log('✅ Draft initialized');
        hasJoinedRef.current = false;
        if (socketConnected && mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) socketService.emit('get-draft-state', { roomId });
          }, 100);
        }
      })
      .catch((err) => {
        console.error('❌ Init failed:', err);
        moduleInitializedRoomId = null;
        
        // On timeout, retry instead of giving up (PWA resume scenario)
        if (err?.message?.includes('timeout') && mountedRef.current) {
          console.log('🔄 Init timed out, retrying after reconnect...');
          initializationAttemptedRef.current = false;
          
          // Wait for socket to reconnect, then retry
          const retryTimer = setTimeout(() => {
            if (mountedRef.current && socketConnected) {
              console.log('🔄 Retrying draft initialization...');
              initializationAttemptedRef.current = true;
              moduleInitializedRoomId = roomId;
              moduleLastInitTime = Date.now();
              dispatch(initializeDraft({ roomId, userId: currentUserId }))
                .unwrap()
                .then(() => {
                  console.log('✅ Draft initialized on retry');
                  hasJoinedRef.current = false;
                  socketService.emit('get-draft-state', { roomId });
                })
                .catch((retryErr) => {
                  console.error('❌ Retry failed:', retryErr);
                  toast('Could not reconnect to draft', 'error');
                  if (mountedRef.current) navigate('/lobby');
                });
            } else if (mountedRef.current) {
              toast('Could not reconnect to draft', 'error');
              navigate('/lobby');
            }
          }, 2000);
          
          return () => clearTimeout(retryTimer);
        }
        
        toast(`Failed to initialize draft: ${err?.message || err?.error || 'Unknown error'}`, 'error');
        if (mountedRef.current) navigate('/lobby');
      });

    // FIX 1: Proper cleanup on unmount
    return () => {
      console.log('=== DRAFT SCREEN UNMOUNTING ===', { roomId });
      mountedRef.current = false;
      hasJoinedRef.current = false;
      socketHandlersRef.current = false;
      initializationAttemptedRef.current = false;

      stopTimerInterval();

      // Reset timer sync refs for clean next-draft state
      turnStartedAtRef.current = null;
      timerSyncedForTurnRef.current = null;
      lastSyncTimeRef.current = 0;

      if (autoPickTimeoutRef.current) clearTimeout(autoPickTimeoutRef.current);
      if (pickTimeoutRef.current) clearTimeout(pickTimeoutRef.current);

      // CRITICAL: Leave the socket room to stop receiving events for this draft
      if (socketConnected && roomId) {
        socketService.emit('leave-draft-room', { roomId });
      }

      // Reset draft state so the next draft starts completely clean.
      // If we re-mount the SAME room, init will re-fetch from server.
      // If we mount a DIFFERENT room, we need clean state anyway.
      dispatch(resetDraft());

      // Reset module tracking so next mount always initializes
      moduleInitializedRoomId = null;
      moduleLastInitTime = 0;
    };
  }, [roomId, user, navigate, toast, dispatch, socketConnected, currentUserId, stopTimerInterval]);

  // ==================== JOIN DRAFT ROOM ====================
  useEffect(() => {
    if (socketConnected && status === 'initialized' && contestData && entryId && !hasJoinedRef.current) {
      console.log('🔌 Joining draft room');
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

        // Restore pre-selection from localStorage
        try {
          const savedPreSelect = localStorage.getItem(`preselect_${roomId}`);
          if (savedPreSelect && currentUserId) {
            const player = JSON.parse(savedPreSelect);
            console.log('📱 Restoring pre-selection on init:', player.name);
            socketService.emit('pre-select', { roomId, userId: currentUserId, player });

            if (isMobile && mobileSelectPlayer) {
              [500, 1000, 2000].forEach((delay, i) => {
                setTimeout(() => mobileSelectPlayer(player, player.row, player.col), delay);
              });
            }
          }
        } catch (e) {
          console.warn('Failed to restore pre-selection:', e);
        }
      }, 500);
    }
  }, [socketConnected, status, contestData, entryId, roomId, dispatch, currentUserId, isMobile, mobileSelectPlayer]);
// Track which draft room we're actively viewing (for push notification suppression)
  useEffect(() => {
    if (socketConnected && roomId) {
      socketService.emit('viewing-draft', { roomId });
    }
    return () => {
      socketService.emit('leaving-draft');
    };
  }, [socketConnected, roomId]);

  // Request draft state when socket is ready
  useEffect(() => {
    if (socketConnected && roomId && hasJoinedRef.current) {
      requestDraftState();
    }
  }, [socketConnected, roomId, requestDraftState]);

  // ==================== RECONNECTION HANDLING ====================
  useEffect(() => {
    if (!roomId) return;

    const handleReconnection = () => {
      console.log('🔄 Socket reconnected, refreshing draft state...');
      socketHandlersRef.current = false;
      isInitialMountRef.current = true;

      setTimeout(() => {
        if (hasJoinedRef.current && mountedRef.current) {
          socketService.emit('join-draft-room', { roomId, rejoin: true });
          requestDraftState();

          try {
            const savedPreSelect = localStorage.getItem(`preselect_${roomId}`);
            if (savedPreSelect && currentUserId) {
              const player = JSON.parse(savedPreSelect);
              socketService.emit('pre-select', { roomId, userId: currentUserId, player });
              if (isMobile && mobileSelectPlayer) {
                [0, 500, 1500].forEach((delay, i) => {
                  setTimeout(() => mobileSelectPlayer(player, player.row, player.col), delay);
                });
              }
            }
          } catch (e) { /* ignore */ }
        }
      }, 500);
    };

    const handleDisconnect = () => {
      console.log('📴 Socket disconnected');
      socketHandlersRef.current = false;
    };

    const handleReauthenticated = () => {
      socketHandlersRef.current = false;
      setTimeout(() => { if (hasJoinedRef.current && mountedRef.current) requestDraftState(); }, 300);
    };

    socketService.on('reconnect', handleReconnection);
    socketService.on('disconnect', handleDisconnect);
    socketService.on('authenticated', handleReauthenticated);

    return () => {
      socketService.off('reconnect', handleReconnection);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('authenticated', handleReauthenticated);
    };
  }, [roomId, requestDraftState, currentUserId, isMobile, mobileSelectPlayer]);

  // ==================== BUDGET CALCULATION HELPER ====================
  const calculateFinalBudget = useCallback((team, existingTeam, finalRoster, finalBonus) => {
    const rosterSpend = Object.values(finalRoster).reduce((t, p) => t + (p?.price || 0), 0);
    const calculatedBudget = Math.max(0, 15 - rosterSpend);
    const playerCount = Object.values(finalRoster).filter(p => p?.name).length;

    // Absolute $0 protection
    if (existingTeam?.budget === 0) return 0;
    if (rosterSpend >= 15) return 0;

    // Server budget (with protection)
    if (team.budget !== undefined && typeof team.budget === 'number') {
      if (existingTeam?.budget === 0 && team.budget > 0) return 0;
      if (Math.abs(team.budget - calculatedBudget) <= 1 || finalBonus > 0) return Math.max(0, team.budget);
      return calculatedBudget;
    }

    // Existing budget
    if (existingTeam?.budget !== undefined) {
      if (existingTeam.budget === 0 || (existingTeam.budget < 1 && rosterSpend > 0)) return 0;
      if (Math.abs(existingTeam.budget - calculatedBudget) <= 1) return Math.max(0, existingTeam.budget);
      return calculatedBudget;
    }

    // Fallback + safety checks
    let finalBudget = calculatedBudget;
    if (finalBudget === 15 && rosterSpend > 0) finalBudget = Math.max(0, 15 - rosterSpend);
    if (playerCount >= 4 && finalBudget > 5 && rosterSpend > 10) finalBudget = Math.max(0, 15 - rosterSpend);
    return finalBudget;
  }, []);

  // ==================== SOCKET EVENT HANDLERS ====================
  useEffect(() => {
    if (!socketConnected || !roomId) return;
    if (socketHandlersRef.current) return;

    console.log('🎮 Setting up socket event handlers');
    socketHandlersRef.current = true;

    // Suppress room-status-update spam
    socketService.on('room-status-update', () => {});

    // ----- DRAFT STATE -----
    const handleDraftState = (data) => {
      if (data.roomId !== roomId) return;

      const currentState = store.getState().draft;
      const isActiveDraft = data.status === 'active' || (data.currentTurn > 0 && data.currentTurn < 25);
      const isCompletedDraft = data.status === 'completed' || currentState.status === 'completed';

      // During active/completed drafts, only update turn/timer IF we haven't missed any picks
      if ((isActiveDraft || isCompletedDraft) && currentState.teams?.length > 0) {
        const serverTurn = data.currentTurn || 0;
        const clientTurn = currentState.currentTurn || 0;
        const missedPicks = serverTurn > clientTurn + 1;
        
        if (!missedPicks) {
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
        // Missed picks detected - fall through to full state sync
        console.log(`⚠️ Missed picks: server turn ${serverTurn}, client turn ${clientTurn}. Full sync.`);
      }

      // Timer sync
      if (data.turnStartedAt || data.serverTime || data.timeLimit) {
        syncTimerFromServer(data);
      } else if (data.currentTurn !== undefined) {
        timerSyncedForTurnRef.current = data.currentTurn;
      }

      // Process teams
      const teamsData = data.teams || data.entries || data.participants || [];
      let processedTeams = [];

      if (Array.isArray(teamsData) && teamsData.length > 0) {
        const sortedTeamsData = [...teamsData].sort((a, b) =>
          (a.draftPosition ?? 999) - (b.draftPosition ?? 999)
        );

        processedTeams = sortedTeamsData.map((team, index) => {
          const teamUserId = getUserId(team);
          const existingTeam = currentState.teams?.find(t => getUserId(t) === teamUserId);

          const newRoster = processRosterData(team.roster || team.picks || []);
          const existingRosterCount = Object.values(existingTeam?.roster || {}).filter(p => p?.name).length;
          const newRosterCount = Object.values(newRoster).filter(p => p?.name).length;

          const finalRoster = existingRosterCount >= newRosterCount
            ? mergeRosterData(existingTeam?.roster || {}, newRoster)
            : mergeRosterData(newRoster, existingTeam?.roster || {});

          const finalBonus = team.bonus || existingTeam?.bonus || 0;
          const finalBudget = calculateFinalBudget(team, existingTeam, finalRoster, finalBonus);

          return {
            ...team,
            userId: teamUserId,
            entryId: team.entryId || team.entry_id || team.id,
            name: team.name || team.username || team.teamName || `Team ${index + 1}`,
            roster: finalRoster,
            budget: finalBudget,
            bonus: finalBonus,
            color: team.color || existingTeam?.color || TEAM_COLORS[index % 5],
            draftPosition: team.draftPosition ?? existingTeam?.draftPosition ?? index
          };
        });
      }

      const shouldUpdateTeams = processedTeams.length > 0;

      // Calculate isMyTurn with snake draft fallback
      let calculatedIsMyTurn = data.isMyTurn ||
        (data.currentDrafter && getUserId(data.currentDrafter) === currentUserId);

      if (!calculatedIsMyTurn && shouldUpdateTeams && data.currentTurn !== undefined && data.status === 'active') {
        const pickNumber = (data.currentTurn || 0) + 1;
        const totalTeams = processedTeams.length;
        const round = Math.ceil(pickNumber / totalTeams);
        const positionInRound = ((pickNumber - 1) % totalTeams) + 1;
        const expectedIdx = round % 2 === 1 ? positionInRound - 1 : totalTeams - positionInRound;
        const expectedTeam = processedTeams[expectedIdx];
        if (expectedTeam && getUserId(expectedTeam) === currentUserId) {
          calculatedIsMyTurn = true;
        }
      }

      const syncedTimeRemaining = data.turnStartedAt
        ? calculateTimeRemaining()
        : (data.timeRemaining ?? data.timeLimit ?? 30);

      // Rebuild picks array from playerBoard if we have board data
      const board = data.playerBoard || currentState.playerBoard;
      if (board?.length > 0) {
        const reconstructedPicks = [];
        board.forEach((row, rowIdx) => {
          row.forEach((cell, colIdx) => {
            if (cell?.drafted && cell.draftedAtTurn !== undefined) {
              const pickerTeam = shouldUpdateTeams 
                ? processedTeams[cell.draftedBy] 
                : currentState.teams?.[cell.draftedBy];
              reconstructedPicks.push({
                pickNumber: cell.pickNumber || (cell.draftedAtTurn + 1),
                turn: cell.draftedAtTurn,
                player: {
                  name: cell.name,
                  position: cell.position || cell.originalPosition,
                  team: cell.team,
                  price: cell.price
                },
                rosterSlot: cell.draftedToPosition || cell.position,
                teamIndex: cell.draftedBy,
                userId: pickerTeam ? getUserId(pickerTeam) : null,
                isAutoPick: cell.isAutoPick || false,
                timestamp: cell.timestamp || new Date().toISOString()
              });
            }
          });
        });
        reconstructedPicks.sort((a, b) => (a.turn || 0) - (b.turn || 0));
        
        // Only use reconstructed picks if we have more than current
        const currentPicks = currentState.picks || [];
        if (reconstructedPicks.length > currentPicks.length) {
          data.picks = reconstructedPicks;
        }
      }

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

    // ----- DRAFT TURN -----
    const handleDraftTurn = (data) => {
      if (data.roomId !== roomId) return;

      if (data.turnStartedAt || data.serverTime || data.timeLimit) {
        syncTimerFromServer(data);
      } else {
        turnStartedAtRef.current = Date.now();
        timeLimitRef.current = data.timeLimit || data.timeRemaining || 30;
        if (data.currentTurn !== undefined) timerSyncedForTurnRef.current = data.currentTurn;
      }

      dispatch(updateDraftState({
        status: 'active',
        currentPick: data.currentPick || 1,
        currentTurn: data.currentTurn ?? 0,
        currentDrafter: data.currentPlayer || data.currentDrafter,
        timeRemaining: data.timeLimit || data.timeRemaining || 30,
        isMyTurn: (data.currentPlayer && getUserId(data.currentPlayer) === currentUserId) ||
                  (data.currentDrafter && getUserId(data.currentDrafter) === currentUserId) || false
      }));
    };

    // ----- PLAYER PICKED -----
    const handlePlayerPicked = (data) => {
      if (data.roomId !== roomId) return;
      lastPickTimeRef.current = Date.now();

      // Duplicate prevention
      const incomingTurn = data.currentTurn ?? data.turn;
      const incomingPickNumber = data.pickNumber || (incomingTurn != null ? incomingTurn + 1 : null);
      if (incomingPickNumber) {
        const currentPicks = store.getState().draft.picks || [];
        if (currentPicks.find(p => p.pickNumber === incomingPickNumber && p.player)) {
          console.log(`⚠️ Ignoring duplicate pick ${incomingPickNumber}`);
          return;
        }
      }

      setIsPicking(false);
      if (pickTimeoutRef.current) { clearTimeout(pickTimeoutRef.current); pickTimeoutRef.current = null; }

      if (data.turnStartedAt || data.serverTime) syncTimerFromServer(data);

      const pickNumber = data.pickNumber || data.currentTurn + 1 || (picksRef.current?.length || 0) + 1;
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

      // Resolve teamIndex robustly
      let resolvedTeamIndex = data.teamIndex;
      if (resolvedTeamIndex === undefined && data.draftPosition !== undefined) resolvedTeamIndex = data.draftPosition;
      if (resolvedTeamIndex === undefined) {
        const pickedUserId = data.userId || data.user_id;
        const liveTeams = store.getState().draft.teams;
        if (pickedUserId && liveTeams) {
          const idx = liveTeams.findIndex(t => getUserId(t) === pickedUserId);
          if (idx !== -1) resolvedTeamIndex = idx;
        }
      }

      // Update player board cell
      const stampUserId = data.userId || data.user_id;
      const eventTeamForStamp = data.teams?.find(t =>
        (t.userId || t.user_id || t.id) === stampUserId
      );

      if (data.row !== undefined && data.col !== undefined) {
        dispatch(updatePlayerBoardCell({
          row: data.row, col: data.col,
          updates: {
            drafted: true,
            draftedBy: resolvedTeamIndex,
            draftedAtTurn: data.currentTurn || currentTurnRef.current,
            pickNumber,
            draftedToPosition: data.roster_slot || data.slot || data.position,
            equippedStamp: eventTeamForStamp?.equipped_stamp || store.getState().draft.teams?.[resolvedTeamIndex]?.equipped_stamp || null
          }
        }));
      }

      // Update roster (skip own non-autopicks - already optimistically updated)
      const pickedUserId = data.userId || data.user_id || getUserId(data);
      const isMyPick = pickedUserId === currentUserId;
      const isAutoPick = data.isAutoPick === true;

      if ((!isMyPick || isAutoPick) && data.player?.name && (data.roster_slot || data.slot || data.position)) {
        const teamIndex = teamsRef.current?.findIndex(t => getUserId(t) === pickedUserId);
        const slot = standardizeSlotName(data.roster_slot || data.slot || data.position);

        if (teamIndex >= 0 && slot) {
          const existingPlayer = teamsRef.current[teamIndex]?.roster?.[slot];
          if (!existingPlayer || existingPlayer.name !== data.player.name) {
            dispatch(updateTeamRoster({
              teamIndex, position: slot,
              player: {
                name: data.player.name,
                position: data.player.position || slot,
                team: data.player.team || '',
                price: data.player.price || data.player.value || 0,
                value: data.player.value || data.player.price || 0,
                playerId: data.player._id || data.player.id || data.player.playerId
              }
            }));
          }
        }
      }

      dispatch(updateDraftState({
        currentTurn: data.currentTurn,
        currentPick: data.currentPick || (data.currentTurn + 1),
        currentDrafter: data.nextDrafter || data.nextPlayer || null,
        isMyTurn: (data.nextDrafter && getUserId(data.nextDrafter) === currentUserId) ||
                  (data.nextPlayer && getUserId(data.nextPlayer) === currentUserId) || false,
        timeRemaining: data.timeLimit || data.timeRemaining || 30
      }));
    };

    const handlePickSuccess = () => {
      setIsPicking(false);
      if (pickTimeoutRef.current) { clearTimeout(pickTimeoutRef.current); pickTimeoutRef.current = null; }
    };

    const handlePickError = (error) => {
      console.error('❌ Pick error:', error);
      setIsPicking(false);
      if (pickTimeoutRef.current) { clearTimeout(pickTimeoutRef.current); pickTimeoutRef.current = null; }
      toast(error.message || 'Pick failed', 'error');
    };

    // ----- TURN SKIPPED -----
    const handleTurnSkipped = (data) => {
      if (data.roomId !== roomId) return;
      if (data.turnStartedAt || data.serverTime) syncTimerFromServer(data);

      const skippedPickNumber = data.skippedTurn != null ? data.skippedTurn + 1 :
                                data.currentTurn ?? (picksRef.current?.length || 0) + 1;

      dispatch(addPick({
        pickNumber: skippedPickNumber,
        turn: data.skippedTurn || (data.currentTurn - 1),
        skipped: true, isSkipped: true,
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
                  (data.nextDrafter && getUserId(data.nextDrafter) === currentUserId) || false,
        timeRemaining: data.timeLimit || data.timeRemaining || 30
      }));
    };

    // ----- COUNTDOWN -----
    const handleDraftCountdown = (data) => {
      if (data.roomId === roomId) {
        dispatch(updateDraftState({
          status: 'countdown',
          countdownTime: data.countdown || data.countdownTime || data.time || data.seconds || 5
        }));
      }
    };

    // ----- DRAFT COMPLETE -----
    const handleDraftComplete = async (data) => {
      console.log('🎉 DRAFT COMPLETE');
      stopTimerInterval();
      if (data.roomId !== roomId) return;

      const currentReduxState = store.getState().draft;
      const currentTeams = currentReduxState.teams || [];
      const backendTeams = data.teams || data.entries || [];

      const reduxHasRosters = currentTeams.some(t => t.roster && Object.values(t.roster).some(p => p?.name));
      const backendHasRosters = backendTeams.some(t => t.roster && Object.values(t.roster).some(p => p?.name));
      const sourceTeams = reduxHasRosters ? currentTeams : (backendHasRosters ? backendTeams : currentTeams);

      const completedTeams = sourceTeams.map((team, index) => {
        const backendTeam = backendTeams.find(t => getUserId(t) === getUserId(team)) || backendTeams[index] || {};
        const existingRoster = team.roster || {};
        const hasExistingRoster = Object.values(existingRoster).some(p => p?.name);

        return {
          ...team,
          ...backendTeam,
          userId: getUserId(team),
          entryId: team.entryId || team.entry_id || backendTeam.entryId || backendTeam.entry_id || team.id,
          roster: hasExistingRoster ? existingRoster : processRosterData(backendTeam.roster || backendTeam.picks || {}),
          budget: team.budget !== undefined ? team.budget : 15,
          bonus: team.bonus || 0,
          color: team.color || TEAM_COLORS[index % 5]
        };
      });

      // Infer sport
      const inferSport = () => {
        if (currentReduxState?.sport) return currentReduxState.sport;
        if (currentReduxState?.contestData?.sport) return currentReduxState.contestData.sport;
        if (data.sport) return data.sport;
        const board = currentReduxState?.playerBoard || data.playerBoard;
        if (board?.[0]?.[0]?.position) {
          const pos = board[0][0].position.toUpperCase();
          if (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) return 'nba';
          if (['QB', 'RB', 'WR', 'TE'].includes(pos)) return 'nfl';
        }
        const anyRoster = sourceTeams[0]?.roster;
        if (anyRoster) {
          const keys = Object.keys(anyRoster).map(k => k.toUpperCase());
          if (keys.some(k => ['PG', 'SG', 'SF', 'PF', 'C'].includes(k))) return 'nba';
        }
        return 'nfl';
      };
      const completedSport = inferSport();

      dispatch(updateDraftState({
        status: 'completed',
        showResults: true,
        teams: completedTeams,
        sport: completedSport
      }));

      // Save to backend
      try {
        const myCompleteTeam = completedTeams.find(t => getUserId(t) === currentUserId);
        const reduxEntryId = currentReduxState.entryId;
        const myEntryId = reduxEntryId || myCompleteTeam?.entryId || data.entryId;

        if (myCompleteTeam?.roster && myEntryId) {
          const token = localStorage.getItem('token');
          if (!token) { toast('Authentication required to save draft', 'error'); return; }

          await axios.post(
            `/api/contests/draft/${myEntryId}/complete`,
            { roster: myCompleteTeam.roster, totalSpent: 15 - (myCompleteTeam.budget || 0) },
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          console.log('✅ Draft saved');
          toast('Draft completed and saved!', 'success');
        } else {
          console.error('❌ Cannot save - missing data:', { hasTeam: !!myCompleteTeam, hasRoster: !!myCompleteTeam?.roster, hasEntryId: !!myEntryId });
          toast('Draft completed but could not save - missing entry ID', 'warning');
        }
      } catch (err) {
        console.error('❌ Save failed:', err.response?.data || err.message);
        toast('Draft completed but failed to save', 'warning');
      }
    };

    // ----- TIMER EVENTS -----
    const handleTimerUpdate = (data) => {
      if (data.roomId !== roomId) return;
      if (data.turnStartedAt || data.serverTime) syncTimerFromServer(data);
      else if (data.timeRemaining !== undefined) dispatch(updateTimer(data.timeRemaining));
    };

    const handleTimerSync = (data) => {
      if (data.roomId === roomId) syncTimerFromServer(data);
    };

    // Register all handlers
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
  }, [socketConnected, roomId, dispatch, getUserId, currentUserId, processRosterData, mergeRosterData, standardizeSlotName, toast, calculateTotalSpent, requestDraftState, entryId, syncTimerFromServer, stopTimerInterval, calculateTimeRemaining, contestData, sport, calculateFinalBudget]);

  // Show toast for errors
  useEffect(() => {
    if (error && mountedRef.current) toast(error, 'error');
  }, [error, toast]);

  // ==================== GET AVAILABLE SLOTS ====================
  const getAvailableSlots = useCallback((team, player) => {
    const playerPos = standardizeSlotName(player.originalPosition || player.position);
    const availableSlots = [];
    const roster = team.roster || {};

    if (!getPlayerFromRoster(roster, playerPos)) availableSlots.push(playerPos);
    if (sportConfig.flexEligible.length > 0 && !getPlayerFromRoster(roster, 'FLEX') && sportConfig.flexEligible.includes(playerPos)) {
      availableSlots.push('FLEX');
    }
    return availableSlots;
  }, [standardizeSlotName, getPlayerFromRoster, sportConfig]);

  // ==================== SELECT PLAYER ====================
  const selectPlayer = useCallback((row, col) => {
    if (isPicking) return;
    if (!playerBoard?.[row]?.[col]) { toast('Invalid position', 'error'); return; }

    const player = playerBoard[row][col];
    if (!player?.name || player.price === undefined) { toast('Invalid player data', 'error'); return; }
    if (player.drafted) { toast('Player already drafted!', 'error'); return; }
    if (!actualIsMyTurn) { toast("It's not your turn!", 'error'); return; }
    if (!myTeam) { toast('Could not find your team', 'error'); return; }

    const fixedMyTeam = validateAndFixBudget(myTeam);
    const availableSlots = getAvailableSlots(fixedMyTeam, player);
    if (!availableSlots.length) { toast(`No available slots for ${player.name}!`, 'error'); return; }

    // Budget validation (use more conservative estimate)
    const totalBudget = Math.max(0, fixedMyTeam.budget || 0) + (fixedMyTeam.bonus || 0);
    const calculatedBudget = Math.max(0, 15 - calculateTotalSpent(fixedMyTeam.roster)) + (fixedMyTeam.bonus || 0);
    const actualBudget = Math.min(totalBudget, calculatedBudget);

    if (player.price > actualBudget) {
      toast(`Not enough budget! You have $${actualBudget}`, 'error');
      return;
    }

    const rosterSlot = standardizeSlotName(availableSlots[0]);
    setIsPicking(true);
    pickTimeoutRef.current = setTimeout(() => { setIsPicking(false); toast('Pick timed out, please try again', 'error'); }, 10000);

    const teamIndex = teams.findIndex(t => getUserId(t) === currentUserId);

    // Optimistic updates
    dispatch(updatePlayerBoardCell({
      row, col,
      updates: {
        drafted: true, draftedBy: teamIndex, draftedAtTurn: currentTurn,
        pickNumber: (picks?.length || 0) + 1, draftedToPosition: rosterSlot
      }
    }));

    if (teamIndex >= 0) {
      dispatch(updateTeamRoster({
        teamIndex, position: rosterSlot,
        player: {
          name: player.name,
          position: standardizeSlotName(player.position || player.originalPosition),
          team: player.team || '',
          price: player.price, value: player.price,
          playerId: player._id || player.id || player.playerId || `${row}-${col}`
        }
      }));
    }

    const playerId = player._id || player.id || player.playerId ||
      player.name?.replace(/\s+/g, '-').toLowerCase() || `${row}-${col}`;

    dispatch(makePick({
      roomId, playerId, playerData: player, position: rosterSlot,
      row, col, slot: rosterSlot, roster_slot: rosterSlot
    }));
  }, [actualIsMyTurn, playerBoard, teams, currentUserId, roomId, dispatch, toast, myTeam, isPicking, standardizeSlotName, getUserId, currentTurn, picks, calculateTotalSpent, validateAndFixBudget, getAvailableSlots]);

  // ==================== AUTO-PICK ====================
  const handleAutoPick = useCallback(() => {
    if (!actualIsMyTurn || isPicking) return;

    // Ref-based debounce
    const now = Date.now();
    if (autoPickTriggeredRef.current > now - 2000) return;
    autoPickTriggeredRef.current = now;

    if (!myTeam || !playerBoard) return;

    console.log(`🤖 Auto-pick triggered for ${myTeam.name} at turn ${currentTurn}`);

    // Check for mobile pre-selection
    let preSelectedPlayer = mobileSelectedPlayer;
    if (!preSelectedPlayer && isMobile && roomId) {
      try {
        const saved = localStorage.getItem(`preselect_${roomId}`);
        if (saved) preSelectedPlayer = JSON.parse(saved);
      } catch (e) { /* ignore */ }
    }

    if (isMobile && preSelectedPlayer) {
      const currentPlayerState = playerBoard[preSelectedPlayer.row]?.[preSelectedPlayer.col];
      if (!currentPlayerState || currentPlayerState.drafted) {
        wasPlayerDraftedRef.current = true;
        clearSelection();
        try { localStorage.removeItem(`preselect_${roomId}`); } catch (e) { /* ignore */ }
        // Fall through to algorithm
      } else {
        console.log(`🤖 Auto-drafting pre-selected: ${preSelectedPlayer.name}`);
        wasPlayerDraftedRef.current = true;
        clearSelection();
        try { localStorage.removeItem(`preselect_${roomId}`); } catch (e) { /* ignore */ }
        selectPlayer(preSelectedPlayer.row, preSelectedPlayer.col);
        return;
      }
    }

    const autoPick = findAutoPick(myTeam, playerBoard);
    if (autoPick) {
      selectPlayer(autoPick.row, autoPick.col);
    } else {
      console.log('🤖 No valid auto-pick, skipping turn');
      dispatch(skipTurn({ roomId, reason: 'no_valid_autopick' }));
    }
  }, [actualIsMyTurn, isPicking, myTeam, playerBoard, findAutoPick, selectPlayer, dispatch, roomId, isMobile, mobileSelectedPlayer, clearSelection, currentTurn]);

  const handleSkipTurn = useCallback(() => {
    if (!actualIsMyTurn || isPicking) return;
    dispatch(skipTurn({ roomId, reason: 'manual_skip' }));
  }, [actualIsMyTurn, roomId, dispatch, isPicking]);

  // ==================== MOBILE HANDLERS ====================
  // Restore pre-selection visual from localStorage
  useEffect(() => {
    if (!isMobile || mobileSelectedPlayer || !playerBoard || !roomId || preSelectRestoredRef.current) return;
    try {
      const saved = localStorage.getItem(`preselect_${roomId}`);
      if (!saved) return;
      const player = JSON.parse(saved);
      const boardPlayer = playerBoard[player.row]?.[player.col];
      if (boardPlayer && !boardPlayer.drafted) {
        preSelectRestoredRef.current = true;
        mobileSelectPlayer(player, player.row, player.col);
        setTimeout(() => dismissModal(), 50);
      }
    } catch (e) { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, mobileSelectedPlayer, playerBoard, roomId]);

  useEffect(() => { preSelectRestoredRef.current = false; }, [roomId]);

  // Clear selection when selected player gets drafted
  useEffect(() => {
    if (!mobileSelectedPlayer || !playerBoard) return;
    const { row, col } = mobileSelectedPlayer;
    if (playerBoard[row]?.[col]?.drafted) {
      wasPlayerDraftedRef.current = true;
      clearSelection();
    }
  }, [playerBoard, mobileSelectedPlayer, clearSelection]);

  // Backup clear when picks change
  useEffect(() => {
    if (!mobileSelectedPlayer || !picks?.length) return;
    const lastPick = picks[picks.length - 1];
    if (lastPick?.player?.name === mobileSelectedPlayer.name) {
      wasPlayerDraftedRef.current = true;
      clearSelection();
    }
  }, [picks, mobileSelectedPlayer, clearSelection]);

  // Sync pre-selection to server
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      mobileSelectedPlayerPrevRef.current = mobileSelectedPlayer;
      return;
    }

    const wasSelected = mobileSelectedPlayerPrevRef.current;
    mobileSelectedPlayerPrevRef.current = mobileSelectedPlayer;

    if (wasSelected && !mobileSelectedPlayer && roomId && currentUserId) {
      if (wasPlayerDraftedRef.current) {
        wasPlayerDraftedRef.current = false;
      } else {
        socketService.emit('clear-pre-select', { roomId, userId: currentUserId });
      }
    }
  }, [mobileSelectedPlayer, roomId, currentUserId]);

  const handleMobilePlayerTap = useCallback((player, rowIndex, colIndex) => {
    if (player.drafted || isPicking) return;

    mobileSelectPlayer({ ...player, row: rowIndex, col: colIndex, matchup: player.matchup || null }, rowIndex, colIndex);

    if (roomId && currentUserId) {
      const preSelectData = {
        roomId, userId: currentUserId,
        player: { name: player.name, team: player.team, position: player.position, price: player.price, row: rowIndex, col: colIndex }
      };
      socketService.emit('pre-select', preSelectData);
      try { localStorage.setItem(`preselect_${roomId}`, JSON.stringify(preSelectData.player)); } catch (e) { /* ignore */ }
    }
  }, [isPicking, mobileSelectPlayer, roomId, currentUserId]);

  const handleMobileConfirm = useCallback((player) => {
    if (!player || isPicking || !actualIsMyTurn) return;
    wasPlayerDraftedRef.current = true;
    clearSelection();
    dismissModal();
    selectPlayer(player.row, player.col);
  }, [isPicking, actualIsMyTurn, dismissModal, selectPlayer, clearSelection]);

  const handlePlayerCardClick = useCallback((player, rowIndex, colIndex) => {
    if (player.drafted || isPicking) return;
    if (isMobile) {
      handleMobilePlayerTap(player, rowIndex, colIndex);
    } else if (actualIsMyTurn) {
      selectPlayer(rowIndex, colIndex);
    }
  }, [isMobile, actualIsMyTurn, isPicking, handleMobilePlayerTap, selectPlayer]);

  // ==================== NAVIGATION ====================
  const handleReturnToLobby = useCallback(() => {
    moduleInitializedRoomId = null;
    moduleLastInitTime = 0;
    stopTimerInterval();
    dispatch(resetDraft());
    navigate('/lobby');
  }, [navigate, dispatch, stopTimerInterval]);

  const handlePrevTeam = useCallback(() => {
    dispatch(setCurrentViewTeam(currentViewTeam > 0 ? currentViewTeam - 1 : teams.length - 1));
  }, [currentViewTeam, teams, dispatch]);

  const handleNextTeam = useCallback(() => {
    dispatch(setCurrentViewTeam(currentViewTeam < teams.length - 1 ? currentViewTeam + 1 : 0));
  }, [currentViewTeam, teams, dispatch]);

  const handleAutoPickToggle = useCallback((e) => dispatch(setAutoPickEnabled(e.target.checked)), [dispatch]);
  const handleSuggestionToggle = useCallback((e) => dispatch(setShowAutoPickSuggestion(e.target.checked)), [dispatch]);

  // ==================== TIMER EFFECTS ====================
  useEffect(() => {
    if (status === 'active') startTimerInterval();
    else stopTimerInterval();
    return () => stopTimerInterval();
  }, [status, startTimerInterval, stopTimerInterval]);

  // Wake detection (visibility, focus, heartbeat)
  useEffect(() => {
    let lastActiveAt = Date.now();
    let lastHeartbeat = Date.now();
    let refreshInProgress = false;
    let heartbeatInterval = null;

    const forceRefresh = async (source) => {
      if (refreshInProgress) return;
      const timeSinceActive = Date.now() - lastActiveAt;
      refreshInProgress = true;
      lastActiveAt = Date.now();
      lastHeartbeat = Date.now();

      if (!roomId || !hasJoinedRef.current) { refreshInProgress = false; return; }

      // Recalculate timer
      if (turnStartedAtRef.current) dispatch(updateTimer(calculateTimeRemaining()));

      // Restart timer interval
      stopTimerInterval();
      if (status === 'active') startTimerInterval();

      // Force reconnect if stale > 10s
      if (timeSinceActive > 10000) {
        socketService.disconnect();
        await new Promise(r => setTimeout(r, 200));
        socketService.connect();
        await new Promise(r => setTimeout(r, 500));
      }

      const requestState = () => {
        if (socketService.isConnected()) {
          socketService.emit('get-draft-state', { roomId });
          lastSyncTimeRef.current = Date.now();
        }
      };
      requestState();
      setTimeout(requestState, 1000);
      setTimeout(() => { refreshInProgress = false; }, 2000);
    };

    heartbeatInterval = setInterval(() => {
      const elapsed = Date.now() - lastHeartbeat;
      if (elapsed > 3000) forceRefresh('heartbeat');
      lastHeartbeat = Date.now();
    }, 1000);

    const markActive = () => { lastActiveAt = Date.now(); lastHeartbeat = Date.now(); };
    const handleVisibility = () => { document.visibilityState === 'visible' && forceRefresh('visibility'); };
    const handleFocus = () => forceRefresh('focus');
    const handlePageShow = (e) => forceRefresh(e.persisted ? 'pageshow-bfcache' : 'pageshow');
    const handleInteraction = () => { Date.now() - lastActiveAt > 3000 ? forceRefresh('interaction') : markActive(); };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction);
    document.addEventListener('mousemove', markActive, { passive: true });
    document.addEventListener('touchmove', markActive, { passive: true });

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('mousemove', markActive);
      document.removeEventListener('touchmove', markActive);
    };
  }, [status, roomId, calculateTimeRemaining, dispatch, startTimerInterval, stopTimerInterval]);

  // Background pause (CSS animation toggle + mobile reload)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        document.body.classList.add('app-backgrounded');
        hiddenAtRef.current = Date.now();
      } else {
        document.body.classList.remove('app-backgrounded');
        if (isMobile && hiddenAtRef.current && (Date.now() - hiddenAtRef.current > 60000)) {
          window.location.reload();
          return;
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => { document.removeEventListener('visibilitychange', handler); document.body.classList.remove('app-backgrounded'); };
  }, [isMobile]);

  // Stall detection (timer at 0 for 5s+)
  useEffect(() => {
    if (status !== 'active' || timeRemaining > 0) return;
    const timer = setTimeout(() => {
      if (socketService.isConnected()) {
        socketService.emit('get-draft-state', { roomId });
        lastSyncTimeRef.current = Date.now();
      } else {
        socketService.connect();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [status, timeRemaining, roomId]);

  // Countdown decrement
  useEffect(() => {
    if (status === 'countdown' && countdownTime > 0) {
      const timer = setTimeout(() => dispatch(updateDraftState({ countdownTime: countdownTime - 1 })), 1000);
      return () => clearTimeout(timer);
    }
  }, [status, countdownTime, dispatch]);

  // Auto-pick on timer expiry
  useEffect(() => {
    if (actualIsMyTurn && status === 'active' && timeRemaining === 0 && !isPicking) {
      if (timerSyncedForTurnRef.current !== currentTurn) return;
      const now = Date.now();
      if (autoPickTriggeredRef.current > now - 500) return;
      autoPickTriggeredRef.current = now;
      handleAutoPick();
    }
  }, [actualIsMyTurn, status, timeRemaining, isPicking, handleAutoPick, currentTurn, mobileSelectedPlayer]);

  // Draft order validation
  useEffect(() => {
    if (status === 'active' && currentTurn !== undefined && teams?.length > 0) {
      if (!validateDraftOrder(currentTurn, teams)) {
        console.warn(`⚠️ Draft order mismatch at turn ${currentTurn + 1}`);
      }
    }
  }, [status, currentTurn, teams, validateDraftOrder]);

  // ==================== COMPONENTS ====================
  const RosterSlot = React.memo(({ slot, myTeamRoster }) => {
    const slotPlayer = useMemo(() => getPlayerFromRoster(myTeamRoster, slot), [myTeamRoster, slot]);

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
          <div className="empty-slot"><span>Empty</span></div>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    const prevPlayer = getPlayerFromRoster(prevProps.myTeamRoster, prevProps.slot);
    const nextPlayer = getPlayerFromRoster(nextProps.myTeamRoster, nextProps.slot);
    return prevProps.slot === nextProps.slot && prevPlayer?.name === nextPlayer?.name && prevPlayer?.price === nextPlayer?.price;
  });

  RosterSlot.displayName = 'RosterSlot';

  const DraftOrderInfo = () => {
    if (!sortedTeams?.length) return null;
    const pickNumber = (currentTurn || 0) + 1;
    const round = Math.ceil(pickNumber / sortedTeams.length);
    const expectedTeam = sortedTeams[getTeamForPick(pickNumber, sortedTeams.length)];

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
        <div className="upcoming-picks">
          <span>Upcoming:</span>
          {[1, 2, 3].map(offset => {
            const upcomingPick = pickNumber + offset;
            if (upcomingPick > sortedTeams.length * 5) return null;
            const upcomingTeam = sortedTeams[getTeamForPick(upcomingPick, sortedTeams.length)];
            return <span key={offset} className="upcoming-pick">{upcomingPick}: {upcomingTeam?.name || '?'}</span>;
          })}
        </div>
      </div>
    );
  };

  // ==================== RENDER ====================

  // Error
  if (status === 'error') {
    return (
      <div className="draft-container">
        <div className="error-screen">
          <h1>Error Loading Draft</h1>
          <p>{error || 'An unknown error occurred'}</p>
          <button onClick={handleReturnToLobby} className="back-button">Back to Lobby</button>
        </div>
      </div>
    );
  }

  // Loading
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

  // Waiting
  if (status === 'waiting') {
    return (
      <div className="draft-container">
        <div className="waiting-screen">
          <h1>Waiting for Draft to Start</h1>
          <div className="status-text">
            Waiting for all players to join...
            <div className="player-count">{connectedPlayers}/{entryCount || 5} Connected</div>
          </div>
          <div className="connected-users">
            {users.map((u, i) => (
              <div key={getUserId(u) || i} className="user-status">
                <span>{u.username}</span>
                <span className={u.connected ? 'connected' : 'disconnected'}>{u.connected ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
          <button onClick={handleReturnToLobby} className="back-button">Back to Lobby</button>
        </div>
      </div>
    );
  }

  // Results
  if ((showResults || (status === 'completed' && currentTurn > 0)) && status !== 'countdown') {
    return (
      <div className="draft-container">
        <div className="results-screen">
          <h1>Draft Complete!</h1>
          <div className="team-viewer">
            <div className="team-navigation">
              <button onClick={handlePrevTeam} disabled={!teams || teams.length <= 1}>←</button>
              <h2 className={`team-name team-${teams?.[currentViewTeam]?.color}`}>
                {teams?.[currentViewTeam]?.name}
                {getUserId(teams?.[currentViewTeam]) === currentUserId && ' (Your Team)'}
              </h2>
              <button onClick={handleNextTeam} disabled={!teams || teams.length <= 1}>→</button>
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
                        <span className="player-details">{player.team} - ${player.price || player.value || 0}</span>
                      </div>
                    ) : (
                      <span className="empty-slot">Empty</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="team-summary">
              <p>Total Spent: ${15 - (teams?.[currentViewTeam]?.budget ?? 15)}</p>
              <p>Budget Remaining: ${teams?.[currentViewTeam]?.budget ?? 15}</p>
              {(teams?.[currentViewTeam]?.bonus || 0) > 0 && (
                <p>Bonus Earned: ${teams?.[currentViewTeam]?.bonus}</p>
              )}
            </div>
          </div>
          <button onClick={handleReturnToLobby} className="return-button">Return to Lobby</button>
        </div>
      </div>
    );
  }

  // Active draft
  const safeMyTeam = myTeam ? validateAndFixBudget(myTeam) : null;
  const showLowTimeWarning = actualIsMyTurn && status === 'active' && timeRemaining <= 10 && timeRemaining > 0;

  return (
    <div className={`draft-container ${showLowTimeWarning ? 'low-time-warning' : ''}`}>
      {/* Countdown overlay */}
      {status === 'countdown' && countdownTime > 0 && (
        <div className="countdown-overlay">
          <div className="countdown-modal">
            <h2>Draft Starting!</h2>
            <div className="countdown-number">{countdownTime}</div>
            <p>Get ready to pick...</p>
          </div>
        </div>
      )}

      {/* Mobile: Auto-draft bar */}
      {isMobile && (
        <AutoDraftBar
          selectedPlayer={mobileSelectedPlayer}
          visible={!!mobileSelectedPlayer}
          isMyTurn={actualIsMyTurn}
        />
      )}

      {/* Live Draft Feed */}
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
          On The Clock: <span className={actualIsMyTurn ? 'you' : ''}>
            {currentDrafter?.username || currentDrafter?.name ||
              (sortedTeams?.length > 0 && currentTurn !== undefined
                ? (sortedTeams[getTeamForPick(currentTurn + 1, sortedTeams.length)]?.name || sortedTeams[getTeamForPick(currentTurn + 1, sortedTeams.length)]?.username)
                : null) || '...'}
          </span>
        </div>
        <div className="header-budget">
          Your Budget: <span>${safeMyTeam ? (safeMyTeam.budget + (safeMyTeam.bonus || 0)) : 15}</span>
        </div>
      </div>

      {/* Player Board */}
      <div className={`player-board ${showLowTimeWarning ? 'low-time-warning' : ''}`}>
        {playerBoard?.length > 0 ? (
          playerBoard.map((row, rowIndex) => (
            <div key={rowIndex} className="price-row">
              <div className={`price-label ${rowIndex === 5 ? 'wildcards' : ''}`}>
                {rowIndex === 5 ? 'Wildcards' : `$${5 - rowIndex}`}
              </div>
              {row.map((player, colIndex) => {
                const isAutoSuggestion = autoPickSuggestion &&
                  autoPickSuggestion.row === rowIndex && autoPickSuggestion.col === colIndex;
                const draftedByColor = player.drafted && player.draftedBy !== undefined
                  ? TEAM_COLORS[player.draftedBy] : null;
                const drafterStamp = teams?.[player.draftedBy]?.equipped_stamp || 'default';
                const hasUniqueStamp = uniqueStamps.has(drafterStamp);
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
                      ) : player.name}
                    </div>
                    <div className="player-team">{player.team} - ${player.price}</div>
                    <div className="actual-position-badge">
                      {standardizeSlotName(player.originalPosition || player.position)}
                    </div>
                    {player.matchup && <div className="player-matchup">{player.matchup}</div>}
                    {isAutoSuggestion && <div className="suggestion-indicator">⭐ Best Pick</div>}
                    {player.drafted && (() => {
                      let teamIndex = player.draftedBy;
                      if (teamIndex === undefined && draftedByColor) {
                        const colorMap = { green: 0, red: 1, blue: 2, yellow: 3, purple: 4 };
                        teamIndex = colorMap[draftedByColor];
                      }
                      const draftedByTeam = teams?.[teamIndex];
                      const stampId = draftedByTeam?.equipped_stamp || player.equippedStamp;
                      const StampComponent = stampId ? getStampComponent(stampId) : null;

                      if (StampComponent) {
                        return (
                          <StampComponent
                            player={{ name: player.name, team: player.team, position: player.position, price: player.price }}
                            pickNumber={player.pickNumber || getTeamPickNumber(player.draftedBy)}
                            showDrafted={true}
                          />
                        );
                      }

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
          <div className="no-board-message"><p>Loading player board...</p></div>
        )}
      </div>

      {/* My Team Section */}
      <div className="my-team-section">
        {isMobile ? (
          <MobileRosterBar
            roster={safeMyTeam?.roster}
            budget={safeMyTeam?.budget}
            bonus={safeMyTeam?.bonus}
            positions={sportConfig.positions}
          />
        ) : (
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
                      <RosterSlot key={slot} slot={slot} myTeamRoster={safeMyTeam.roster || {}} />
                    ))}
                  </div>
                  <div className="team-summary">
                    <div className="summary-item"><span>Spent:</span><span>${15 - (safeMyTeam.budget || 15)}</span></div>
                    <div className="summary-item"><span>Remaining:</span><span>${(safeMyTeam.budget || 15) + (safeMyTeam.bonus || 0)}</span></div>
                    <div className="summary-item"><span>Roster Slots:</span><span>{Object.keys(safeMyTeam.roster || {}).length}/5</span></div>
                    <div className="summary-item"><span>Valid Players:</span><span>{Object.values(safeMyTeam.roster || {}).filter(p => p?.name).length}/5</span></div>
                  </div>
                </div>
              ) : (
                <div className="loading-team"><p>Loading your team...</p></div>
              )}
            </div>
            {currentDrafter && (
              <div className="current-drafter-info">
                <p>Currently drafting: <strong>{currentDrafter.username || currentDrafter.name || 'Unknown'}</strong></p>
              </div>
            )}
            <div className="team-legend">
              <p>Team Colors:</p>
              <div className="legend-items">
                {teams?.map((team, index) => (
                  <div key={index} className="legend-item">
                    <div className={`legend-piece ${team.color}`}></div>
                    <span className="legend-text">{team.name} {getUserId(team) === currentUserId && '(You)'}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile confirmation modal */}
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