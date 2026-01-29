// backend/src/services/draftService.js
const Redis = require('ioredis');
const { PLAYER_POOLS, getMatchupString } = require('../utils/gameLogic');

class DraftService {
  constructor() {
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { keyPrefix: 'draft:' });
    } else {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        keyPrefix: 'draft:'
      });
    }
    this.io = null;
  }
  
  setSocketIO(io) {
    this.io = io;
    console.log('Socket.IO instance set in DraftService');
  }

  // ============================================
  // ATOMIC LOCKING FOR RACE CONDITION PREVENTION
  // ============================================
  
  /**
   * Acquires an atomic lock for a pick operation.
   * Returns true if lock acquired, false if another pick is in progress.
   */
  async acquirePickLock(contestId, turnNumber) {
    const lockKey = `pick_lock:${contestId}:${turnNumber}`;
    
    // SET NX (only if not exists) with 10 second expiry
    const result = await this.redis.set(lockKey, Date.now().toString(), 'NX', 'EX', 10);
    
    if (result === 'OK') {
      console.log(`🔒 Acquired pick lock for ${contestId} turn ${turnNumber}`);
      return true;
    } else {
      console.log(`⏳ Pick lock already held for ${contestId} turn ${turnNumber}`);
      return false;
    }
  }

  /**
   * Releases the pick lock after processing
   */
  async releasePickLock(contestId, turnNumber) {
    const lockKey = `pick_lock:${contestId}:${turnNumber}`;
    await this.redis.del(lockKey);
    console.log(`🔓 Released pick lock for ${contestId} turn ${turnNumber}`);
  }
  
  ensureStackedWRInBottomRight(playerBoard) {
    if (!playerBoard || !Array.isArray(playerBoard) || playerBoard.length === 0) {
      return playerBoard;
    }
    
    const bottomRow = playerBoard.length - 1;
    const rightCol = playerBoard[bottomRow].length - 1;
    
    if (playerBoard[bottomRow][rightCol] !== null && playerBoard[bottomRow][rightCol] !== undefined) {
      console.log('⚠️ Bottom-right already filled, replacing with stacked WR...');
    }
    
    const qbTeams = new Set();
    const allQBs = [];
    
    for (let row = 0; row < playerBoard.length; row++) {
      for (let col = 0; col < playerBoard[row].length; col++) {
        const player = playerBoard[row][col];
        if (player && (player.position === 'QB' || player.originalPosition === 'QB')) {
          qbTeams.add(player.team);
          allQBs.push({ ...player, row, col });
        }
      }
    }
    
    console.log(`📋 Found ${allQBs.length} QBs from teams:`, Array.from(qbTeams));
    
    // Fallback 1: No QBs found on board
    if (qbTeams.size === 0) {
      console.log('⚠️ No QBs found on board, placing random $1 WR');
      const wrPool = PLAYER_POOLS.WR[1] || [];
      if (wrPool.length > 0) {
        const randomWR = wrPool[Math.floor(Math.random() * wrPool.length)];
        playerBoard[bottomRow][rightCol] = {
          ...randomWR,
          position: 'FLEX',
          originalPosition: 'WR',
          price: 1,
          matchup: getMatchupString(randomWR.team),
          drafted: false,
          draftedBy: null,
          isStackedWR: true,
          noQBFound: true
        };
      }
      return playerBoard;
    }
    
    const eligibleWRs = [];
    [5, 4, 3, 2, 1].forEach(price => {
      const wrPool = PLAYER_POOLS.WR[price] || [];
      wrPool.forEach(wr => {
        if (qbTeams.has(wr.team)) {
          eligibleWRs.push({ ...wr, originalPrice: price });
        }
      });
    });
    
    console.log(`✅ Found ${eligibleWRs.length} WRs from QB teams across all price tiers`);
    
    // Fallback 2: No WRs match QB teams
    if (eligibleWRs.length === 0) {
      console.log('⚠️ No WRs match QB teams, using random $1 WR');
      const wrPool = PLAYER_POOLS.WR[1] || [];
      if (wrPool.length > 0) {
        const randomWR = wrPool[Math.floor(Math.random() * wrPool.length)];
        playerBoard[bottomRow][rightCol] = {
          ...randomWR,
          position: 'FLEX',
          originalPosition: 'WR',
          price: 1,
          matchup: getMatchupString(randomWR.team),
          drafted: false,
          draftedBy: null,
          isStackedWR: true,
          noStackAvailable: true
        };
      }
      return playerBoard;
    }
    
    // Main case: Found eligible stacked WRs
    const selectedWR = eligibleWRs[Math.floor(Math.random() * eligibleWRs.length)];
    const matchingQB = allQBs.find(qb => qb.team === selectedWR.team);
    const wrPrice = selectedWR.originalPrice;
    
    console.log(`🎯 Selected ${selectedWR.name} (${selectedWR.team}) - Price: $${wrPrice}`);
    console.log(`   Stacks with QB: ${matchingQB?.name || 'Unknown'}`);
    
    playerBoard[bottomRow][rightCol] = {
      name: selectedWR.name,
      team: selectedWR.team,
      position: 'FLEX',
      originalPosition: 'WR',
      price: wrPrice,
      matchup: getMatchupString(selectedWR.team),
      drafted: false,
      draftedBy: null,
      isStackedWR: true,
      stackedWith: matchingQB?.name || 'Unknown QB',
      originalPriceTier: selectedWR.originalPrice
    };
    
    console.log(`✅ Placed ${selectedWR.name} in bottom-right at $${wrPrice} (stacks with ${matchingQB?.name || 'QB'} from ${selectedWR.team})`);
    
    return playerBoard;
  }
  
  async startDraft(contestId, entries, playerBoard) {
    const shuffledEntries = [...entries].sort(() => Math.random() - 0.5);
    const processedBoard = this.ensureStackedWRInBottomRight(playerBoard);
    
    const draftState = {
      contestId,
      playerBoard: processedBoard,
      entries,
      currentTurn: 0,
      draftOrder: this.createSnakeDraftOrder(shuffledEntries.length),
      picks: [],
      teams: shuffledEntries.map((entry, index) => ({
        entryId: entry.id,
        userId: entry.userId || entry.user_id,
        username: entry.username,
        draftPosition: index, // IMPORTANT: Store draft position for consistent ordering
        color: this.getTeamColor(index),
        roster: { QB: null, RB: null, WR: null, TE: null, FLEX: null },
        budget: 15,
        bonus: 0
      })),
      startTime: new Date().toISOString(),
      status: 'active'
    };
    
    console.log('📝 DraftService.startDraft created:', {
      contestId,
      teamsType: typeof draftState.teams,
      teamsIsArray: Array.isArray(draftState.teams),
      teamsLength: draftState.teams.length,
      entriesLength: entries.length
    });
    
    const key = `state:${contestId}`;
    await this.redis.set(key, JSON.stringify(draftState), 'EX', 86400);
    await this.redis.sadd('active_drafts', contestId);
    
    const returnCopy = JSON.parse(JSON.stringify(draftState));
    
    console.log('📤 Returning COPY of draft state:', {
      teamsType: typeof returnCopy.teams,
      teamsLength: returnCopy.teams.length
    });
    
    return returnCopy;
  }
  
  createSnakeDraftOrder(numPlayers) {
    const rounds = 5;
    const order = [];
    
    for (let round = 0; round < rounds; round++) {
      if (round % 2 === 0) {
        for (let i = 0; i < numPlayers; i++) {
          order.push(i);
        }
      } else {
        for (let i = numPlayers - 1; i >= 0; i--) {
          order.push(i);
        }
      }
    }
    
    return order;
  }
  
  getTeamColor(index) {
    const colors = ['Green', 'Red', 'Blue', 'Yellow', 'Purple'];
    return colors[index % colors.length];
  }
  
  async getDraft(contestId) {
    try {
      const key = `state:${contestId}`;
      const draftData = await this.redis.get(key);
      
      if (!draftData) {
        console.log(`❌ No draft data found for contest ${contestId}`);
        return null;
      }
      
      const draft = JSON.parse(draftData);
      
      if (draft && typeof draft.teams === 'number') {
        console.error('🚨 CORRUPTION DETECTED: teams is a number in Redis!');
        console.error('Contest ID:', contestId);
        console.error('teams value:', draft.teams);
        
        if (draft.entries && Array.isArray(draft.entries)) {
          draft.teams = draft.entries.map((entry, index) => ({
            entryId: entry.id,
            userId: entry.userId || entry.user_id,
            username: entry.username,
            draftPosition: index,
            color: this.getTeamColor(index),
            roster: entry.roster || { QB: null, RB: null, WR: null, TE: null, FLEX: null },
            budget: 15,
            bonus: 0
          }));
          
          console.log('✅ Fixed teams array, now has', draft.teams.length, 'teams');
          await this.redis.set(key, JSON.stringify(draft), 'EX', 86400);
        } else {
          console.error('❌ Cannot fix teams - no entries array available!');
          draft.teams = [];
        }
      }
      
      console.log('📋 getDraft returning:', {
        contestId,
        teamsType: typeof draft.teams,
        teamsIsArray: Array.isArray(draft.teams),
        teamsLength: draft.teams?.length
      });
      
      return draft;
    } catch (error) {
      console.error('Error getting draft:', error);
      return null;
    }
  }
  
  // ============================================
  // UPDATED: makePick with atomic locking
  // ============================================
  async makePick(contestId, userId, pick) {
    // Get current draft state FIRST to know what turn we're locking
    const draft = await this.getDraft(contestId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    const turnToLock = draft.currentTurn;
    
    // ============================================
    // CRITICAL: Acquire atomic lock BEFORE processing
    // ============================================
    const lockAcquired = await this.acquirePickLock(contestId, turnToLock);
    
    if (!lockAcquired) {
      // Another pick is already being processed for this turn
      console.log(`🚫 Pick rejected - turn ${turnToLock} already being processed`);
      throw new Error('Pick already in progress for this turn');
    }
    
    try {
      // Re-fetch draft state AFTER acquiring lock to ensure consistency
      const currentDraft = await this.getDraft(contestId);
      
      // Verify turn hasn't already advanced (double-check after lock)
      if (currentDraft.currentTurn !== turnToLock) {
        console.log(`🚫 Turn already advanced from ${turnToLock} to ${currentDraft.currentTurn}`);
        throw new Error('Turn has already advanced');
      }
      
      const currentTeamIndex = currentDraft.draftOrder[currentDraft.currentTurn];
      const currentTeam = currentDraft.teams[currentTeamIndex];
      
      if (currentTeam.userId !== userId) {
        throw new Error('Not your turn');
      }
      
      if (currentDraft.playerBoard[pick.row][pick.col].drafted) {
        throw new Error('Player already drafted');
      }
      
      // FIX: QBs can ONLY go in QB slot - check both position fields
      const playerPos = pick.player.originalPosition || pick.player.position;
      const isQB = playerPos === 'QB' || pick.player.position === 'QB';
      if (isQB && pick.rosterSlot !== 'QB') {
        console.log(`🚨 BLOCKED: Cannot put QB ${pick.player.name} in ${pick.rosterSlot} slot`);
        throw new Error('QBs can only be placed in the QB slot');
      }
      
      currentDraft.picks.push({
        ...pick,
        teamIndex: currentTeamIndex,
        pickNumber: currentDraft.currentTurn,
        timestamp: new Date().toISOString()
      });
      
      if (pick.row !== undefined && pick.col !== undefined) {
        if (currentDraft.playerBoard[pick.row] && currentDraft.playerBoard[pick.row][pick.col]) {
          currentDraft.playerBoard[pick.row][pick.col].drafted = true;
          currentDraft.playerBoard[pick.row][pick.col].draftedBy = currentTeamIndex;
        }
      }
      
      currentTeam.roster[pick.rosterSlot] = pick.player;
      currentTeam.budget -= pick.player.price;
      
      if (pick.contestType === 'kingpin' || pick.contestType === 'firesale') {
        const bonus = this.calculateKingpinBonus(currentTeam, pick.player);
        currentTeam.bonus += bonus;
      }
      
      currentDraft.currentTurn++;
      
      if (currentDraft.currentTurn >= currentDraft.draftOrder.length) {
        currentDraft.status = 'completed';
        currentDraft.completedAt = new Date().toISOString();
      }
      
      if (!Array.isArray(currentDraft.teams)) {
        console.error('🚨 teams is not an array before saving pick!');
        throw new Error('Draft state corrupted');
      }
      
      const key = `state:${contestId}`;
      await this.redis.set(key, JSON.stringify(currentDraft), 'EX', 86400);
      
      if (currentDraft.status === 'completed') {
        await this.redis.srem('active_drafts', contestId);
        setTimeout(async () => {
          await this.cleanupDraft(contestId);
        }, 3600000);
      }
      
      console.log(`✅ Pick successfully processed for turn ${turnToLock}`);
      return currentDraft;
      
    } finally {
      // ALWAYS release the lock, even if an error occurred
      await this.releasePickLock(contestId, turnToLock);
    }
  }
  
  calculateKingpinBonus(team, newPlayer) {
    let bonusAdded = 0;
    const roster = team.roster || {};
    const players = Object.values(roster).filter(p => p);
    
    const duplicates = players.filter(p => 
      p.name === newPlayer.name && p.team === newPlayer.team
    );
    if (duplicates.length === 1) {
      bonusAdded++;
    }
    
    const teamQB = players.find(p => 
      (p.position === 'QB' || p.originalPosition === 'QB') && 
      p.team === newPlayer.team
    );
    const isPassCatcher = ['WR', 'TE'].includes(newPlayer.position) || 
      ['WR', 'TE'].includes(newPlayer.originalPosition);
    
    if (teamQB && isPassCatcher) {
      bonusAdded++;
    }
    
    const isQB = newPlayer.position === 'QB' || newPlayer.originalPosition === 'QB';
    if (isQB) {
      const hasPassCatcher = players.some(p => 
        p.team === newPlayer.team &&
        (['WR', 'TE'].includes(p.position) || ['WR', 'TE'].includes(p.originalPosition))
      );
      if (hasPassCatcher) {
        bonusAdded++;
      }
    }
    
    return bonusAdded;
  }
  
  async completeDraft(contestId) {
    try {
      const draft = await this.getDraft(contestId);
      if (!draft) return;
      
      draft.status = 'completed';
      draft.completedAt = new Date().toISOString();
      
      const key = `state:${contestId}`;
      await this.redis.set(key, JSON.stringify(draft), 'EX', 86400);
      await this.redis.srem('active_drafts', contestId);
      
      console.log(`Draft completed for contest ${contestId}`);
      
      if (this.io) {
        this.io.to(`draft_${contestId}`).emit('draft-completed', {
          contestId,
          teams: draft.teams,
          picks: draft.picks
        });
      }
      
      setTimeout(async () => {
        await this.cleanupDraft(contestId);
      }, 3600000);
      
    } catch (error) {
      console.error('Error completing draft:', error);
    }
  }
  
  async cleanupDraft(contestId) {
    try {
      const key = `state:${contestId}`;
      await this.redis.del(key);
      console.log(`Cleaned up draft state for contest ${contestId}`);
    } catch (error) {
      console.error('Error cleaning up draft:', error);
    }
  }
  
  async getActiveDrafts() {
    try {
      const activeIds = await this.redis.smembers('active_drafts');
      const drafts = [];
      for (const contestId of activeIds) {
        const draft = await this.getDraft(contestId);
        if (draft) {
          drafts.push(draft);
        }
      }
      return drafts;
    } catch (error) {
      console.error('Error getting active drafts:', error);
      return [];
    }
  }
  
  async getCurrentTurn(contestId) {
    try {
      const draft = await this.getDraft(contestId);
      if (!draft) return null;
      
      const currentTeamIndex = draft.draftOrder[draft.currentTurn];
      const currentTeam = draft.teams[currentTeamIndex];
      
      return {
        currentTurn: draft.currentTurn,
        totalTurns: draft.draftOrder.length,
        currentTeam: currentTeam,
        timeRemaining: 30
      };
    } catch (error) {
      console.error('Error getting current turn:', error);
      return null;
    }
  }
  
  async skipTurn(contestId, userId, reason = 'timeout') {
    try {
      const draft = await this.getDraft(contestId);
      if (!draft) {
        throw new Error('Draft not found');
      }
      
      const currentTeamIndex = draft.draftOrder[draft.currentTurn];
      const currentTeam = draft.teams[currentTeamIndex];
      
      draft.picks.push({
        teamIndex: currentTeamIndex,
        pickNumber: draft.currentTurn,
        skipped: true,
        reason: reason,
        timestamp: new Date().toISOString()
      });
      
      draft.currentTurn++;
      
      if (draft.currentTurn >= draft.draftOrder.length) {
        draft.status = 'completed';
        draft.completedAt = new Date().toISOString();
      }
      
      const key = `state:${contestId}`;
      await this.redis.set(key, JSON.stringify(draft), 'EX', 86400);
      
      if (this.io) {
        this.io.to(`draft_${contestId}`).emit('turn-skipped', {
          userId: currentTeam.userId,
          reason: reason,
          currentTurn: draft.currentTurn
        });
      }
      
      return draft;
    } catch (error) {
      console.error('Error skipping turn:', error);
      throw error;
    }
  }
  
  async updateTimer(contestId, timeRemaining) {
    try {
      const timerKey = `timer:${contestId}`;
      await this.redis.set(timerKey, timeRemaining, 'EX', 35);
      
      if (this.io) {
        this.io.to(`draft_${contestId}`).emit('timer-update', timeRemaining);
      }
    } catch (error) {
      console.error('Error updating timer:', error);
    }
  }
  
  async getTimer(contestId) {
    try {
      const timerKey = `timer:${contestId}`;
      const time = await this.redis.get(timerKey);
      return time ? parseInt(time) : 0;
    } catch (error) {
      console.error('Error getting timer:', error);
      return 0;
    }
  }
  
  async saveDraftState(draftState) {
    try {
      const key = `state:${draftState.contestId || draftState.roomId}`;
      
      if (!Array.isArray(draftState.teams)) {
        console.error('🚨 Attempting to save draft with non-array teams!');
        throw new Error('Invalid draft state - teams must be an array');
      }
      
      console.log('💾 Saving draft state:', {
        contestId: draftState.contestId,
        teamsType: typeof draftState.teams,
        teamsLength: draftState.teams.length
      });
      
      await this.redis.set(key, JSON.stringify(draftState), 'EX', 86400);
      return true;
    } catch (error) {
      console.error('Error saving draft state:', error);
      return false;
    }
  }
  
  async healthCheck() {
    try {
      await this.redis.ping();
      return { redis: true, status: 'healthy' };
    } catch (error) {
      console.error('DraftService health check failed:', error);
      return { redis: false, status: 'unhealthy', error: error.message };
    }
  }
  
  async cleanup() {
    try {
      await this.redis.quit();
      console.log('DraftService cleanup completed');
    } catch (error) {
      console.error('Error during DraftService cleanup:', error);
    }
  }

  // ============================================
  // HELPER: Find best roster slot for a player
  // ============================================
  findBestSlotForPlayer(player, roster) {
    const position = player.originalPosition || player.position;
    const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
    
    // Helper to check if slot is empty
    const isSlotEmpty = (slot) => !roster[slot] || !roster[slot].name;
    
    // QBs can ONLY go in QB slot
    const isQB = position === 'QB' || player.position === 'QB';
    if (isQB) {
      return isSlotEmpty('QB') ? 'QB' : null;
    }
    
    // Priority 1: Exact position match
    if (position && slots.includes(position) && isSlotEmpty(position)) {
      return position;
    }
    
    // Priority 2: FLEX for eligible positions (RB, WR, TE)
    if (['RB', 'WR', 'TE'].includes(position) && isSlotEmpty('FLEX')) {
      return 'FLEX';
    }
    
    // No valid slot found
    return null;
  }

  // ============================================
  // UPDATED: autoPick with pre-selection support and graceful lock handling
  // ============================================
  async autoPick(contestId, userId) {
    try {
      const draft = await this.getDraft(contestId);
      if (!draft) {
        throw new Error('Draft not found');
      }
      
      const turnToProcess = draft.currentTurn;
      
      // Check if a pick is already in progress for this turn
      // We do a quick check before doing expensive work
      const lockKey = `pick_lock:${contestId}:${turnToProcess}`;
      const existingLock = await this.redis.get(lockKey);
      
      if (existingLock) {
        console.log(`🤖 AutoPick skipped - pick already in progress for turn ${turnToProcess}`);
        return null; // Gracefully skip - manual pick won the race
      }
      
      const currentTeamIndex = draft.draftOrder[turnToProcess];
      const currentTeam = draft.teams[currentTeamIndex];
      
      if (currentTeam.userId !== userId) {
        console.log(`AutoPick: Not user's turn. Expected ${currentTeam.userId}, got ${userId}`);
        return null;
      }
      
      const emptySlots = [];
      for (const [slot, player] of Object.entries(currentTeam.roster)) {
        if (!player) {
          emptySlots.push(slot);
        }
      }
      
      if (emptySlots.length === 0) {
        console.log('AutoPick: No empty slots, skipping');
        return await this.skipTurn(contestId, userId, 'roster_full');
      }
      
      const budget = currentTeam.budget;
      console.log(`🤖 AutoPick for ${currentTeam.username}: Budget $${budget}, Empty slots: ${emptySlots.join(', ')}`);
      
      // ==========================================
      // CHECK FOR PRE-SELECTION FIRST
      // ==========================================
      // Note: Pre-selection is stored with ffsale: prefix in contestService.redis
      // We need to access it without the draft: prefix
      const preSelectKey = `ffsale:preselect:${contestId}:${userId}`;
      let preSelectData = null;
      
      try {
        // Create a separate redis connection without prefix for this lookup
        const Redis = require('ioredis');
        let redisUrl = process.env.REDIS_URL;
        let tempRedis;
        
        if (redisUrl) {
          tempRedis = new Redis(redisUrl);
        } else {
          tempRedis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379
          });
        }
        
        preSelectData = await tempRedis.get(preSelectKey);
        
        if (preSelectData) {
          const preSelect = JSON.parse(preSelectData);
          const { row, col, name, position } = preSelect;
          
          // Verify player is still available on the board
          if (draft.playerBoard && 
              draft.playerBoard[row] && 
              draft.playerBoard[row][col] && 
              !draft.playerBoard[row][col].drafted) {
            
            const boardPlayer = draft.playerBoard[row][col];
            
            // Check if player is within budget
            if (boardPlayer.price <= budget) {
              // Find the best roster slot for this player
              const targetSlot = this.findBestSlotForPlayer(boardPlayer, currentTeam.roster || {});
              
              if (targetSlot && emptySlots.includes(targetSlot)) {
                console.log(`🎯 AUTO-PICK using pre-selected player for ${currentTeam.username}: ${name} -> ${targetSlot}`);
                
                // Clear the pre-selection immediately
                await tempRedis.del(preSelectKey);
                await tempRedis.quit();
                
                // Make the pick with the pre-selected player
                const pick = {
                  player: boardPlayer,
                  rosterSlot: targetSlot,
                  row,
                  col,
                  isAutoPick: true,
                  wasPreSelected: true
                };
                
                return await this.makePick(contestId, userId, pick);
              } else {
                console.log(`⚠️ Pre-selected player ${name} has no valid slot (need: ${position}, empty: ${emptySlots.join(',')}), falling back to algorithm`);
              }
            } else {
              console.log(`⚠️ Pre-selected player ${name} ($${boardPlayer.price}) exceeds budget ($${budget}), falling back to algorithm`);
            }
          } else {
            console.log(`⚠️ Pre-selected player ${name} at [${row}][${col}] no longer available, falling back to algorithm`);
          }
          
          // Clear invalid pre-selection
          await tempRedis.del(preSelectKey);
        }
        
        await tempRedis.quit();
      } catch (preSelectError) {
        console.error('Error checking pre-selection:', preSelectError);
        // Continue with normal auto-pick algorithm
      }
      // ==========================================
      // END PRE-SELECTION CHECK
      // ==========================================
      
      // STANDARD AUTO-PICK ALGORITHM
      let bestPick = null;
      let bestRow = -1;
      let bestCol = -1;
      
      const slotPriority = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
      const prioritizedSlots = slotPriority.filter(s => emptySlots.includes(s));
      
      for (const targetSlot of prioritizedSlots) {
        for (let row = 0; row < draft.playerBoard.length; row++) {
          for (let col = 0; col < draft.playerBoard[row].length; col++) {
            const player = draft.playerBoard[row][col];
            
            if (!player || player.drafted || player.price > budget) {
              continue;
            }
            
            const playerPos = player.originalPosition || player.position;
            let canFillSlot = false;
            
            if (targetSlot === 'FLEX') {
              // FIX: QBs can NEVER go in FLEX - check both position fields explicitly
              const isQB = playerPos === 'QB' || player.position === 'QB';
              if (isQB) {
                canFillSlot = false;
              } else {
                canFillSlot = ['RB', 'WR', 'TE', 'FLEX'].includes(playerPos);
              }
            } else {
              canFillSlot = (playerPos === targetSlot) || (player.position === targetSlot);
            }
            
            if (canFillSlot) {
              if (!bestPick || player.price > bestPick.price) {
                bestPick = { ...player };
                bestRow = row;
                bestCol = col;
                bestPick.targetSlot = targetSlot;
              }
            }
          }
        }
        
        if (bestPick) {
          break;
        }
      }
      
      if (!bestPick) {
        console.log(`🤖 AutoPick: No valid player found for ${currentTeam.username}, skipping`);
        return await this.skipTurn(contestId, userId, 'no_valid_pick');
      }
      
      console.log(`🤖 AutoPick: Selecting ${bestPick.name} ($${bestPick.price}) for ${bestPick.targetSlot}`);
      
      const pick = {
        player: bestPick,
        rosterSlot: bestPick.targetSlot,
        row: bestRow,
        col: bestCol,
        isAutoPick: true
      };
      
      // This will acquire its own lock via makePick
      // If manual pick already has the lock, this will throw and we handle it gracefully
      return await this.makePick(contestId, userId, pick);
      
    } catch (error) {
      if (error.message === 'Pick already in progress for this turn' || 
          error.message === 'Turn has already advanced') {
        console.log(`🤖 AutoPick gracefully skipped - manual pick won the race`);
        return null;
      }
      console.error('Error in autoPick:', error);
      return await this.skipTurn(contestId, userId, 'autopick_error');
    }
  }
}

module.exports = new DraftService();