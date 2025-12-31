// backend/src/services/draft/index.js
// This file contains all the core draft service classes

class DraftManager {
  constructor() {
    this.drafts = new Map();
    this.timers = new Map();
  }

  createDraft(contestId, config) {
    const draft = {
      id: contestId,
      status: 'waiting', // waiting, countdown, active, completed
      config: {
        maxPlayers: config.maxPlayers || 5,
        timePerPick: config.timePerPick || 30,
        countdownTime: config.countdownTime || 10,
        type: config.type || 'snake'
      },
      state: {
        currentTurn: 0,
        draftOrder: [],
        picks: [],
        skips: [],
        startTime: null,
        endTime: null,
        countdownTime: 10
      },
      players: new Map(),
      board: config.playerBoard,
      entries: config.entries || []
    };
    
    this.drafts.set(contestId, draft);
    return draft;
  }

  getDraft(contestId) {
    return this.drafts.get(contestId);
  }

  updateDraftState(contestId, updates) {
    const draft = this.drafts.get(contestId);
    if (!draft) throw new Error('Draft not found');
    
    Object.assign(draft.state, updates);
    return draft;
  }

  deleteDraft(contestId) {
    this.clearTimer(contestId);
    return this.drafts.delete(contestId);
  }

  setTimer(contestId, callback, delay) {
    this.clearTimer(contestId);
    const timer = setTimeout(callback, delay);
    this.timers.set(contestId, timer);
  }

  clearTimer(contestId) {
    const timer = this.timers.get(contestId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(contestId);
    }
  }
}

class DraftValidator {
  validatePick(draft, userId, pick) {
    const errors = [];
    
    // Check draft status
    if (draft.status !== 'active') {
      errors.push('Draft is not active');
    }
    
    // Check turn
    const currentPosition = draft.state.draftOrder[draft.state.currentTurn];
    const player = draft.players.get(userId);
    if (!player || player.position !== currentPosition) {
      errors.push('Not your turn');
    }
    
    // Check if player already drafted
    if (pick.player && this.isPlayerDrafted(draft, pick.row, pick.col)) {
      errors.push('Player already drafted');
    }
    
    // Check budget
    if (pick.player && player) {
      const totalBudget = player.budget + (player.bonus || 0);
      if (pick.player.price > totalBudget) {
        errors.push('Insufficient budget');
      }
    }
    
    // Check roster slot availability
    if (pick.rosterSlot && player) {
      if (!this.canFillSlot(player, pick.player, pick.rosterSlot)) {
        errors.push('Cannot fill this roster slot');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  isPlayerDrafted(draft, row, col) {
    return draft.state.picks.some(p => p.row === row && p.col === col && p.type !== 'skip');
  }

  canFillSlot(player, draftPlayer, slot) {
    // Check if slot is empty
    if (player.roster && player.roster[slot]) return false;
    
    // Check position compatibility
    const playerPos = draftPlayer.originalPosition || draftPlayer.position;
    if (slot === playerPos) return true;
    if (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPos)) return true;
    
    return false;
  }

  getAvailableSlots(player, draftPlayer) {
    const slots = [];
    const playerPos = draftPlayer.originalPosition || draftPlayer.position;
    
    if (!player.roster || !player.roster[playerPos]) {
      slots.push(playerPos);
    }
    
    if ((!player.roster || !player.roster.FLEX) && ['RB', 'WR', 'TE'].includes(playerPos)) {
      slots.push('FLEX');
    }
    
    return slots;
  }
}

class DraftEventHandler {
  constructor(io, draftManager, validator, contestService) {
    this.io = io;
    this.draftManager = draftManager;
    this.validator = validator;
    this.contestService = contestService;
  }

  async handleJoinDraft(socket, data) {
    try {
      const { contestId, entryId, userInfo } = data;
      let draft = this.draftManager.getDraft(contestId);
      
      // Create draft if it doesn't exist
      if (!draft) {
        const contest = await this.contestService.getContest(contestId);
        if (!contest) {
          socket.emit('error', { message: 'Contest not found' });
          return;
        }
        
        draft = this.draftManager.createDraft(contestId, {
          maxPlayers: contest.maxEntries,
          playerBoard: contest.playerBoard,
          type: contest.type,
          entries: contest.entries
        });
      }
      
      // Add or update player
      const player = {
        socketId: socket.id,
        userId: userInfo.userId,
        username: userInfo.username,
        position: userInfo.position,
        teamColor: userInfo.teamColor,
        connected: true,
        roster: draft.players.get(userInfo.userId)?.roster || {},
        budget: draft.players.get(userInfo.userId)?.budget ?? 15,
        bonus: draft.players.get(userInfo.userId)?.bonus || 0
      };
      
      draft.players.set(userInfo.userId, player);
      
      // Join socket room
      socket.join(`draft-${contestId}`);
      socket.contestId = contestId;
      socket.draftPosition = userInfo.position;
      
      // Send current state
      this.broadcastDraftState(contestId);
      
      // Notify others
      this.io.to(`draft-${contestId}`).emit('user-joined', {
        username: draft.status === 'countdown' || draft.status === 'active' ? userInfo.username : 'Player',
        userId: userInfo.userId,
        connectedPlayers: this.getConnectedCount(draft),
        totalPlayers: draft.config.maxPlayers,
        draftPosition: userInfo.position
      });
      
      // Check if should start countdown
      if (this.shouldStartCountdown(draft)) {
        this.startCountdown(contestId);
      }
    } catch (error) {
      console.error('Error joining draft:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleMakePick(socket, data) {
    try {
      const { contestId, pick } = data;
      const draft = this.draftManager.getDraft(contestId);
      const userId = socket.userId;
      
      if (!draft) {
        socket.emit('error', { message: 'Draft not found' });
        return;
      }
      
      // Find user's entry for draft position
      const userEntry = draft.entries.find(e => e.userId === userId);
      if (!userEntry) {
        socket.emit('error', { message: 'User entry not found' });
        return;
      }
      
      // Validate pick
      const validation = this.validator.validatePick(draft, userId, pick);
      if (!validation.valid) {
        socket.emit('error', { 
          message: 'Invalid pick', 
          errors: validation.errors 
        });
        return;
      }
      
      // Record pick
      const pickRecord = {
        ...pick,
        userId,
        username: socket.username,
        turnNumber: draft.state.currentTurn,
        draftPosition: userEntry.draftPosition,
        timestamp: new Date()
      };
      
      draft.state.picks.push(pickRecord);
      
      // Update player
      const player = draft.players.get(userId);
      if (!player.roster) player.roster = {};
      player.roster[pick.rosterSlot] = pick.player;
      player.budget -= pick.player.price;
      
      // Calculate kingpin bonus if applicable
      if (draft.config.type === 'kingpin') {
        const bonus = this.calculateKingpinBonus(player, pick.player);
        player.bonus += bonus;
      }
      
      // Advance turn
      const previousTurn = draft.state.currentTurn;
      draft.state.currentTurn++;
      
      console.log(`TURN ADVANCED: ${previousTurn} -> ${draft.state.currentTurn}`);
      
      // Get next drafter
      const nextDrafterPosition = draft.state.currentTurn < draft.state.draftOrder.length 
        ? draft.state.draftOrder[draft.state.currentTurn] 
        : null;
      
      // Broadcast update
      this.io.to(`draft-${contestId}`).emit('pick-made', {
        pick: pickRecord,
        currentTurn: draft.state.currentTurn,
        nextDrafter: nextDrafterPosition,
        previousTurn: previousTurn
      });
      
      // Check if draft complete
      if (this.isDraftComplete(draft)) {
        this.completeDraft(contestId);
      }
    } catch (error) {
      console.error('Error making pick:', error);
      socket.emit('error', { message: error.message });
    }
  }

  async handleSkipTurn(socket, data) {
    try {
      const { contestId, reason = 'no_budget' } = data;
      const draft = this.draftManager.getDraft(contestId);
      const userId = socket.userId;
      
      if (!draft) {
        socket.emit('error', { message: 'Draft not found' });
        return;
      }
      
      // Find user's entry
      const userEntry = draft.entries.find(e => e.userId === userId);
      if (!userEntry) {
        socket.emit('error', { message: 'User entry not found' });
        return;
      }
      
      // Validate it's user's turn
      const currentPosition = draft.state.draftOrder[draft.state.currentTurn];
      if (userEntry.draftPosition !== currentPosition) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Record skip
      const skip = {
        userId,
        username: socket.username,
        type: 'skip',
        reason,
        turnNumber: draft.state.currentTurn,
        draftPosition: userEntry.draftPosition,
        timestamp: new Date()
      };
      
      draft.state.skips.push(skip);
      
      // Advance turn
      const previousTurn = draft.state.currentTurn;
      draft.state.currentTurn++;
      
      console.log(`TURN ADVANCED (SKIP): ${previousTurn} -> ${draft.state.currentTurn}`);
      
      // Get next drafter
      const nextDrafterPosition = draft.state.currentTurn < draft.state.draftOrder.length 
        ? draft.state.draftOrder[draft.state.currentTurn] 
        : null;
      
      // Broadcast update
      this.io.to(`draft-${contestId}`).emit('turn-skipped', {
        skip,
        currentTurn: draft.state.currentTurn,
        nextDrafter: nextDrafterPosition,
        previousTurn: previousTurn
      });
      
      // Check if draft complete
      if (this.isDraftComplete(draft)) {
        this.completeDraft(contestId);
      }
    } catch (error) {
      console.error('Error skipping turn:', error);
      socket.emit('error', { message: error.message });
    }
  }

  shouldStartCountdown(draft) {
    const connectedCount = this.getConnectedCount(draft);
    return connectedCount === draft.config.maxPlayers && draft.status === 'waiting';
  }

  getConnectedCount(draft) {
    return Array.from(draft.players.values()).filter(p => p.connected).length;
  }

  async startCountdown(contestId) {
    const draft = this.draftManager.getDraft(contestId);
    if (!draft) return;
    
    // Re-fetch contest to ensure we have latest positions
    const contest = await this.contestService.getContest(contestId);
    if (contest) {
      draft.entries = contest.entries;
      
      // Update player positions
      for (const [userId, player] of draft.players) {
        const entry = contest.entries.find(e => e.userId === userId);
        if (entry) {
          player.position = entry.draftPosition;
          player.teamColor = entry.teamColor;
        }
      }
    }
    
    draft.status = 'countdown';
    draft.state.countdownTime = draft.config.countdownTime;
    
    // Generate draft order
    draft.state.draftOrder = this.generateSnakeOrder(draft.config.maxPlayers);
    
    console.log(`Starting countdown for contest ${contestId}`);
    console.log('Draft order:', draft.state.draftOrder);
    
    // Send position updates
    for (const [userId, player] of draft.players) {
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('draft-position-update', {
          draftPosition: player.position,
          teamColor: player.teamColor
        });
      }
    }
    
    // Broadcast countdown start
    this.io.to(`draft-${contestId}`).emit('countdown-started', {
      status: 'countdown',
      countdownTime: draft.config.countdownTime,
      users: Array.from(draft.players.values()),
      connectedPlayers: this.getConnectedCount(draft),
      totalPlayers: draft.config.maxPlayers,
      message: 'All players connected! Draft starting in 10 seconds...',
      draftOrder: draft.state.draftOrder
    });
    
    // Start countdown timer
    const interval = setInterval(() => {
      draft.state.countdownTime--;
      
      if (draft.state.countdownTime > 0) {
        this.io.to(`draft-${contestId}`).emit('countdown-update', {
          countdownTime: draft.state.countdownTime
        });
      } else {
        clearInterval(interval);
        this.startDraft(contestId);
      }
    }, 1000);
    
    this.draftManager.setTimer(contestId, () => {
      clearInterval(interval);
    }, (draft.config.countdownTime + 1) * 1000);
  }

  startDraft(contestId) {
    const draft = this.draftManager.getDraft(contestId);
    if (!draft) return;
    
    draft.status = 'active';
    draft.state.startTime = new Date();
    draft.state.currentTurn = 0;
    
    console.log(`Draft started for contest ${contestId}`);
    console.log(`First drafter position: ${draft.state.draftOrder[0]}`);
    
    this.io.to(`draft-${contestId}`).emit('draft-started', {
      message: 'Draft starting now!',
      currentTurn: 0,
      firstDrafter: draft.state.draftOrder[0],
      draftOrder: draft.state.draftOrder
    });
  }

  completeDraft(contestId) {
    const draft = this.draftManager.getDraft(contestId);
    if (!draft) return;
    
    draft.status = 'completed';
    draft.state.endTime = new Date();
    
    console.log('Draft complete!');
    
    this.io.to(`draft-${contestId}`).emit('draft-complete', {
      results: this.calculateResults(draft)
    });
    
    // Cleanup after delay
    setTimeout(() => {
      this.draftManager.deleteDraft(contestId);
    }, 60000);
  }

  generateSnakeOrder(numPlayers) {
    const order = [];
    const rounds = 5; // 5 picks per player
    
    for (let round = 0; round < rounds; round++) {
      if (round % 2 === 0) {
        // Forward: 0, 1, 2, 3, 4
        for (let i = 0; i < numPlayers; i++) {
          order.push(i);
        }
      } else {
        // Reverse: 4, 3, 2, 1, 0
        for (let i = numPlayers - 1; i >= 0; i--) {
          order.push(i);
        }
      }
    }
    
    return order;
  }

  isDraftComplete(draft) {
    return draft.state.currentTurn >= draft.state.draftOrder.length;
  }

  calculateResults(draft) {
    const results = Array.from(draft.players.entries()).map(([userId, player]) => ({
      userId,
      username: player.username,
      teamColor: player.teamColor,
      roster: player.roster,
      points: Math.floor(Math.random() * 50) + 100,
      budget: player.budget,
      bonus: player.bonus
    }));
    
    return results.sort((a, b) => b.points - a.points);
  }

  calculateKingpinBonus(player, pickedPlayer) {
    // Simple kingpin bonus calculation
    // You can expand this based on your actual rules
    let bonus = 0;
    
    // Check if player from same team already drafted
    const sameTeamPlayers = Object.values(player.roster || {})
      .filter(p => p && p.team === pickedPlayer.team);
    
    if (sameTeamPlayers.length > 0) {
      bonus = 1; // $1 bonus for each additional player from same team
    }
    
    return bonus;
  }

  broadcastDraftState(contestId) {
    const draft = this.draftManager.getDraft(contestId);
    if (!draft) return;
    
    const state = {
      status: draft.status,
      currentTurn: draft.state.currentTurn,
      draftOrder: draft.state.draftOrder,
      picks: draft.state.picks,
      users: Array.from(draft.players.values()).map(p => ({
        ...p,
        username: draft.status === 'countdown' || draft.status === 'active' ? p.username : 'Player'
      })),
      totalPlayers: draft.config.maxPlayers,
      connectedPlayers: this.getConnectedCount(draft),
      countdownTime: draft.state.countdownTime || 0
    };
    
    // Send to all users in the draft
    for (const [userId, player] of draft.players) {
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('draft-state', {
          ...state,
          userDraftPosition: player.position
        });
      }
    }
  }

  handleDisconnect(socket, contestId) {
    const draft = this.draftManager.getDraft(contestId);
    if (!draft) return;
    
    const player = draft.players.get(socket.userId);
    if (player) {
      player.connected = false;
      
      const connectedCount = this.getConnectedCount(draft);
      
      // Cancel countdown if someone disconnects
      if (draft.status === 'countdown') {
        this.draftManager.clearTimer(contestId);
        draft.status = 'waiting';
        draft.state.countdownTime = 10;
        
        this.io.to(`draft-${contestId}`).emit('countdown-cancelled', {
          message: 'A player disconnected. Waiting for all players to reconnect...',
          connectedPlayers: connectedCount
        });
      }
      
      // Notify others
      this.io.to(`draft-${contestId}`).emit('user-disconnected', {
        username: socket.username,
        userId: socket.userId,
        connectedPlayers: connectedCount
      });
      
      // Update draft state for remaining users
      this.broadcastDraftState(contestId);
    }
  }
}

module.exports = {
  DraftManager,
  DraftValidator,
  DraftEventHandler
};