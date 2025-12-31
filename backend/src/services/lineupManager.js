// backend/src/services/lineupManager.js
const db = require('../models');
const { Op } = require('sequelize');

class LineupManager {
  // Get user's active lineups (Your Teams tab)
  async getUserLineups(userId, filters = {}) {
    const {
      status = null,
      contestType = null,
      page = 1,
      limit = 50
    } = filters;

    const where = { user_id: userId };
    if (status) {
      where.status = Array.isArray(status) ? { [Op.in]: status } : status;
    }
    if (contestType) {
      where.contest_type = contestType;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.Lineup.findAndCountAll({
      where,
      include: [{
        model: db.Contest,
        attributes: ['name', 'type', 'entry_fee', 'prize_pool', 'status']
      }, {
        model: db.ContestEntry,
        attributes: ['id', 'draft_room_id', 'total_spent']
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      total: count,
      lineups: rows.map(this.formatLineup),
      page,
      pageSize: limit,
      totalPages: Math.ceil(count / limit),
      hasMore: offset + limit < count
    };
  }

  // Format lineup for frontend
  formatLineup(lineup) {
    return {
      id: lineup.id,
      contestName: lineup.Contest?.name,
      contestType: lineup.contest_type,
      contestStatus: lineup.Contest?.status,
      status: lineup.status,
      roster: lineup.roster,
      liveScore: parseFloat(lineup.live_score || 0),
      finalScore: lineup.final_score ? parseFloat(lineup.final_score) : null,
      rank: lineup.rank,
      payout: parseFloat(lineup.payout || 0),
      entryFee: lineup.Contest ? parseFloat(lineup.Contest.entry_fee) : 0,
      createdAt: lineup.created_at,
      isLive: lineup.status === 'live',
      isComplete: ['final', 'paid'].includes(lineup.status)
    };
  }

  // Progress lineups through states
  async progressLineups(contestType, fromStatus, toStatus) {
    const [updated] = await db.Lineup.update(
      { 
        status: toStatus,
        updated_at: new Date()
      },
      {
        where: {
          contest_type: contestType,
          status: fromStatus
        }
      }
    );

    console.log(`Progressed ${updated} ${contestType} lineups from ${fromStatus} to ${toStatus}`);
    return updated;
  }

  // Update scores
  async updateScores(lineupId, liveScore, finalScore = null) {
    const lineup = await db.Lineup.findByPk(lineupId);
    if (!lineup) throw new Error('Lineup not found');

    const update = {
      live_score: liveScore,
      updated_at: new Date()
    };

    if (finalScore !== null) {
      update.final_score = finalScore;
      update.status = 'final';
    }

    await lineup.update(update);
    return lineup;
  }

  // Calculate rankings within a contest
  async calculateRankings(contestId) {
    const lineups = await db.Lineup.findAll({
      where: {
        contest_id: contestId,
        final_score: { [Op.ne]: null }
      },
      order: [['final_score', 'DESC']]
    });

    // Update ranks
    for (let i = 0; i < lineups.length; i++) {
      await lineups[i].update({ rank: i + 1 });
    }

    return lineups.length;
  }

  // Get contest standings
  async getContestStandings(contestId) {
    const lineups = await db.Lineup.findAll({
      where: { contest_id: contestId },
      include: [{
        model: db.User,
        attributes: ['username']
      }],
      order: [
        [db.sequelize.literal('CASE WHEN final_score IS NOT NULL THEN 0 ELSE 1 END'), 'ASC'],
        ['final_score', 'DESC NULLS LAST'],
        ['live_score', 'DESC']
      ]
    });

    return lineups.map((lineup, index) => ({
      rank: lineup.rank || index + 1,
      username: lineup.User?.username,
      score: lineup.final_score || lineup.live_score,
      status: lineup.status,
      payout: lineup.payout
    }));
  }

  // Batch operations for performance
  async batchUpdateScores(updates) {
    const promises = updates.map(({ lineupId, score }) => 
      db.Lineup.update(
        { live_score: score },
        { where: { id: lineupId } }
      )
    );
    
    await Promise.all(promises);
  }
}

module.exports = new LineupManager();