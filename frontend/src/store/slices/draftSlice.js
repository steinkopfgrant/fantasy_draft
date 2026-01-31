// frontend/src/store/slices/draftSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import socketService from '../../services/socket';

// Function to find best auto-pick player
const findAutoPick = (playerBoard, teams, currentTurn, draftOrder) => {
  const currentTeamIndex = draftOrder[currentTurn];
  const currentTeam = teams[currentTeamIndex];
  
  if (!currentTeam) return null;

  const roster = currentTeam.roster || {};
  const budget = currentTeam.budget || 15;

  // Define position priorities based on what's already drafted
  const hasQB = !!roster.QB;
  const hasRB = !!roster.RB;
  const hasWR = !!roster.WR;
  const hasTE = !!roster.TE;
  const hasFLEX = !!roster.FLEX;

  // Determine which positions we still need
  const neededPositions = [];
  if (!hasQB) neededPositions.push('QB');
  if (!hasRB) neededPositions.push('RB');
  if (!hasWR) neededPositions.push('WR');
  if (!hasTE) neededPositions.push('TE');
  if (!hasFLEX && (hasRB || hasWR || hasTE)) {
    // Only need FLEX if we already have at least one RB/WR/TE
    neededPositions.push('RB', 'WR', 'TE'); // FLEX can be any of these
  }

  let bestPick = null;
  let highestValue = -1;

  // Search the board for the best available player
  playerBoard.forEach((row, rowIndex) => {
    row.forEach((player, colIndex) => {
      if (!player.drafted && player.price <= budget) {
        // Check if this position fills a need
        let positionValue = 0;
        
        if (neededPositions.includes(player.position)) {
          // Higher rows (lower index) are better players
          positionValue = (6 - rowIndex) * 10;
          
          // Add bonus for critical positions
          if (!hasQB && player.position === 'QB') positionValue += 20;
          if (!hasRB && player.position === 'RB') positionValue += 15;
          if (!hasWR && player.position === 'WR') positionValue += 15;
          if (!hasTE && player.position === 'TE') positionValue += 10;
        }

        // Factor in price (prefer higher priced players if we can afford them)
        const priceValue = player.price * 2;
        const totalValue = positionValue + priceValue;

        if (totalValue > highestValue) {
          highestValue = totalValue;
          bestPick = { row: rowIndex, col: colIndex, player };
        }
      }
    });
  });

  return bestPick;
};

// CRITICAL FIX: Roster processing that correctly uses SLOT KEY, not player position
const processRosterData = (roster) => {
  if (!roster) return {};
  
  console.log('🔧 Processing roster data:', roster);
  const standardizedRoster = {};
  
  // Handle array format (e.g., [player1, player2, ...])
  if (Array.isArray(roster)) {
    roster.forEach((player) => {
      if (player && player.position && player.name) {
        // For arrays, use the slot field if available, otherwise position
        const slot = (player.slot || player.roster_slot || player.position || '').toUpperCase();
        standardizedRoster[slot] = {
          name: player.name,
          position: player.originalPosition || player.position,
          originalPosition: player.originalPosition || player.position,
          team: player.team,
          price: player.price || player.value || player.salary || 0,
          value: player.value || player.price || player.salary || 0,
          playerId: player.playerId || player._id || player.id
        };
      } else if (player && player.slot && player.name) {
        // Handle {slot: "QB", name: "..."} format
        const slot = (player.slot || '').toUpperCase();
        standardizedRoster[slot] = {
          name: player.name,
          position: player.originalPosition || player.position || slot,
          originalPosition: player.originalPosition || player.position || slot,
          team: player.team,
          price: player.price || player.value || player.salary || 0,
          value: player.value || player.price || player.salary || 0,
          playerId: player.playerId || player._id || player.id
        };
      }
    });
    return standardizedRoster;
  }
  
  // Handle object format - filter out null values and process valid players
  if (typeof roster === 'object') {
    Object.entries(roster).forEach(([key, value]) => {
      // Skip null values completely
      if (!value || value === null) {
        return;
      }
      
      // Skip non-roster keys like 'picks'
      const validSlots = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
      const slotKey = key.toUpperCase();
      if (!validSlots.includes(slotKey)) {
        console.log(`⏭️ Skipping non-roster key: ${key}`);
        return;
      }
      
      // If value is a player object with name
      if (typeof value === 'object' && value.name) {
        // CRITICAL FIX: Use the SLOT KEY (key) as the storage key, NOT value.position!
        // The key IS the roster slot (QB, RB, WR, TE, FLEX)
        // The value.position is the player's actual position (which may differ for FLEX picks)
        const slot = slotKey;  // Use the object key as the slot
        
        standardizedRoster[slot] = {
          name: value.name,
          // Player's actual position for display purposes
          position: value.originalPosition || value.position || slot,
          originalPosition: value.originalPosition || value.position || slot,
          team: value.team,
          price: value.price || value.value || value.salary || 0,
          value: value.value || value.price || value.salary || 0,
          playerId: value.playerId || value._id || value.id
        };
        
        console.log(`✅ Processed roster slot ${slot}: ${value.name} (actual position: ${value.originalPosition || value.position || slot})`);
      }
    });
  }
  
  console.log('🔧 Processed roster result:', standardizedRoster);
  return standardizedRoster;
};

// ENHANCED: Intelligent roster merging that preserves existing data
const mergeRosterData = (currentRoster, newRoster) => {
  const current = processRosterData(currentRoster) || {};
  const incoming = processRosterData(newRoster) || {};
  
  // Start with current roster to preserve existing data
  const merged = { ...current };
  
  // Only add new data if it's valid and has a name
  Object.entries(incoming).forEach(([position, player]) => {
    if (player && player.name && typeof player.name === 'string' && player.name.trim()) {
      merged[position] = player;
    }
  });
  
  console.log('🔧 Roster merge result:', {
    currentCount: Object.keys(current).length,
    incomingCount: Object.keys(incoming).length,
    mergedCount: Object.keys(merged).length,
    merged
  });
  
  return merged;
};

// Helper function to count actual players in rosters (not null values)
const countActualPlayers = (teams) => {
  if (!Array.isArray(teams)) return 0;
  return teams.reduce((total, team) => {
    const roster = team.roster || {};
    // Only count positions that have actual player objects with names
    return total + Object.values(roster).filter(player => 
      player && player.name && typeof player.name === 'string' && player.name.trim()
    ).length;
  }, 0);
};

// ENHANCED: Better team comparison logic
const hasMorePlayerData = (currentTeams, newTeams) => {
  const currentCount = countActualPlayers(currentTeams);
  const newCount = countActualPlayers(newTeams);
  
  console.log('🔧 Player data comparison:', {
    currentCount,
    newCount,
    hasMore: newCount > currentCount
  });
  
  return newCount > currentCount;
};

// ENHANCED: Check if teams data looks like it was processed by DraftScreen
const isProcessedByDraftScreen = (teams) => {
  if (!Array.isArray(teams) || teams.length === 0) return false;
  
  return teams.some(team => {
    const roster = team?.roster;
    if (!roster || typeof roster !== 'object') return false;
    
    // Check if roster has standardized position keys and valid player objects
    const hasStandardizedKeys = Object.keys(roster).some(key => 
      ['QB', 'RB', 'WR', 'TE', 'FLEX'].includes(key)
    );
    
    const hasValidPlayers = Object.values(roster).some(player => 
      player && 
      typeof player === 'object' && 
      player.name && 
      typeof player.name === 'string' &&
      player.position &&
      typeof player.position === 'string'
    );
    
    return hasStandardizedKeys && hasValidPlayers;
  });
};

// Initial state
const initialState = {
  // Draft metadata
  status: 'idle', // idle, loading, initializing, initialized, waiting, countdown, active, completed, error
  error: null,
  roomId: null,
  contestId: null,
  contestType: 'cash',
  entryId: null,
  
  // Draft participants
  teams: [], // Array of team objects with rosters
  users: [], // Array of user objects
  connectedPlayers: 0,
  userDraftPosition: null,
  
  // Draft state
  currentTurn: 0,
  currentPick: 0,
  draftOrder: [],
  picks: [],
  
  // Player board
  playerBoard: [],
  
  // Timer
  timeRemaining: 30,
  countdownTime: 0,
  
  // Current drafter info
  currentDrafter: null,
  isMyTurn: false,
  
  // UI state
  selectedPlayer: null,
  currentViewTeam: 0,
  showResults: false,
  autoPickEnabled: false,
  showAutoPickSuggestion: false,
  
  // Draft results
  draftResults: null,
  finalRosters: null
};

// Async thunks (unchanged)
export const initializeDraft = createAsyncThunk(
  'draft/initialize',
  async ({ roomId, contestId, contestType, entryId }, { rejectWithValue }) => {
    try {
      console.log('🚀 Initializing draft:', { roomId, contestId, contestType, entryId });
      
      // Request current draft state via socket
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Draft initialization timeout'));
        }, 10000);

        socketService.emit('get-draft-state', { roomId });
        
        // Listen for response
        const handleDraftState = (data) => {
          clearTimeout(timeout);
          socketService.off('draft-state', handleDraftState);
          
          console.log('📨 Draft state received during initialization:', data);
          resolve({
            success: true,
            roomId,
            contestId,
            contestType,
            entryId,
            draftState: data
          });
        };

        socketService.on('draft-state', handleDraftState);
      });
    } catch (error) {
      console.error('❌ Draft initialization error:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const joinDraftRoom = createAsyncThunk(
  'draft/joinRoom',
  async ({ roomId, userId }, { rejectWithValue }) => {
    try {
      console.log('🚪 Joining draft room:', { roomId, userId });
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Join room timeout'));
        }, 5000);

        socketService.emit('join-draft-room', { roomId, userId });
        
        const handleJoinSuccess = (data) => {
          clearTimeout(timeout);
          socketService.off('join-draft-success', handleJoinSuccess);
          socketService.off('error', handleError);
          resolve(data);
        };

        const handleError = (error) => {
          clearTimeout(timeout);
          socketService.off('join-draft-success', handleJoinSuccess);
          socketService.off('error', handleError);
          reject(error);
        };

        socketService.on('join-draft-success', handleJoinSuccess);
        socketService.on('error', handleError);
      });
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const makePick = createAsyncThunk(
  'draft/makePick',
  async ({ roomId, playerId, position, row, col }, { getState, rejectWithValue }) => {
    try {
      const state = getState().draft;
      const player = state.playerBoard[row][col];
      
      console.log('🎯 Making pick:', { player, position, row, col });
      
      socketService.emit('make-pick', {
        roomId,
        playerId,
        playerData: player,
        position,
        row,
        col
      });
      
      return { success: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const leaveDraftRoom = createAsyncThunk(
  'draft/leaveRoom',
  async ({ roomId }, { rejectWithValue }) => {
    try {
      console.log('🚪 Leaving draft room:', roomId);
      socketService.emit('leave-draft-room', { roomId });
      return { success: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const skipTurn = createAsyncThunk(
  'draft/skipTurn',
  async ({ roomId }, { rejectWithValue }) => {
    try {
      console.log('⏭️ Skipping turn');
      socketService.emit('skip-turn', { roomId });
      return { success: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// ENHANCED Draft slice with better roster preservation and cross-room bleeding fix
const draftSlice = createSlice({
  name: 'draft',
  initialState,
  reducers: {
    updateDraftState: (state, action) => {
      // ============================================
      // CRITICAL FIX: Detect room change and clear stale data
      // This prevents cross-room state bleeding in Market Mover
      // ============================================
      const incomingRoomId = action.payload.roomId || action.payload.contestId;
      const currentRoomId = state.roomId || state.contestId;
      
      if (incomingRoomId && currentRoomId && incomingRoomId !== currentRoomId) {
        console.log('🔄 ROOM CHANGED - Clearing stale data to prevent cross-room bleeding', {
          from: currentRoomId,
          to: incomingRoomId
        });
        
        // Clear all room-specific state
        state.teams = [];
        state.playerBoard = [];
        state.picks = [];
        state.currentTurn = 0;
        state.currentPick = 0;
        state.draftOrder = [];
        state.currentDrafter = null;
        state.isMyTurn = false;
        state.timeRemaining = 30;
        state.status = 'loading';
      }
      
      // Update roomId early so subsequent logic uses correct room
      if (incomingRoomId) {
        state.roomId = incomingRoomId;
      }
      // ============================================
      
      console.log('🔄 updateDraftState called with:', {
        hasTeams: !!action.payload.teams,
        teamsLength: action.payload.teams?.length,
        teamsIsArray: Array.isArray(action.payload.teams),
        hasPlayerBoard: !!action.payload.playerBoard,
        playerBoardLength: action.payload.playerBoard?.length,
        hasUsers: !!action.payload.users,
        currentTurn: action.payload.currentTurn,
        currentPick: action.payload.currentPick
      });

      // ENHANCED: Much more intelligent team processing with budget preservation
      if (action.payload.teams !== undefined) {
        if (Array.isArray(action.payload.teams)) {
          const currentPlayerCount = countActualPlayers(state.teams);
          const newPlayerCount = countActualPlayers(action.payload.teams);
          const hasNoTeams = !state.teams || state.teams.length === 0;
          const alreadyProcessed = isProcessedByDraftScreen(action.payload.teams);
          
          console.log('🔧 Enhanced team processing:', {
            hasNoTeams,
            currentPlayerCount,
            newPlayerCount,
            alreadyProcessed,
            currentTeamsLength: state.teams?.length || 0,
            newTeamsLength: action.payload.teams.length
          });

          // Decision logic - prioritize data preservation
          let shouldUpdate = false;
          let reason = '';

          if (hasNoTeams) {
            shouldUpdate = true;
            reason = 'no current teams';
          } else if (alreadyProcessed) {
            shouldUpdate = true;
            reason = 'pre-processed by DraftScreen';
          } else if (newPlayerCount > currentPlayerCount) {
            shouldUpdate = true;
            reason = 'more player data available';
          } else if (newPlayerCount === currentPlayerCount && newPlayerCount > 0) {
            // Same amount of data - merge intelligently
            shouldUpdate = true;
            reason = 'equal data - will merge';
          } else {
            shouldUpdate = false;
            reason = 'would lose data - rejecting';
          }

          console.log('🔧 Update decision:', { shouldUpdate, reason });

          if (shouldUpdate) {
            if (alreadyProcessed) {
              console.log('✅ Using pre-processed teams from DraftScreen');
              state.teams = action.payload.teams;
            } else {
              console.log('🔄 Processing teams (strict userId matching only)');
              
              // Process new teams with STRICT userId matching only
              state.teams = action.payload.teams.map((newTeam, index) => {
                // ============================================
                // CRITICAL FIX: STRICT MATCHING - Only find existing team by exact userId match
                // No fallbacks - this prevents cross-room data bleeding
                // ============================================
                const existingTeam = state.teams?.find(t => 
                  t.userId && newTeam.userId && t.userId === newTeam.userId
                );
                
                // Only merge if we found an exact userId match, otherwise start fresh
                let finalRoster = {};
                if (existingTeam && Object.keys(existingTeam.roster || {}).length > 0) {
                  finalRoster = mergeRosterData(existingTeam.roster, newTeam.roster || newTeam.picks);
                  console.log(`🔄 Merged roster for ${newTeam.name || newTeam.username} (found existing by userId)`);
                } else {
                  finalRoster = processRosterData(newTeam.roster || newTeam.picks || {});
                  console.log(`📝 Fresh roster for ${newTeam.name || newTeam.username} (no existing match)`);
                }

                // ULTRA-ROBUST BUDGET CALCULATION - NEVER RESET FROM $0
                let finalBudget = 15; // Default budget
                let finalBonus = newTeam.bonus || existingTeam?.bonus || 0;
                
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
                  console.log(`💰 ${newTeam.name}: ABSOLUTE $0 PROTECTION`);
                } 
                // HIGH PRIORITY: If roster shows full spend, force $0
                else if (rosterSpend >= 15) {
                  finalBudget = 0;
                  console.log(`💰 ${newTeam.name}: FORCED $0 (spent $${rosterSpend})`);
                }
                // MEDIUM PRIORITY: Server budget (with protection)
                else if (newTeam.budget !== undefined && typeof newTeam.budget === 'number') {
                  const serverBudget = newTeam.budget;
                  
                  // NEVER allow reset from $0 to positive
                  if (existingTeam?.budget === 0 && serverBudget > 0) {
                    finalBudget = 0;
                    console.log(`💰 ${newTeam.name}: BLOCKED server reset from $0 to $${serverBudget}`);
                  }
                  // Accept reasonable server budgets
                  else if (Math.abs(serverBudget - calculatedBudget) <= 1 || finalBonus > 0) {
                    finalBudget = Math.max(0, serverBudget);
                    console.log(`💰 ${newTeam.name}: Server budget $${serverBudget}`);
                  }
                  // Server budget is wrong
                  else {
                    finalBudget = calculatedBudget;
                    console.log(`💰 ${newTeam.name}: Server wrong, calculated $${calculatedBudget}`);
                  }
                }
                // LOW PRIORITY: Existing budget
                else if (existingTeam?.budget !== undefined) {
                  const existingBudget = existingTeam.budget;
                  
                  if (existingBudget === 0 || (existingBudget < 1 && rosterSpend > 0)) {
                    finalBudget = 0;
                    console.log(`💰 ${newTeam.name}: Preserving low budget $${existingBudget}`);
                  } else if (Math.abs(existingBudget - calculatedBudget) <= 1) {
                    finalBudget = Math.max(0, existingBudget);
                    console.log(`💰 ${newTeam.name}: Keeping existing $${existingBudget}`);
                  } else {
                    finalBudget = calculatedBudget;
                    console.log(`💰 ${newTeam.name}: Existing wrong, calculated $${calculatedBudget}`);
                  }
                }
                // FALLBACK: Calculate from roster
                else {
                  finalBudget = calculatedBudget;
                  console.log(`💰 ${newTeam.name}: Fresh calculation $${calculatedBudget}`);
                }
                
                // FINAL SAFETY CHECKS
                finalBudget = Math.max(0, finalBudget);
                
                // Emergency correction if $15 with roster
                if (finalBudget === 15 && rosterSpend > 0) {
                  finalBudget = Math.max(0, 15 - rosterSpend);
                  console.log(`💰 ${newTeam.name}: EMERGENCY fix $15→$${finalBudget}`);
                }
                
                // Additional safety for high player counts
                const playerCount = Object.values(finalRoster).filter(p => p?.name).length;
                if (playerCount >= 4 && finalBudget > 5 && rosterSpend > 10) {
                  const correctedBudget = Math.max(0, 15 - rosterSpend);
                  if (correctedBudget < finalBudget) {
                    finalBudget = correctedBudget;
                    console.log(`💰 ${newTeam.name}: Multi-player correction $${finalBudget}`);
                  }
                }
                
                return {
                  ...newTeam,
                  userId: newTeam.userId || newTeam.user_id,
                  entryId: newTeam.entryId || newTeam.entry_id || newTeam.id,
                  name: newTeam.name || newTeam.username || newTeam.teamName || `Team ${index + 1}`,
                  roster: finalRoster,
                  budget: finalBudget,
                  bonus: finalBonus,
                  color: newTeam.color || existingTeam?.color || ['green', 'red', 'blue', 'yellow', 'purple'][index % 5],
                  draftPosition: newTeam.draftPosition !== undefined ? newTeam.draftPosition : 
                                existingTeam?.draftPosition !== undefined ? existingTeam.draftPosition : index
                };
              });
            }
          } else {
            console.log('🛡️ Preserving existing roster data - blocking update');
          }
        } else {
          console.error('⚠️ Teams provided but not an array:', action.payload.teams);
        }
      } else if (action.payload.users && Array.isArray(action.payload.users) && (!state.teams || state.teams.length === 0)) {
        // Only create teams from users if we don't already have teams
        console.log('👥 Creating teams from users');
        state.teams = action.payload.users.map((user, index) => ({
          userId: user.userId || user._id || user.id,
          name: user.username || user.name,
          draftPosition: user.draftPosition !== undefined ? user.draftPosition : index,
          budget: user.budget !== undefined ? user.budget : 15,
          bonus: user.bonus || 0,
          roster: processRosterData(user.roster || {}),
          color: user.color || ['blue', 'red', 'green', 'purple', 'orange'][index % 5]
        }));
      }

      // Update player board if provided
      if (action.payload.playerBoard && Array.isArray(action.payload.playerBoard)) {
        state.playerBoard = action.payload.playerBoard;
      }
      
      // Update other fields only if they are explicitly provided
      if (action.payload.status !== undefined) state.status = action.payload.status;
      if (action.payload.currentTurn !== undefined) state.currentTurn = action.payload.currentTurn;
      if (action.payload.currentPick !== undefined) state.currentPick = action.payload.currentPick;
      if (action.payload.draftOrder !== undefined) state.draftOrder = action.payload.draftOrder;
      
      // CRITICAL FIX: Merge picks instead of replacing to prevent losing locally added picks
      // This fixes the visual lag where new picks show as previous pick momentarily
      if (action.payload.picks !== undefined && Array.isArray(action.payload.picks)) {
        const incomingPicks = action.payload.picks;
        const existingPicks = state.picks || [];
        
        // Merge: keep existing picks that aren't in incoming, add all incoming
        const mergedPicks = [...existingPicks];
        
        for (const incomingPick of incomingPicks) {
          const existingIndex = mergedPicks.findIndex(p => p.pickNumber === incomingPick.pickNumber);
          if (existingIndex >= 0) {
            // Update existing pick with server data (server is authoritative)
            mergedPicks[existingIndex] = { ...mergedPicks[existingIndex], ...incomingPick };
          } else {
            // Add new pick from server
            mergedPicks.push(incomingPick);
          }
        }
        
        // Sort by pickNumber for consistent order
        mergedPicks.sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0));
        state.picks = mergedPicks;
      }
      
      if (action.payload.timeRemaining !== undefined) state.timeRemaining = action.payload.timeRemaining;
      if (action.payload.countdownTime !== undefined) state.countdownTime = action.payload.countdownTime;
      if (action.payload.currentDrafter !== undefined) state.currentDrafter = action.payload.currentDrafter;
      if (action.payload.isMyTurn !== undefined) state.isMyTurn = action.payload.isMyTurn;
      if (action.payload.contestId !== undefined) state.contestId = action.payload.contestId;
      if (action.payload.contestType !== undefined) state.contestType = action.payload.contestType;
      if (action.payload.connectedPlayers !== undefined) state.connectedPlayers = action.payload.connectedPlayers;
      
      // Handle users/participants
      if (action.payload.users && Array.isArray(action.payload.users)) {
        state.users = action.payload.users;
        state.connectedPlayers = action.payload.users.filter(u => u.connected !== false).length;
      } else if (action.payload.participants && Array.isArray(action.payload.participants)) {
        state.users = action.payload.participants;
        state.connectedPlayers = action.payload.participants.filter(p => p.connected !== false).length;
      }

      const finalPlayerCount = countActualPlayers(state.teams);
      console.log('🔄 updateDraftState complete:', {
        teamsLength: state.teams?.length,
        finalPlayerCount,
        currentTurn: state.currentTurn,
        status: state.status,
        firstTeamBudget: state.teams?.[0]?.budget,
        firstTeamRosterKeys: state.teams?.[0]?.roster ? Object.keys(state.teams[0].roster) : 'none'
      });
    },
    
    // FIXED: Enhanced roster update with budget deduction protection
    updateTeamRoster: (state, action) => {
      const { teamIndex, position, player } = action.payload;
      
      if (state.teams && state.teams[teamIndex]) {
        const currentRoster = state.teams[teamIndex].roster || {};
        
        // Check if this position already has a player (to avoid double deduction)
        const existingPlayer = currentRoster[position];
        const isNewPick = !existingPlayer || existingPlayer.name !== player?.name;
        
        // Update roster - use position (slot) as key, not player's position
        state.teams[teamIndex].roster = {
          ...currentRoster,
          [position]: player
        };
        
        // Only update budget if this is a NEW pick (not a duplicate update)
        if (player && player.price !== undefined && isNewPick) {
          const currentBudget = state.teams[teamIndex].budget !== undefined 
            ? state.teams[teamIndex].budget 
            : 15;
          
          // Deduct price from budget, ensuring we don't go negative
          const newBudget = Math.max(0, currentBudget - player.price);
          
          state.teams[teamIndex].budget = newBudget;
          
          console.log('💰 Budget update:', {
            teamIndex,
            position,
            player: player?.name,
            price: player.price,
            oldBudget: currentBudget,
            newBudget: newBudget,
            isNewPick
          });
        } else if (!isNewPick) {
          console.log('⚠️ Skipping budget update - player already in roster:', {
            position,
            existingPlayer: existingPlayer?.name,
            newPlayer: player?.name
          });
        }
      }
    },
    
    // NEW: Action to update individual player board cells
    updatePlayerBoardCell: (state, action) => {
      const { row, col, updates } = action.payload;
      if (state.playerBoard && state.playerBoard[row] && state.playerBoard[row][col]) {
        state.playerBoard[row][col] = {
          ...state.playerBoard[row][col],
          ...updates
        };
        console.log('📋 Updated player board cell:', { row, col, updates });
      }
    },
    
    // NEW: Add a pick to the picks array for real-time LiveDraftFeed updates
    addPick: (state, action) => {
      const pick = action.payload;
      
      // Check if this pick already exists (by pickNumber) to avoid duplicates
      const existingIndex = state.picks.findIndex(p => p.pickNumber === pick.pickNumber);
      
      if (existingIndex >= 0) {
        // Update existing pick
        state.picks[existingIndex] = { ...state.picks[existingIndex], ...pick };
        console.log('📝 Updated existing pick:', pick.pickNumber);
      } else {
        // Add new pick
        state.picks.push(pick);
        console.log('📝 Added new pick to picks array:', {
          pickNumber: pick.pickNumber,
          player: pick.player?.name,
          rosterSlot: pick.rosterSlot
        });
      }
      
      // Sort picks by pickNumber to ensure correct order
      state.picks.sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0));
    },
    
    setSelectedPlayer: (state, action) => {
      state.selectedPlayer = action.payload;
    },
    
    clearSelectedPlayer: (state) => {
      state.selectedPlayer = null;
    },
    
    updateTimer: (state, action) => {
      state.timeRemaining = action.payload;
    },
    
    setCurrentTurn: (state, action) => {
      if (action.payload.currentTurn !== undefined) {
        state.currentTurn = action.payload.currentTurn;
      }
      if (action.payload.currentPick !== undefined) {
        state.currentPick = action.payload.currentPick;
      }
      if (action.payload.currentDrafter) {
        state.currentDrafter = action.payload.currentDrafter;
      }
    },
    
    setMyTurn: (state, action) => {
      state.isMyTurn = action.payload;
    },
    
    updatePlayerBoard: (state, action) => {
      if (action.payload.row !== undefined && action.payload.col !== undefined) {
        const { row, col, updates } = action.payload;
        if (state.playerBoard[row] && state.playerBoard[row][col]) {
          state.playerBoard[row][col] = {
            ...state.playerBoard[row][col],
            ...updates
          };
        }
      } else if (Array.isArray(action.payload)) {
        state.playerBoard = action.payload;
      }
    },
    
    setAutoPickEnabled: (state, action) => {
      state.autoPickEnabled = action.payload;
    },
    
    setCurrentViewTeam: (state, action) => {
      state.currentViewTeam = action.payload;
    },
    
    setShowAutoPickSuggestion: (state, action) => {
      state.showAutoPickSuggestion = action.payload;
    },
    
    resetDraft: (state) => {
      return { ...initialState };
    },
    
    setDraftError: (state, action) => {
      state.error = action.payload;
      state.status = 'error';
    },
    
    clearDraftError: (state) => {
      state.error = null;
      if (state.status === 'error') {
        state.status = 'idle';
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Initialize draft
      .addCase(initializeDraft.pending, (state) => {
        state.status = 'initializing';
        state.error = null;
      })
      .addCase(initializeDraft.fulfilled, (state, action) => {
        console.log('✅ Draft initialized:', action.payload);
        
        state.roomId = action.payload.roomId;
        state.contestId = action.payload.contestId;
        state.contestType = action.payload.contestType;
        state.entryId = action.payload.entryId;
        state.status = 'initialized';
        
        // If draft state was included in response, update it
        if (action.payload.draftState) {
          const draft = action.payload.draftState;
          
          // Process teams with enhanced logic
          if (draft.teams && Array.isArray(draft.teams) && draft.teams.length > 0) {
            state.teams = draft.teams.map((team, index) => ({
              ...team,
              roster: processRosterData(team.roster || team.picks || {}),
              userId: team.userId || team._id || team.id,
              name: team.name || team.username || `Team ${index + 1}`,
              budget: team.budget !== undefined ? team.budget : 15,
              bonus: team.bonus || 0,
              color: team.color || ['green', 'red', 'blue', 'yellow', 'purple'][index % 5]
            }));
          } else {
            state.teams = [];
          }
          
          if (draft.playerBoard) state.playerBoard = draft.playerBoard;
          if (draft.currentTurn !== undefined) state.currentTurn = draft.currentTurn;
          if (draft.currentPick !== undefined) state.currentPick = draft.currentPick;
          if (draft.draftOrder) state.draftOrder = draft.draftOrder;
          if (draft.picks) state.picks = draft.picks;
          if (draft.status) state.status = draft.status;
        }
      })
      .addCase(initializeDraft.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload || 'Failed to initialize draft';
        console.error('❌ Draft initialization failed:', action.payload);
      })
      
      // Join room
      .addCase(joinDraftRoom.fulfilled, (state, action) => {
        console.log('✅ Joined draft room:', action.payload);
        if (action.payload.draftPosition !== undefined) {
          state.userDraftPosition = action.payload.draftPosition;
        }
      })
      .addCase(joinDraftRoom.rejected, (state, action) => {
        state.error = action.payload || 'Failed to join draft room';
        console.error('❌ Failed to join room:', action.payload);
      })
      
      // Leave room
      .addCase(leaveDraftRoom.fulfilled, (state) => {
        console.log('✅ Left draft room');
      })
      
      // Skip turn
      .addCase(skipTurn.fulfilled, (state) => {
        console.log('✅ Turn skipped');
      });
  }
});

// Export actions
export const {
  updateDraftState,
  updateTeamRoster,
  updatePlayerBoardCell,
  addPick,
  setSelectedPlayer,
  clearSelectedPlayer,
  updateTimer,
  setCurrentTurn,
  setMyTurn,
  updatePlayerBoard,
  setAutoPickEnabled,
  setCurrentViewTeam,
  setShowAutoPickSuggestion,
  resetDraft,
  setDraftError,
  clearDraftError
} = draftSlice.actions;

// Selectors
export const selectDraft = (state) => state.draft;
export const selectCurrentTeam = (state) => {
  const { teams, currentTurn, draftOrder } = state.draft;
  if (!teams || !draftOrder || currentTurn === undefined) return null;
  const teamIndex = draftOrder[currentTurn];
  return teams[teamIndex] || null;
};

export const selectMyTeam = (state) => {
  const { teams, userDraftPosition } = state.draft;
  if (!teams || userDraftPosition === null) return null;
  return teams[userDraftPosition] || null;
};

export const selectAutoPick = (state) => {
  const { playerBoard, teams, currentTurn, draftOrder } = state.draft;
  return findAutoPick(playerBoard, teams, currentTurn, draftOrder);
};

// Export reducer
export default draftSlice.reducer;