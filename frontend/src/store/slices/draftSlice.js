// frontend/src/store/slices/draftSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import socketService from '../../services/socket';

// All valid roster slots across all sports
const ALL_VALID_SLOTS = [
  // NFL
  'QB', 'RB', 'WR', 'TE', 'FLEX',
  // NBA
  'PG', 'SG', 'SF', 'PF', 'C',
  // MLB
  'P', '1B', '2B', '3B', 'SS', 'OF', 'DH'
];

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
    neededPositions.push('RB', 'WR', 'TE');
  }

  let bestPick = null;
  let highestValue = -1;

  playerBoard.forEach((row, rowIndex) => {
    row.forEach((player, colIndex) => {
      if (!player.drafted && player.price <= budget) {
        let positionValue = 0;
        
        if (neededPositions.includes(player.position)) {
          positionValue = (6 - rowIndex) * 10;
          
          if (!hasQB && player.position === 'QB') positionValue += 20;
          if (!hasRB && player.position === 'RB') positionValue += 15;
          if (!hasWR && player.position === 'WR') positionValue += 15;
          if (!hasTE && player.position === 'TE') positionValue += 10;
        }

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

// Roster processing that correctly uses SLOT KEY, not player position
const processRosterData = (roster) => {
  if (!roster) return {};
  
  const standardizedRoster = {};
  
  if (Array.isArray(roster)) {
    roster.forEach((player) => {
      if (player && player.position && player.name) {
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
  
  if (typeof roster === 'object') {
    Object.entries(roster).forEach(([key, value]) => {
      if (!value || value === null) {
        return;
      }
      
      const slotKey = key.toUpperCase();
      if (!ALL_VALID_SLOTS.includes(slotKey)) {
        return;
      }
      
      if (typeof value === 'object' && value.name) {
        const slot = slotKey;
        
        standardizedRoster[slot] = {
          name: value.name,
          position: value.originalPosition || value.position || slot,
          originalPosition: value.originalPosition || value.position || slot,
          team: value.team,
          price: value.price || value.value || value.salary || 0,
          value: value.value || value.price || value.salary || 0,
          playerId: value.playerId || value._id || value.id
        };
      }
    });
  }
  
  return standardizedRoster;
};

// Intelligent roster merging that preserves existing data
const mergeRosterData = (currentRoster, newRoster) => {
  const current = processRosterData(currentRoster) || {};
  const incoming = processRosterData(newRoster) || {};
  
  const merged = { ...current };
  
  Object.entries(incoming).forEach(([position, player]) => {
    if (player && player.name && typeof player.name === 'string' && player.name.trim()) {
      merged[position] = player;
    }
  });
  
  return merged;
};

// Helper function to count actual players in rosters
const countActualPlayers = (teams) => {
  if (!Array.isArray(teams)) return 0;
  return teams.reduce((total, team) => {
    const roster = team.roster || {};
    return total + Object.values(roster).filter(player => 
      player && player.name && typeof player.name === 'string' && player.name.trim()
    ).length;
  }, 0);
};

// Check if teams data looks like it was processed by DraftScreen
const isProcessedByDraftScreen = (teams) => {
  if (!Array.isArray(teams) || teams.length === 0) return false;
  
  return teams.some(team => {
    const roster = team?.roster;
    if (!roster || typeof roster !== 'object') return false;
    
    const hasStandardizedKeys = Object.keys(roster).some(key => 
      ALL_VALID_SLOTS.includes(key)
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
  status: 'idle',
  error: null,
  roomId: null,
  contestId: null,
  contestType: 'cash',
  contestData: null,
  entryId: null,
  entryCount: 5,
  teams: [],
  users: [],
  connectedPlayers: 0,
  userDraftPosition: null,
  currentTurn: 0,
  currentPick: 0,
  draftOrder: [],
  picks: [],
  playerBoard: [],
  timeRemaining: 30,
  countdownTime: 0,
  currentDrafter: null,
  isMyTurn: false,
  selectedPlayer: null,
  currentViewTeam: 0,
  showResults: false,
  autoPickEnabled: false,
  showAutoPickSuggestion: false,
  draftResults: null,
  finalRosters: null
};

// ==================== ASYNC THUNKS ====================

// Initialize draft via HTTP (works for both waiting rooms and active drafts)
export const initializeDraft = createAsyncThunk(
  'draft/initialize',
  async ({ roomId, userId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`/api/drafts/initialize/${roomId}`);
      const data = response.data;
      
      return {
        success: true,
        roomId: data.roomId,
        contestId: data.contestId,
        contestType: data.contestType,
        entryId: data.entryId,
        userDraftPosition: data.userDraftPosition,
        status: data.status,
        playerBoard: data.playerBoard,
        currentPlayers: data.currentPlayers,
        maxPlayers: data.maxPlayers,
        contestData: data.contestData,
        users: data.users
      };
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to initialize draft');
    }
  }
);

export const joinDraftRoom = createAsyncThunk(
  'draft/joinRoom',
  async ({ roomId, userId }, { rejectWithValue }) => {
    try {
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
      socketService.emit('skip-turn', { roomId });
      return { success: true };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// ==================== DRAFT SLICE ====================
const draftSlice = createSlice({
  name: 'draft',
  initialState,
  reducers: {
    updateDraftState: (state, action) => {
      // Detect room change and clear stale data
      const incomingRoomId = action.payload.roomId || action.payload.contestId;
      const currentRoomId = state.roomId || state.contestId;
      
      if (incomingRoomId && currentRoomId && incomingRoomId !== currentRoomId) {
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
      
      if (incomingRoomId) {
        state.roomId = incomingRoomId;
      }

      // Team processing
      if (action.payload.teams !== undefined) {
        if (Array.isArray(action.payload.teams)) {
          const currentPlayerCount = countActualPlayers(state.teams);
          const newPlayerCount = countActualPlayers(action.payload.teams);
          const hasNoTeams = !state.teams || state.teams.length === 0;
          const alreadyProcessed = isProcessedByDraftScreen(action.payload.teams);

          let shouldUpdate = false;

          if (hasNoTeams) {
            shouldUpdate = true;
          } else if (alreadyProcessed) {
            shouldUpdate = true;
          } else if (newPlayerCount > currentPlayerCount) {
            shouldUpdate = true;
          } else if (newPlayerCount === currentPlayerCount && newPlayerCount > 0) {
            shouldUpdate = true;
          }

          if (shouldUpdate) {
            if (alreadyProcessed) {
              state.teams = action.payload.teams;
            } else {
              state.teams = action.payload.teams.map((newTeam, index) => {
                const existingTeam = state.teams?.find(t => 
                  t.userId && newTeam.userId && t.userId === newTeam.userId
                );
                
                let finalRoster = {};
                if (existingTeam && Object.keys(existingTeam.roster || {}).length > 0) {
                  finalRoster = mergeRosterData(existingTeam.roster, newTeam.roster || newTeam.picks);
                } else {
                  finalRoster = processRosterData(newTeam.roster || newTeam.picks || {});
                }

                let finalBudget = 15;
                let finalBonus = newTeam.bonus || existingTeam?.bonus || 0;
                
                const rosterSpend = Object.values(finalRoster).reduce((total, player) => {
                  if (player && typeof player === 'object' && player.price !== undefined) {
                    return total + (player.price || 0);
                  }
                  return total;
                }, 0);
                
                const calculatedBudget = Math.max(0, 15 - rosterSpend);
                
                if (existingTeam?.budget === 0) {
                  finalBudget = 0;
                } else if (rosterSpend >= 15) {
                  finalBudget = 0;
                } else if (newTeam.budget !== undefined && typeof newTeam.budget === 'number') {
                  const serverBudget = newTeam.budget;
                  
                  if (existingTeam?.budget === 0 && serverBudget > 0) {
                    finalBudget = 0;
                  } else if (Math.abs(serverBudget - calculatedBudget) <= 1 || finalBonus > 0) {
                    finalBudget = Math.max(0, serverBudget);
                  } else {
                    finalBudget = calculatedBudget;
                  }
                } else if (existingTeam?.budget !== undefined) {
                  const existingBudget = existingTeam.budget;
                  
                  if (existingBudget === 0 || (existingBudget < 1 && rosterSpend > 0)) {
                    finalBudget = 0;
                  } else if (Math.abs(existingBudget - calculatedBudget) <= 1) {
                    finalBudget = Math.max(0, existingBudget);
                  } else {
                    finalBudget = calculatedBudget;
                  }
                } else {
                  finalBudget = calculatedBudget;
                }
                
                finalBudget = Math.max(0, finalBudget);
                
                if (finalBudget === 15 && rosterSpend > 0) {
                  finalBudget = Math.max(0, 15 - rosterSpend);
                }
                
                const playerCount = Object.values(finalRoster).filter(p => p?.name).length;
                if (playerCount >= 4 && finalBudget > 5 && rosterSpend > 10) {
                  const correctedBudget = Math.max(0, 15 - rosterSpend);
                  if (correctedBudget < finalBudget) {
                    finalBudget = correctedBudget;
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
          }
        }
      } else if (action.payload.users && Array.isArray(action.payload.users) && (!state.teams || state.teams.length === 0)) {
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

      if (action.payload.playerBoard && Array.isArray(action.payload.playerBoard)) {
        state.playerBoard = action.payload.playerBoard;
      }
      
      if (action.payload.status !== undefined) state.status = action.payload.status;
      if (action.payload.currentTurn !== undefined) state.currentTurn = action.payload.currentTurn;
      if (action.payload.currentPick !== undefined) state.currentPick = action.payload.currentPick;
      if (action.payload.draftOrder !== undefined) state.draftOrder = action.payload.draftOrder;
      if (action.payload.picks !== undefined) state.picks = action.payload.picks;
      if (action.payload.timeRemaining !== undefined) state.timeRemaining = action.payload.timeRemaining;
      if (action.payload.countdownTime !== undefined) state.countdownTime = action.payload.countdownTime;
      if (action.payload.currentDrafter !== undefined) state.currentDrafter = action.payload.currentDrafter;
      if (action.payload.isMyTurn !== undefined) state.isMyTurn = action.payload.isMyTurn;
      if (action.payload.contestId !== undefined) state.contestId = action.payload.contestId;
      if (action.payload.contestType !== undefined) state.contestType = action.payload.contestType;
      if (action.payload.connectedPlayers !== undefined) state.connectedPlayers = action.payload.connectedPlayers;
      if (action.payload.showResults !== undefined) state.showResults = action.payload.showResults;
      if (action.payload.sport !== undefined) state.sport = action.payload.sport;
      if (action.payload.currentViewTeam !== undefined) state.currentViewTeam = action.payload.currentViewTeam;
      
      if (action.payload.users && Array.isArray(action.payload.users)) {
        state.users = action.payload.users;
        state.connectedPlayers = action.payload.users.filter(u => u.connected !== false).length;
      } else if (action.payload.participants && Array.isArray(action.payload.participants)) {
        state.users = action.payload.participants;
        state.connectedPlayers = action.payload.participants.filter(p => p.connected !== false).length;
      }
    },
    
    updateTeamRoster: (state, action) => {
      const { teamIndex, position, player } = action.payload;
      
      if (state.teams && state.teams[teamIndex]) {
        const currentRoster = state.teams[teamIndex].roster || {};
        
        const existingPlayer = currentRoster[position];
        const isNewPick = !existingPlayer || existingPlayer.name !== player?.name;
        
        state.teams[teamIndex].roster = {
          ...currentRoster,
          [position]: player
        };
        
        if (player && player.price !== undefined && isNewPick) {
          const currentBudget = state.teams[teamIndex].budget !== undefined 
            ? state.teams[teamIndex].budget 
            : 15;
          
          const newBudget = Math.max(0, currentBudget - player.price);
          state.teams[teamIndex].budget = newBudget;
        }
      }
    },
    
    updatePlayerBoardCell: (state, action) => {
      const { row, col, updates } = action.payload;
      if (state.playerBoard && state.playerBoard[row] && state.playerBoard[row][col]) {
        state.playerBoard[row][col] = {
          ...state.playerBoard[row][col],
          ...updates
        };
      }
    },
    
    addPick: (state, action) => {
      const pick = action.payload;
      
      const existingIndex = state.picks.findIndex(p => p.pickNumber === pick.pickNumber);
      
      if (existingIndex >= 0) {
        state.picks[existingIndex] = { ...state.picks[existingIndex], ...pick };
      } else {
        state.picks.push(pick);
      }
      
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
      .addCase(initializeDraft.pending, (state) => {
        state.status = 'initializing';
        state.error = null;
      })
      .addCase(initializeDraft.fulfilled, (state, action) => {
        state.roomId = action.payload.roomId;
        state.contestId = action.payload.contestId;
        state.contestType = action.payload.contestType;
        state.entryId = action.payload.entryId;
        state.userDraftPosition = action.payload.userDraftPosition ?? null;
        state.contestData = action.payload.contestData || null;
        state.entryCount = action.payload.maxPlayers || 5;
        
        if (action.payload.playerBoard) {
          state.playerBoard = action.payload.playerBoard;
        }
        
        if (action.payload.users) {
          state.users = action.payload.users;
          state.connectedPlayers = action.payload.currentPlayers || action.payload.users.length;
        }
        
        // Waiting room vs active draft
        if (action.payload.status === 'waiting') {
          state.status = 'waiting';
        } else {
          state.status = 'initialized';
        }
      })
      .addCase(initializeDraft.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload || 'Failed to initialize draft';
      })
      .addCase(joinDraftRoom.fulfilled, (state, action) => {
        if (action.payload.draftPosition !== undefined) {
          state.userDraftPosition = action.payload.draftPosition;
        }
      })
      .addCase(joinDraftRoom.rejected, (state, action) => {
        state.error = action.payload || 'Failed to join draft room';
      })
      .addCase(leaveDraftRoom.fulfilled, (state) => {
      })
      .addCase(skipTurn.fulfilled, (state) => {
      });
  }
});

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

export const selectAuthUser = (state) => state.auth?.user;

export default draftSlice.reducer;