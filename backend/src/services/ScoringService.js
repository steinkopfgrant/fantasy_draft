// backend/src/services/ScoringService.js
const { Op } = require('sequelize');

class ScoringService {
  constructor(models) {
    this.models = models;
  }

  /**
   * Set a player's score for a specific week
   * Called when importing scores from data provider
   */
  async setPlayerScore(playerName, playerTeam, week, season, scoreData) {
    const { PlayerScore } = this.models;
    
    // Find existing or create new
    const [score, created] = await PlayerScore.findOrCreate({
      where: {
        player_name: playerName,
        player_team: playerTeam,
        week,
        season
      },
      defaults: {
        fantasy_points: scoreData.total,
        stats: scoreData.breakdown || {},
        status: 'final',
        updated_at: new Date()
      }
    });
    
    // If found, update it
    if (!created) {
      await score.update({
        fantasy_points: scoreData.total,
        stats: scoreData.breakdown || {},
        status: 'final',
        updated_at: new Date()
      });
    }
    
    console.log(`📊 ${created ? 'Created' : 'Updated'} score for ${playerName}: ${scoreData.total} pts`);
    
    return score;
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
   * Check if all scores for a week are final
   */
  async areAllScoresFinal(week, season) {
    const { PlayerScore } = this.models;
    
    const pendingCount = await PlayerScore.count({
      where: { week, season, status: 'pending' }
    });
    
    return pendingCount === 0;
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
    
    // Try to get roster from Lineup table first (preferred)
    let roster = null;
    
    // Method 1: Get lineup by contest_entry_id
    let lineup = await Lineup.findOne({
      where: { contest_entry_id: entryId }
    });
    
    // Method 2: If not found, try by contest_id + user_id
    if (!lineup) {
      lineup = await Lineup.findOne({
        where: { 
          contest_id: entry.contest_id,
          user_id: entry.user_id
        }
      });
    }
    
    if (lineup && lineup.roster) {
      roster = typeof lineup.roster === 'string' 
        ? JSON.parse(lineup.roster) 
        : lineup.roster;
    }
    
    // Fall back to entry.roster if Lineup is empty
    if (!roster || Object.keys(roster).length === 0) {
      roster = entry.roster;
    }
    
    let totalPoints = 0;
    const playerScores = [];
    
    // Get players from roster
    const rosterPlayers = this.extractPlayersFromRoster(roster || {});
    
    for (const player of rosterPlayers) {
      if (!player.name) continue;
      
      // Find player's score for this week
      const score = await PlayerScore.findOne({
        where: {
          player_name: player.name,
          week,
          season
        }
      });
      
      const points = score?.fantasy_points || 0;
      totalPoints += parseFloat(points);
      
      playerScores.push({
        name: player.name,
        position: player.position,
        slot: player.slot,
        points: parseFloat(points)
      });
    }
    
    // Update entry with calculated score
    await entry.update({
      total_points: totalPoints
    });
    
    console.log(`📈 Entry ${entryId}: ${totalPoints.toFixed(2)} total points (${rosterPlayers.length} players)`);
    
    return {
      entryId,
      totalPoints,
      playerCount: rosterPlayers.length,
      playerScores
    };
  }

  /**
   * Extract players from the roster JSONB structure
   */
  extractPlayersFromRoster(roster) {
    const players = [];
    
    if (!roster) return players;
    
    // Handle different roster formats
    if (Array.isArray(roster)) {
      // Array format: [{ name, position, ... }, ...]
      return roster
        .filter(p => p && p.name)
        .map(p => ({
          name: p.name || p.playerName,
          team: p.team,
          position: p.position || p.pos,
          slot: p.slot || p.position || p.pos
        }));
    }
    
    // Object format: { QB: {...}, RB1: {...}, ... }
    const slots = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX'];
    
    for (const slot of slots) {
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
    
    // Also try iterating all keys in case format is different
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
   * Recalculate scores for all entries in a contest
   */
  async recalculateContestScores(contestId, week, season) {
    const { ContestEntry } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contestId,
        status: { [Op.in]: ['completed', 'drafting'] }
      }
    });
    
    console.log(`🔄 Recalculating scores for ${entries.length} entries in contest ${contestId}`);
    
    const results = [];
    for (const entry of entries) {
      try {
        const result = await this.calculateEntryScore(entry.id, week, season);
        results.push(result);
      } catch (error) {
        console.error(`❌ Error calculating score for entry ${entry.id}:`, error.message);
        results.push({ entryId: entry.id, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Get leaderboard for a contest
   */
  async getContestLeaderboard(contestId, limit = 100) {
    const { ContestEntry, User } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contestId,
        status: { [Op.in]: ['completed', 'drafting'] }
      },
      order: [['total_points', 'DESC']],
      limit,
      include: [{
        model: User,
        attributes: ['id', 'username']
      }]
    });
    
    return entries.map((entry, index) => ({
      rank: index + 1,
      entryId: entry.id,
      userId: entry.user_id,
      username: entry.User?.username,
      totalPoints: parseFloat(entry.total_points || 0),
      roster: entry.roster
    }));
  }
}

module.exports = ScoringService;