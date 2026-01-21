// backend/src/services/ScoringService.js
const { Op } = require('sequelize');

class ScoringService {
  constructor(models) {
    this.models = models;
  }

  // ==================== PLAYER SCORE MANAGEMENT ====================

  /**
   * Set a player's score for a specific week
   */
  async setPlayerScore(playerName, playerTeam, week, season, scoreData) {
    const { PlayerScore } = this.models;
    
    const points = typeof scoreData === 'number' ? scoreData : scoreData.total;
    const stats = typeof scoreData === 'object' ? (scoreData.breakdown || scoreData.stats || {}) : {};
    
    const [score, created] = await PlayerScore.findOrCreate({
      where: {
        player_name: playerName,
        week,
        season
      },
      defaults: {
        player_team: playerTeam,
        fantasy_points: points,
        stats: stats,
        status: 'final',
        updated_at: new Date()
      }
    });
    
    if (!created) {
      await score.update({
        player_team: playerTeam,
        fantasy_points: points,
        stats: stats,
        status: 'final',
        updated_at: new Date()
      });
    }
    
    console.log(`📊 ${created ? 'Created' : 'Updated'} score for ${playerName}: ${points} pts`);
    
    return score;
  }

  /**
   * Bulk import player scores from array
   * Format: [{ name, team, points, stats? }, ...]
   */
  async bulkImportScores(scores, week, season) {
    console.log(`\n📥 Bulk importing ${scores.length} player scores for Week ${week}, ${season}`);
    
    const results = { success: 0, failed: 0, errors: [] };
    
    for (const player of scores) {
      try {
        if (!player.name) {
          results.failed++;
          results.errors.push({ player: 'unknown', error: 'Missing player name' });
          continue;
        }
        
        await this.setPlayerScore(
          player.name,
          player.team || 'UNK',
          week,
          season,
          { total: player.points || 0, breakdown: player.stats || {} }
        );
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ player: player.name, error: error.message });
      }
    }
    
    console.log(`✅ Import complete: ${results.success} succeeded, ${results.failed} failed`);
    return results;
  }

  /**
   * Import scores from CSV format
   * Expected: "PlayerName,Team,Points" per line
   */
  async importScoresFromCSV(csvString, week, season) {
    const lines = csvString.trim().split('\n');
    const scores = [];
    
    // Skip header if present
    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
    
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length >= 3) {
        scores.push({
          name: parts[0],
          team: parts[1],
          points: parseFloat(parts[2]) || 0
        });
      }
    }
    
    return await this.bulkImportScores(scores, week, season);
  }

  /**
   * Calculate fantasy points from raw stats using PPR scoring
   */
  calculatePPRPoints(stats) {
    let points = 0;
    
    // Passing
    points += (stats.passingYards || 0) * 0.04;      // 1 point per 25 yards
    points += (stats.passingTDs || 0) * 4;           // 4 points per TD
    points += (stats.interceptions || 0) * -2;       // -2 per INT
    
    // Rushing
    points += (stats.rushingYards || 0) * 0.1;       // 1 point per 10 yards
    points += (stats.rushingTDs || 0) * 6;           // 6 points per TD
    
    // Receiving (PPR)
    points += (stats.receptions || 0) * 1;           // 1 point per reception
    points += (stats.receivingYards || 0) * 0.1;    // 1 point per 10 yards
    points += (stats.receivingTDs || 0) * 6;        // 6 points per TD
    
    // Misc
    points += (stats.fumbles || 0) * -2;            // -2 per fumble lost
    points += (stats.twoPointConversions || 0) * 2; // 2 points per 2PC
    
    return Math.round(points * 100) / 100;  // Round to 2 decimals
  }

  /**
   * Mark all scores for a week as final
   */
  async finalizeWeekScores(week, season) {
    const { PlayerScore } = this.models;
    
    const [updatedCount] = await PlayerScore.update(
      { status: 'final' },
      { where: { week, season, status: 'pending' } }
    );
    
    console.log(`✅ Finalized ${updatedCount} player scores for Week ${week}`);
    return updatedCount;
  }

  /**
   * Get all player scores for a week
   */
  async getWeekScores(week, season) {
    const { PlayerScore } = this.models;
    
    const scores = await PlayerScore.findAll({
      where: { week, season },
      order: [['fantasy_points', 'DESC']]
    });
    
    return scores.map(s => ({
      name: s.player_name,
      team: s.player_team,
      points: parseFloat(s.fantasy_points || 0),
      status: s.status
    }));
  }

  // ==================== ENTRY SCORE CALCULATION ====================

  /**
   * Extract players from roster - handles multiple formats
   */
  extractPlayersFromRoster(roster) {
    const players = [];
    
    if (!roster) return players;
    
    // Handle array format
    if (Array.isArray(roster)) {
      return roster
        .filter(p => p && (p.name || p.playerName))
        .map(p => ({
          name: p.name || p.playerName,
          team: p.team,
          position: p.position || p.pos,
          slot: p.slot || p.rosterSlot || p.position
        }));
    }
    
    // Handle object format - try both slot naming conventions
    const possibleSlots = [
      // Standard 5-slot format (your current format)
      'QB', 'RB', 'WR', 'TE', 'FLEX',
      // Extended format (in case)
      'RB1', 'RB2', 'WR1', 'WR2', 'WR3',
      // Other common formats
      'K', 'DEF', 'DST', 'D/ST'
    ];
    
    for (const slot of possibleSlots) {
      const player = roster[slot];
      if (player && player.name) {
        players.push({
          name: player.name,
          team: player.team,
          position: player.position || player.pos || slot.replace(/[0-9]/g, ''),
          slot
        });
      }
    }
    
    // If still empty, iterate all keys
    if (players.length === 0) {
      for (const [key, value] of Object.entries(roster)) {
        if (value && typeof value === 'object' && value.name) {
          players.push({
            name: value.name,
            team: value.team,
            position: value.position || value.pos || key.replace(/[0-9]/g, ''),
            slot: key
          });
        }
      }
    }
    
    return players;
  }

  /**
   * Calculate total score for an entry based on its roster
   */
  async calculateEntryScore(entryId, week, season) {
    const { ContestEntry, PlayerScore, Lineup } = this.models;
    
    const entry = await ContestEntry.findByPk(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }
    
    // Get roster - try Lineup table first, then entry.roster
    let roster = null;
    
    const lineup = await Lineup.findOne({
      where: { contest_entry_id: entryId }
    });
    
    if (lineup && lineup.roster) {
      roster = typeof lineup.roster === 'string' 
        ? JSON.parse(lineup.roster) 
        : lineup.roster;
    }
    
    // Fall back to entry.roster
    if (!roster || Object.keys(roster).length === 0) {
      roster = entry.roster;
    }
    
    const rosterPlayers = this.extractPlayersFromRoster(roster || {});
    
    let totalPoints = 0;
    const playerScores = [];
    const missingScores = [];
    
    for (const player of rosterPlayers) {
      if (!player.name) continue;
      
      // Find player's score
      const score = await PlayerScore.findOne({
        where: {
          player_name: player.name,
          week,
          season
        }
      });
      
      if (!score) {
        missingScores.push(player.name);
      }
      
      const points = score ? parseFloat(score.fantasy_points || 0) : 0;
      totalPoints += points;
      
      playerScores.push({
        name: player.name,
        position: player.position,
        slot: player.slot,
        points,
        hasScore: !!score
      });
    }
    
    // Update entry
    await entry.update({ total_points: totalPoints });
    
    console.log(`📈 Entry ${entryId}: ${totalPoints.toFixed(2)} pts (${rosterPlayers.length} players, ${missingScores.length} missing scores)`);
    
    return {
      entryId,
      totalPoints,
      playerCount: rosterPlayers.length,
      playerScores,
      missingScores
    };
  }

  /**
   * Recalculate scores for all entries in a contest
   */
  async recalculateContestScores(contestId, week, season) {
    const { ContestEntry } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contestId,
        status: 'completed'
      }
    });
    
    console.log(`\n🔄 Recalculating scores for ${entries.length} entries in contest ${contestId}`);
    console.log(`   Week: ${week}, Season: ${season}`);
    
    const results = [];
    let totalMissing = new Set();
    
    for (const entry of entries) {
      try {
        const result = await this.calculateEntryScore(entry.id, week, season);
        results.push(result);
        result.missingScores.forEach(p => totalMissing.add(p));
      } catch (error) {
        console.error(`❌ Error calculating score for entry ${entry.id}:`, error.message);
        results.push({ entryId: entry.id, error: error.message });
      }
    }
    
    const successCount = results.filter(r => !r.error).length;
    console.log(`\n✅ Calculated ${successCount}/${entries.length} entry scores`);
    
    if (totalMissing.size > 0) {
      console.log(`⚠️ ${totalMissing.size} players missing scores: ${[...totalMissing].slice(0, 10).join(', ')}${totalMissing.size > 10 ? '...' : ''}`);
    }
    
    return {
      contestId,
      totalEntries: entries.length,
      calculated: successCount,
      failed: entries.length - successCount,
      missingPlayerScores: [...totalMissing],
      results
    };
  }

  // ==================== PRE-SETTLEMENT VALIDATION ====================

  /**
   * Get all unique players rostered in a contest
   */
  async getRosteredPlayers(contestId) {
    const { ContestEntry, Lineup } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: { contest_id: contestId, status: 'completed' }
    });
    
    const allPlayers = new Map(); // name -> { count, teams }
    
    for (const entry of entries) {
      // Try lineup first
      const lineup = await Lineup.findOne({
        where: { contest_entry_id: entry.id }
      });
      
      let roster = lineup?.roster || entry.roster;
      if (typeof roster === 'string') roster = JSON.parse(roster);
      
      const players = this.extractPlayersFromRoster(roster || {});
      
      for (const player of players) {
        if (!player.name) continue;
        
        if (!allPlayers.has(player.name)) {
          allPlayers.set(player.name, { count: 0, team: player.team });
        }
        allPlayers.get(player.name).count++;
      }
    }
    
    return allPlayers;
  }

  /**
   * Check which rostered players are missing scores
   * Call this BEFORE settlement to ensure all players have scores
   */
  async validateScoresForSettlement(contestId, week, season) {
    const { PlayerScore } = this.models;
    
    console.log(`\n🔍 Validating scores for contest ${contestId}, Week ${week}`);
    
    const rosteredPlayers = await this.getRosteredPlayers(contestId);
    console.log(`   Found ${rosteredPlayers.size} unique rostered players`);
    
    const missingScores = [];
    const playersWithScores = [];
    
    for (const [playerName, data] of rosteredPlayers) {
      const score = await PlayerScore.findOne({
        where: { player_name: playerName, week, season }
      });
      
      if (!score) {
        missingScores.push({ 
          name: playerName, 
          team: data.team, 
          rosterCount: data.count 
        });
      } else {
        playersWithScores.push({
          name: playerName,
          points: parseFloat(score.fantasy_points || 0)
        });
      }
    }
    
    // Sort missing by roster count (most owned first)
    missingScores.sort((a, b) => b.rosterCount - a.rosterCount);
    
    const ready = missingScores.length === 0;
    
    console.log(`   Players with scores: ${playersWithScores.length}`);
    console.log(`   Players missing scores: ${missingScores.length}`);
    
    if (!ready) {
      console.log(`\n⚠️ MISSING SCORES (top 20 by ownership):`);
      missingScores.slice(0, 20).forEach(p => {
        console.log(`   - ${p.name} (${p.team || 'UNK'}) - rostered ${p.rosterCount}x`);
      });
    }
    
    return {
      ready,
      totalPlayers: rosteredPlayers.size,
      playersWithScores: playersWithScores.length,
      missingCount: missingScores.length,
      missingScores,
      message: ready 
        ? '✅ All rostered players have scores - ready to settle!'
        : `❌ ${missingScores.length} players missing scores - import scores before settling`
    };
  }

  /**
   * Generate a template of all players that need scores
   * Useful for manual score entry
   */
  async generateScoreTemplate(contestId) {
    const rosteredPlayers = await this.getRosteredPlayers(contestId);
    
    const template = [];
    for (const [name, data] of rosteredPlayers) {
      template.push({
        name,
        team: data.team || '',
        points: 0,
        rosterCount: data.count
      });
    }
    
    // Sort by roster count
    template.sort((a, b) => b.rosterCount - a.rosterCount);
    
    return template;
  }

  // ==================== LEADERBOARD ====================

  /**
   * Get leaderboard for a contest
   */
  async getContestLeaderboard(contestId, limit = 100) {
    const { ContestEntry, User } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contestId,
        status: 'completed'
      },
      order: [
        ['total_points', 'DESC'],
        ['created_at', 'ASC']  // Tiebreaker
      ],
      limit,
      include: [{
        model: User,
        attributes: ['id', 'username']
      }]
    });
    
    let currentRank = 1;
    let previousScore = null;
    
    return entries.map((entry, index) => {
      const score = parseFloat(entry.total_points || 0);
      
      // Standard competition ranking
      if (previousScore !== null && score < previousScore) {
        currentRank = index + 1;
      }
      previousScore = score;
      
      return {
        rank: currentRank,
        entryId: entry.id,
        odId: entry.user_id,
        username: entry.User?.username,
        totalPoints: score,
        roster: entry.roster
      };
    });
  }

  /**
   * Get scoring summary for a contest
   */
  async getContestScoringSummary(contestId) {
    const { ContestEntry } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: { contest_id: contestId, status: 'completed' },
      attributes: ['total_points']
    });
    
    if (entries.length === 0) {
      return { entries: 0, message: 'No completed entries' };
    }
    
    const scores = entries.map(e => parseFloat(e.total_points || 0));
    const sum = scores.reduce((a, b) => a + b, 0);
    
    return {
      entries: entries.length,
      averageScore: (sum / scores.length).toFixed(2),
      highScore: Math.max(...scores).toFixed(2),
      lowScore: Math.min(...scores).toFixed(2),
      zeroScores: scores.filter(s => s === 0).length,
      scoredEntries: scores.filter(s => s > 0).length
    };
  }
}

module.exports = ScoringService;