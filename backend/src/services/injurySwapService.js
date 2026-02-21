// backend/src/services/injurySwapService.js
// Handles injury swaps for all contest types within a slate.
//
// FLOW:
//   1. Admin marks players as OUT for a specific slate via API
//   2. When the slate locks (games about to start), call runSwapsForSlate()
//   3. For every completed lineup tied to that slate, find OUT players
//   4. Replace each OUT player with a random same-position, same-price
//      player from PLAYER_POOLS who is NOT out and NOT already on the roster
//   5. Save updated lineup + swap history
//
// Replacement candidates come from gameLogic PLAYER_POOLS (the master list),
// NOT from the draft board. The board is irrelevant post-draft.

const db = require('../models');
const { Op } = require('sequelize');
const { SPORT_CONFIG } = require('../utils/gameLogic');

class InjurySwapService {
  constructor() {
    this.redis = null;
  }

  setRedis(redisClient) {
    this.redis = redisClient;
  }

  // ============================================
  // INJURY STATUS MANAGEMENT (per-slate)
  // ============================================

  _key(slateId) {
    return `injuries:slate:${slateId}`;
  }

  /**
   * Mark a player as OUT for a specific slate.
   * Uses player name as the key since that's what's stored in lineup rosters.
   */
  async markPlayerOut(slateId, playerName, position, price, sport = 'nfl') {
    const key = this._key(slateId);
    const injuries = await this.getInjuries(slateId);

    injuries[playerName] = {
      status: 'OUT',
      position,
      price: Number(price),
      sport,
      markedAt: Date.now()
    };

    await this.redis.set(key, JSON.stringify(injuries), 'EX', 86400 * 7);
    console.log(`🏥 Marked "${playerName}" (${position} $${price}) as OUT for slate ${slateId}`);
    return true;
  }

  /**
   * Mark a player as active (remove from injury list for a slate).
   */
  async markPlayerActive(slateId, playerName) {
    const key = this._key(slateId);
    const injuries = await this.getInjuries(slateId);
    delete injuries[playerName];
    await this.redis.set(key, JSON.stringify(injuries), 'EX', 86400 * 7);
    console.log(`✅ Marked "${playerName}" as ACTIVE for slate ${slateId}`);
    return true;
  }

  /**
   * Bulk mark players as OUT for a slate.
   * players: [{ name, position, price }]
   */
  async bulkMarkOut(slateId, players, sport = 'nfl') {
    const key = this._key(slateId);
    const injuries = await this.getInjuries(slateId);
    const now = Date.now();

    for (const p of players) {
      injuries[p.name] = {
        status: 'OUT',
        position: p.position,
        price: Number(p.price),
        sport,
        markedAt: now
      };
    }

    await this.redis.set(key, JSON.stringify(injuries), 'EX', 86400 * 7);
    console.log(`🏥 Bulk marked ${players.length} players as OUT for slate ${slateId}`);
    return true;
  }

  /**
   * Get all injuries for a slate.
   * Returns: { "Josh Allen": { status: "OUT", position: "QB", price: 5, ... }, ... }
   */
  async getInjuries(slateId) {
    const key = this._key(slateId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : {};
  }

  /**
   * Clear all injuries for a slate.
   */
  async clearInjuries(slateId) {
    await this.redis.del(this._key(slateId));
    console.log(`🗑️ Cleared all injuries for slate ${slateId}`);
    return true;
  }

  // ============================================
  // CORE SWAP LOGIC
  // ============================================

  /**
   * Run injury swaps for every lineup in a slate.
   * Call this when the slate locks (before games start).
   */
  async runSwapsForSlate(slateId) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 RUNNING INJURY SWAPS FOR SLATE: ${slateId}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // 1. Get the slate
      const slate = await db.Slate.findByPk(slateId);
      if (!slate) {
        console.log(`❌ Slate ${slateId} not found`);
        return { success: false, error: 'Slate not found' };
      }

      const sport = slate.sport || 'nfl';

      // 2. Get OUT players for this slate
      const injuries = await this.getInjuries(slateId);
      const outPlayerNames = Object.keys(injuries).filter(
        name => injuries[name].status === 'OUT'
      );

      if (outPlayerNames.length === 0) {
        console.log(`✅ No players marked OUT — no swaps needed`);
        return { success: true, totalSwaps: 0, lineupsAffected: 0 };
      }

      console.log(`🏥 Players OUT (${outPlayerNames.length}): ${outPlayerNames.join(', ')}`);

      // 3. Build a Set for fast lookup
      const outSet = new Set(outPlayerNames.map(n => n.toLowerCase()));

      // 4. Find all contests on this slate
      const contests = await db.Contest.findAll({
        where: { slate_id: slateId }
      });

      if (contests.length === 0) {
        console.log(`📭 No contests found for slate ${slateId}`);
        return { success: true, totalSwaps: 0, lineupsAffected: 0 };
      }

      const contestIds = contests.map(c => c.id);
      console.log(`📋 Found ${contests.length} contest(s) on this slate`);

      // 5. Get all drafted lineups for those contests
      const lineups = await db.Lineup.findAll({
        where: {
          contest_id: { [Op.in]: contestIds },
          status: 'drafted'
        }
      });

      if (lineups.length === 0) {
        console.log(`📭 No drafted lineups to process`);
        return { success: true, totalSwaps: 0, lineupsAffected: 0 };
      }

      console.log(`📋 Found ${lineups.length} lineup(s) to check`);

      // 6. Get the player pool for this sport
      const sportConfig = SPORT_CONFIG[sport];
      if (!sportConfig) {
        console.log(`❌ Unknown sport: ${sport}`);
        return { success: false, error: `Unknown sport: ${sport}` };
      }
      const playerPools = sportConfig.playerPools;

      // 7. Process each lineup
      let totalSwaps = 0;
      const swapResults = [];

      for (const lineup of lineups) {
        const roster = lineup.roster || {};
        const swapsForLineup = [];

        // Build set of player names already on this roster (lowercase for matching)
        const rosterNames = new Set(
          Object.values(roster)
            .filter(p => p && p.name)
            .map(p => p.name.toLowerCase())
        );

        for (const [slot, player] of Object.entries(roster)) {
          if (!player || !player.name) continue;

          if (!outSet.has(player.name.toLowerCase())) continue;

          console.log(`🔍 Found OUT player in lineup ${lineup.id}: "${player.name}" (${slot}, ${player.position} $${player.price})`);

          // Find replacement from PLAYER_POOLS
          const replacement = this._findReplacement(
            player,
            slot,
            playerPools,
            outSet,
            rosterNames,
            sport
          );

          if (replacement) {
            console.log(`  ✅ Swapping "${player.name}" → "${replacement.name}"`);

            // Update roster in-place
            roster[slot] = {
              ...replacement,
              position: player.position,           // Keep the slot's position label
              price: player.price,                  // Keep the original price
              swappedFrom: player.name,             // Audit trail
              swappedAt: new Date().toISOString()
            };

            // Update rosterNames so the next slot doesn't pick the same replacement
            rosterNames.delete(player.name.toLowerCase());
            rosterNames.add(replacement.name.toLowerCase());

            swapsForLineup.push({
              slot,
              oldPlayer: { name: player.name, team: player.team, position: player.position, price: player.price },
              newPlayer: { name: replacement.name, team: replacement.team, position: replacement.position, price: player.price }
            });
            totalSwaps++;
          } else {
            console.log(`  ❌ No valid replacement for "${player.name}" (${player.position} $${player.price})`);
            swapsForLineup.push({
              slot,
              oldPlayer: { name: player.name, team: player.team, position: player.position, price: player.price },
              newPlayer: null,
              error: 'No valid replacement available'
            });
          }
        }

        // Save updated roster if any swaps occurred
        if (swapsForLineup.length > 0) {
          lineup.roster = roster;
          lineup.changed('roster', true); // Force Sequelize to detect JSONB change
          await lineup.save();

          // Record swap history in Redis
          await this._recordSwapHistory(slateId, lineup.id, lineup.user_id, swapsForLineup);

          swapResults.push({
            lineupId: lineup.id,
            contestId: lineup.contest_id,
            userId: lineup.user_id,
            swaps: swapsForLineup
          });
        }
      }

      console.log(`\n✅ Injury swaps complete for slate ${slateId}: ${totalSwaps} swap(s) across ${swapResults.length} lineup(s)`);
      console.log(`${'='.repeat(60)}\n`);

      return {
        success: true,
        slateId,
        sport,
        totalSwaps,
        lineupsAffected: swapResults.length,
        lineupsChecked: lineups.length,
        outPlayers: outPlayerNames,
        results: swapResults
      };

    } catch (error) {
      console.error(`❌ Error running injury swaps for slate ${slateId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find a valid replacement player from PLAYER_POOLS.
   *
   * Rules:
   *   - Same base position (QB→QB, WR→WR, etc.)
   *     For FLEX slots, use originalPosition or the player's actual position
   *   - Same price tier
   *   - Not marked OUT
   *   - Not already on the roster
   */
  _findReplacement(outPlayer, slot, playerPools, outSet, rosterNames, sport) {
    // Determine the base position to search.
    // If the slot is FLEX, use the player's original/actual position.
    let searchPosition = outPlayer.originalPosition || outPlayer.position;

    // Normalize: FLEX isn't a pool key, so we need the real position
    if (searchPosition === 'FLEX') {
      // Fallback: try to infer from slot name or just use position field
      searchPosition = outPlayer.position !== 'FLEX' ? outPlayer.position : null;
    }

    if (!searchPosition || !playerPools[searchPosition]) {
      console.log(`  ⚠️ Cannot determine pool for position "${searchPosition}"`);
      return null;
    }

    const price = Number(outPlayer.price);
    const pool = playerPools[searchPosition][price] || [];

    if (pool.length === 0) {
      console.log(`  ⚠️ Empty pool for ${searchPosition} at $${price}`);
      return null;
    }

    // Filter for valid candidates
    const candidates = pool.filter(p => {
      // Not the same player
      if (p.name.toLowerCase() === outPlayer.name.toLowerCase()) return false;
      // Not OUT
      if (outSet.has(p.name.toLowerCase())) return false;
      // Not already on roster
      if (rosterNames.has(p.name.toLowerCase())) return false;
      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    // Pick random
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ============================================
  // SWAP HISTORY
  // ============================================

  async _recordSwapHistory(slateId, lineupId, userId, swaps) {
    try {
      const record = {
        slateId,
        lineupId,
        userId,
        swappedAt: Date.now(),
        swaps: swaps.map(s => ({
          slot: s.slot,
          oldPlayerName: s.oldPlayer?.name,
          oldPlayerTeam: s.oldPlayer?.team,
          newPlayerName: s.newPlayer?.name,
          newPlayerTeam: s.newPlayer?.team,
          price: s.oldPlayer?.price,
          error: s.error || null
        }))
      };

      // Per-lineup history
      const lineupKey = `swap_history:lineup:${lineupId}`;
      await this.redis.set(lineupKey, JSON.stringify(record), 'EX', 86400 * 30);

      // Per-user list (so users can see all their swaps)
      const userKey = `swap_history:user:${userId}`;
      await this.redis.lpush(userKey, JSON.stringify(record));
      await this.redis.expire(userKey, 86400 * 30);

      // Per-slate summary list (for admin review)
      const slateKey = `swap_history:slate:${slateId}`;
      await this.redis.lpush(slateKey, JSON.stringify(record));
      await this.redis.expire(slateKey, 86400 * 30);

    } catch (error) {
      console.error(`Error recording swap history:`, error);
    }
  }

  /**
   * Get swap history for a specific lineup.
   */
  async getSwapHistoryForLineup(lineupId) {
    const key = `swap_history:lineup:${lineupId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all swap records for a user.
   */
  async getSwapHistoryForUser(userId, limit = 20) {
    const key = `swap_history:user:${userId}`;
    const records = await this.redis.lrange(key, 0, limit - 1);
    return records.map(r => JSON.parse(r));
  }

  /**
   * Get all swap records for a slate (admin).
   */
  async getSwapHistoryForSlate(slateId, limit = 100) {
    const key = `swap_history:slate:${slateId}`;
    const records = await this.redis.lrange(key, 0, limit - 1);
    return records.map(r => JSON.parse(r));
  }
}

// Singleton
const injurySwapService = new InjurySwapService();
module.exports = injurySwapService;