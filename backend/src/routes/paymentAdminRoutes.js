// backend/src/routes/admin/paymentAdminRoutes.js
// Admin routes for managing withdrawals and transactions

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const { adminMiddleware } = require('../../middleware/admin');
const db = require('../../models');
const StripeService = require('../../services/stripeService');

// Initialize Stripe service
const stripeService = new StripeService(db);

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// ============================================
// WITHDRAWAL MANAGEMENT
// ============================================

/**
 * GET /api/admin/payments/withdrawals
 * List all withdrawal requests with optional filters
 */
router.get('/withdrawals', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const { count, rows: withdrawals } = await db.WithdrawalRequest.findAndCountAll({
      where: whereClause,
      include: [{
        model: db.User,
        as: 'user',
        attributes: ['id', 'username', 'email', 'balance', 'lifetime_deposits', 'lifetime_withdrawals']
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Get pending count for dashboard
    const pendingCount = await db.WithdrawalRequest.count({
      where: { status: 'pending' }
    });

    res.json({
      success: true,
      withdrawals: withdrawals.map(w => ({
        id: w.id,
        userId: w.user_id,
        username: w.user?.username,
        email: w.user?.email,
        userBalance: w.user?.balance,
        userLifetimeDeposits: w.user?.lifetime_deposits,
        userLifetimeWithdrawals: w.user?.lifetime_withdrawals,
        amount: w.amount,
        status: w.status,
        method: w.payout_method,
        adminNotes: w.admin_notes,
        rejectionReason: w.rejection_reason,
        createdAt: w.created_at,
        reviewedAt: w.reviewed_at
      })),
      total: count,
      pendingCount,
      hasMore: offset + withdrawals.length < count
    });

  } catch (error) {
    console.error('❌ Failed to list withdrawals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve withdrawals'
    });
  }
});

/**
 * POST /api/admin/payments/withdrawals/:id/approve
 * Approve a withdrawal request
 */
router.post('/withdrawals/:id/approve', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;

    const withdrawal = await db.WithdrawalRequest.findByPk(id, {
      include: [{
        model: db.User,
        as: 'user'
      }],
      transaction
    });

    if (!withdrawal) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot approve withdrawal with status: ${withdrawal.status}`
      });
    }

    // Update withdrawal status
    await withdrawal.update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date(),
      admin_notes: notes || null
    }, { transaction });

    // Update user's lifetime withdrawals
    const user = withdrawal.user;
    await user.update({
      lifetime_withdrawals: parseFloat(user.lifetime_withdrawals || 0) + parseFloat(withdrawal.amount)
    }, { transaction });

    // Update transaction record
    await db.Transaction.update(
      { status: 'approved' },
      { 
        where: { 
          user_id: withdrawal.user_id,
          type: 'withdrawal',
          status: 'pending'
        },
        transaction 
      }
    );

    await transaction.commit();

    console.log(`✅ Withdrawal ${id} approved by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Withdrawal approved',
      withdrawal: {
        id: withdrawal.id,
        status: 'approved',
        amount: withdrawal.amount
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Failed to approve withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve withdrawal'
    });
  }
});

/**
 * POST /api/admin/payments/withdrawals/:id/reject
 * Reject a withdrawal request and restore user balance
 */
router.post('/withdrawals/:id/reject', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    const withdrawal = await db.WithdrawalRequest.findByPk(id, {
      include: [{
        model: db.User,
        as: 'user'
      }],
      transaction
    });

    if (!withdrawal) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found'
      });
    }

    if (!['pending', 'approved'].includes(withdrawal.status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot reject withdrawal with status: ${withdrawal.status}`
      });
    }

    // Restore user balance
    const user = withdrawal.user;
    const newBalance = parseFloat(user.balance) + parseFloat(withdrawal.amount);
    await user.update({ balance: newBalance }, { transaction });

    // Update withdrawal status
    await withdrawal.update({
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: new Date(),
      rejection_reason: reason,
      admin_notes: notes || null
    }, { transaction });

    // Update transaction record
    await db.Transaction.update(
      { 
        status: 'rejected',
        balance_after: newBalance
      },
      { 
        where: { 
          user_id: withdrawal.user_id,
          type: 'withdrawal',
          status: ['pending', 'approved']
        },
        transaction 
      }
    );

    await transaction.commit();

    console.log(`❌ Withdrawal ${id} rejected by admin ${req.user.username}: ${reason}`);

    res.json({
      success: true,
      message: 'Withdrawal rejected and balance restored',
      withdrawal: {
        id: withdrawal.id,
        status: 'rejected',
        amount: withdrawal.amount,
        newBalance
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Failed to reject withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject withdrawal'
    });
  }
});

/**
 * POST /api/admin/payments/withdrawals/:id/complete
 * Mark a withdrawal as completed (after manual payout)
 */
router.post('/withdrawals/:id/complete', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { notes, externalReference } = req.body;

    const withdrawal = await db.WithdrawalRequest.findByPk(id, { transaction });

    if (!withdrawal) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found'
      });
    }

    if (withdrawal.status !== 'approved') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot complete withdrawal with status: ${withdrawal.status}`
      });
    }

    // Update withdrawal status
    await withdrawal.update({
      status: 'completed',
      completed_at: new Date(),
      admin_notes: notes ? `${withdrawal.admin_notes || ''}\n${notes}` : withdrawal.admin_notes,
      metadata: {
        ...withdrawal.metadata,
        external_reference: externalReference
      }
    }, { transaction });

    // Update transaction record
    await db.Transaction.update(
      { status: 'completed' },
      { 
        where: { 
          user_id: withdrawal.user_id,
          type: 'withdrawal',
          status: 'approved'
        },
        transaction 
      }
    );

    await transaction.commit();

    console.log(`✅ Withdrawal ${id} marked as completed`);

    res.json({
      success: true,
      message: 'Withdrawal marked as completed',
      withdrawal: {
        id: withdrawal.id,
        status: 'completed'
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Failed to complete withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete withdrawal'
    });
  }
});

// ============================================
// TRANSACTION MANAGEMENT
// ============================================

/**
 * GET /api/admin/payments/transactions
 * List all transactions with filters
 */
router.get('/transactions', async (req, res) => {
  try {
    const { 
      type, 
      status, 
      userId, 
      startDate, 
      endDate,
      limit = 100, 
      offset = 0 
    } = req.query;

    const whereClause = {};
    
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (userId) whereClause.user_id = userId;
    
    if (startDate || endDate) {
      whereClause.created_at = {};
      if (startDate) whereClause.created_at[db.Sequelize.Op.gte] = new Date(startDate);
      if (endDate) whereClause.created_at[db.Sequelize.Op.lte] = new Date(endDate);
    }

    const { count, rows: transactions } = await db.Transaction.findAndCountAll({
      where: whereClause,
      include: [{
        model: db.User,
        as: 'User',
        attributes: ['id', 'username', 'email']
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate totals for the filtered period
    const totals = await db.Transaction.findAll({
      where: whereClause,
      attributes: [
        'type',
        [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'total'],
        [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']
      ],
      group: ['type']
    });

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        id: t.id,
        userId: t.user_id,
        username: t.User?.username,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        status: t.status,
        description: t.description,
        stripePaymentIntentId: t.stripe_payment_intent_id,
        createdAt: t.created_at
      })),
      totals: totals.reduce((acc, t) => {
        acc[t.type] = { total: t.get('total'), count: t.get('count') };
        return acc;
      }, {}),
      total: count,
      hasMore: offset + transactions.length < count
    });

  } catch (error) {
    console.error('❌ Failed to list transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transactions'
    });
  }
});

/**
 * POST /api/admin/payments/refund
 * Process a refund for a deposit
 */
router.post('/refund', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { transactionId, amount, reason } = req.body;

    // Find the original transaction
    const originalTransaction = await db.Transaction.findByPk(transactionId, {
      include: [{
        model: db.User,
        as: 'User'
      }],
      transaction
    });

    if (!originalTransaction) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    if (originalTransaction.type !== 'deposit' || originalTransaction.status !== 'completed') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Can only refund completed deposits'
      });
    }

    if (!originalTransaction.stripe_payment_intent_id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'No Stripe PaymentIntent ID found for this transaction'
      });
    }

    const refundAmount = amount || originalTransaction.amount;
    
    if (refundAmount > originalTransaction.amount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Refund amount cannot exceed original deposit'
      });
    }

    // Process refund through Stripe
    const refund = await stripeService.refundPaymentIntent(
      originalTransaction.stripe_payment_intent_id,
      refundAmount
    );

    // Debit user balance
    const user = originalTransaction.User;
    const currentBalance = parseFloat(user.balance);
    const newBalance = Math.max(0, currentBalance - parseFloat(refundAmount));
    
    await user.update({
      balance: newBalance,
      lifetime_deposits: Math.max(0, parseFloat(user.lifetime_deposits || 0) - parseFloat(refundAmount))
    }, { transaction });

    // Create refund transaction record
    await db.Transaction.create({
      user_id: user.id,
      type: 'refund',
      amount: -parseFloat(refundAmount),
      balance_after: newBalance,
      status: 'completed',
      stripe_payment_intent_id: originalTransaction.stripe_payment_intent_id,
      description: reason || `Refund of $${refundAmount}`,
      metadata: {
        original_transaction_id: transactionId,
        refund_id: refund.id,
        admin_id: req.user.id
      }
    }, { transaction });

    await transaction.commit();

    console.log(`💸 Refund processed: $${refundAmount} to user ${user.username}`);

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: {
        amount: refundAmount,
        newBalance,
        stripeRefundId: refund.id
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Failed to process refund:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process refund'
    });
  }
});

/**
 * POST /api/admin/payments/manual-adjustment
 * Manually adjust a user's balance (with audit trail)
 */
router.post('/manual-adjustment', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { userId, amount, reason } = req.body;

    if (!userId || !amount || !reason) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'userId, amount, and reason are required'
      });
    }

    const user = await db.User.findByPk(userId, { transaction });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const adjustmentAmount = parseFloat(amount);
    const currentBalance = parseFloat(user.balance);
    const newBalance = Math.max(0, currentBalance + adjustmentAmount);

    // Update user balance
    await user.update({ balance: newBalance }, { transaction });

    // Create transaction record
    await db.Transaction.create({
      user_id: userId,
      type: adjustmentAmount > 0 ? 'admin_bonus' : 'admin_deduction',
      amount: adjustmentAmount,
      balance_after: newBalance,
      status: 'completed',
      description: `Admin adjustment: ${reason}`,
      metadata: {
        admin_id: req.user.id,
        admin_username: req.user.username,
        reason: reason
      }
    }, { transaction });

    await transaction.commit();

    console.log(`📊 Manual adjustment: ${adjustmentAmount > 0 ? '+' : ''}$${adjustmentAmount} for user ${user.username} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Balance adjusted successfully',
      adjustment: {
        userId,
        username: user.username,
        previousBalance: currentBalance,
        adjustment: adjustmentAmount,
        newBalance
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Failed to adjust balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to adjust balance'
    });
  }
});

// ============================================
// DASHBOARD / STATS
// ============================================

/**
 * GET /api/admin/payments/stats
 * Get payment-related stats for admin dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Today's deposits
    const todayDeposits = await db.Transaction.sum('amount', {
      where: {
        type: 'deposit',
        status: 'completed',
        created_at: { [db.Sequelize.Op.gte]: today }
      }
    }) || 0;

    // This month's deposits
    const monthDeposits = await db.Transaction.sum('amount', {
      where: {
        type: 'deposit',
        status: 'completed',
        created_at: { [db.Sequelize.Op.gte]: thisMonth }
      }
    }) || 0;

    // Pending withdrawals
    const pendingWithdrawals = await db.WithdrawalRequest.findAll({
      where: { status: 'pending' },
      attributes: [
        [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count'],
        [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'total']
      ],
      raw: true
    });

    // Total user balances (liability)
    const totalUserBalances = await db.User.sum('balance') || 0;

    // Recent transaction counts
    const recentTransactions = await db.Transaction.count({
      where: {
        created_at: { [db.Sequelize.Op.gte]: today }
      }
    });

    res.json({
      success: true,
      stats: {
        deposits: {
          today: todayDeposits,
          thisMonth: monthDeposits
        },
        pendingWithdrawals: {
          count: parseInt(pendingWithdrawals[0]?.count) || 0,
          total: parseFloat(pendingWithdrawals[0]?.total) || 0
        },
        totalUserBalances,
        recentTransactionCount: recentTransactions
      }
    });

  } catch (error) {
    console.error('❌ Failed to get payment stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stats'
    });
  }
});

module.exports = router;