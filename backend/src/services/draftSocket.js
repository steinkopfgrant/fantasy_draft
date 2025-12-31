const jwt = require('jsonwebtoken');
const { DraftManager, DraftValidator, DraftEventHandler } = require('./draft');
const contestService = require('./contestService');

class DraftSocketHandler {
  constructor() {
    this.io = null;
    this.draftManager = new DraftManager();
    this.validator = new DraftValidator();
    this.eventHandler = null;
    this.roomPlayers = new Map(); // Track players in each room
  }

  initialize(io) {
    this.io = io;
    this.eventHandler = new DraftEventHandler(io, this.draftManager, this.validator, contestService);
    
    // Authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        socket.userId = decoded.userId;
        socket.username = decoded.username;
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });
    
    // Connection handler
    io.on('connection', (socket) => {
      console.log(`User ${socket.username} connected (${socket.id})`);
      
      // Join draft
      socket.on('join-draft', async (data) => {
        const { contestId, entryId } = data;
        console.log(`${socket.username} joining draft for contest ${contestId}, entry ${entryId}`);
        
        try {
          // Get the entry to find which room they're in
          const entry = contestService.getEntry(entryId);
          if (!entry) {
            socket.emit('error', { message: 'Entry not found' });
            return;
          }
          
          // IMPORTANT: Validate that this entry belongs to the connecting user
          if (entry.userId !== socket.userId) {
            console.error(`User ${socket.username} (${socket.userId}) tried to join with entry belonging to user ${entry.userId}`);
            socket.emit('error', { message: 'This entry does not belong to you' });
            return;
          }
          
          const roomId = entry.draftRoomId || contestId;
          const roomStatus = contestService.getRoomStatus(roomId);
          
          if (!roomStatus) {
            socket.emit('error', { message: 'Room not found' });
            return;
          }
          
          console.log(`Room ID: ${roomId}, Contest Type: ${entry.contest?.type}`);
          console.log(`Room Status:`, roomStatus);
          console.log(`Room entries: ${roomStatus.entries.length}/${roomStatus.maxPlayers}`);
          console.log(`Entry belongs to correct user: ${entry.userId === socket.userId}`);
          
          // Find the user's draft position based on their entry in this specific room
          let userDraftPosition = -1;
          for (let i = 0; i < roomStatus.entries.length; i++) {
            if (roomStatus.entries[i].userId === socket.userId && roomStatus.entries[i].id === entryId) {
              userDraftPosition = i;
              break;
            }
          }
          
          // If user not found in room, they shouldn't be here
          if (userDraftPosition === -1) {
            console.error(`User ${socket.username} not found in room ${roomId} entries`);
            socket.emit('error', { message: 'You are not registered for this draft room' });
            return;
          }
          
          console.log(`User ${socket.username} has draft position ${userDraftPosition}`);
          
          // Join the socket room
          socket.join(roomId);
          
          // Store room info on socket with draft position
          socket.contestId = contestId;
          socket.roomId = roomId;
          socket.entryId = entryId;
          socket.userId = socket.userId;
          socket.username = socket.username;
          socket.draftPosition = userDraftPosition;
          
          // Track this player in the room with draft position
          if (!this.roomPlayers.has(roomId)) {
            this.roomPlayers.set(roomId, new Map());
          }
          this.roomPlayers.get(roomId).set(socket.userId, {
            userId: socket.userId,
            username: socket.username,
            socketId: socket.id,
            entryId: entryId,
            draftPosition: userDraftPosition,
            connected: true
          });
          
          // Send room update to all players in the room
          this.sendRoomUpdate(roomId);
          
          // Send initial draft status to the joining player
          const draft = this.draftManager.getDraft(roomId);
          if (draft) {
            // Get current drafter info
            const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
            const currentDrafter = Array.from(draft.players.values()).find(p => p.position === currentDrafterPosition);
            
            socket.emit('draft-state-update', {
              status: draft.status,
              currentTurn: draft.state.currentTurn,
              draftOrder: draft.state.draftOrder,
              picks: draft.state.picks,
              timeRemaining: 30,
              currentDrafter: currentDrafter?.username || 'Unknown',
              currentDrafterPosition: currentDrafterPosition,
              userDraftPosition: userDraftPosition,
              users: Array.from(draft.players.values()),
              playerBoard: draft.board
            });
          } else {
            // No draft exists yet, send waiting status
            socket.emit('draft-state-update', {
              status: 'waiting',
              currentTurn: 0,
              draftOrder: [],
              totalPlayers: roomStatus.maxPlayers,
              connectedPlayers: this.getConnectedPlayersCount(roomId),
              userDraftPosition: userDraftPosition
            });
          }
          
          // Check if room is full and should start draft
          const connectedCount = this.getConnectedPlayersCount(roomId);
          console.log(`Room ${roomId}: ${connectedCount}/${roomStatus.maxPlayers} players connected`);
          
          if (connectedCount === roomStatus.maxPlayers && !draft) {
            console.log(`Room ${roomId} is full! Starting countdown...`);
            this.startDraftCountdown(roomId);
          }
          
        } catch (error) {
          console.error('Error joining draft:', error);
          socket.emit('error', { message: error.message });
        }
      });
      
      // Make pick
      socket.on('make-pick', async (data) => {
        const { row, col, player, rosterSlot } = data;
        const draftId = socket.roomId || socket.contestId;
        
        console.log(`\n=== PICK ATTEMPT ===`);
        console.log(`User: ${socket.username} (${socket.userId})`);
        console.log(`Player: ${player.name}`);
        console.log(`Draft/Room: ${draftId}`);
        console.log(`Row: ${row}, Col: ${col}, Slot: ${rosterSlot}`);
        
        if (!draftId) {
          socket.emit('error', { message: 'Not in a draft' });
          return;
        }
        
        try {
          const draft = this.draftManager.getDraft(draftId);
          if (!draft) {
            socket.emit('error', { message: 'Draft not found' });
            return;
          }
          
          // Validate it's the user's turn
          const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
          if (socket.draftPosition !== currentDrafterPosition) {
            socket.emit('error', { message: 'Not your turn!' });
            return;
          }
          
          // Make the pick through draft manager
          const pick = {
            row,
            col,
            player,
            rosterSlot,
            userId: socket.userId,
            username: socket.username,
            turnNumber: draft.state.currentTurn,
            draftPosition: socket.draftPosition,
            timestamp: new Date()
          };
          
          // Update draft state
          draft.state.picks.push(pick);
          
          // Update player board
          if (draft.board[row] && draft.board[row][col]) {
            draft.board[row][col] = {
              ...draft.board[row][col],
              drafted: true,
              draftedBy: socket.draftPosition
            };
          }
          
          // Update player roster
          const playerEntry = draft.players.get(socket.userId);
          if (playerEntry) {
            if (!playerEntry.roster) playerEntry.roster = {};
            playerEntry.roster[rosterSlot] = player;
            playerEntry.budget -= player.price;
            
            // Check for kingpin bonuses if applicable
            if (draft.type === 'kingpin' || draft.type === 'firesale') {
              const bonusEarned = this.calculateKingpinBonus(playerEntry, player);
              if (bonusEarned > 0) {
                playerEntry.bonus = (playerEntry.bonus || 0) + bonusEarned;
                pick.bonusEarned = bonusEarned;
              }
            }
          }
          
          // Advance turn
          draft.state.currentTurn++;
          console.log(`TURN ADVANCED: ${draft.state.currentTurn - 1} -> ${draft.state.currentTurn}`);
          
          // Save to backend
          contestService.saveDraftPick(socket.entryId, {
            player,
            rosterSlot,
            userId: socket.userId,
            timestamp: new Date()
          });
          
          // Get next drafter info
          let nextDrafterPosition = null;
          let nextDrafter = null;
          
          if (draft.state.currentTurn < draft.state.draftOrder.length) {
            nextDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
            nextDrafter = Array.from(draft.players.values()).find(p => p.position === nextDrafterPosition);
          }
          
          // Emit pick made to all players in the room
          this.io.to(draftId).emit('pick-made', {
            pick,
            currentTurn: draft.state.currentTurn,
            nextDrafter: nextDrafterPosition,
            message: `${socket.username} drafted ${player.name} for $${player.price}`
          });
          
          // Check if draft is complete
          if (draft.state.currentTurn >= draft.state.draftOrder.length) {
            clearInterval(draft.pickTimer);
            this.completeDraft(draftId);
          } else {
            // Send updated draft state to all players
            const updatedState = {
              status: 'active',
              currentTurn: draft.state.currentTurn,
              draftOrder: draft.state.draftOrder,
              picks: draft.state.picks,
              timeRemaining: 30,
              currentDrafter: nextDrafter?.username || 'Unknown',
              currentDrafterPosition: nextDrafterPosition,
              users: Array.from(draft.players.values()),
              playerBoard: draft.board,
              message: `${nextDrafter?.username}'s turn to draft!`
            };
            
            // Send personalized state to each player
            for (const [userId, player] of draft.players) {
              const socket = this.io.sockets.sockets.get(player.socketId);
              if (socket) {
                socket.emit('draft-state-update', {
                  ...updatedState,
                  userDraftPosition: player.position
                });
              }
            }
            
            // Restart the pick timer
            this.startPickTimer(draftId);
          }
          
        } catch (error) {
          console.error('Error making pick:', error);
          socket.emit('error', { message: error.message });
        }
      });
      
      // Skip turn
      socket.on('skip-turn', async () => {
        const draftId = socket.roomId || socket.contestId;
        
        console.log(`\n=== TURN SKIP ===`);
        console.log(`User: ${socket.username} (${socket.userId}) is skipping their turn`);
        console.log(`Draft/Room: ${draftId}`);
        
        if (!draftId) {
          socket.emit('error', { message: 'Not in a draft' });
          return;
        }
        
        try {
          await this.eventHandler.handleSkipTurn(socket, {
            contestId: draftId,
            reason: 'no_budget'
          });
        } catch (error) {
          console.error('Error skipping turn:', error);
          socket.emit('error', { message: error.message });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.username} disconnected`);
        
        const roomId = socket.roomId;
        if (roomId && this.roomPlayers.has(roomId)) {
          const playerInfo = this.roomPlayers.get(roomId).get(socket.userId);
          if (playerInfo) {
            playerInfo.connected = false;
            this.sendRoomUpdate(roomId);
          }
        }
        
        const draftId = socket.roomId || socket.contestId;
        if (draftId) {
          this.eventHandler.handleDisconnect(socket, draftId);
        }
      });
    });
  }
  
  sendRoomUpdate(roomId) {
    const roomStatus = contestService.getRoomStatus(roomId);
    if (!roomStatus) return;
    
    const players = [];
    if (this.roomPlayers.has(roomId)) {
      this.roomPlayers.get(roomId).forEach(player => {
        players.push({
          userId: player.userId,
          username: player.username,
          connected: player.connected,
          draftPosition: player.draftPosition
        });
      });
    }
    
    // Emit room update to all players in the room
    this.io.to(roomId).emit('room-update', {
      players: players,
      currentPlayers: players.filter(p => p.connected).length,
      maxPlayers: roomStatus.maxPlayers
    });
  }
  
  getConnectedPlayersCount(roomId) {
    if (!this.roomPlayers.has(roomId)) return 0;
    
    let count = 0;
    this.roomPlayers.get(roomId).forEach(player => {
      if (player.connected) count++;
    });
    return count;
  }
  
  startDraftCountdown(roomId) {
    const roomPlayers = this.roomPlayers.get(roomId);
    if (!roomPlayers) return;
    
    // Get the contest and room entries
    const contestId = roomId.includes('_room_') ? roomId.split('_room_')[0] : roomId;
    const contest = contestService.getContest(contestId);
    const roomStatus = contestService.getRoomStatus(roomId);
    
    if (!contest || !roomStatus) {
      console.error('Contest or room not found');
      return;
    }
    
    // Get entries for this room with draft positions
    const entries = roomStatus.entries.map((entry, index) => ({
      ...entry,
      draftPosition: index,
      teamColor: ['Green', 'Red', 'Blue', 'Yellow', 'Purple'][index]
    }));
    
    // Create draft through DraftManager with proper structure
    const draft = this.draftManager.createDraft(roomId, {
      maxPlayers: 5,
      playerBoard: contest.playerBoard,
      type: contest.type,
      entries: entries,
      timePerPick: 30,
      countdownTime: 10
    });
    
    // Start countdown
    draft.status = 'countdown';
    draft.state.countdownTime = 10;
    draft.state.draftOrder = this.createSnakeDraftOrder(5, 5);
    
    // Initialize players in the draft - only include connected players
    const connectedEntries = [];
    entries.forEach(entry => {
      const playerInfo = roomPlayers.get(entry.userId);
      if (playerInfo && playerInfo.connected) {
        connectedEntries.push(entry);
        draft.players.set(entry.userId, {
          socketId: playerInfo.socketId,
          userId: entry.userId,
          username: entry.username,
          position: entry.draftPosition,
          teamColor: entry.teamColor,
          connected: true,
          roster: {},
          budget: 15,
          bonus: 0,
          entryId: entry.id
        });
      }
    });
    
    const players = Array.from(draft.players.values());
    
    console.log(`Starting countdown for room ${roomId}`);
    console.log(`Connected players: ${players.length}`);
    console.log(`Players: ${players.map(p => `${p.username} (pos: ${p.position})`).join(', ')}`);
    console.log(`Draft order: ${draft.state.draftOrder}`);
    
    // Emit countdown started with user positions
    this.io.to(roomId).emit('countdown-started', {
      countdownTime: 10,
      users: players,
      draftOrder: draft.state.draftOrder
    });
    
    let countdownValue = 10;
    
    const countdownInterval = setInterval(() => {
      countdownValue--;
      
      if (countdownValue > 0) {
        this.io.to(roomId).emit('countdown-update', {
          countdownTime: countdownValue
        });
      } else {
        clearInterval(countdownInterval);
        
        console.log(`Countdown finished for room ${roomId}, starting draft...`);
        
        // Update draft status
        draft.status = 'active';
        draft.state.startTime = new Date();
        draft.state.currentTurn = 0;
        
        // Get first drafter info
        const firstDrafterPosition = draft.state.draftOrder[0];
        const firstDrafter = players.find(p => p.position === firstDrafterPosition);
        
        console.log(`Draft starting with first drafter: ${firstDrafter?.username} at position ${firstDrafterPosition}`);
        
        // Emit draft started with all necessary data
        this.io.to(roomId).emit('draft-started', {
          draftOrder: draft.state.draftOrder,
          currentTurn: 0,
          status: 'active',
          playerBoard: contest.playerBoard,
          users: players
        });
        
        // Send comprehensive draft state update to each player with their position
        for (const [userId, player] of draft.players) {
          const socket = this.io.sockets.sockets.get(player.socketId);
          if (socket) {
            socket.emit('draft-state-update', {
              status: 'active',
              currentTurn: 0,
              draftOrder: draft.state.draftOrder,
              picks: [],
              timeRemaining: 30,
              currentDrafter: firstDrafter?.username || 'Unknown',
              currentDrafterPosition: firstDrafterPosition,
              userDraftPosition: player.position,
              users: players,
              playerBoard: contest.playerBoard,
              message: `${firstDrafter?.username}'s turn to draft!`
            });
          }
        }
        
        console.log(`Draft started for room ${roomId} with ${players.length} players`);
        
        // Start the pick timer
        this.startPickTimer(roomId);
      }
    }, 1000);
  }
  
  startPickTimer(roomId) {
    const draft = this.draftManager.getDraft(roomId);
    if (!draft || draft.status !== 'active') return;
    
    let timeRemaining = 30;
    
    // Clear any existing timer
    if (draft.pickTimer) {
      clearInterval(draft.pickTimer);
    }
    
    // Start countdown
    draft.pickTimer = setInterval(() => {
      timeRemaining--;
      
      // Emit timer update every second with current turn info
      this.io.to(roomId).emit('timer-update', {
        timeRemaining: timeRemaining,
        currentTurn: draft.state.currentTurn,
        currentDrafterPosition: draft.state.draftOrder[draft.state.currentTurn]
      });
      
      if (timeRemaining <= 0) {
        // Time's up - handle timeout
        this.handlePickTimeout(roomId);
      }
    }, 1000);
    
    console.log(`Pick timer started for room ${roomId}`);
  }
  
  handlePickTimeout(roomId) {
    const draft = this.draftManager.getDraft(roomId);
    if (!draft) return;
    
    const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
    const currentDrafter = Array.from(draft.players.values()).find(p => p.position === currentDrafterPosition);
    
    if (currentDrafter) {
      console.log(`Time expired for ${currentDrafter.username}, auto-picking...`);
      
      // Find the best available player the user can afford
      const playerBoard = draft.board;
      let bestPlayer = null;
      let bestPosition = null;
      
      // Get current roster to see what positions are needed
      const roster = currentDrafter.roster || {};
      const neededPositions = [];
      if (!roster.QB) neededPositions.push('QB');
      if (!roster.RB) neededPositions.push('RB');
      if (!roster.WR) neededPositions.push('WR');
      if (!roster.TE) neededPositions.push('TE');
      if (!roster.FLEX) neededPositions.push('FLEX');
      
      // Search the board for the highest value player they can afford
      for (let row = 0; row < playerBoard.length; row++) {
        for (let col = 0; col < playerBoard[row].length; col++) {
          const player = playerBoard[row][col];
          
          // Skip if already drafted
          if (player.drafted) continue;
          
          // Skip if can't afford
          if (player.price > currentDrafter.budget) continue;
          
          // Check if this player can fill a needed position
          const availableSlots = this.getAvailableSlots(currentDrafter, player);
          if (availableSlots.length === 0) continue;
          
          // Prioritize filling required positions first
          const canFillNeeded = availableSlots.some(slot => neededPositions.includes(slot));
          
          if (!bestPlayer || (canFillNeeded && player.price > bestPlayer.price)) {
            bestPlayer = player;
            bestPosition = { row, col, slot: availableSlots[0] };
          }
        }
      }
      
      if (bestPlayer && bestPosition) {
        // Make the auto-pick
        const autoPick = {
          row: bestPosition.row,
          col: bestPosition.col,
          player: bestPlayer,
          rosterSlot: bestPosition.slot,
          userId: currentDrafter.userId,
          username: currentDrafter.username,
          turnNumber: draft.state.currentTurn,
          draftPosition: currentDrafterPosition,
          timestamp: new Date(),
          isAutoPick: true
        };
        
        // Record the pick
        draft.state.picks.push(autoPick);
        
        // Update player board
        draft.board[bestPosition.row][bestPosition.col] = {
          ...draft.board[bestPosition.row][bestPosition.col],
          drafted: true,
          draftedBy: currentDrafterPosition
        };
        
        // Update player roster and budget
        if (!currentDrafter.roster) currentDrafter.roster = {};
        currentDrafter.roster[bestPosition.slot] = bestPlayer;
        currentDrafter.budget -= bestPlayer.price;
        
        // Save to backend
        contestService.saveDraftPick(currentDrafter.entryId, {
          player: bestPlayer,
          rosterSlot: bestPosition.slot,
          userId: currentDrafter.userId,
          isAutoPick: true,
          timestamp: new Date()
        });
        
        // Advance turn
        draft.state.currentTurn++;
        
        // Get next drafter
        const nextDrafterPosition = draft.state.currentTurn < draft.state.draftOrder.length 
          ? draft.state.draftOrder[draft.state.currentTurn] 
          : null;
        const nextDrafter = nextDrafterPosition !== null
          ? Array.from(draft.players.values()).find(p => p.position === nextDrafterPosition)
          : null;
        
        // Emit auto-pick made
        this.io.to(roomId).emit('pick-made', {
          pick: autoPick,
          currentTurn: draft.state.currentTurn,
          nextDrafter: nextDrafterPosition,
          isAutoPick: true,
          message: `${currentDrafter.username}'s time expired - auto-picked ${bestPlayer.name} for $${bestPlayer.price}`
        });
        
        // Check if draft is complete
        if (draft.state.currentTurn >= draft.state.draftOrder.length) {
          clearInterval(draft.pickTimer);
          this.completeDraft(roomId);
        } else {
          // Send updated draft state to each player
          for (const [userId, player] of draft.players) {
            const socket = this.io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('draft-state-update', {
                status: 'active',
                currentTurn: draft.state.currentTurn,
                draftOrder: draft.state.draftOrder,
                picks: draft.state.picks,
                timeRemaining: 30,
                currentDrafter: nextDrafter?.username || 'Unknown',
                currentDrafterPosition: nextDrafterPosition,
                userDraftPosition: player.position,
                users: Array.from(draft.players.values()),
                message: `${nextDrafter?.username}'s turn to draft!`
              });
            }
          }
          
          // Restart timer
          this.startPickTimer(roomId);
        }
      } else {
        // No valid pick available, must skip
        console.log(`No valid auto-pick for ${currentDrafter.username}, skipping turn...`);
        
        const skip = {
          userId: currentDrafter.userId,
          username: currentDrafter.username,
          type: 'skip',
          reason: 'no_valid_picks',
          turnNumber: draft.state.currentTurn,
          draftPosition: currentDrafterPosition,
          timestamp: new Date()
        };
        
        draft.state.skips = draft.state.skips || [];
        draft.state.skips.push(skip);
        draft.state.currentTurn++;
        
        // Get next drafter
        const nextDrafterPosition = draft.state.currentTurn < draft.state.draftOrder.length 
          ? draft.state.draftOrder[draft.state.currentTurn] 
          : null;
        const nextDrafter = nextDrafterPosition !== null
          ? Array.from(draft.players.values()).find(p => p.position === nextDrafterPosition)
          : null;
        
        // Emit turn skipped
        this.io.to(roomId).emit('turn-skipped', {
          skip,
          currentTurn: draft.state.currentTurn,
          nextDrafter: nextDrafterPosition,
          message: `${currentDrafter.username} has no valid picks available - turn skipped`
        });
        
        // Check if draft is complete
        if (draft.state.currentTurn >= draft.state.draftOrder.length) {
          clearInterval(draft.pickTimer);
          this.completeDraft(roomId);
        } else {
          // Send updated draft state to each player
          for (const [userId, player] of draft.players) {
            const socket = this.io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('draft-state-update', {
                status: 'active',
                currentTurn: draft.state.currentTurn,
                draftOrder: draft.state.draftOrder,
                picks: draft.state.picks,
                timeRemaining: 30,
                currentDrafter: nextDrafter?.username || 'Unknown',
                currentDrafterPosition: nextDrafterPosition,
                userDraftPosition: player.position,
                users: Array.from(draft.players.values())
              });
            }
          }
          
          // Restart timer
          this.startPickTimer(roomId);
        }
      }
    }
  }
  
  completeDraft(roomId) {
    const draft = this.draftManager.getDraft(roomId);
    if (!draft) return;
    
    draft.status = 'completed';
    
    // Emit draft completed to all players
    this.io.to(roomId).emit('draft-completed', {
      message: 'Draft completed!',
      results: Array.from(draft.players.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        roster: p.roster,
        budget: p.budget,
        bonus: p.bonus || 0
      }))
    });
    
    console.log(`Draft completed for room ${roomId}`);
    
    // Clean up
    this.draftManager.deleteDraft(roomId);
  }
  
  getAvailableSlots(team, player) {
    const playerPos = player.originalPosition || player.position;
    const availableSlots = [];
    const roster = team.roster || {};

    // Check if the specific position slot is open
    if (!roster[playerPos]) {
      availableSlots.push(playerPos);
    }

    // Check if FLEX slot is available (only for RB, WR, TE)
    if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(playerPos)) {
      availableSlots.push('FLEX');
    }

    return availableSlots;
  }
  
  calculateKingpinBonus(team, newPlayer) {
    let bonusAdded = 0;
    const roster = team.roster || {};
    const players = Object.values(roster);
    
    // Check for duplicate player bonus
    const duplicates = players.filter(p => 
      p.name === newPlayer.name && p.team === newPlayer.team
    );
    if (duplicates.length === 1) { // Already have one, this makes two
      bonusAdded++;
    }
    
    // Check for QB + pass catcher stack
    const teamQB = players.find(p => 
      (p.position === 'QB' || p.originalPosition === 'QB') && 
      p.team === newPlayer.team
    );
    const isPassCatcher = ['WR', 'TE'].includes(newPlayer.position) || 
      ['WR', 'TE'].includes(newPlayer.originalPosition);
    
    if (teamQB && isPassCatcher) {
      bonusAdded++;
    }
    
    // Or if new player is QB, check for existing pass catchers
    const isQB = newPlayer.position === 'QB' || newPlayer.originalPosition === 'QB';
    if (isQB) {
      const hasPassCatcher = players.some(p => 
        p.team === newPlayer.team &&
        (['WR', 'TE'].includes(p.position) || 
         ['WR', 'TE'].includes(p.originalPosition))
      );
      if (hasPassCatcher) {
        bonusAdded++;
      }
    }
    
    return bonusAdded;
  }
  
  getSocketIdForUser(userId) {
    // Find the socket ID for a user across all rooms
    for (const [roomId, players] of this.roomPlayers) {
      const player = players.get(userId);
      if (player && player.connected) {
        return player.socketId;
      }
    }
    return null;
  }
  
  createSnakeDraftOrder(numPlayers, numRounds) {
    const order = [];
    
    for (let round = 0; round < numRounds; round++) {
      if (round % 2 === 0) {
        // Even rounds: normal order
        for (let i = 0; i < numPlayers; i++) {
          order.push(i);
        }
      } else {
        // Odd rounds: reverse order
        for (let i = numPlayers - 1; i >= 0; i--) {
          order.push(i);
        }
      }
    }
    
    return order;
  }
}

module.exports = new DraftSocketHandler();