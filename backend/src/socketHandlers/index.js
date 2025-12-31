// backend/src/socketHandlers/index.js
const jwt = require('jsonwebtoken');
const contestService = require('../services/contestService');
const draftService = require('../services/draftService');
const db = require('../models');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.socketUsers = new Map(); // socketId -> userId
    this.roomParticipants = new Map(); // roomId -> Set of userIds
  }

  initialize() {
    // Set socket.io instance in contest service
    contestService.setSocketIO(this.io);

    this.io.on('connection', (socket) => {
      console.log('New socket connection:', socket.id);

      // Initial auth
      socket.on('authenticate', async (data) => {
        await this.handleAuthentication(socket, data);
      });

      // Join contest (NEW - for waiting room)
      socket.on('join-contest', async (data) => {
        await this.handleJoinContest(socket, data);
      });

      // Leave contest (NEW - for waiting room)
      socket.on('leave-contest', async (data) => {
        await this.handleLeaveContest(socket, data);
      });

      // Join contest lobby
      socket.on('join-contest-lobby', (data) => {
        this.handleJoinContestLobby(socket, data);
      });

      // Leave contest lobby
      socket.on('leave-contest-lobby', (data) => {
        this.handleLeaveContestLobby(socket, data);
      });

      // Join draft room
      socket.on('join-room', (data) => {
        this.handleJoinRoom(socket, data);
      });

      // Leave draft room
      socket.on('leave-room', (data) => {
        this.handleLeaveRoom(socket, data);
      });

      // Join draft
      socket.on('join-draft', (data) => {
        this.handleJoinDraft(socket, data);
      });

      // Leave draft (but don't disconnect!)
      socket.on('leave-draft', (data) => {
        this.handleLeaveDraft(socket, data);
      });

      // Draft pick
      socket.on('make-pick', async (data) => {
        await this.handleMakePick(socket, data);
      });

      // Get room status
      socket.on('get-room-status', async (data) => {
        await this.handleGetRoomStatus(socket, data);
      });

      // Get draft state
      socket.on('get-draft-state', async (data) => {
        await this.handleGetDraftState(socket, data);
      });

      // Request draft state (alias)
      socket.on('request-draft-state', async (data) => {
        await this.handleGetDraftState(socket, data);
      });

      // Check active drafts
      socket.on('check-active-drafts', async () => {
        await this.handleCheckActiveDrafts(socket);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Keep-alive ping
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Error handler
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });

    // Start periodic cleanup with error handling
    this.startPeriodicCleanup();
  }

  // New method for periodic cleanup with error handling
  startPeriodicCleanup() {
    setInterval(async () => {
      try {
        // Only call if method exists
        if (typeof contestService.cleanupRoomBoards === 'function') {
          await contestService.cleanupRoomBoards();
        }
        
        if (typeof contestService.cleanupLocks === 'function') {
          await contestService.cleanupLocks();
        }
      } catch (error) {
        console.error('Error during periodic cleanup:', error);
      }
    }, 60000); // Every minute
  }

  async handleAuthentication(socket, data) {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('auth-error', { error: 'No token provided' });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await db.User.findByPk(decoded.userId);

      if (!user) {
        socket.emit('auth-error', { error: 'User not found' });
        return;
      }

      // Store user-socket mapping
      const userId = user.id;
      socket.userId = userId;
      socket.username = user.username;
      
      // Add to user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);
      this.socketUsers.set(socket.id, userId);

      // Join user room for direct messaging
      socket.join(`user_${userId}`);

      console.log(`User ${user.username} authenticated (${socket.id})`);
      
      socket.emit('authenticated', {
        user: {
          id: user.id,
          username: user.username,
          balance: user.balance,
          tickets: user.tickets
        }
      });

      // Check for any active drafts
      const activeEntries = await db.ContestEntry.findAll({
        where: {
          user_id: userId,
          status: 'drafting'
        },
        include: [{
          model: db.Contest,
          attributes: ['id', 'name', 'type']
        }]
      });

      if (activeEntries.length > 0) {
        const entry = activeEntries[0];
        socket.emit('active-draft', {
          entryId: entry.id,
          draftRoomId: entry.draft_room_id,
          contestId: entry.contest_id,
          contestName: entry.Contest?.name
        });
      }

    } catch (error) {
      console.error('Authentication error:', error);
      socket.emit('auth-error', { error: 'Invalid token' });
    }
  }

  // Handle join contest
  async handleJoinContest(socket, data) {
    const { contestId, userId, username, roomId, operationId } = data;
    
    try {
      console.log(`\n=== JOIN CONTEST REQUEST ===`);
      console.log(`User: ${username} (${userId})`);
      console.log(`Contest: ${contestId}`);
      console.log(`Room: ${roomId}`);
      
      // Verify socket user matches request
      if (socket.userId !== userId) {
        throw new Error('User mismatch');
      }

      // Create contest entry through service
      const result = await contestService.enterContest(contestId, userId, username);
      
      if (result.error) {
        socket.emit('contest-entry-response', {
          error: { message: result.error },
          contestId,
          operationId
        });
        return;
      }

      // Join the correct socket room format that contestService uses
      const socketRoomId = `room_${roomId}`;
      await socket.join(socketRoomId);
      socket.contestId = contestId;
      socket.roomId = roomId;
      socket.entryId = result.entryId;
      
      console.log(`Added ${username} to socket room ${socketRoomId}`);

      // Send success response
      socket.emit('contest-entry-response', {
        entryId: result.entryId,
        roomId,
        contestId,
        operationId,
        draftPosition: result.entry.draftPosition
      });

      // Emit room joined event
      socket.emit('joined-room', {
        roomId,
        contestId,
        entryId: result.entryId
      });

      // Notify other players in the room
      socket.to(socketRoomId).emit('room-player-joined', {
        roomId,
        userId,
        username,
        position: result.entry.draftPosition
      });

    } catch (error) {
      console.error('Error joining contest:', error);
      socket.emit('contest-entry-response', {
        error: { message: error.message },
        contestId,
        operationId
      });
    }
  }

  // Handle leave contest
  async handleLeaveContest(socket, data) {
    const { contestId, userId, roomId, entryId } = data;
    
    try {
      console.log(`\n=== LEAVE CONTEST REQUEST ===`);
      console.log(`User: ${socket.username} (${userId})`);
      console.log(`Contest: ${contestId}`);
      console.log(`Room: ${roomId}`);
      console.log(`Entry: ${entryId}`);
      
      // Verify socket user matches request
      if (socket.userId !== userId) {
        throw new Error('User mismatch');
      }

      // Withdraw the entry
      const result = await contestService.withdrawEntry(entryId, userId);

      // Leave socket room
      const socketRoomId = `room_${roomId}`;
      socket.leave(socketRoomId);
      
      // Send confirmation
      socket.emit('contest-left', {
        contestId,
        success: true,
        refund: result.refund
      });

      // Notify other players
      socket.to(socketRoomId).emit('room-player-left', {
        roomId,
        userId,
        username: socket.username
      });

    } catch (error) {
      console.error('Error leaving contest:', error);
      socket.emit('error', { 
        message: error.message,
        type: 'LEAVE_CONTEST_ERROR'
      });
    }
  }

  // Handle check active drafts
  async handleCheckActiveDrafts(socket) {
    try {
      const userId = socket.userId;
      if (!userId) return;

      // Find any pending or drafting entries for this user
      const activeEntries = await db.ContestEntry.findAll({
        where: {
          user_id: userId,
          status: { [db.Sequelize.Op.in]: ['pending', 'drafting'] }
        },
        include: [{
          model: db.Contest,
          attributes: ['type']
        }]
      });

      for (const entry of activeEntries) {
        // Join the socket room for each active draft
        const roomId = entry.draft_room_id;
        const socketRoomId = `room_${roomId}`;
        await socket.join(socketRoomId);
        console.log(`🔌 User ${userId} rejoined ${socketRoomId} on connect`);
        
        // Emit current room status
        const roomStatus = await contestService.getRoomStatus(roomId);
        if (roomStatus) {
          socket.emit('room-status-update', {
            roomId,
            roomStatus,
            userEntry: entry
          });
        }
      }
    } catch (error) {
      console.error('Error checking active drafts:', error);
    }
  }

  handleJoinContestLobby(socket, data) {
    const { contestId } = data;
    const userId = socket.userId;

    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const lobbyRoom = `contest_lobby_${contestId}`;
    socket.join(lobbyRoom);

    // Get current lobby participants
    const participants = this.getContestLobbyParticipants(contestId);

    // Send current state to joining user
    socket.emit('lobby-state', {
      contestId,
      participants: participants.length
    });

    // Notify others in lobby
    socket.to(lobbyRoom).emit('user-joined-lobby', {
      userId,
      username: socket.username,
      contestId,
      participants: participants.length + 1
    });

    console.log(`User ${socket.username} joined contest lobby ${contestId}`);
  }

  handleLeaveContestLobby(socket, data) {
    const { contestId } = data;
    const userId = socket.userId;

    if (!userId) return;

    const lobbyRoom = `contest_lobby_${contestId}`;
    socket.leave(lobbyRoom);

    const participants = this.getContestLobbyParticipants(contestId);

    socket.to(lobbyRoom).emit('user-left-lobby', {
      userId,
      contestId,
      participants: participants.length - 1
    });
  }

  async handleJoinRoom(socket, data) {
    const { roomId } = data;
    const userId = socket.userId;

    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    // Join socket room
    const socketRoom = `room_${roomId}`;
    socket.join(socketRoom);

    // Track room participants
    if (!this.roomParticipants.has(roomId)) {
      this.roomParticipants.set(roomId, new Set());
    }
    this.roomParticipants.get(roomId).add(userId);

    // Get current room status
    const roomStatus = await contestService.getRoomStatus(roomId);
    
    if (roomStatus) {
      // Send room state to joining user
      socket.emit('room-state', roomStatus);

      // Notify others in room
      socket.to(socketRoom).emit('user-joined-room', {
        userId,
        username: socket.username,
        roomId,
        currentPlayers: roomStatus.currentPlayers,
        maxPlayers: roomStatus.maxPlayers
      });

      console.log(`User ${socket.username} joined room ${roomId} (${roomStatus.currentPlayers}/${roomStatus.maxPlayers})`);
    }
  }

  handleLeaveRoom(socket, data) {
    const { roomId } = data;
    const userId = socket.userId;

    if (!userId) return;

    const socketRoom = `room_${roomId}`;
    socket.leave(socketRoom);

    // Remove from room participants
    if (this.roomParticipants.has(roomId)) {
      this.roomParticipants.get(roomId).delete(userId);
    }

    socket.to(socketRoom).emit('user-left-room', {
      userId,
      roomId
    });

    console.log(`User ${socket.username} left room ${roomId}`);
  }

  async handleJoinDraft(socket, data) {
    const { draftId, roomId } = data;
    const userId = socket.userId;

    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const draftRoom = `draft_${draftId || roomId}`;
    socket.join(draftRoom);

    console.log(`User ${socket.username} joined draft ${draftId || roomId}`);

    // Send current draft state if available
    await this.sendDraftState(socket, draftId || roomId);
  }

  handleLeaveDraft(socket, data) {
    const { draftId, roomId } = data;
    const userId = socket.userId;

    if (!userId) return;

    const draftRoom = `draft_${draftId || roomId}`;
    socket.leave(draftRoom);

    console.log(`User ${socket.username} left draft ${draftId || roomId} (but staying connected)`);
  }

  // FIXED: Handle make pick with proper row/col passing
  async handleMakePick(socket, data) {
    const { roomId, playerId, position, playerData, row, col, slot, roster_slot } = data;
    const userId = socket.userId;

    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const rosterSlot = roster_slot || slot || position;
      
      console.log(`🎯 Pick attempt - User: ${socket.username}, Player: ${playerId}, Roster Slot: ${rosterSlot}, Row: ${row}, Col: ${col}`);
      
      // Process pick through contest service - PASS ROW AND COL PROPERLY
      const pickData = playerData || { id: playerId };
      await contestService.handlePlayerPick(roomId, userId, pickData, {
        slot: rosterSlot,
        row: row,
        col: col
      });
      
      socket.emit('pick-success', {
        playerId,
        position: rosterSlot,
        row,
        col
      });
      
    } catch (error) {
      console.error('Error processing pick:', error);
      socket.emit('pick-error', { 
        error: error.message,
        playerId,
        position: roster_slot || slot || position
      });
    }
  }

  async handleGetRoomStatus(socket, data) {
    const { roomId } = data;
    
    try {
      const roomStatus = await contestService.getRoomStatus(roomId);
      
      if (roomStatus) {
        socket.emit('room-status', roomStatus);
      } else {
        socket.emit('room-status-error', { 
          error: 'Room not found',
          roomId 
        });
      }
    } catch (error) {
      console.error('Error getting room status:', error);
      socket.emit('room-status-error', { 
        error: error.message,
        roomId 
      });
    }
  }

  // FIXED: Added fallback for _room_1 suffix when roomId doesn't include it
  async handleGetDraftState(socket, data) {
    let { roomId } = data;
    const userId = socket.userId;

    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      console.log(`🔍 User ${socket.username} requesting draft state for room ${roomId}`);
      
      // Get draft from draftService
      let draft = await draftService.getDraft(roomId);
      
      // Fallback: if not found and roomId doesn't have _room_ suffix, look up user's entry
      if (!draft && !roomId.includes('_room_')) {
        console.log(`🔍 Looking up user's entry to find correct room...`);
        const userEntry = await db.ContestEntry.findOne({
          where: {
            contest_id: roomId,
            user_id: userId,
            status: { [db.Sequelize.Op.in]: ['pending', 'drafting'] }
          }
        });
        
        if (userEntry && userEntry.draft_room_id) {
          const fallbackRoomId = userEntry.draft_room_id;
          console.log(`🔄 Found user's room from entry: ${fallbackRoomId}`);
          draft = await draftService.getDraft(fallbackRoomId);
          if (draft) {
            roomId = fallbackRoomId;
            console.log(`✅ Found draft under user's actual room ID`);
          }
        }
      }
      
      if (!draft) {
        console.log(`❌ No draft found for room ${roomId}`);
        socket.emit('draft-state', {
          roomId,
          teams: [],
          playerBoard: [],
          currentTurn: 0,
          currentPick: 0,
          draftOrder: [],
          picks: []
        });
        return;
      }

      // Make sure teams is an array with rosters
      let teams = draft.teams || [];
      if (!Array.isArray(teams)) {
        console.warn(`⚠️ Teams is not an array for room ${roomId}:`, teams);
        teams = [];
      }

      // Make sure playerBoard is an array
      let playerBoard = draft.playerBoard || [];
      if (!Array.isArray(playerBoard)) {
        console.warn(`⚠️ PlayerBoard is not an array for room ${roomId}:`, playerBoard);
        playerBoard = [];
      }

      // Ensure each team has a roster object
      teams = teams.map(team => ({
         ...team,
        roster: team.roster && typeof team.roster === 'object' ? team.roster : {}
      }));

      const draftState = {
        roomId,
        teams,
        playerBoard,
        currentTurn: draft.currentTurn || 0,
        currentPick: draft.currentPick || 0,
        draftOrder: draft.draftOrder || [],
        picks: draft.picks || [],
        status: draft.status || 'pending',
        participants: draft.participants || []
      };

      console.log(`📤 Sending draft state to ${socket.username}:`, {
        roomId,
        teamsCount: teams.length,
        playerBoardRows: playerBoard.length,
        currentTurn: draftState.currentTurn,
        currentPick: draftState.currentPick
      });

      socket.emit('draft-state', draftState);
      
    } catch (error) {
      console.error('Error getting draft state:', error);
      socket.emit('error', { 
        message: 'Failed to get draft state',
        type: 'DRAFT_STATE_ERROR'
      });
    }
  }

  handleDisconnect(socket) {
    const userId = this.socketUsers.get(socket.id);
    
    if (userId) {
      // Remove this specific socket
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        
        // Only log user as disconnected if they have no other sockets
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
          console.log(`User ${socket.username || userId} fully disconnected`);
          
          // Clean up room participants
          for (const [roomId, participants] of this.roomParticipants) {
            if (participants.has(userId)) {
              participants.delete(userId);
              
              // Notify room of disconnection
              this.io.to(`room_${roomId}`).emit('user-disconnected', {
                userId,
                roomId
              });
            }
          }
        } else {
          console.log(`User ${socket.username || userId} disconnected one socket, ${userSocketSet.size} remaining`);
        }
      }
      
      this.socketUsers.delete(socket.id);
    }

    console.log('Socket disconnected:', socket.id);
  }

  // FIXED: Added fallback for _room_1 suffix
  async sendDraftState(socket, roomId) {
    try {
      console.log(`📨 sendDraftState called for room ${roomId}`);
      
      // Get draft from draftService
      let draft = await draftService.getDraft(roomId);
      
      // Fallback: if not found and roomId doesn't have _room_ suffix, try _room_1
      if (!draft && !roomId.includes('_room_')) {
        const fallbackRoomId = `${roomId}_room_1`;
        console.log(`🔄 sendDraftState trying fallback room ID: ${fallbackRoomId}`);
        draft = await draftService.getDraft(fallbackRoomId);
        if (draft) {
          roomId = fallbackRoomId;
          console.log(`✅ sendDraftState found draft under fallback room ID`);
        }
      }
      
      if (!draft) {
        console.log(`❌ No draft found in sendDraftState for room ${roomId}`);
        
        // Check if there's an active draft in contestService
        const activeDraft = contestService.activeDrafts ? contestService.activeDrafts.get(roomId) : null;
        if (activeDraft) {
          socket.emit('draft-state', {
            roomId,
            currentTurn: activeDraft.currentTurn,
            picks: activeDraft.picks,
            participants: activeDraft.participants,
            teams: [],
            playerBoard: []
          });
        }
        return;
      }

      // Make sure we have arrays
      let teams = draft.teams || [];
      let playerBoard = draft.playerBoard || [];

      // Validate arrays
      if (!Array.isArray(teams)) {
        console.warn(`⚠️ Teams is not an array in sendDraftState:`, teams);
        teams = [];
      }

      if (!Array.isArray(playerBoard)) {
        console.warn(`⚠️ PlayerBoard is not an array in sendDraftState:`, playerBoard);
        playerBoard = [];
      }

      // Ensure each team has a roster
      teams = teams.map(team => ({
        ...team,
        roster: Array.isArray(team.roster) ? team.roster : []
      }));

      const draftState = {
        roomId,
        teams,
        playerBoard,
        currentTurn: draft.currentTurn || 0,
        currentPick: draft.currentPick || 0,
        draftOrder: draft.draftOrder || [],
        picks: draft.picks || [],
        status: draft.status || 'pending',
        participants: draft.participants || []
      };

      console.log(`📤 Sending draft state from sendDraftState:`, {
        roomId,
        teamsCount: teams.length,
        playerBoardRows: playerBoard.length
      });

      socket.emit('draft-state', draftState);
      
    } catch (error) {
      console.error('Error in sendDraftState:', error);
    }
  }

  // Utility methods
  getContestLobbyParticipants(contestId) {
    const lobbyRoom = `contest_lobby_${contestId}`;
    const room = this.io.sockets.adapter.rooms.get(lobbyRoom);
    return room ? Array.from(room) : [];
  }

  getRoomParticipants(roomId) {
    const socketRoom = `room_${roomId}`;
    const room = this.io.sockets.adapter.rooms.get(socketRoom);
    return room ? Array.from(room) : [];
  }

  // Emit to specific user
  emitToUser(userId, event, data) {
    const userRoom = `user_${userId}`;
    this.io.to(userRoom).emit(event, data);
  }

  // Emit to room
  emitToRoom(roomId, event, data) {
    const socketRoom = `room_${roomId}`;
    this.io.to(socketRoom).emit(event, data);
  }

  // Emit to draft
  emitToDraft(draftId, event, data) {
    const draftRoom = `draft_${draftId}`;
    this.io.to(draftRoom).emit(event, data);
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.userSockets.size;
  }

  // Get room participant count
  getRoomParticipantCount(roomId) {
    const participants = this.roomParticipants.get(roomId);
    return participants ? participants.size : 0;
  }
}

module.exports = SocketHandler;