// backend/src/services/TransactionService.js
/**
 * TransactionService - THE ONLY AUTHORIZED WAY TO MODIFY USER BALANCES
 * 
 * RULES:
 * 1. NEVER update user.balance directly anywhere in the codebase
 * 2. ALL balance changes MUST go through this service
 * 3. Every balance change creates a transaction record
 * 4. Use idempotency keys for operations that might retry (webhooks, etc)
 * 
 * This ensures:
 * - Complete audit trail of all money movement
 * - Atomic balance updates (no race conditions)
 * - Reconciliation capability (sum of transactions = current balance)
 */

const { v4: uuidv4 } = require('uuid');

class TransactionService {
  constructor(models, sequelize) {
    this.models = models;
    this.sequelize = sequelize;
  }

  /**
   * Core method - records a transaction and updates user balance atomically
   * 
   * @param {string} userId - User ID
   * @param {number} amount - Positive for credit, negative for debit
   * @param {string} type - Transaction type enum value
   * @param {Object} options - Additional options
   * @param {string} options.referenceType - Type of related entity (contest, stripe, etc)
   * @param {string} options.referenceId - ID of related entity
   * @param {string} options.description - Human-readable description
   * @param {string} options.adminUserId - Admin who initiated (for promo/adjustments)
   * @param {Object} options.metadata - Additional JSON data
   * @param {string} options.idempotencyKey - Unique key to prevent duplicates
   * @param {Object} options.transaction - Existing Sequelize transaction to use
   * @returns {Object} { transaction, newBalance, previousBalance }
   */
  async recordTransaction(userId, amount, type, options = {}) {
    const {
      referenceType = null,
      referenceId = null,
      description = null,
      adminUserId = null,
      metadata = {},
      idempotencyKey = null,
      transaction: existingTransaction = null
    } = options;

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount === 0) {
      throw new Error('Transaction amount must be a non-zero number');
    }

    // Validate type
    const validTypes = [
      'deposit', 'withdrawal', 'entry_fee', 'entry_refund',
      'contest_winnings', 'promo_credit', 'adjustment'
    ];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid transaction type: ${type}`);
    }

    // Check idempotency if key provided
    if (idempotencyKey) {
      const existing = await this.models.Transaction.findOne({
        where: { idempotency_key: idempotencyKey }
      });
      if (existing) {
        console.log(`⚠️ Duplicate transaction blocked by idempotency key: ${idempotencyKey}`);
        return {
          transaction: existing,
          newBalance: parseFloat(existing.balance_after),
          previousBalance: parseFloat(existing.balance_before),
          duplicate: true
        };
      }
    }

    // Use existing transaction or create new one
    const shouldManageTransaction = !existingTransaction;
    const t = existingTransaction || await this.sequelize.transaction({
      isolationLevel: this.sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });

    try {
      // Get user with row lock
      const user = await this.models.User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const previousBalance = parseFloat(user.balance || 0);
      const newBalance = previousBalance + numericAmount;

      // Prevent negative balances for debits
      if (newBalance < 0) {
        throw new Error(
          `Insufficient balance. Current: $${previousBalance.toFixed(2)}, ` +
          `Attempted: $${Math.abs(numericAmount).toFixed(2)}`
        );
      }

      // Create transaction record
      const txRecord = await this.models.Transaction.create({
        id: uuidv4(),
        user_id: userId,
        type,
        amount: numericAmount,
        balance_before: previousBalance,
        balance_after: newBalance,
        reference_type: referenceType,
        reference_id: referenceId,
        description,
        admin_user_id: adminUserId,
        metadata,
        idempotency_key: idempotencyKey,
        created_at: new Date()
      }, { transaction: t });

      // Update user balance
      await user.update({ balance: newBalance }, { transaction: t });

      // Commit if we created the transaction
      if (shouldManageTransaction) {
        await t.commit();
      }

      console.log(
        `💰 Transaction recorded: ${type} | User: ${userId} | ` +
        `Amount: ${numericAmount >= 0 ? '+' : ''}$${numericAmount.toFixed(2)} | ` +
        `Balance: $${previousBalance.toFixed(2)} → $${newBalance.toFixed(2)}`
      );

      return {
        transaction: txRecord,
        newBalance,
        previousBalance,
        duplicate: false
      };

    } catch (error) {
      // Rollback if we created the transaction
      if (shouldManageTransaction) {
        await t.rollback();
      }
      console.error(`❌ Transaction failed: ${error.message}`);
      throw error;
    }
  }

  // ==================== CONVENIENCE METHODS ====================
  // These wrap recordTransaction with appropriate defaults

  /**
   * Deduct entry fee when user joins a contest
   */
  async deductEntryFee(userId, amount, contestId, contestName, options = {}) {
    if (amount <= 0) {
      throw new Error('Entry fee must be positive');
    }

    return this.recordTransaction(userId, -amount, 'entry_fee', {
      referenceType: 'contest',
      referenceId: contestId,
      description: `Entry fee for ${contestName}`,
      metadata: { contest_name: contestName },
      ...options
    });
  }

  /**
   * Refund entry fee when user withdraws from a contest
   */
  async refundEntryFee(userId, amount, contestId, contestName, options = {}) {
    if (amount <= 0) {
      throw new Error('Refund amount must be positive');
    }

    return this.recordTransaction(userId, amount, 'entry_refund', {
      referenceType: 'contest',
      referenceId: contestId,
      description: `Refund for ${contestName} withdrawal`,
      metadata: { contest_name: contestName },
      ...options
    });
  }

  /**
   * Credit contest winnings
   */
  async creditWinnings(userId, amount, contestId, rank, options = {}) {
    if (amount <= 0) {
      throw new Error('Winnings must be positive');
    }

    return this.recordTransaction(userId, amount, 'contest_winnings', {
      referenceType: 'contest',
      referenceId: contestId,
      description: `Contest winnings - Rank #${rank}`,
      metadata: { rank, ...options.metadata },
      ...options
    });
  }

  /**
   * Record a deposit (from Stripe or other payment)
   */
  async recordDeposit(userId, amount, stripePaymentId, options = {}) {
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    return this.recordTransaction(userId, amount, 'deposit', {
      referenceType: 'stripe_payment',
      referenceId: stripePaymentId,
      description: `Deposit via Stripe`,
      idempotencyKey: `deposit_${stripePaymentId}`, // Prevent double-processing webhooks
      metadata: { stripe_payment_id: stripePaymentId },
      ...options
    });
  }

  /**
   * Record a withdrawal
   */
  async recordWithdrawal(userId, amount, withdrawalId, options = {}) {
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    return this.recordTransaction(userId, -amount, 'withdrawal', {
      referenceType: 'withdrawal',
      referenceId: withdrawalId,
      description: `Withdrawal to bank`,
      idempotencyKey: `withdrawal_${withdrawalId}`,
      ...options
    });
  }

  /**
   * Add promotional credit (admin action)
   */
  async addPromoCredit(userId, amount, reason, adminUserId, options = {}) {
    if (amount <= 0) {
      throw new Error('Promo credit must be positive');
    }

    if (!adminUserId) {
      throw new Error('Admin user ID required for promo credits');
    }

    return this.recordTransaction(userId, amount, 'promo_credit', {
      referenceType: 'admin_action',
      referenceId: adminUserId,
      description: reason || 'Promotional credit',
      adminUserId,
      ...options
    });
  }

  /**
   * Manual balance adjustment (emergency use only)
   */
  async adjustBalance(userId, amount, reason, adminUserId, options = {}) {
    if (!adminUserId) {
      throw new Error('Admin user ID required for adjustments');
    }

    if (!reason || reason.length < 10) {
      throw new Error('Adjustment requires detailed reason (min 10 chars)');
    }

    return this.recordTransaction(userId, amount, 'adjustment', {
      referenceType: 'admin_action',
      referenceId: adminUserId,
      description: `ADJUSTMENT: ${reason}`,
      adminUserId,
      ...options
    });
  }

  // ==================== RECONCILIATION & AUDIT ====================

  /**
   * Get all transactions for a user
   */
  async getUserTransactions(userId, options = {}) {
    const { limit = 50, offset = 0, type = null, startDate = null, endDate = null } = options;

    const where = { user_id: userId };
    
    if (type) {
      where.type = type;
    }
    
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[this.sequelize.Op.gte] = startDate;
      if (endDate) where.created_at[this.sequelize.Op.lte] = endDate;
    }

    return this.models.Transaction.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
  }

  /**
   * Reconcile a user's balance against transaction history
   * Returns discrepancy if any
   */
  async reconcileUser(userId) {
    const user = await this.models.User.findByPk(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Sum all transactions
    const result = await this.models.Transaction.findOne({
      where: { user_id: userId },
      attributes: [
        [this.sequelize.fn('SUM', this.sequelize.col('amount')), 'total'],
        [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'count']
      ],
      raw: true
    });

    const transactionSum = parseFloat(result?.total || 0);
    const currentBalance = parseFloat(user.balance || 0);
    const discrepancy = currentBalance - transactionSum;

    // Get the last transaction to verify balance_after
    const lastTransaction = await this.models.Transaction.findOne({
      where: { user_id: userId },
      order: [['created_at', 'DESC']]
    });

    const lastRecordedBalance = lastTransaction 
      ? parseFloat(lastTransaction.balance_after) 
      : 0;

    return {
      userId,
      username: user.username,
      currentBalance,
      transactionSum,
      transactionCount: parseInt(result?.count || 0),
      lastRecordedBalance,
      discrepancy: Math.abs(discrepancy) < 0.01 ? 0 : discrepancy,
      isReconciled: Math.abs(discrepancy) < 0.01 && Math.abs(currentBalance - lastRecordedBalance) < 0.01,
      lastTransactionAt: lastTransaction?.created_at
    };
  }

  /**
   * Reconcile ALL users - find any balance discrepancies
   */
  async reconcileAllUsers() {
    const users = await this.models.User.findAll({
      attributes: ['id', 'username', 'balance']
    });

    const results = {
      total: users.length,
      reconciled: 0,
      discrepancies: []
    };

    for (const user of users) {
      const reconciliation = await this.reconcileUser(user.id);
      
      if (reconciliation.isReconciled) {
        results.reconciled++;
      } else {
        results.discrepancies.push(reconciliation);
      }
    }

    console.log(`\n📊 RECONCILIATION REPORT`);
    console.log(`   Total users: ${results.total}`);
    console.log(`   Reconciled: ${results.reconciled}`);
    console.log(`   Discrepancies: ${results.discrepancies.length}`);
    
    if (results.discrepancies.length > 0) {
      console.log(`\n⚠️ USERS WITH DISCREPANCIES:`);
      for (const d of results.discrepancies) {
        console.log(`   ${d.username}: Balance $${d.currentBalance.toFixed(2)}, ` +
          `Transactions sum $${d.transactionSum.toFixed(2)}, ` +
          `Diff: $${d.discrepancy.toFixed(2)}`);
      }
    }

    return results;
  }

  /**
   * Get transaction history for a contest (all entries/refunds/winnings)
   */
  async getContestTransactions(contestId) {
    return this.models.Transaction.findAll({
      where: {
        reference_type: 'contest',
        reference_id: contestId
      },
      include: [{
        model: this.models.User,
        attributes: ['id', 'username']
      }],
      order: [['created_at', 'ASC']]
    });
  }

  /**
   * Get summary statistics for a time period
   */
  async getTransactionStats(startDate, endDate) {
    const where = {
      created_at: {
        [this.sequelize.Op.gte]: startDate,
        [this.sequelize.Op.lte]: endDate
      }
    };

    const stats = await this.models.Transaction.findAll({
      where,
      attributes: [
        'type',
        [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'count'],
        [this.sequelize.fn('SUM', this.sequelize.col('amount')), 'total']
      ],
      group: ['type'],
      raw: true
    });

    return stats.map(s => ({
      type: s.type,
      count: parseInt(s.count),
      total: parseFloat(s.total || 0)
    }));
  }
}

// Export factory function
module.exports = TransactionService;

// Also export singleton creator for convenience
let instance = null;
module.exports.getInstance = (models, sequelize) => {
  if (!instance && models && sequelize) {
    instance = new TransactionService(models, sequelize);
  }
  return instance;
};