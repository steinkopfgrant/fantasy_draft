// backend/src/services/settlement/SettlementService.js
const PayoutService = require('../PayoutService');
const CashGameSettlement = require('./strategies/CashGameSettlement');
const MarketMoverSettlement = require('./strategies/MarketMoverSettlement');

class SettlementService {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
    this.payoutService = new PayoutService(models, sequelize);
    
    // Initialize strategies
    this.strategies = {
      'cash': new CashGameSettlement(models, sequelize, this.payoutService),
      'market': new MarketMoverSettlement(models, sequelize, this.payoutService),
      // Add more strategies as needed:
      // 'firesale': new FireSaleSettlement(models, sequelize, this.payoutService),
      // 'weekly': new WeeklySettlement(models, sequelize, this.payoutService),
    };
  }

  /**
   * Get the settlement strategy for a contest type
   */
  getStrategy(contestType) {
    const strategy = this.strategies[contestType];
    if (!strategy) {
      throw new Error(`No settlement strategy for contest type: ${contestType}`);
    }
    return strategy;
  }

  /**
   * Settle a single contest
   * 
   * CRITICAL FIX: Transaction starts FIRST, contest fetched with FOR UPDATE lock.
   * This prevents race condition where concurrent settlements both pass the
   * "already settled" check and pay users multiple times.
   */
  async settleContest(contestId) {
    const { Contest } = this.models;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 STARTING SETTLEMENT FOR CONTEST: ${contestId}`);
    console.log(`${'='.repeat(60)}`);
    
    // ================================================================
    // CRITICAL: Start transaction FIRST, before any reads
    // ================================================================
    const transaction = await this.sequelize.transaction({
      isolationLevel: this.sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });
    
    try {
      // ================================================================
      // CRITICAL: Fetch contest WITH ROW LOCK (FOR UPDATE)
      // This blocks any other settlement attempt for this contest
      // until this transaction completes or rolls back
      // ================================================================
      const contest = await Contest.findOne({
        where: { id: contestId },
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (!contest) {
        throw new Error(`Contest ${contestId} not found`);
      }
      
      // NOW this check is protected by the row lock
      if (contest.status === 'settled') {
        throw new Error(`Contest ${contestId} is already settled`);
      }
      
      // Get the right strategy
      const contestType = contest.type || 'cash';
      const strategy = this.getStrategy(contestType);
      
      console.log(`📋 Contest: ${contest.name}`);
      console.log(`📋 Type: ${contestType}`);
      console.log(`📋 Status: ${contest.status}`);
      
      let result;
      
      // Cash games need special handling for multiple rooms
      if (contestType === 'cash') {
        result = await strategy.settleAllRooms(contest, transaction);
      } else {
        result = await strategy.settle(contest, transaction);
      }
      
      // Update contest status
      await Contest.update(
        { 
          status: 'settled',
          settled_at: new Date()
        },
        { 
          where: { id: contestId },
          transaction 
        }
      );
      
      await transaction.commit();
      
      console.log(`\n✅ SETTLEMENT COMPLETE FOR ${contest.name}`);
      console.log(`${'='.repeat(60)}\n`);
      
      return {
        success: true,
        contestId,
        contestName: contest.name,
        ...result
      };
      
    } catch (error) {
      await transaction.rollback();
      console.error(`\n❌ SETTLEMENT FAILED FOR ${contestId}:`, error.message);
      console.log(`${'='.repeat(60)}\n`);
      throw error;
    }
  }

  /**
   * Settle all contests that are ready (completed status)
   */
  async settleAllReady() {
    const { Contest } = this.models;
    
    // Find all completed contests that haven't been settled
    const readyContests = await Contest.findAll({
      where: {
        status: 'completed'
      }
    });
    
    console.log(`\n🔍 Found ${readyContests.length} contests ready for settlement`);
    
    const results = [];
    
    for (const contest of readyContests) {
      try {
        const result = await this.settleContest(contest.id);
        results.push({ contestId: contest.id, success: true, result });
      } catch (error) {
        console.error(`❌ Failed to settle ${contest.id}:`, error.message);
        results.push({ contestId: contest.id, success: false, error: error.message });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Settlement batch complete: ${successful} succeeded, ${failed} failed`);
    
    return {
      total: readyContests.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Preview settlement without committing
   */
  async previewSettlement(contestId) {
    const { Contest } = this.models;
    
    const contest = await Contest.findByPk(contestId);
    if (!contest) {
      throw new Error(`Contest ${contestId} not found`);
    }
    
    const contestType = contest.type || 'cash';
    const strategy = this.getStrategy(contestType);
    
    if (typeof strategy.previewSettlement === 'function') {
      return await strategy.previewSettlement(contestId);
    }
    
    // Basic preview
    const entries = await strategy.getEntriesSortedByScore(contestId, null);
    const rankedEntries = strategy.assignRanks(entries);
    
    return {
      contestId,
      contestName: contest.name,
      contestType,
      status: contest.status,
      totalEntries: entries.length,
      topEntries: rankedEntries.slice(0, 20).map(e => ({
        rank: e.rank,
        username: e.User?.username,
        totalPoints: e.totalPoints
      }))
    };
  }

  /**
   * Check if a contest is ready to settle
   */
  async isReadyToSettle(contestId, week, season) {
    const { Contest, PlayerScore, ContestEntry } = this.models;
    
    const contest = await Contest.findByPk(contestId);
    if (!contest) {
      return { ready: false, reason: 'Contest not found' };
    }
    
    if (contest.status === 'settled') {
      return { ready: false, reason: 'Already settled' };
    }
    
    // Check if all entries are completed (drafted)
    const pendingEntries = await ContestEntry.count({
      where: {
        contest_id: contestId,
        status: { [require('sequelize').Op.notIn]: ['completed', 'cancelled'] }
      }
    });
    
    if (pendingEntries > 0) {
      return { ready: false, reason: `${pendingEntries} entries still pending/drafting` };
    }
    
    // Check if scores are finalized (optional - depends on your flow)
    const pendingScores = await PlayerScore.count({
      where: {
        week: week || 1,
        season: season || 2024,
        status: 'pending'
      }
    });
    
    if (pendingScores > 0) {
      return { ready: false, reason: `${pendingScores} player scores still pending`, allowForce: true };
    }
    
    return { ready: true };
  }

  /**
   * Get settlement summary for a contest
   */
  async getSettlementSummary(contestId) {
    const { Contest, ContestEntry, ContestResult } = this.models;
    
    const contest = await Contest.findByPk(contestId);
    if (!contest) {
      throw new Error('Contest not found');
    }
    
    const entries = await ContestEntry.findAll({
      where: { contest_id: contestId }
    });
    
    const results = await ContestResult.findAll({
      where: { contest_id: contestId },
      order: [['final_rank', 'ASC']]
    });
    
    const totalPrizes = entries.reduce((sum, e) => sum + parseFloat(e.prize_won || 0), 0);
    const winnersCount = entries.filter(e => parseFloat(e.prize_won || 0) > 0).length;
    
    return {
      contestId,
      contestName: contest.name,
      contestType: contest.type,
      status: contest.status,
      settledAt: contest.settled_at,
      totalEntries: entries.length,
      winnersCount,
      totalPrizesPaid: totalPrizes,
      topResults: results.slice(0, 20).map(r => ({
        rank: r.final_rank,
        userId: r.user_id,
        totalScore: parseFloat(r.total_score),
        payout: parseFloat(r.payout)
      }))
    };
  }
}

module.exports = SettlementService;