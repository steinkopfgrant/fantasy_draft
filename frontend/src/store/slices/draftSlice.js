// frontend/src/store/slices/draftSlice.js
// FIXED: Timer now resets to 30s on turn change instead of using server's elapsed time
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

// ENHANCED: Better roster processing to handle multiple data formats
const processRosterData = (roster) => {
  if (!roster) return {};
  
  console.log('🔧 Processing roster data:', roster);
  const standardizedRoster = {};
  
  // Handle array format (e.g., [player1, player2, ...])
  if (Array.isArray(roster)) {
    roster.forEach((player) => {
      if (player && player.position && player.name) {
        const position = (player.position || '').toUpperCase();
        standardizedRoster[position] = {
          name: player.name,
          position: player.position,
          team: player.team,
          price: player.price || player.value || player.salary || 0,
          value: player.value || player.price || player.salary || 0,
          playerId: player.playerId || player._id || player.id
        };
      } else if (player && player.slot && player.name) {
        // Handle {slot: "QB", name: "..."} format
        const position = (player.slot || '').toUpperCase();
        standardizedRoster[position] = {
          name: player.name,
          position: position,
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
      
      // If value is a player object with name
      if (typeof value === 'object' && value.name) {
        const position = (value.position || key || '').toUpperCase();
        standardizedRoster[position] = {
          name: value.name,
          position: value.position || position,
          team: value.team,
          price: value.price || value.value || value.salary || 0,
          value: value.value || value.price || value.salary || 0,
          playerId: value.playerId || value._id || value.id
        };
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
  timerResetForTurn: null,  // NEW: Track which turn we've reset the timer for
  
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

// ENHANCED Draft slice with better roster preservation AND FIXED TIMER
const draftSlice = createSlice({
  name: 'draft',
  initialState,
  reducers: {
    updateDraftState: (state, action) => {
      console.log('🔄 updateDraftState called with:', {
        hasTeams: !!action.payload.teams,
        teamsLength: action.payload.teams?.length,
        teamsIsArray: Array.isArray(action.payload.teams),
        hasPlayerBoard: !!action.payload.playerBoard,
        playerBoardLength: action.payload.playerBoard?.length,
        hasUsers: !!action.payload.users,
        currentTurn: action.payload.currentTurn,
        currentPick: action.payload.currentPick,
        timeRemaining: action.payload.timeRemaining
      });

      // ==========================================
      // TIMER FIX: Detect turn changes BEFORE updating currentTurn
      // ==========================================
      const prevTurn = state.currentTurn;
      const newTurn = action.payload.currentTurn;
      const isActiveOrGoingActive = action.payload.status === 'active' || state.status === 'active';
      
      // Detect if this is a NEW turn (not just a re-sync of the same turn)
      const turnIsChanging = newTurn !== undefined && 
                            (prevTurn === undefined || newTurn !== prevTurn);
      
      // Only reset timer if:
      // 1. Turn is actually changing
      // 2. We haven't already reset for this turn
      // 3. Draft is active
      const shouldResetTimer = turnIsChanging && 
                              newTurn !== state.timerResetForTurn &&
                              isActiveOrGoingActive;
      
      if (shouldResetTimer) {
        console.log(`⏱️ TIMER FIX: Turn changing from ${prevTurn} to ${newTurn}, will reset to 30s`);
      }
      // ==========================================

      // ENHANCED: Much more intelligent team processing with budget preservation
      // (ALL OF THIS LOGIC IS UNCHANGED - ONLY TIMER IS FIXED)
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
              console.log('🔄 Processing and merging teams');
              
              // Process new teams and merge with existing data
              state.teams = action.payload.teams.map((newTeam, index) => {
                // Find corresponding existing team
                const existingTeam = state.teams?.find(t => 
                  (t.userId && newTeam.userId && t.userId === newTeam.userId) ||
                  (t.name && newTeam.name && t.name === newTeam.name) ||
                  index < state.teams.length
                ) || {};

                // Merge roster data intelligently
                const mergedRoster = mergeRosterData(existingTeam.roster, newTeam.roster || newTeam.picks);

                // CRITICAL FIX: Budget preservation logic with 0 protection
                let finalBudget = 15; // Default budget
                
                // FIRST: Always preserve budget of 0
                if (existingTeam.budget === 0) {
                  finalBudget = 0;
                  console.log('💰 Preserving budget at $0 (was already 0)');
                } else {
                  // Calculate expected budget based on roster
                  const rosterSpend = Object.values(mergedRoster).reduce((total, player) => {
                    if (player && player.price !== undefined) {
                      return total + player.price;
                    }
                    return total;
                  }, 0);
                  
                  const calculatedBudget = Math.max(0, 15 - rosterSpend);
                  
                  // Trust the server budget ONLY if it makes sense with the roster
                  if (newTeam.budget !== undefined && typeof newTeam.budget === 'number') {
                    const serverBudget = newTeam.budget;
                    
                    // CRITICAL: Never allow reset from 0 to positive
                    if (existingTeam.budget === 0 && serverBudget > 0) {
                      finalBudget = 0;
                      console.log('💰 Rejecting server attempt to reset from $0 to $' + serverBudget);
                    } else {
                      const budgetDiff = Math.abs(serverBudget - calculatedBudget);
                      
                      // If server budget is close to calculated (within $1), use server
                      // This handles rounding or bonus money
                      if (budgetDiff <= 1 || newTeam.bonus > 0) {
                        finalBudget = serverBudget;
                        console.log('💰 Using server budget:', serverBudget);
                      } else {
                        // Server budget doesn't match roster - use calculated
                        finalBudget = calculatedBudget;
                        console.log('💰 Server budget mismatch, using calculated:', {
                          serverBudget,
                          calculatedBudget,
                          rosterSpend,
                          diff: budgetDiff
                        });
                      }
                    }
                  } else if (existingTeam.budget !== undefined) {
                    // No server budget, preserve existing if it makes sense
                    const existingBudgetValid = Math.abs(existingTeam.budget - calculatedBudget) <= 1;
                    finalBudget = existingBudgetValid ? existingTeam.budget : calculatedBudget;
                  } else {
                    // No budget info, calculate from roster
                    finalBudget = calculatedBudget;
                  }

                  // FINAL CHECK: If we calculated 15 but roster shows money was spent, something is wrong
                  if (finalBudget === 15 && rosterSpend > 0) {
                    finalBudget = Math.max(0, 15 - rosterSpend);
                    console.log('💰 Correcting budget from $15 to $' + finalBudget + ' (spent: $' + rosterSpend + ')');
                  }
                }

                // Ensure budget never goes negative
                finalBudget = Math.max(0, finalBudget);

                return {
                  ...existingTeam,
                  ...newTeam,
                  roster: mergedRoster,
                  userId: newTeam.userId || existingTeam.userId,
                  name: newTeam.name || existingTeam.name || `Team ${index + 1}`,
                  budget: finalBudget,
                  bonus: newTeam.bonus || existingTeam.bonus || 0,
                  color: newTeam.color || existingTeam.color || 
                         ['green', 'red', 'blue', 'yellow', 'purple'][index % 5]
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
      if (action.payload.picks !== undefined) state.picks = action.payload.picks;
      
      // ==========================================
      // TIMER FIX: Handle timer based on turn change detection
      // ==========================================
      if (shouldResetTimer) {
        // NEW TURN: Reset timer to full 30 seconds
        state.timeRemaining = 30;
        state.timerResetForTurn = newTurn;
        console.log(`⏱️ TIMER RESET: Turn ${newTurn} starting with 30s`);
      } else if (action.payload.timeRemaining !== undefined) {
        // SAME TURN: Use server's time for sync (drift correction)
        state.timeRemaining = action.payload.timeRemaining;
      }
      // ==========================================
      
      if (action.payload.countdownTime !== undefined) state.countdownTime = action.payload.countdownTime;
      if (action.payload.currentDrafter !== undefined) state.currentDrafter = action.payload.currentDrafter;
      if (action.payload.isMyTurn !== undefined) state.isMyTurn = action.payload.isMyTurn;
      if (action.payload.roomId !== undefined) state.roomId = action.payload.roomId;
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
        timeRemaining: state.timeRemaining,
        timerResetForTurn: state.timerResetForTurn,
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
        
        // Update roster
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
      // This returns initialState which includes timerResetForTurn: null
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
          
          // TIMER FIX: If draft is active during initialization, start fresh
          if (draft.status === 'active') {
            state.timeRemaining = 30;
            state.timerResetForTurn = draft.currentTurn;
            console.log('⏱️ TIMER FIX: Draft active on init, starting at 30s for turn', draft.currentTurn);
          }
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