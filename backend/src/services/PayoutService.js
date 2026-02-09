// backend/src/services/PayoutService.js

class PayoutService {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
  }

  /**
   * Credit a user's balance with audit trail
   * 
   * CRITICAL FIX: Added idempotency check to prevent double payouts.
   * If a user has already been paid for a specific contest entry,
   * this will return early without crediting again.
   */
  async creditUser(userId, amount, transaction, metadata = {}) {
    const { User, Transaction: TransactionModel } = this.models;
    
    if (amount <= 0) {
      console.log(`⏭️ Skipping zero/negative payout for user ${userId}: $${amount}`);
      return { credited: false, amount: 0 };
    }
    
    // ================================================================
    // CRITICAL: IDEMPOTENCY CHECK
    // Prevent double payout for same user + contest combination
    // ================================================================
    if (metadata.contestId && metadata.entryId) {
      const existingPayout = await TransactionModel.findOne({
        where: {
          user_id: userId,
          type: 'contest_win',
          reference_type: 'contest',
          reference_id: metadata.contestId
        },
        transaction
      });
      
      if (existingPayout) {
        console.log(`⚠️ BLOCKED DUPLICATE PAYOUT: User ${userId} already received $${existingPayout.amount} for contest ${metadata.contestId}`);
        return { 
          credited: false, 
          duplicate: true,
          existingAmount: parseFloat(existingPayout.amount),
          existingTransactionId: existingPayout.id
        };
      }
    }
    // ================================================================
    
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
      duplicate: false,
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
      let duplicatesBlocked = 0;
      
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
          
          if (result.credited) {
            totalPaid += payout.amount;
          } else if (result.duplicate) {
            duplicatesBlocked++;
          }
        }
      }
      
      await transaction.commit();
      
      console.log(`✅ Batch payout complete: ${results.filter(r => r.credited).length} users paid, $${totalPaid.toFixed(2)} total`);
      
      if (duplicatesBlocked > 0) {
        console.log(`⚠️ Blocked ${duplicatesBlocked} duplicate payout attempts`);
      }
      
      return {
        success: true,
        payoutsProcessed: results.filter(r => r.credited).length,
        duplicatesBlocked,
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
    const { Transaction: TransactionModel } = this.models;
    
    const transaction = await this.sequelize.transaction();
    
    try {
      // Check for existing refund for this entry
      const existingRefund = await TransactionModel.findOne({
        where: {
          user_id: userId,
          type: 'entry_refund',
          reference_type: 'entry',
          reference_id: entryId
        },
        transaction
      });
      
      if (existingRefund) {
        await transaction.rollback();
        console.log(`⚠️ BLOCKED DUPLICATE REFUND: Entry ${entryId} already refunded`);
        return { 
          credited: false, 
          duplicate: true,
          existingAmount: parseFloat(existingRefund.amount)
        };
      }
      
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
        type: { [require('sequelize').Op.in]: ['contest_win', 'contest_winnings', 'entry_refund', 'refund'] }
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
      metadata: t.metadata ? (typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata) : {}
    }));
  }

  /**
   * Get total payouts for a contest
   */
  async getContestPayoutSummary(contestId) {
    const { ContestEntry, Transaction: TransactionModel } = this.models;
    
    const entries = await ContestEntry.findAll({
      where: { contest_id: contestId },
      attributes: ['id', 'user_id', 'final_rank', 'prize_won', 'total_points']
    });
    
    // Also verify against transaction records
    const payoutTransactions = await TransactionModel.findAll({
      where: {
        type: 'contest_win',
        reference_type: 'contest',
        reference_id: contestId
      }
    });
    
    const entryTotalPaid = entries.reduce((sum, e) => sum + parseFloat(e.prize_won || 0), 0);
    const txTotalPaid = payoutTransactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    
    // Warn if there's a discrepancy
    if (Math.abs(entryTotalPaid - txTotalPaid) > 0.01) {
      console.warn(`⚠️ PAYOUT DISCREPANCY for contest ${contestId}: Entries show $${entryTotalPaid.toFixed(2)}, Transactions show $${txTotalPaid.toFixed(2)}`);
    }
    
    const winners = entries.filter(e => parseFloat(e.prize_won || 0) > 0);
    
    return {
      contestId,
      totalEntries: entries.length,
      totalPaid: entryTotalPaid,
      totalPaidVerified: txTotalPaid,
      discrepancy: Math.abs(entryTotalPaid - txTotalPaid) > 0.01,
      winnersCount: winners.length,
      transactionCount: payoutTransactions.length,
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