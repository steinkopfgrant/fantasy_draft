// backend/src/services/draftSocketHandler.js
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
    this.botNames = ['AlphaBot', 'BetaBot', 'GammaBot', 'DeltaBot', 'EpsilonBot'];
    this.botDelay = 3000; // 3 seconds for bot picks
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
        console.log(`\n=== JOIN DRAFT REQUEST ===`);
        console.log(`User: ${socket.username} (${socket.userId})`);
        console.log(`Contest ID: ${contestId}`);
        console.log(`Entry ID: ${entryId}`);
        
        try {
          // Get the entry to find which room they're in
          const entry = await contestService.getEntry(entryId);
          console.log('Entry found:', entry ? 'Yes' : 'No');
          
          if (!entry) {
            console.error('Entry not found for ID:', entryId);
            socket.emit('error', { message: 'Entry not found' });
            return;
          }
          
          console.log('Entry details:', {
            userId: entry.userId,
            contestId: entry.contestId,
            draftRoomId: entry.draftRoomId,
            status: entry.status
          });
          
          // IMPORTANT: Validate that this entry belongs to the connecting user
          if (entry.userId !== socket.userId) {
            console.error(`User ${socket.username} (${socket.userId}) tried to join with entry belonging to user ${entry.userId}`);
            socket.emit('error', { message: 'This entry does not belong to you' });
            return;
          }
          
          const roomId = entry.draftRoomId || contestId;
          console.log(`Looking for room: ${roomId}`);
          
          const roomStatus = await contestService.getRoomStatus(roomId);
          console.log('Room status:', roomStatus ? 'Found' : 'Not found');
          
          if (!roomStatus) {
            console.error(`Room not found: ${roomId}`);
            socket.emit('error', { message: 'Room not found' });
            return;
          }
          
          console.log(`Room details:`, {
            roomId: roomStatus.id,
            contestId: roomStatus.contestId,
            currentPlayers: roomStatus.currentPlayers,
            maxPlayers: roomStatus.maxPlayers,
            status: roomStatus.status
          });
          
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
          socket.currentEntryId = entryId; // Track current entry for validation
          
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
          
          // Check if we should start with bots
          const connectedCount = this.getConnectedPlayersCount(roomId);
          console.log(`Room ${roomId}: ${connectedCount}/${roomStatus.maxPlayers} players connected`);
          
          // Start draft after a delay to allow more players to join
          if (!draft && connectedCount >= 1) {
            setTimeout(() => {
              const currentConnected = this.getConnectedPlayersCount(roomId);
              if (currentConnected >= 1 && !this.draftManager.getDraft(roomId)) {
                console.log(`Starting draft with ${currentConnected} real players and ${5 - currentConnected} bots`);
                this.startDraftCountdown(roomId);
              }
            }, 5000); // Wait 5 seconds for more players
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
          
          // Validate entry ID matches
          if (socket.currentEntryId !== socket.entryId) {
            socket.emit('error', { message: 'Entry ID mismatch' });
            return;
          }
          
          // Clear the timer immediately when a pick is made
          if (draft.pickTimer) {
            clearInterval(draft.pickTimer);
            draft.pickTimer = null;
          }
          
          // Process the pick
          await this.processPick(draftId, socket.userId, socket.username, socket.draftPosition, 
            { row, col, player, rosterSlot }, false, socket.entryId);
          
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
  
  async sendRoomUpdate(roomId) {
    const roomStatus = await contestService.getRoomStatus(roomId);
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
  
  async startDraftCountdown(roomId) {
    const roomPlayers = this.roomPlayers.get(roomId);
    if (!roomPlayers) return;
    
    // Get the contest and room entries
    const contestId = roomId.includes('_room_') ? roomId.split('_room_')[0] : roomId;
    const contest = await contestService.getContest(contestId);
    const roomStatus = await contestService.getRoomStatus(roomId);
    
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
    
    // Process the board to ensure stacked WR in bottom right
    const processedBoard = this.ensureStackedWRInBottomRight(roomStatus.playerBoard);
    
    // Create draft through DraftManager with room's unique board
    const draft = this.draftManager.createDraft(roomId, {
      maxPlayers: 5,
      playerBoard: processedBoard, // Use processed board
      type: contest.type,
      entries: entries,
      timePerPick: 30,
      countdownTime: 10
    });
    
    // Start countdown
    draft.status = 'countdown';
    draft.state.countdownTime = 10;
    draft.state.draftOrder = this.createSnakeDraftOrder(5, 5);
    
    // Initialize players in the draft - include both real players and bots
    const connectedCount = this.getConnectedPlayersCount(roomId);
    const botsNeeded = 5 - connectedCount;
    const usedBotNames = [];
    
    console.log(`Preparing draft with ${connectedCount} real players and ${botsNeeded} bots`);
    
    // First, add all connected real players
    entries.forEach(entry => {
      const playerInfo = roomPlayers.get(entry.userId);
      if (playerInfo && playerInfo.connected) {
        draft.players.set(entry.userId, {
          socketId: playerInfo.socketId,
          userId: entry.userId,
          username: entry.username,
          position: entry.draftPosition,
          teamColor: entry.teamColor,
          connected: true,
          isBot: false,
          roster: {},
          budget: 15,
          bonus: 0,
          entryId: entry.id
        });
      }
    });
    
    // Then, fill empty positions with bots
    for (let i = 0; i < 5; i++) {
      const positionTaken = Array.from(draft.players.values()).some(p => p.position === i);
      if (!positionTaken) {
        const botName = this.botNames[usedBotNames.length];
        usedBotNames.push(botName);
        const botId = `bot_${i}_${Date.now()}`;
        
        draft.players.set(botId, {
          socketId: null,
          userId: botId,
          username: botName,
          position: i,
          teamColor: ['Green', 'Red', 'Blue', 'Yellow', 'Purple'][i],
          connected: true,
          isBot: true,
          roster: {},
          budget: 15,
          bonus: 0,
          entryId: null
        });
      }
    }
    
    const players = Array.from(draft.players.values()).sort((a, b) => a.position - b.position);
    
    console.log(`Starting countdown for room ${roomId}`);
    console.log(`Players: ${players.map(p => `${p.username} (pos: ${p.position}, bot: ${p.isBot})`).join(', ')}`);
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
        
        // Emit draft started with room's unique board
        this.io.to(roomId).emit('draft-started', {
          draftOrder: draft.state.draftOrder,
          currentTurn: 0,
          status: 'active',
          playerBoard: processedBoard, // Use processed board
          users: players
        });
        
        // Send comprehensive draft state update to each player with their position
        for (const [userId, player] of draft.players) {
          if (!player.isBot && player.socketId) {
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
                playerBoard: processedBoard, // Use processed board
                message: `${firstDrafter?.username}'s turn to draft!`
              });
            }
          }
        }
        
        console.log(`Draft started for room ${roomId} with ${players.length} players`);
        
        // Start the pick timer or bot pick
        if (firstDrafter?.isBot) {
          setTimeout(() => this.makeBotPick(roomId), this.botDelay);
        } else {
          this.startPickTimer(roomId);
        }
      }
    }, 1000);
  }
  
  ensureStackedWRInBottomRight(playerBoard) {
    if (!playerBoard || !Array.isArray(playerBoard) || playerBoard.length === 0) {
      return playerBoard;
    }
    
    // Find bottom right position (last row, last column)
    const bottomRow = playerBoard.length - 1;
    const rightCol = playerBoard[bottomRow].length - 1;
    
    // Find all QBs on the board and their teams
    const qbTeams = new Set();
    for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        if (player && (player.position === 'QB' || player.originalPosition === 'QB')) {
          qbTeams.add(player.team);
        }
      }
    }
    
    if (qbTeams.size === 0) {
      return playerBoard;
    }
    
    // Find all WRs that match QB teams
    const stackableWRs = [];
    for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        if (player && (player.position === 'WR' || player.originalPosition === 'WR')) {
          if (qbTeams.has(player.team)) {
            stackableWRs.push({
              ...player,
              originalRow: row,
              originalCol: col,
              originalPrice: player.price
            });
          }
        }
      }
    }
    
    if (stackableWRs.length === 0) {
      return playerBoard;
    }
    
    // Select a random stackable WR
    const selectedWR = stackableWRs[Math.floor(Math.random() * stackableWRs.length)];
    
    // Get current bottom-right player
    const currentBottomRight = playerBoard[bottomRow][rightCol];
    
    // If selected WR is already in bottom right, we're done
    if (selectedWR.originalRow === bottomRow && selectedWR.originalCol === rightCol) {
      return playerBoard;
    }
    
    // Swap the players, maintaining their original prices
    playerBoard[selectedWR.originalRow][selectedWR.originalCol] = {
      ...currentBottomRight,
      price: currentBottomRight.price
    };
    
    playerBoard[bottomRow][rightCol] = {
      ...selectedWR,
      price: selectedWR.originalPrice,
      position: 'FLEX',
      originalPosition: selectedWR.position || selectedWR.originalPosition || 'WR',
      isStackedWR: true
    };
    
    return playerBoard;
  }
  
  async processPick(draftId, userId, username, draftPosition, pickData, isBot = false, entryId = null) {
    const draft = this.draftManager.getDraft(draftId);
    if (!draft) throw new Error('Draft not found');
    
    const { row, col, player, rosterSlot } = pickData;
    
    // Make the pick
    const pick = {
      row,
      col,
      player,
      rosterSlot,
      userId,
      username,
      turnNumber: draft.state.currentTurn,
      draftPosition,
      timestamp: new Date(),
      isBot
    };
    
    // Update draft state
    draft.state.picks.push(pick);
    
    // Update player board - CRITICAL: Mark as drafted with team info
    if (draft.board[row] && draft.board[row][col]) {
      draft.board[row][col] = {
        ...draft.board[row][col],
        drafted: true,
        draftedBy: draftPosition,
        draftedByTeam: username
      };
    }
    
    // Update player roster
    const playerEntry = draft.players.get(userId);
    if (playerEntry) {
      if (!playerEntry.roster) playerEntry.roster = {};
      playerEntry.roster[rosterSlot] = player;
      playerEntry.budget -= player.price;
      
      // Check for bonuses if applicable
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
    
    // Save to backend only for real players
    if (!isBot && entryId) {
      await contestService.saveDraftPick(entryId, {
        player,
        rosterSlot,
        userId,
        timestamp: new Date(),
        pickNumber: draft.state.currentTurn - 1
      });
    }
    
    // Get next drafter info
    let nextDrafterPosition = null;
    let nextDrafter = null;
    
    if (draft.state.currentTurn < draft.state.draftOrder.length) {
      nextDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
      nextDrafter = Array.from(draft.players.values()).find(p => p.position === nextDrafterPosition);
    }
    
    // CRITICAL FIX: Emit pick-made with the FULL updated playerBoard
    this.io.to(draftId).emit('pick-made', {
      pick,
      currentTurn: draft.state.currentTurn,
      nextDrafter: nextDrafterPosition,
      playerBoard: draft.board,  // Include the full updated board
      message: `${username} drafted ${player.name} for $${player.price}`
    });
    
    // Also emit player-picked with the board for backwards compatibility
    this.io.to(draftId).emit('player-picked', {
      pick,
      currentTurn: draft.state.currentTurn,
      nextDrafter: nextDrafterPosition,
      playerBoard: draft.board,  // Include the full updated board
      roomId: draftId,
      row,
      col,
      player,
      roster_slot: rosterSlot,
      userId,
      teamIndex: draftPosition,
      message: `${username} drafted ${player.name} for $${player.price}`
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
        playerBoard: draft.board,  // Include the board here too
        message: `${nextDrafter?.username}'s turn to draft!`
      };
      
      // CRITICAL FIX: Broadcast the complete state to the entire room
      this.io.to(draftId).emit('draft-state', {
        ...updatedState,
        contestId: draftId,
        roomId: draftId,
        teams: Array.from(draft.players.values()),
        entries: Array.from(draft.players.values())
      });
      
      // Also send personalized state to each player with their position
      for (const [userId, player] of draft.players) {
        if (!player.isBot && player.socketId) {
          const socket = this.io.sockets.sockets.get(player.socketId);
          if (socket) {
            socket.emit('draft-state-update', {
              ...updatedState,
              userDraftPosition: player.position
            });
          }
        }
      }
      
      // Also emit draft-turn for compatibility
      this.io.to(draftId).emit('draft-turn', {
        roomId: draftId,
        currentPick: draft.state.currentTurn + 1,
        totalPicks: draft.state.draftOrder.length,
        currentPlayer: nextDrafter,
        timeLimit: 30,
        playerBoard: draft.board
      });
      
      // Handle next turn
      if (nextDrafter?.isBot) {
        clearInterval(draft.pickTimer);
        setTimeout(() => this.makeBotPick(draftId), this.botDelay);
      } else {
        this.startPickTimer(draftId);
      }
    }
  }
  
  async makeBotPick(draftId) {
    const draft = this.draftManager.getDraft(draftId);
    if (!draft || draft.status !== 'active') return;
    
    const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
    const currentDrafter = Array.from(draft.players.values()).find(p => p.position === currentDrafterPosition);
    
    if (!currentDrafter || !currentDrafter.isBot) return;
    
    console.log(`🤖 Bot ${currentDrafter.username} making pick...`);
    
    // Use simple left-to-right, top-to-bottom logic for bots
    const playerBoard = draft.board;
    let botPick = null;
    
    // Scan from top to bottom, left to right
    for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        
        if (player.drafted) continue;
        if (player.price > currentDrafter.budget) continue;
        
        const availableSlots = this.getAvailableSlots(currentDrafter, player);
        if (availableSlots.length === 0) continue;
        
        // Found first viable player
        botPick = {
          row,
          col,
          player,
          rosterSlot: availableSlots[0]
        };
        
        console.log(`🤖 Bot picking: ${player.name} at row ${row}, col ${col} for $${player.price}`);
        break;
      }
      
      if (botPick) break;
    }
    
    if (botPick) {
      await this.processPick(draftId, currentDrafter.userId, currentDrafter.username, 
        currentDrafter.position, botPick, true);
    } else {
      // Bot has no valid picks, skip turn
      console.log(`🤖 Bot ${currentDrafter.username} skipping - no valid picks`);
      this.skipPlayerTurn(draftId, currentDrafter);
    }
  }
  
  startPickTimer(roomId) {
    const draft = this.draftManager.getDraft(roomId);
    if (!draft || draft.status !== 'active') {
      console.log(`❌ Cannot start timer - draft not active for room ${roomId}`);
      return;
    }
    
    // Clear any existing timer
    if (draft.pickTimer) {
      console.log(`🧹 Clearing existing timer for room ${roomId}`);
      clearInterval(draft.pickTimer);
      draft.pickTimer = null;
    }
    
    // Get current drafter info for logging
    const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
    const currentDrafter = Array.from(draft.players.values()).find(p => p.position === currentDrafterPosition);
    
    console.log(`\n⏱️ STARTING PICK TIMER for room ${roomId}`);
    console.log(`   Current drafter: ${currentDrafter?.username} (position ${currentDrafterPosition})`);
    console.log(`   Is bot: ${currentDrafter?.isBot}`);
    
    // Store the start time
    draft.timerStartTime = Date.now();
    draft.timeLimit = 30; // 30 seconds per pick
    
    // Start countdown interval
    draft.pickTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - draft.timerStartTime) / 1000);
      const timeRemaining = Math.max(0, draft.timeLimit - elapsed);
      
      // Log at key moments only (10 seconds, 5 seconds, 0 seconds)
      if (timeRemaining === 20 || timeRemaining === 10 || timeRemaining === 5) {
        console.log(`⏱️ Timer: ${timeRemaining} seconds remaining for ${currentDrafter?.username}`);
      }
      
      // Emit timer update to frontend
      this.io.to(roomId).emit('timer-update', {
        roomId: roomId,
        timeRemaining: timeRemaining,
        currentTurn: draft.state.currentTurn,
        currentDrafterPosition: currentDrafterPosition
      });
      
      // Check if time is up
      if (timeRemaining === 0) {
        console.log(`\n⏰ TIMER EXPIRED for ${currentDrafter?.username} in room ${roomId}!`);
        
        // Clear the timer immediately
        clearInterval(draft.pickTimer);
        draft.pickTimer = null;
        
        // Execute auto-pick immediately
        console.log(`   Executing auto-pick...`);
        this.executeAutoPick(roomId);
      }
    }, 1000);
  }
  
  async executeAutoPick(roomId) {
    console.log(`\n🤖 AUTO-PICK EXECUTION STARTING for room ${roomId}`);
    
    const draft = this.draftManager.getDraft(roomId);
    if (!draft) {
      console.log('❌ Draft not found');
      return;
    }
    
    if (draft.status !== 'active') {
      console.log(`❌ Draft not active (status: ${draft.status})`);
      return;
    }
    
    const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
    const currentDrafter = Array.from(draft.players.values()).find(p => p.position === currentDrafterPosition);
    
    if (!currentDrafter) {
      console.error('❌ No current drafter found for auto-pick');
      return;
    }
    
    console.log(`🤖 AUTO-PICKING FOR: ${currentDrafter.username} (Human player)`);
    console.log(`   Budget: $${currentDrafter.budget}`);
    
    // Find the first available player they can afford
    const playerBoard = draft.board;
    let autoPick = null;
    
    // Scan from top to bottom (highest price to lowest), left to right
    outerLoop: for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        
        // Skip if already drafted
        if (player.drafted === true) {
          continue;
        }
        
        // Skip if can't afford
        const playerPrice = player.price || 0;
        const budget = currentDrafter.budget || 0;
        
        if (playerPrice > budget) {
          continue;
        }
        
        // Check if this player can fill a needed position (no logging here to avoid lag)
        const playerPos = player.originalPosition || player.position;
        const roster = currentDrafter.roster || {};
        const availableSlots = [];
        
        // Check position slot
        if (!roster[playerPos]) {
          availableSlots.push(playerPos);
        }
        
        // Check FLEX slot
        if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(playerPos)) {
          availableSlots.push('FLEX');
        }
        
        if (availableSlots.length === 0) {
          continue;
        }
        
        // Found first viable player - pick them!
        autoPick = {
          row,
          col,
          player,
          rosterSlot: availableSlots[0]
        };
        
        console.log(`✅ AUTO-PICK FOUND: ${player.name} (${player.position}) at row ${row}, col ${col} for $${playerPrice}`);
        break outerLoop;
      }
    }
    
    if (autoPick) {
      try {
        console.log(`🎯 Processing auto-pick...`);
        await this.processPick(
          roomId, 
          currentDrafter.userId, 
          currentDrafter.username, 
          currentDrafter.position, 
          autoPick, 
          false, // Not a bot pick, it's an auto-pick for a human
          currentDrafter.entryId
        );
        console.log(`✅ Auto-pick completed successfully`);
      } catch (error) {
        console.error(`❌ Auto-pick failed:`, error);
        this.skipPlayerTurn(roomId, currentDrafter);
      }
    } else {
      console.log(`❌ No valid auto-pick available, skipping turn...`);
      this.skipPlayerTurn(roomId, currentDrafter);
    }
  }
  
  handlePickTimeout(roomId) {
    // This method is now replaced by executeAutoPick
    this.executeAutoPick(roomId);
  }
  
  skipPlayerTurn(roomId, player) {
    const draft = this.draftManager.getDraft(roomId);
    if (!draft) return;
    
    // Clear timer if it exists
    if (draft.pickTimer) {
      clearInterval(draft.pickTimer);
      draft.pickTimer = null;
    }
    
    const skip = {
      userId: player.userId,
      username: player.username,
      type: 'skip',
      reason: 'no_valid_picks',
      turnNumber: draft.state.currentTurn,
      draftPosition: player.position,
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
      roomId: roomId,
      message: `${player.username} has no valid picks available - turn skipped`
    });
    
    // Check if draft is complete
    if (draft.state.currentTurn >= draft.state.draftOrder.length) {
      this.completeDraft(roomId);
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
        playerBoard: draft.board
      };
      
      // Broadcast to entire room
      this.io.to(roomId).emit('draft-state', {
        ...updatedState,
        contestId: roomId,
        roomId: roomId,
        teams: Array.from(draft.players.values()),
        entries: Array.from(draft.players.values())
      });
      
      // Send personalized updates
      for (const [userId, player] of draft.players) {
        if (!player.isBot && player.socketId) {
          const socket = this.io.sockets.sockets.get(player.socketId);
          if (socket) {
            socket.emit('draft-state-update', {
              ...updatedState,
              userDraftPosition: player.position
            });
          }
        }
      }
      
      // Handle next turn
      if (nextDrafter?.isBot) {
        setTimeout(() => this.makeBotPick(roomId), this.botDelay);
      } else {
        this.startPickTimer(roomId);
      }
    }
  }
  
  async completeDraft(roomId) {
    const draft = this.draftManager.getDraft(roomId);
    if (!draft) return;
    
    draft.status = 'completed';
    
    // Complete each real player's draft in the backend
    for (const [userId, player] of draft.players) {
      if (!player.isBot && player.entryId && player.roster) {
        try {
          await contestService.completeDraft(
            player.entryId,
            player.roster,
            15 - player.budget
          );
        } catch (error) {
          console.error(`Error completing draft for user ${userId}:`, error);
        }
      }
    }
    
    // Emit draft completed to all players
    this.io.to(roomId).emit('draft-completed', {
      message: 'Draft completed!',
      results: Array.from(draft.players.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        roster: p.roster,
        budget: p.budget,
        bonus: p.bonus || 0,
        isBot: p.isBot
      }))
    });
    
    console.log(`Draft completed for room ${roomId}`);
    
    // Clean up
    this.draftManager.deleteDraft(roomId);
    this.roomPlayers.delete(roomId);
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