// backend/src/services/unifiedSocketManager.js
const jwt = require('jsonwebtoken');
const contestService = require('./contestService');
const { DraftManager } = require('./draft');

class UnifiedSocketManager {
  constructor() {
    this.io = null;
    this.connections = new Map(); // socketId -> connection info
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.rooms = new Map(); // roomId -> room info
    this.draftManager = new DraftManager();
    this.eventHandlers = new Map(); // event -> handler function
    
    // Bot configuration
    this.botNames = ['AlphaBot', 'BetaBot', 'GammaBot', 'DeltaBot', 'EpsilonBot'];
    this.botDelay = 3000;
  }

  initialize(io) {
    this.io = io;
    
    // Set up authentication middleware
    io.use(this.authMiddleware.bind(this));
    
    // Set up connection handler
    io.on('connection', this.handleConnection.bind(this));
    
    // Start cleanup interval
    this.startCleanupInterval();
    
    console.log('✅ Unified Socket Manager initialized');
  }

  async authMiddleware(socket, next) {
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
  }

  handleConnection(socket) {
    console.log(`👤 User ${socket.username} connected (${socket.id})`);
    
    // Store connection info
    this.connections.set(socket.id, {
      userId: socket.userId,
      username: socket.username,
      socketId: socket.id,
      joinedAt: new Date(),
      rooms: new Set()
    });
    
    // Track user sockets
    if (!this.userSockets.has(socket.userId)) {
      this.userSockets.set(socket.userId, new Set());
    }
    this.userSockets.get(socket.userId).add(socket.id);
    
    // Emit authentication success
    socket.emit('authenticated', {
      user: {
        id: socket.userId,
        username: socket.username
      }
    });
    
    // Register all event handlers for this socket
    this.registerEventHandlers(socket);
    
    // Handle disconnection
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  registerEventHandlers(socket) {
    // Define all event handlers in one place
    const handlers = {
      // Room events
      'join-room': (data) => this.handleJoinRoom(socket, data),
      'leave-room': (data) => this.handleLeaveRoom(socket, data),
      
      // Draft events
      'join-draft': (data) => this.handleJoinDraft(socket, data),
      'leave-draft': (data) => this.handleLeaveDraft(socket, data),
      'make-pick': (data) => this.handleMakePick(socket, data),
      'skip-turn': (data) => this.handleSkipTurn(socket, data),
      
      // Contest events
      'join-contest-lobby': (data) => this.handleJoinContestLobby(socket, data),
      'leave-contest-lobby': (data) => this.handleLeaveContestLobby(socket, data),
      
      // Utility events
      'ping': () => socket.emit('pong', { timestamp: Date.now() })
    };
    
    // Register each handler ONCE
    Object.entries(handlers).forEach(([event, handler]) => {
      // Remove any existing listeners first (prevents duplicates)
      socket.removeAllListeners(event);
      
      // Register the handler
      socket.on(event, async (...args) => {
        try {
          console.log(`📨 Event: ${event} from ${socket.username}`);
          await handler(...args);
        } catch (error) {
          console.error(`❌ Error handling ${event}:`, error);
          socket.emit('error', { 
            event, 
            message: error.message 
          });
        }
      });
    });
  }

  // Room Management
  async handleJoinRoom(socket, data) {
    const { roomId } = data;
    const connection = this.connections.get(socket.id);
    
    // Leave any previous room
    for (const oldRoomId of connection.rooms) {
      if (oldRoomId !== roomId) {
        await this.handleLeaveRoom(socket, { roomId: oldRoomId });
      }
    }
    
    // Join new room
    socket.join(roomId);
    connection.rooms.add(roomId);
    
    // Get room status
    const roomStatus = await contestService.getRoomStatus(roomId);
    
    // Emit room state ONCE
    socket.emit('room-state', roomStatus);
    
    // Notify others ONCE
    socket.to(roomId).emit('user-joined-room', {
      userId: socket.userId,
      username: socket.username,
      roomId
    });
    
    console.log(`✅ ${socket.username} joined room ${roomId}`);
  }

  async handleLeaveRoom(socket, data) {
    const { roomId } = data;
    const connection = this.connections.get(socket.id);
    
    socket.leave(roomId);
    connection.rooms.delete(roomId);
    
    // Notify others
    socket.to(roomId).emit('user-left-room', {
      userId: socket.userId,
      username: socket.username,
      roomId
    });
    
    console.log(`👋 ${socket.username} left room ${roomId}`);
  }

  // Draft Management
  async handleJoinDraft(socket, data) {
    const { contestId, entryId } = data;
    
    console.log(`\n🎮 JOIN DRAFT: ${socket.username} -> Contest ${contestId}, Entry ${entryId}`);
    
    // Validate entry
    const entry = await contestService.getEntry(entryId);
    if (!entry) {
      throw new Error('Entry not found');
    }
    
    if (entry.userId !== socket.userId) {
      throw new Error('Entry does not belong to you');
    }
    
    const roomId = entry.draftRoomId || contestId;
    const roomStatus = await contestService.getRoomStatus(roomId);
    
    if (!roomStatus) {
      throw new Error('Room not found');
    }
    
    // Find user's draft position
    const userDraftPosition = roomStatus.entries.findIndex(
      e => e.userId === socket.userId && e.id === entryId
    );
    
    if (userDraftPosition === -1) {
      throw new Error('You are not registered for this draft room');
    }
    
    // Store draft info on socket
    socket.contestId = contestId;
    socket.roomId = roomId;
    socket.entryId = entryId;
    socket.draftPosition = userDraftPosition;
    
    // Join socket room
    socket.join(roomId);
    
    // Track player in draft
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        players: new Map(),
        contestId,
        status: 'waiting'
      });
    }
    
    this.rooms.get(roomId).players.set(socket.userId, {
      userId: socket.userId,
      username: socket.username,
      socketId: socket.id,
      entryId,
      draftPosition: userDraftPosition,
      connected: true
    });
    
    // Send current draft state
    await this.sendDraftState(socket, roomId);
    
    // Check if we should start draft
    const connectedCount = this.getConnectedPlayersCount(roomId);
    const draft = this.draftManager.getDraft(roomId);
    
    if (!draft && connectedCount >= 1) {
      // Wait for more players
      setTimeout(() => {
        const currentConnected = this.getConnectedPlayersCount(roomId);
        if (currentConnected >= 1 && !this.draftManager.getDraft(roomId)) {
          this.startDraftWithBots(roomId, roomStatus);
        }
      }, 5000);
    }
  }

  async handleLeaveDraft(socket, data) {
    const { roomId } = data;
    
    socket.leave(roomId);
    
    // Mark as disconnected but keep in room data
    const room = this.rooms.get(roomId);
    if (room && room.players.has(socket.userId)) {
      room.players.get(socket.userId).connected = false;
    }
    
    console.log(`👋 ${socket.username} left draft ${roomId}`);
  }

  async handleMakePick(socket, data) {
    const { row, col, player, rosterSlot } = data;
    const draftId = socket.roomId;
    
    if (!draftId) {
      throw new Error('Not in a draft');
    }
    
    const draft = this.draftManager.getDraft(draftId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    // Validate turn
    const currentDrafterPosition = draft.state.draftOrder[draft.state.currentTurn];
    if (socket.draftPosition !== currentDrafterPosition) {
      throw new Error('Not your turn!');
    }
    
    // Process pick
    await this.processPick(draftId, socket.userId, socket.username, 
      socket.draftPosition, { row, col, player, rosterSlot }, false, socket.entryId);
  }

  async handleSkipTurn(socket, data) {
    const draftId = socket.roomId;
    
    if (!draftId) {
      throw new Error('Not in a draft');
    }
    
    console.log(`⏭️ ${socket.username} skipping turn`);
    
    // Process skip logic
    await this.processSkipTurn(draftId, socket.userId);
  }

  // Contest Lobby
  async handleJoinContestLobby(socket, data) {
    const { contestId } = data;
    const lobbyRoom = `contest_lobby_${contestId}`;
    
    socket.join(lobbyRoom);
    
    // Get contest info and emit ONCE
    const contest = await contestService.getContest(contestId);
    socket.emit('contest-updated', contest);
    
    console.log(`📋 ${socket.username} joined contest lobby ${contestId}`);
  }

  async handleLeaveContestLobby(socket, data) {
    const { contestId } = data;
    const lobbyRoom = `contest_lobby_${contestId}`;
    
    socket.leave(lobbyRoom);
    
    console.log(`👋 ${socket.username} left contest lobby ${contestId}`);
  }

  // Disconnect handler
  handleDisconnect(socket) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;
    
    // Remove from user sockets
    const userSocketSet = this.userSockets.get(connection.userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      
      if (userSocketSet.size === 0) {
        this.userSockets.delete(connection.userId);
        console.log(`👤 User ${connection.username} fully disconnected`);
      }
    }
    
    // Mark as disconnected in any rooms
    for (const [roomId, room] of this.rooms) {
      if (room.players.has(connection.userId)) {
        room.players.get(connection.userId).connected = false;
        
        // Notify room
        this.io.to(roomId).emit('user-disconnected', {
          userId: connection.userId,
          roomId
        });
      }
    }
    
    // Clean up connection
    this.connections.delete(socket.id);
    
    console.log(`🔌 Socket ${socket.id} disconnected`);
  }

  // Draft Logic (simplified from your existing code)
  async startDraftWithBots(roomId, roomStatus) {
    // Implementation from your existing startDraftCountdown
    // ... (condensed for brevity)
    console.log(`🎮 Starting draft for room ${roomId} with bots`);
  }

  async processPick(draftId, userId, username, draftPosition, pickData, isBot = false, entryId = null) {
    // Implementation from your existing processPick
    // ... (condensed for brevity)
    console.log(`✅ Pick processed: ${username} -> ${pickData.player.name}`);
  }

  async processSkipTurn(draftId, userId) {
    // Implementation from your existing skip logic
    // ... (condensed for brevity)
    console.log(`⏭️ Turn skipped for user ${userId}`);
  }

  // Utility methods
  getConnectedPlayersCount(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    
    let count = 0;
    room.players.forEach(player => {
      if (player.connected) count++;
    });
    return count;
  }

  async sendDraftState(socket, roomId) {
    const draft = this.draftManager.getDraft(roomId);
    const roomStatus = await contestService.getRoomStatus(roomId);
    
    if (draft) {
      // Send comprehensive state ONCE
      socket.emit('draft-state-update', {
        status: draft.status,
        currentTurn: draft.state.currentTurn,
        draftOrder: draft.state.draftOrder,
        picks: draft.state.picks,
        userDraftPosition: socket.draftPosition,
        users: Array.from(draft.players.values()),
        playerBoard: draft.board
      });
    } else {
      // Send waiting state
      socket.emit('draft-state-update', {
        status: 'waiting',
        currentTurn: 0,
        draftOrder: [],
        totalPlayers: roomStatus.maxPlayers,
        connectedPlayers: this.getConnectedPlayersCount(roomId),
        userDraftPosition: socket.draftPosition
      });
    }
  }

  // Cleanup
  startCleanupInterval() {
    setInterval(() => {
      // Clean up old connections
      const now = Date.now();
      for (const [socketId, connection] of this.connections) {
        const age = now - connection.joinedAt.getTime();
        if (age > 24 * 60 * 60 * 1000) { // 24 hours
          this.connections.delete(socketId);
        }
      }
      
      // Clean up empty rooms
      for (const [roomId, room] of this.rooms) {
        if (room.players.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    }, 60000); // Every minute
  }

  // Public API for emitting events
  emitToUser(userId, event, data) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  emitToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }
}

module.exports = new UnifiedSocketManager();