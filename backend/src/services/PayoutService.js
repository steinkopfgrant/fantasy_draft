// backend/src/services/PayoutService.js

class PayoutService {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
  }

  /**
   * Credit a user's balance with audit trail
   */
  async creditUser(userId, amount, transaction, metadata = {}) {
    const { User, Transaction: TransactionModel } = this.models;
    
    if (amount <= 0) {
      console.log(`⏭️ Skipping zero/negative payout for user ${userId}: $${amount}`);
      return { credited: false, amount: 0 };
    }
    
    // Get current balance
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    const previousBalance = parseFloat(user.balance || 0);
    const newBalance = previousBalance + amount;
    
    // Update balance
    await User.update(
      { balance: newBalance },
      { where: { id: userId }, transaction }
    );
    
    // Create audit record
    await TransactionModel.create({
      user_id: userId,
      type: 'contest_win',
      amount: amount,
      balance_before: previousBalance,
      balance_after: newBalance,
      description: metadata.description || 'Contest winnings',
      reference_type: 'contest',
      reference_id: metadata.contestId || null,
      metadata: JSON.stringify({
        ...metadata,
        timestamp: new Date().toISOString()
      }),
      created_at: new Date()
    }, { transaction });
    
    console.log(`💰 Credited $${amount.toFixed(2)} to user ${userId} (${user.username}). Balance: $${previousBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
    
    return {
      credited: true,
      userId,
      amount,
      previousBalance,
      newBalance
    };
  }

  /**
   * Process multiple payouts in a single transaction
   */
  async processBatchPayouts(payouts, contestId) {
    const transaction = await this.sequelize.transaction();
    
    try {
      const results = [];
      let totalPaid = 0;
      
      for (const payout of payouts) {
        if (payout.amount > 0) {
          const result = await this.creditUser(
            payout.userId,
            payout.amount,
            transaction,
            {
              contestId,
              entryId: payout.entryId,
              rank: payout.rank,
              description: `Contest winnings - Rank #${payout.rank}`
            }
          );
          results.push(result);
          totalPaid += payout.amount;
        }
      }
      
      await transaction.commit();
      
      console.log(`✅ Batch payout complete: ${results.length} users paid, $${totalPaid.toFixed(2)} total`);
      
      return {
        success: true,
        payoutsProcessed: results.length,
        totalPaid,
        results
      };
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Batch payout failed:', error);
      throw error;
    }
  }

  /**
   * Refund an entry fee
   */
  async refundEntry(userId, amount, entryId, reason = 'Contest cancelled') {
    const transaction = await this.sequelize.transaction();
    
    try {
      const result = await this.creditUser(
        userId,
        amount,
        transaction,
        {
          entryId,
          type: 'refund',
          description: `Refund: ${reason}`
        }
      );
      
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Get payout history for a user
   */
  async getUserPayoutHistory(userId, limit = 50) {
    const { Transaction: TransactionModel } = this.models;
    
    const transactions = await TransactionModel.findAll({
      where: {
        user_id: userId,
        type: { [require('sequelize').Op.in]: ['contest_winnings', 'refund'] }
      },
      order: [['created_at', 'DESC']],
      limit
    });
    
    return transactions.map(t => ({
      id: t.id,
      type: t.type,
      amount: parseFloat(t.amount),
      description: t.description,
      createdAt: t.created_at,
      metadata: t.metadata ? JSON.parse(t.metadata) : {}
    }));
  }

  /**
   * Get total payouts for a contest
   */
  async getContestPayoutSummary(contestId) {
    const { ContestEntry } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: { contest_id: contestId },
      attributes: ['id', 'user_id', 'final_rank', 'prize_won', 'total_points']
    });
    
    const totalPaid = entries.reduce((sum, e) => sum + parseFloat(e.prize_won || 0), 0);
    const winners = entries.filter(e => parseFloat(e.prize_won || 0) > 0);
    
    return {
      contestId,
      totalEntries: entries.length,
      totalPaid,
      winnersCount: winners.length,
      winners: winners.map(e => ({
        entryId: e.id,
        userId: e.user_id,
        rank: e.final_rank,
        prize: parseFloat(e.prize_won || 0),
        points: parseFloat(e.total_points || 0)
      })).sort((a, b) => a.rank - b.rank)
    };
  }
}

module.exports = PayoutService;