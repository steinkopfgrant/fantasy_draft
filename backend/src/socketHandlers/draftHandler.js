// backend/src/socketHandlers/draftHandler.js
const contestService = require('../services/contestService');
const ticketService = require('../services/ticketService');
const db = require('../models');
const { v4: uuidv4 } = require('uuid');

class DraftHandler {
  constructor(io) {
    this.io = io;
    this.draftStates = new Map();
    this.pickTimers = new Map();
    this.TURN_TIME = 30;
  }

  handleConnection(socket, userId) {
    socket.on('join-draft', async (data) => {
      await this.handleJoinDraft(socket, userId, data);
    });

    socket.on('leave-draft', async (data) => {
      await this.handleLeaveDraft(socket, userId, data);
    });

    socket.on('request-draft-state', async (data) => {
      await this.sendDraftState(socket, data.roomId);
    });

    socket.on('make-pick', async (data) => {
      await this.handleMakePick(socket, userId, data);
    });

    socket.on('get-draft-state', async (data) => {
      await this.sendDraftState(socket, data.roomId);
    });
    
    // NEW: Check if user needs to rejoin an active draft on connection
    this.checkAndRejoinActiveDraft(socket, userId);
  }

  // NEW: Check if user has an active draft and push them back into it
  async checkAndRejoinActiveDraft(socket, userId) {
    try {
      // Check if user has an active drafting entry
      const activeEntry = await db.ContestEntry.findOne({
        where: { 
          user_id: userId, 
          status: 'drafting' 
        },
        include: [{
          model: db.Contest,
          attributes: ['id', 'type', 'name']
        }]
      });
      
      if (!activeEntry) {
        return false;
      }
      
      const roomId = activeEntry.draft_room_id;
      console.log(`🔄 User ${userId} has active draft in room ${roomId}, rejoining...`);
      
      // Join the draft socket room
      socket.join(`draft_${roomId}`);
      socket.roomId = roomId;
      socket.userId = userId;
      
      // Get or initialize draft state
      let draftState = this.draftStates.get(roomId);
      
      if (!draftState) {
        // Try to reconstruct draft state from room status
        console.log(`⚠️ Draft state not in memory for ${roomId}, reconstructing...`);
        try {
          draftState = await this.initializeDraftState(roomId);
          draftState.status = 'active'; // Mark as active since we know it's drafting
          this.draftStates.set(roomId, draftState);
        } catch (err) {
          console.error(`❌ Could not reconstruct draft state: ${err.message}`);
          return false;
        }
      }
      
      // Send the complete draft state to the reconnected user
      this.sendCompleteState(socket, roomId);
      
      // Emit special rejoin event so client knows to navigate to draft screen
      socket.emit('rejoin-draft', {
        roomId,
        contestId: draftState.contestId,
        contestType: activeEntry.Contest?.type,
        contestName: activeEntry.Contest?.name,
        status: draftState.status,
        currentTurn: draftState.currentTurn,
        timeRemaining: draftState.timeRemaining,
        message: 'Reconnected to active draft'
      });
      
      console.log(`✅ Pushed user ${userId} back into active draft ${roomId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error checking active draft for user ${userId}:`, error.message);
      return false;
    }
  }

  async handleJoinDraft(socket, userId, { roomId }) {
    try {
      console.log(`User ${userId} joining draft room ${roomId}`);
      
      socket.join(`draft_${roomId}`);
      socket.roomId = roomId;
      socket.userId = userId;
      
      let draftState = this.draftStates.get(roomId);
      if (!draftState) {
        draftState = await this.initializeDraftState(roomId);
        this.draftStates.set(roomId, draftState);
      }

      if (!draftState.userRosters) {
        draftState.userRosters = {};
      }
      if (!draftState.userRosters[userId]) {
        draftState.userRosters[userId] = {
          QB: null,
          RB: null,
          WR: null,
          TE: null,
          FLEX: null,
          picks: []
        };
      }

      this.sendCompleteState(socket, roomId);

      socket.to(`draft_${roomId}`).emit('user-joined-draft', {
        userId,
        roomId
      });

      await this.checkDraftStart(roomId);
    } catch (error) {
      console.error('Error joining draft:', error);
      socket.emit('draft-error', { message: error.message });
    }
  }

  async initializeDraftState(roomId) {
    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) throw new Error('Room not found');

    const userRosters = {};
    roomStatus.entries.forEach(entry => {
      userRosters[entry.userId] = {
        QB: null,
        RB: null,
        WR: null,
        TE: null,
        FLEX: null,
        picks: []
      };
    });

    return {
      roomId,
      contestId: roomStatus.contestId,
      status: 'waiting',
      playerBoard: roomStatus.playerBoard,
      users: roomStatus.entries,
      currentTurn: 0,
      currentDrafter: null,
      picks: [],
      timeRemaining: this.TURN_TIME,
      draftOrder: [],
      totalPlayers: roomStatus.maxPlayers,
      connectedPlayers: roomStatus.currentPlayers,
      userRosters: userRosters,
      availablePlayers: this.getAllAvailablePlayers(roomStatus.playerBoard)
    };
  }

  getAllAvailablePlayers(playerBoard) {
    const players = [];
    for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        if (player && !player.drafted) {
          players.push({
            ...player,
            row,
            col,
            id: `${row}-${col}`,
            playerId: player.playerId || `${row}-${col}`
          });
        }
      }
    }
    return players;
  }

  sendCompleteState(socket, roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) return;

    const teams = draftState.users.map((user, index) => {
      const roster = draftState.userRosters[user.userId] || {
        QB: null,
        RB: null,
        WR: null,
        TE: null,
        FLEX: null
      };

      const cleanRoster = {};
      Object.entries(roster).forEach(([slot, player]) => {
        if (player !== null && slot !== 'picks') {
          cleanRoster[slot] = player;
        }
      });

      return {
        id: user.userId,
        userId: user.userId,
        entryId: user.entryId || user.id,
        username: user.username || user.userName,
        roster: cleanRoster,
        picks: roster.picks || [],
        remainingBudget: user.remainingBudget || 15,
        isReady: true,
        draftPosition: index
      };
    });

    const currentDrafterIndex = draftState.draftOrder[draftState.currentTurn];
    const currentDrafter = currentDrafterIndex !== undefined ? 
      teams[currentDrafterIndex] : null;

    const stateToSend = {
      roomId,
      status: draftState.status,
      currentTurn: draftState.currentTurn,
      currentDrafter,
      teams,
      availablePlayers: draftState.availablePlayers,
      timeRemaining: draftState.timeRemaining,
      playerBoard: draftState.playerBoard,
      draftOrder: draftState.draftOrder
    };

    socket.emit('draft-state', stateToSend);
    socket.emit('draft-state-update', stateToSend);
  }

  async sendDraftState(socket, roomId) {
    this.sendCompleteState(socket, roomId);
  }

  async checkDraftStart(roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) return;

    const roomStatus = await contestService.getRoomStatus(roomId);
    
    if (roomStatus.currentPlayers >= roomStatus.maxPlayers && 
        draftState.status === 'waiting') {
      draftState.status = 'countdown';
      draftState.countdownTime = 5;
      
      draftState.draftOrder = this.createSnakeDraftOrder(roomStatus.entries);
      
      this.io.to(`draft_${roomId}`).emit('countdown-started', {
        countdownTime: 5,
        users: roomStatus.entries,
        draftOrder: draftState.draftOrder
      });

      this.startCountdown(roomId);
    }
  }

  startCountdown(roomId) {
    let count = 5;
    const interval = setInterval(() => {
      count--;
      
      if (count > 0) {
        this.io.to(`draft_${roomId}`).emit('countdown-update', {
          countdownTime: count
        });
      } else {
        clearInterval(interval);
        this.startDraft(roomId);
      }
    }, 1000);
  }

  async startDraft(roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) return;

    draftState.status = 'active';
    draftState.currentTurn = 0;
    draftState.timeRemaining = this.TURN_TIME;

    const currentDrafterIndex = draftState.draftOrder[0];
    draftState.currentDrafter = draftState.users[currentDrafterIndex];

    console.log(`Draft started for room ${roomId}, first drafter:`, draftState.currentDrafter?.username);

    this.io.to(`draft_${roomId}`).emit('draft-started', {
      roomId,
      status: 'active',
      currentDrafter: draftState.currentDrafter,
      timeRemaining: this.TURN_TIME
    });

    this.io.to(`draft_${roomId}`).emit('draft-turn', {
      roomId,
      currentPlayer: draftState.currentDrafter,
      currentDrafter: draftState.currentDrafter,
      timeLimit: this.TURN_TIME,
      timeRemaining: this.TURN_TIME
    });

    this.io.to(`draft_${roomId}`).emit('draft-state', this.getCompleteState(roomId));

    this.startTurnTimer(roomId);
  }

  getCompleteState(roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) return null;

    const teams = draftState.users.map((user, index) => {
      const roster = draftState.userRosters[user.userId] || {
        QB: null,
        RB: null,
        WR: null,
        TE: null,
        FLEX: null
      };

      const cleanRoster = {};
      Object.entries(roster).forEach(([slot, player]) => {
        if (player !== null && slot !== 'picks') {
          cleanRoster[slot] = player;
        }
      });

      return {
        id: user.userId,
        userId: user.userId,
        entryId: user.entryId || user.id,
        username: user.username || user.userName,
        roster: cleanRoster,
        picks: roster.picks || [],
        remainingBudget: user.remainingBudget || 15,
        isReady: true,
        draftPosition: index
      };
    });

    const currentDrafterIndex = draftState.draftOrder[draftState.currentTurn];
    const currentDrafter = currentDrafterIndex !== undefined ? 
      teams[currentDrafterIndex] : null;

    return {
      roomId,
      status: draftState.status,
      currentTurn: draftState.currentTurn,
      currentDrafter,
      teams,
      availablePlayers: draftState.availablePlayers,
      timeRemaining: draftState.timeRemaining,
      playerBoard: draftState.playerBoard,
      draftOrder: draftState.draftOrder
    };
  }

  startTurnTimer(roomId) {
    const existingTimer = this.pickTimers.get(roomId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    let timeRemaining = this.TURN_TIME;

    const timer = setInterval(() => {
      const draftState = this.draftStates.get(roomId);
      if (!draftState || draftState.status !== 'active') {
        clearInterval(timer);
        this.pickTimers.delete(roomId);
        return;
      }

      timeRemaining--;
      draftState.timeRemaining = timeRemaining;
      
      this.io.to(`draft_${roomId}`).emit('draft-timer', {
        timeRemaining,
        currentDrafter: draftState.currentDrafter
      });

      if (timeRemaining <= 0) {
        console.log(`Timer expired for room ${roomId}, auto-picking...`);
        this.handleAutoPick(roomId);
      }
    }, 1000);

    this.pickTimers.set(roomId, timer);
  }


  async handleAutoPick(roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState || draftState.status !== 'active') return;

    const currentDrafterIndex = draftState.draftOrder[draftState.currentTurn];
    const currentUser = draftState.users[currentDrafterIndex];
    
    if (!currentUser) {
      console.log(`⚠️ No current user for autopick, moving to next turn`);
      this.moveToNextTurn(roomId);
      return;
    }

    const userRoster = draftState.userRosters[currentUser.userId];
    if (!userRoster) {
      console.log(`⚠️ No roster found for ${currentUser.username}, initializing...`);
      draftState.userRosters[currentUser.userId] = {
        QB: null, RB: null, WR: null, TE: null, FLEX: null, picks: []
      };
    }

    // Try ALL available players until we find one that fits
    const availablePlayers = draftState.availablePlayers.filter(p => !p.drafted);
    
    for (const player of availablePlayers) {
      const slot = this.findBestSlotForPlayer(player, draftState.userRosters[currentUser.userId]);
      
      if (slot) {
        console.log(`🤖 Autopick: ${currentUser.username} selecting ${player.name} for ${slot}`);
        await this.makePick(roomId, currentUser.userId, {
          row: player.row,
          col: player.col,
          player: player,
          slot,
          isAutoPick: true
        });
        return;
      }
    }

    // If we get here, no player could fit - roster might be full or no valid players left
    console.log(`⚠️ Autopick: No valid player found for ${currentUser.username}`);
    console.log(`   Roster: QB=${userRoster?.QB?.name || 'empty'}, RB=${userRoster?.RB?.name || 'empty'}, WR=${userRoster?.WR?.name || 'empty'}, TE=${userRoster?.TE?.name || 'empty'}, FLEX=${userRoster?.FLEX?.name || 'empty'}`);
    console.log(`   Available players: ${availablePlayers.length}`);
    
    this.moveToNextTurn(roomId);
  }

  // FIX: Use originalPosition to get the player's ACTUAL position
  findBestSlotForPlayer(player, roster) {
    // CRITICAL FIX: Use originalPosition first to get the player's actual position
    // This prevents QBs in Wildcards row (position='FLEX', originalPosition='QB')
    // from being placed in FLEX slot
    const position = (player.originalPosition || player.position || player.pos || '').toUpperCase();
    const emptySlots = [];

    // FIX: QBs can ONLY go in QB slot - never FLEX
    if (position === 'QB') {
      if (!roster.QB) {
        return 'QB';
      }
      // QB slot is full and QBs can't go anywhere else
      return null;
    }

    // For non-QB positions, check their primary slot first
    if (!roster[position] && ['RB', 'WR', 'TE'].includes(position)) {
      emptySlots.push(position);
    }

    // Then check FLEX (only RB, WR, TE can go in FLEX - never QB)
    if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(position)) {
      emptySlots.push('FLEX');
    }

    return emptySlots[0] || null;
  }

  async handleMakePick(socket, userId, { roomId, row, col, player, slot }) {
    try {
      await this.makePick(roomId, userId, { row, col, player, slot });
    } catch (error) {
      console.error('Error making pick:', error);
      socket.emit('draft-error', { message: error.message });
      socket.emit('error', { message: error.message });
    }
  }

  async makePick(roomId, userId, { row, col, player, slot, isAutoPick = false }) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) throw new Error('Draft not found');

    const currentDrafterIndex = draftState.draftOrder[draftState.currentTurn];
    const currentDrafter = draftState.users[currentDrafterIndex];
    
    if (currentDrafter.userId !== userId) {
      throw new Error('Not your turn');
    }

    if (draftState.playerBoard[row][col].drafted) {
      throw new Error('Player already drafted');
    }

    const normalizedSlot = (slot || '').toUpperCase();
    
    // CRITICAL FIX: Use originalPosition first to get the player's actual position
    // This handles Wildcards row players where position='FLEX' but originalPosition='QB'
    const playerPosition = (player.originalPosition || player.position || '').toUpperCase();
    
    console.log(`📝 makePick validation: ${player.name} (position=${player.position}, originalPosition=${player.originalPosition}) -> ${normalizedSlot} slot`);
    console.log(`   Using playerPosition: ${playerPosition}`);
    
    let isValidPlacement = false;
    
    // Direct position match (e.g., QB->QB, RB->RB)
    if (normalizedSlot === playerPosition) {
      isValidPlacement = true;
    } 
    // FLEX slot can accept RB, WR, TE - but NEVER QB
    else if (normalizedSlot === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPosition)) {
      isValidPlacement = true;
    }
    // QB validation - QBs can ONLY go in QB slot
    else if (playerPosition === 'QB' && normalizedSlot === 'QB') {
      isValidPlacement = true;
    }
    
    if (!isValidPlacement) {
      console.log(`🚨 BLOCKED: ${player.name} (${playerPosition}) cannot be placed in ${normalizedSlot} slot`);
      throw new Error(`${player.name} (${playerPosition}) cannot be placed in ${normalizedSlot} slot`);
    }

    const userRoster = draftState.userRosters[userId];
    if (userRoster[normalizedSlot] !== null) {
      throw new Error(`${normalizedSlot} position already filled`);
    }

    // CRITICAL FIX: Store the player's actual position (from originalPosition)
    // This ensures the roster displays correctly after refresh
    const playerData = {
      ...player,
      playerId: player.playerId || player.id || `${row}-${col}`,
      name: player.name,
      team: player.team,
      position: playerPosition,  // FIX: Use the actual position, not the board slot
      originalPosition: player.originalPosition || playerPosition,  // Preserve originalPosition
      price: player.price || player.value || 5,
      value: player.value || player.price || 5
    };

    const pick = {
      userId,
      player: playerData,
      slot: normalizedSlot,
      roster_slot: normalizedSlot,  // FIX: Explicitly include roster_slot
      row,
      col,
      pickNumber: draftState.picks.length + 1,
      timestamp: new Date(),
      isAutoPick
    };

    draftState.picks.push(pick);
    draftState.playerBoard[row][col].drafted = true;
    draftState.playerBoard[row][col].draftedBy = currentDrafter.draftPosition;
    
    userRoster[normalizedSlot] = playerData;
    
    if (!userRoster.picks) userRoster.picks = [];
    userRoster.picks.push({ slot: normalizedSlot, player: playerData });

    draftState.availablePlayers = draftState.availablePlayers.filter(
      p => !(p.row === row && p.col === col)
    );

    const user = draftState.users.find(u => u.userId === userId);
    if (user) {
      user.remainingBudget = (user.remainingBudget || 15) - playerData.price;
    }

    console.log(`Pick ${draftState.picks.length}: ${currentDrafter.username} drafted ${playerData.name} (${playerPosition}) for ${normalizedSlot} slot`);
    console.log(`${currentDrafter.username} roster: QB=${userRoster.QB?.name || 'empty'}, RB=${userRoster.RB?.name || 'empty'}, WR=${userRoster.WR?.name || 'empty'}, TE=${userRoster.TE?.name || 'empty'}, FLEX=${userRoster.FLEX?.name || 'empty'}`);

    const pickerSocket = [...this.io.sockets.sockets.values()]
      .find(s => s.userId === userId && s.roomId === roomId);
    if (pickerSocket) {
      pickerSocket.emit('pick-success', { 
        player: playerData, 
        slot: normalizedSlot,
        roster_slot: normalizedSlot,  // FIX: Include roster_slot
        remainingBudget: user.remainingBudget 
      });
    }

    this.io.to(`draft_${roomId}`).emit('pick-made', {
      pick,
      userId,
      player: playerData,
      slot: normalizedSlot,
      roster_slot: normalizedSlot,  // FIX: Include roster_slot
      team: currentDrafter.draftPosition,
      remainingBudget: user.remainingBudget
    });

    this.io.to(`draft_${roomId}`).emit('player-picked', {
      team: currentDrafter.draftPosition,
      userId,
      player: playerData,
      slot: normalizedSlot,
      roster_slot: normalizedSlot,  // FIX: Include roster_slot explicitly
      row,
      col,
      pick: { slot: normalizedSlot, roster_slot: normalizedSlot, player: playerData },
      roster: userRoster,
      remainingBudget: user.remainingBudget
    });

    this.moveToNextTurn(roomId);
  }

  moveToNextTurn(roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) return;

    draftState.currentTurn++;
    draftState.timeRemaining = this.TURN_TIME;

    console.log(`Moving to turn ${draftState.currentTurn} of ${draftState.draftOrder.length}`);

    if (draftState.currentTurn >= draftState.draftOrder.length) {
      console.log('Draft complete - all picks made');
      this.completeDraft(roomId);
    } else {
      const nextDrafterIndex = draftState.draftOrder[draftState.currentTurn];
      draftState.currentDrafter = draftState.users[nextDrafterIndex];

      console.log(`Turn ${draftState.currentTurn}: ${draftState.currentDrafter?.username}'s pick`);

      this.io.to(`draft_${roomId}`).emit('draft-turn', {
        roomId,
        currentPlayer: draftState.currentDrafter,
        currentDrafter: draftState.currentDrafter,
        timeLimit: this.TURN_TIME,
        timeRemaining: this.TURN_TIME
      });

      this.io.to(`draft_${roomId}`).emit('draft-state', this.getCompleteState(roomId));

      this.startTurnTimer(roomId);
    }
  }

  async completeDraft(roomId) {
    const draftState = this.draftStates.get(roomId);
    if (!draftState) return;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`DRAFT COMPLETED FOR ROOM ${roomId}`);
    console.log(`${'='.repeat(60)}`);
    
    const timer = this.pickTimers.get(roomId);
    if (timer) {
      clearInterval(timer);
      this.pickTimers.delete(roomId);
    }

    draftState.status = 'completed';

    console.log('\n📋 FINAL ROSTERS IN MEMORY:');
    for (const user of draftState.users) {
      const roster = draftState.userRosters[user.userId];
      console.log(`\n${user.username} (${user.userId}):`);
      if (roster) {
        let playerCount = 0;
        ['QB', 'RB', 'WR', 'TE', 'FLEX'].forEach(pos => {
          if (roster[pos]) {
            console.log(`  ${pos}: ${roster[pos].name} (${roster[pos].position}) - $${roster[pos].price}`);
            playerCount++;
          } else {
            console.log(`  ${pos}: EMPTY`);
          }
        });
        console.log(`  Total: ${playerCount} players`);
      } else {
        console.log('  NO ROSTER FOUND!');
      }
    }

    const finalTeams = [];
    
    for (const user of draftState.users) {
      const userRoster = draftState.userRosters[user.userId] || {};
      
      const cleanRoster = {};
      let playerCount = 0;
      
      ['QB', 'RB', 'WR', 'TE', 'FLEX'].forEach(position => {
        if (userRoster[position] && userRoster[position].name) {
          cleanRoster[position] = {
            name: userRoster[position].name,
            team: userRoster[position].team,
            // FIX: Use originalPosition for display, fall back to position then slot
            position: userRoster[position].originalPosition || userRoster[position].position || position,
            originalPosition: userRoster[position].originalPosition || userRoster[position].position || position,
            price: userRoster[position].price || 0,
            value: userRoster[position].value || userRoster[position].price || 0,
            playerId: userRoster[position].playerId || `${position}-${user.userId}`
          };
          playerCount++;
        }
      });
      
      finalTeams.push({
        userId: user.userId,
        username: user.username,
        entryId: user.entryId || user.id,
        roster: cleanRoster,
        playerCount: playerCount
      });
      
      console.log(`\n✅ Prepared ${user.username}: ${playerCount} players for save`);
      console.log(`   Positions filled: ${Object.keys(cleanRoster).join(', ')}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SAVING ALL LINEUPS TO DATABASE');
    console.log('='.repeat(60));
    
    let successCount = 0;
    let failCount = 0;
    
    const savedEntries = [];
    
    for (const team of finalTeams) {
      try {
        if (team.playerCount === 0) {
          console.log(`\n⚠️ ${team.username} has no players - skipping`);
          continue;
        }
        
        console.log(`\n💾 Saving ${team.username} (${team.userId}):`);
        console.log(`   Players: ${team.playerCount}`);
        console.log(`   Positions: ${Object.keys(team.roster).join(', ')}`);
        
        const entry = await db.ContestEntry.findOne({
          where: {
            user_id: team.userId,
            draft_room_id: roomId
          },
          include: [{
            model: db.Contest,
            attributes: ['id', 'type']
          }]
        });
        
        if (!entry) {
          console.error(`   ❌ NO CONTEST ENTRY FOUND!`);
          console.error(`      User ID: ${team.userId}`);
          console.error(`      Room ID: ${roomId}`);
          failCount++;
          continue;
        }
        
        console.log(`   ✅ Found entry: ${entry.id}`);
        console.log(`   Contest ID: ${entry.contest_id}`);
        
        await entry.update({ 
          status: 'completed',
          completed_at: new Date(),
          roster: team.roster
        });
        
        const existingLineup = await db.Lineup.findOne({
          where: { contest_entry_id: entry.id }
        });
        
        if (existingLineup) {
          console.log(`   ⚠️ Updating existing lineup ${existingLineup.id}`);
          await existingLineup.update({
            roster: team.roster,
            status: 'drafted',
            updated_at: new Date()
          });
          successCount++;
          console.log(`   ✅ UPDATED successfully with ${Object.keys(team.roster).length} players`);
        } else {
          console.log(`   Creating new lineup...`);
          
          const lineup = await db.Lineup.create({
            id: uuidv4(),
            user_id: team.userId,
            contest_entry_id: entry.id,
            contest_id: entry.contest_id || entry.Contest?.id,
            contest_type: entry.Contest?.type || 'cash',
            roster: team.roster,
            status: 'drafted',
            week: 1,
            created_at: new Date(),
            updated_at: new Date()
          });
          
          successCount++;
          console.log(`   ✅ CREATED lineup ${lineup.id} with ${Object.keys(team.roster).length} players`);
        }
        
        savedEntries.push({
          entryId: entry.id,
          userId: team.userId,
          username: team.username
        });
        
      } catch (error) {
        failCount++;
        console.error(`\n❌ ERROR saving ${team.username}:`, error.message);
        console.error(`   Stack:`, error.stack);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`SAVE RESULTS: ${successCount} succeeded, ${failCount} failed`);
    console.log('='.repeat(60));

    console.log('\n' + '='.repeat(60));
    console.log('AWARDING DRAFT COMPLETION TICKETS');
    console.log('='.repeat(60));
    
    for (const saved of savedEntries) {
      try {
        console.log(`\n🎟️ Awarding ticket to ${saved.username} for entry ${saved.entryId}...`);
        
        const ticketResult = await ticketService.awardDraftCompletion(
          saved.userId, 
          saved.entryId
        );
        
        if (ticketResult.success) {
          console.log(`🎟️ Awarded 1 ticket to ${saved.username}. New balance: ${ticketResult.newBalance}`);
          
          const userSocket = [...this.io.sockets.sockets.values()]
            .find(s => s.userId === saved.userId);
          if (userSocket) {
            userSocket.emit('tickets-updated', {
              newBalance: ticketResult.newBalance,
              earned: 1,
              reason: 'Draft completion bonus'
            });
          }
        } else {
          console.log(`⚠️ Could not award ticket to ${saved.username}: ${ticketResult.error}`);
        }
      } catch (ticketError) {
        console.error(`❌ Error awarding ticket to ${saved.username}:`, ticketError.message);
      }
    }

    console.log('\n📡 Emitting draft-complete event to all clients');
    
    const teamsToEmit = finalTeams.map(team => ({
      userId: team.userId,
      username: team.username,
      roster: team.roster,
      entryId: team.entryId,
      playerCount: team.playerCount
    }));

    this.io.to(`draft_${roomId}`).emit('draft-completed', {
      roomId,
      teams: teamsToEmit
    });

    this.io.to(`draft_${roomId}`).emit('draft-complete', {
      roomId,
      teams: teamsToEmit
    });

    console.log(`\n✅ Draft completion finished for room ${roomId}\n`);

    setTimeout(() => {
      this.draftStates.delete(roomId);
      console.log(`🧹 Cleaned up draft state for room ${roomId}`);
    }, 300000);
  }

  createSnakeDraftOrder(users) {
    const order = [];
    const rounds = 5;
    const numUsers = users.length;

    for (let round = 0; round < rounds; round++) {
      if (round % 2 === 0) {
        for (let i = 0; i < numUsers; i++) {
          order.push(i);
        }
      } else {
        for (let i = numUsers - 1; i >= 0; i--) {
          order.push(i);
        }
      }
    }

    console.log(`Created draft order: ${order.length} total picks for ${numUsers} users`);
    return order;
  }

  async handleLeaveDraft(socket, userId, { roomId }) {
    try {
      socket.leave(`draft_${roomId}`);
      socket.to(`draft_${roomId}`).emit('user-left-draft', {
        userId,
        roomId
      });
    } catch (error) {
      console.error('Error leaving draft:', error);
    }
  }
}

module.exports = DraftHandler;