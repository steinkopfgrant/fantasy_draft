// backend/src/services/injurySwapService.js
// Handles injury swaps for Cash and Market Mover contests
// Runs 15 minutes before contest start time

const db = require('../models');
const { redis } = require('../config/redis');

class InjurySwapService {
  constructor() {
    this.scheduledSwaps = new Map(); // contestId -> timeoutId
    this.redis = null;
  }

  setRedis(redisClient) {
    this.redis = redisClient;
  }

  // ============================================
  // INJURY STATUS MANAGEMENT
  // ============================================

  // Mark a player as OUT for the current week
  async markPlayerOut(playerId, weekId = 'current') {
    const key = `injuries:${weekId}`;
    const injuries = await this.getInjuries(weekId);
    injuries[playerId] = {
      status: 'OUT',
      markedAt: Date.now()
    };
    await this.redis.set(key, JSON.stringify(injuries), 'EX', 86400 * 7); // 7 day expiry
    console.log(`🏥 Marked player ${playerId} as OUT for week ${weekId}`);
    return true;
  }

  // Mark a player as active (remove from injury list)
  async markPlayerActive(playerId, weekId = 'current') {
    const key = `injuries:${weekId}`;
    const injuries = await this.getInjuries(weekId);
    delete injuries[playerId];
    await this.redis.set(key, JSON.stringify(injuries), 'EX', 86400 * 7);
    console.log(`✅ Marked player ${playerId} as ACTIVE for week ${weekId}`);
    return true;
  }

  // Get all injuries for a week
  async getInjuries(weekId = 'current') {
    const key = `injuries:${weekId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : {};
  }

  // Check if a specific player is OUT
  async isPlayerOut(playerId, weekId = 'current') {
    const injuries = await this.getInjuries(weekId);
    return injuries[playerId]?.status === 'OUT';
  }

  // Bulk mark players as OUT (for admin use)
  async bulkMarkOut(playerIds, weekId = 'current') {
    const key = `injuries:${weekId}`;
    const injuries = await this.getInjuries(weekId);
    const now = Date.now();
    
    for (const playerId of playerIds) {
      injuries[playerId] = { status: 'OUT', markedAt: now };
    }
    
    await this.redis.set(key, JSON.stringify(injuries), 'EX', 86400 * 7);
    console.log(`🏥 Bulk marked ${playerIds.length} players as OUT`);
    return true;
  }

  // Clear all injuries for a week
  async clearInjuries(weekId = 'current') {
    const key = `injuries:${weekId}`;
    await this.redis.del(key);
    console.log(`🗑️ Cleared all injuries for week ${weekId}`);
    return true;
  }

  // ============================================
  // INJURY SWAP LOGIC
  // ============================================

  // Run injury swaps for a specific contest
  async runInjurySwapsForContest(contestId) {
    console.log(`\n🔄 Running injury swaps for contest ${contestId}...`);
    
    try {
      // Get contest info
      const contest = await db.Contest.findByPk(contestId);
      if (!contest) {
        console.log(`❌ Contest ${contestId} not found`);
        return { success: false, error: 'Contest not found' };
      }

      // Only run for Cash and Market Mover contests
      if (!['cash', 'market_mover'].includes(contest.type)) {
        console.log(`⏭️ Skipping injury swap for contest type: ${contest.type}`);
        return { success: false, error: 'Contest type not eligible for injury swaps' };
      }

      // Get all lineups for this contest (from Lineup model, not ContestEntry)
      const lineups = await db.Lineup.findAll({
        where: {
          contest_id: contestId,
          status: 'drafted' // Only drafted lineups
        }
      });

      if (lineups.length === 0) {
        console.log(`📭 No drafted lineups for contest ${contestId}`);
        return { success: true, swaps: 0 };
      }

      console.log(`📋 Found ${lineups.length} lineups to check`);

      // Get current injuries
      const injuries = await this.getInjuries('current');
      const outPlayerIds = Object.keys(injuries).filter(id => injuries[id].status === 'OUT');
      
      if (outPlayerIds.length === 0) {
        console.log(`✅ No players marked OUT - no swaps needed`);
        return { success: true, swaps: 0 };
      }

      console.log(`🏥 Players marked OUT: ${outPlayerIds.join(', ')}`);

      // Get the player board for this contest (to find replacements)
      const playerBoard = contest.player_board || {};
      
      let totalSwaps = 0;
      const swapResults = [];

      // Process each lineup
      for (const lineupRecord of lineups) {
        const roster = lineupRecord.roster || {};
        const swapsForLineup = [];

        // Check each roster slot
        for (const [slot, player] of Object.entries(roster)) {
          if (!player || !player.id) continue;

          // Check if this player is OUT (check both id and name for flexibility)
          const playerIdStr = String(player.id);
          const isOut = outPlayerIds.includes(playerIdStr) || 
                        outPlayerIds.includes(player.name) ||
                        outPlayerIds.some(id => player.name && player.name.toLowerCase().includes(id.toLowerCase()));

          if (isOut) {
            console.log(`🔍 Found OUT player in lineup ${lineupRecord.id}: ${player.name} (${slot})`);

            // Find replacement: same position, same price, not OUT
            const replacement = this.findReplacement(
              player,
              slot,
              playerBoard,
              outPlayerIds,
              roster
            );

            if (replacement) {
              console.log(`✅ Swapping ${player.name} → ${replacement.name}`);
              
              // Update roster
              roster[slot] = replacement;
              swapsForLineup.push({
                slot,
                oldPlayer: player,
                newPlayer: replacement
              });
              totalSwaps++;
            } else {
              console.log(`❌ No valid replacement found for ${player.name} ($${player.price} ${player.position})`);
              swapsForLineup.push({
                slot,
                oldPlayer: player,
                newPlayer: null,
                error: 'No valid replacement available'
              });
            }
          }
        }

        // Save updated roster if there were swaps
        if (swapsForLineup.length > 0) {
          lineupRecord.roster = roster;
          await lineupRecord.save();

          // Store swap history
          await this.recordSwapHistory(lineupRecord.id, swapsForLineup);
          
          swapResults.push({
            lineupId: lineupRecord.id,
            entryId: lineupRecord.contest_entry_id,
            userId: lineupRecord.user_id,
            swaps: swapsForLineup
          });
        }
      }

      console.log(`\n✅ Injury swap complete for contest ${contestId}: ${totalSwaps} total swaps`);
      
      // Remove from scheduled swaps
      this.scheduledSwaps.delete(contestId);

      return {
        success: true,
        contestId,
        totalSwaps,
        lineupsAffected: swapResults.length,
        results: swapResults
      };

    } catch (error) {
      console.error(`❌ Error running injury swaps for contest ${contestId}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Find a valid replacement player
  findReplacement(outPlayer, slot, playerBoard, outPlayerIds, currentLineup) {
    // Determine position requirement based on slot
    let positionReq = outPlayer.position;
    
    // FLEX can be RB or WR
    if (slot.toLowerCase().includes('flex')) {
      positionReq = ['RB', 'WR'];
    }

    // Get all players at the same price point
    const priceKey = `$${outPlayer.price}`;
    const playersAtPrice = playerBoard[priceKey] || [];

    // Get IDs of players already in lineup (to avoid duplicates)
    const lineupPlayerIds = Object.values(currentLineup)
      .filter(p => p && p.id)
      .map(p => String(p.id));

    // Filter for valid replacements
    const validReplacements = playersAtPrice.filter(player => {
      // Must match position
      const positionMatch = Array.isArray(positionReq)
        ? positionReq.includes(player.position)
        : player.position === positionReq;
      
      if (!positionMatch) return false;

      // Must not be OUT
      if (outPlayerIds.includes(String(player.id))) return false;

      // Must not already be in lineup
      if (lineupPlayerIds.includes(String(player.id))) return false;

      // Must not be the same player
      if (String(player.id) === String(outPlayer.id)) return false;

      return true;
    });

    if (validReplacements.length === 0) {
      return null;
    }

    // Pick a random replacement
    const randomIndex = Math.floor(Math.random() * validReplacements.length);
    return validReplacements[randomIndex];
  }

  // ============================================
  // SWAP HISTORY
  // ============================================

  // Record swap history for an entry
  async recordSwapHistory(entryId, swaps) {
    try {
      const key = `swap_history:${entryId}`;
      const history = {
        entryId,
        swappedAt: Date.now(),
        swaps: swaps.map(s => ({
          slot: s.slot,
          oldPlayerId: s.oldPlayer?.id,
          oldPlayerName: s.oldPlayer?.name,
          newPlayerId: s.newPlayer?.id,
          newPlayerName: s.newPlayer?.name,
          error: s.error || null
        }))
      };
      
      await this.redis.set(key, JSON.stringify(history), 'EX', 86400 * 30); // 30 day expiry
      
      // Also store in a list for the user to query
      const userKey = `user_swaps:${entryId}`;
      await this.redis.lpush(userKey, JSON.stringify(history));
      await this.redis.expire(userKey, 86400 * 30);
      
    } catch (error) {
      console.error(`Error recording swap history:`, error);
    }
  }

  // Get swap history for an entry
  async getSwapHistory(entryId) {
    const key = `swap_history:${entryId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // ============================================
  // SCHEDULING
  // ============================================

  // Schedule injury swap for a contest (call this when contest is created)
  scheduleSwapForContest(contestId, startTime) {
    // Clear any existing scheduled swap
    if (this.scheduledSwaps.has(contestId)) {
      clearTimeout(this.scheduledSwaps.get(contestId));
    }

    const now = Date.now();
    const swapTime = new Date(startTime).getTime() - (15 * 60 * 1000); // 15 min before
    const delay = swapTime - now;

    if (delay <= 0) {
      console.log(`⏰ Swap time already passed for contest ${contestId}, running immediately`);
      this.runInjurySwapsForContest(contestId);
      return;
    }

    console.log(`📅 Scheduled injury swap for contest ${contestId} in ${Math.round(delay / 60000)} minutes`);
    
    const timeoutId = setTimeout(() => {
      this.runInjurySwapsForContest(contestId);
    }, delay);

    this.scheduledSwaps.set(contestId, timeoutId);
  }

  // Cancel scheduled swap (if contest is deleted/cancelled)
  cancelScheduledSwap(contestId) {
    if (this.scheduledSwaps.has(contestId)) {
      clearTimeout(this.scheduledSwaps.get(contestId));
      this.scheduledSwaps.delete(contestId);
      console.log(`🚫 Cancelled scheduled injury swap for contest ${contestId}`);
    }
  }

  // Re-schedule all upcoming swaps (call on server boot)
  async rescheduleAllSwaps() {
    console.log('🔄 Rescheduling injury swaps for upcoming contests...');
    
    try {
      const now = new Date();
      
      // Find all active Cash and Market Mover contests with future start times
      const contests = await db.Contest.findAll({
        where: {
          type: ['cash', 'market_mover'],
          status: ['open', 'filling', 'active'],
          start_time: {
            [db.Sequelize.Op.gt]: now
          }
        }
      });

      for (const contest of contests) {
        this.scheduleSwapForContest(contest.id, contest.start_time);
      }

      console.log(`✅ Rescheduled swaps for ${contests.length} contests`);
    } catch (error) {
      console.error('Error rescheduling swaps:', error);
    }
  }
}

// Singleton instance
const injurySwapService = new InjurySwapService();

module.exports = injurySwapService;