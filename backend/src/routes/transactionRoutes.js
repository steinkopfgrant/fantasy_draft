// backend/src/routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const { Op } = require('sequelize');

// Get user's transaction history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { limit = 50, offset = 0, type } = req.query;
    
    // Build where clause
    const where = { user_id: userId };
    if (type) {
      where.type = type;
    }
    
    // Get transactions
    const transactions = await db.Transaction.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [{
        model: db.Contest,
        attributes: ['id', 'name', 'type'],
        required: false
      }]
    });
    
    // Get total count for pagination
    const total = await db.Transaction.count({ where });
    
    // Format transactions
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      balanceAfter: parseFloat(tx.balance_after),
      description: tx.description,
      contestId: tx.contest_id,
      contestName: tx.Contest?.name,
      createdAt: tx.created_at
    }));
    
    res.json({
      transactions: formattedTransactions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + transactions.length < total
      }
    });
    
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
});

// Get transaction summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { period = '30d' } = req.query;
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }
    
    // Get transaction summary
    const summary = await db.Transaction.findAll({
      where: {
        user_id: userId,
        created_at: { [Op.gte]: startDate }
      },
      attributes: [
        'type',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total']
      ],
      group: ['type'],
      raw: true
    });
    
    // Get current balance
    const user = await db.User.findByPk(userId, {
      attributes: ['balance']
    });
    
    // Format summary
    const formattedSummary = {
      currentBalance: parseFloat(user.balance),
      period,
      byType: {}
    };
    
    summary.forEach(item => {
      formattedSummary.byType[item.type] = {
        count: parseInt(item.count),
        total: parseFloat(item.total) || 0
      };
    });
    
    // Calculate totals
    formattedSummary.totalDeposits = 
      (formattedSummary.byType.deposit?.total || 0) +
      (formattedSummary.byType.bonus?.total || 0) +
      (formattedSummary.byType.contest_refund?.total || 0);
    
    formattedSummary.totalWithdrawals = 
      Math.abs(formattedSummary.byType.withdrawal?.total || 0) +
      Math.abs(formattedSummary.byType.contest_entry?.total || 0);
    
    formattedSummary.netChange = 
      formattedSummary.totalDeposits - formattedSummary.totalWithdrawals;
    
    res.json(formattedSummary);
    
  } catch (error) {
    console.error('Get transaction summary error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction summary' });
  }
});

// Get single transaction details
router.get('/:transactionId', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    const transaction = await db.Transaction.findOne({
      where: {
        id: transactionId,
        user_id: userId
      },
      include: [{
        model: db.Contest,
        attributes: ['id', 'name', 'type', 'entry_fee', 'prize_pool'],
        required: false
      }]
    });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({
      id: transaction.id,
      type: transaction.type,
      amount: parseFloat(transaction.amount),
      balanceAfter: parseFloat(transaction.balance_after),
      description: transaction.description,
      contest: transaction.Contest ? {
        id: transaction.Contest.id,
        name: transaction.Contest.name,
        type: transaction.Contest.type,
        entryFee: parseFloat(transaction.Contest.entry_fee),
        prizePool: parseFloat(transaction.Contest.prize_pool)
      } : null,
      createdAt: transaction.created_at
    });
    
  } catch (error) {
    console.error('Get transaction details error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction details' });
  }
});

// Export transaction history as CSV
router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { startDate, endDate } = req.query;
    
    // Build where clause
    const where = { user_id: userId };
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = new Date(startDate);
      if (endDate) where.created_at[Op.lte] = new Date(endDate);
    }
    
    // Get all transactions for export
    const transactions = await db.Transaction.findAll({
      where,
      order: [['created_at', 'DESC']],
      include: [{
        model: db.Contest,
        attributes: ['name'],
        required: false
      }]
    });
    
    // Create CSV content
    const csvRows = [
      ['Date', 'Type', 'Description', 'Amount', 'Balance After', 'Contest'].join(',')
    ];
    
    transactions.forEach(tx => {
      const row = [
        tx.created_at.toISOString(),
        tx.type,
        `"${tx.description.replace(/"/g, '""')}"`,
        tx.amount,
        tx.balance_after,
        tx.Contest ? `"${tx.Contest.name.replace(/"/g, '""')}"` : ''
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${Date.now()}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Export transactions error:', error);
    res.status(500).json({ error: 'Failed to export transactions' });
  }
});

// Admin: Add manual transaction (for deposits, bonuses, etc.)
router.post('/manual', authMiddleware, async (req, res) => {
  try {
    const { targetUserId, type, amount, description } = req.body;
    const adminUserId = req.user.id || req.user.userId;
    
    // Check if user is admin (you might want to add proper admin middleware)
    const adminUser = await db.User.findByPk(adminUserId);
    if (!adminUser || !adminUser.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Validate input
    if (!targetUserId || !type || !amount || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const validTypes = ['deposit', 'withdrawal', 'bonus', 'adjustment'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    
    // Start transaction
    const transaction = await db.sequelize.transaction();
    
    try {
      // Get target user
      const targetUser = await db.User.findByPk(targetUserId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (!targetUser) {
        await transaction.rollback();
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Calculate new balance
      const currentBalance = parseFloat(targetUser.balance);
      const txAmount = parseFloat(amount);
      const newBalance = currentBalance + txAmount;
      
      if (newBalance < 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Update user balance
      await targetUser.update({ balance: newBalance }, { transaction });
      
      // Create transaction record
      const txRecord = await db.Transaction.create({
        user_id: targetUserId,
        type,
        amount: txAmount,
        balance_after: newBalance,
        description: `${description} (by admin: ${adminUser.username})`,
        created_by: adminUserId
      }, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        transaction: {
          id: txRecord.id,
          type: txRecord.type,
          amount: txAmount,
          balanceAfter: newBalance,
          description: txRecord.description,
          createdAt: txRecord.created_at
        },
        user: {
          id: targetUser.id,
          username: targetUser.username,
          newBalance
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('Manual transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

module.exports = router;