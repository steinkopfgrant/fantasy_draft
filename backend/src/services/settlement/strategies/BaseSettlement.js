// backend/src/services/settlement/strategies/BaseSettlement.js

class BaseSettlement {
  constructor(models, sequelize, payoutService) {
    this.models = models;
    this.sequelize = sequelize;
    this.payoutService = payoutService;
  }

  /**
   * Get contest type this strategy handles
   */
  getType() {
    throw new Error('Subclass must implement getType()');
  }

  /**
   * Main settle method - must be implemented by subclass
   */
  async settle(contest, transaction) {
    throw new Error('Subclass must implement settle()');
  }

  /**
   * Get all completed entries for a contest, sorted by score
   */
  async getEntriesSortedByScore(contestId, transaction) {
    const { ContestEntry, User } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contestId,
        status: 'completed'
      },
      order: [
        ['total_points', 'DESC'],
        ['created_at', 'ASC']  // Tiebreaker: earlier entry wins
      ],
      include: [{
        model: User,
        attributes: ['id', 'username']
      }],
      transaction
    });
    
    return entries;
  }

  /**
   * Assign standard competition ranking (1, 2, 2, 4, 5...)
   * Ties share the same rank, next rank skips accordingly
   */
  assignRanks(entries) {
    let currentRank = 1;
    let previousScore = null;
    let skipCount = 0;
    
    return entries.map((entry, index) => {
      const score = parseFloat(entry.total_points || 0);
      
      if (previousScore !== null && score < previousScore) {
        currentRank = index + 1;
      }
      
      previousScore = score;
      
      return {
        ...entry.toJSON(),
        rank: currentRank,
        totalPoints: score
      };
    });
  }

  /**
   * Update entry with final results
   */
  async updateEntryResult(entryId, rank, prizeWon, transaction) {
    const { ContestEntry } = this.models;
    
    await ContestEntry.update(
      {
        final_rank: rank,
        prize_won: prizeWon
      },
      {
        where: { id: entryId },
        transaction
      }
    );
  }

  /**
   * Create contest result record
   */
  async createResultRecord(data, transaction) {
    const { ContestResult } = this.models;
    
    await ContestResult.create({
      contest_id: data.contestId,
      entry_id: data.entryId,
      user_id: data.userId,
      final_rank: data.rank,
      total_score: data.totalPoints,
      payout: data.payout,
      settled_at: new Date()
    }, { transaction });
  }

  /**
   * Credit user and update entry in one call
   */
  async processWinner(entry, rank, payout, contestId, transaction) {
    // Update entry record
    await this.updateEntryResult(entry.id, rank, payout, transaction);
    
    // Create result record
    await this.createResultRecord({
      contestId,
      entryId: entry.id,
      userId: entry.user_id,
      rank,
      totalPoints: parseFloat(entry.total_points || 0),
      payout
    }, transaction);
    
    // Credit user if payout > 0
    if (payout > 0) {
      await this.payoutService.creditUser(
        entry.user_id,
        payout,
        transaction,
        {
          contestId,
          entryId: entry.id,
          rank,
          description: `Contest winnings - Rank #${rank}`
        }
      );
    }
    
    return {
      entryId: entry.id,
      userId: entry.user_id,
      username: entry.User?.username,
      rank,
      totalPoints: parseFloat(entry.total_points || 0),
      payout
    };
  }

  /**
   * Validate contest can be settled
   * FIXED: Auto-close full contests that are still open due to race conditions
   */
  async validateSettlement(contest) {
    if (!contest) {
      throw new Error('Contest not found');
    }
    
    if (contest.status === 'settled') {
      throw new Error('Contest already settled');
    }
    
    // AUTO-CLOSE if contest is full but still open (fixes race condition bug)
    if (contest.status === 'open' && contest.current_entries >= contest.max_entries) {
      console.log(`⚠️ Contest ${contest.id} is full (${contest.current_entries}/${contest.max_entries}) but still OPEN - auto-closing for settlement`);
      await contest.update({ status: 'closed' });
      contest.status = 'closed';  // Update in-memory object too
    }
    
    if (contest.status !== 'completed' && contest.status !== 'in_progress' && contest.status !== 'closed') {
      throw new Error(`Contest cannot be settled - status is ${contest.status}`);
    }
    
    return true;
  }

  /**
   * Handle ties at a specific rank for prize distribution
   * Returns the prize per person when ties occur
   */
  calculateTiedPrize(tiedEntries, prizeStructure) {
    // Sum up all prizes that would have been awarded to these positions
    const startRank = tiedEntries[0].rank;
    const endRank = startRank + tiedEntries.length - 1;
    
    let totalPrize = 0;
    for (let rank = startRank; rank <= endRank; rank++) {
      totalPrize += this.getPrizeForRank(rank, prizeStructure);
    }
    
    // Split evenly among tied entries
    return totalPrize / tiedEntries.length;
  }

  /**
   * Get prize for a specific rank from structure
   * Subclasses should override this
   */
  getPrizeForRank(rank, prizeStructure) {
    // Default implementation - override in subclass
    for (const tier of prizeStructure) {
      if (tier.rank && rank === tier.rank) {
        return tier.payout;
      }
      if (tier.rankStart && tier.rankEnd && rank >= tier.rankStart && rank <= tier.rankEnd) {
        return tier.payout;
      }
    }
    return 0;
  }
}

module.exports = BaseSettlement;