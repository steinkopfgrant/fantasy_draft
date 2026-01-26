// backend/src/routes/withdrawalRoutes.js
const express = require('express');
const router = express.Router();
const withdrawalService = require('../services/withdrawalService');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// All routes require authentication
router.use(authMiddleware);

// ============================================
// USER ROUTES
// ============================================

/**
 * GET /api/withdrawals/info
 * Get withdrawal eligibility and limits
 */
router.get('/info', async (req, res) => {
  try {
    const info = await withdrawalService.getWithdrawalInfo(req.user.id);
    res.json(info);
  } catch (error) {
    console.error('❌ Error getting withdrawal info:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/request
 * Request a withdrawal
 */
router.post('/request', async (req, res) => {
  try {
    const { amount, method, payoutDetails } = req.body;

    if (!amount || !method) {
      return res.status(400).json({ error: 'Amount and method required' });
    }

    const withdrawal = await withdrawalService.requestWithdrawal(
      req.user.id,
      amount,
      method,
      {
        ...payoutDetails,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        method: withdrawal.payout_method,
        createdAt: withdrawal.created_at
      }
    });
  } catch (error) {
    console.error('❌ Withdrawal request error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/withdrawals/history
 * Get user's withdrawal history
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const withdrawals = await withdrawalService.getWithdrawalHistory(req.user.id, limit);
    res.json({ withdrawals });
  } catch (error) {
    console.error('❌ Error getting withdrawal history:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/:id/cancel
 * Cancel a pending withdrawal
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const withdrawal = await withdrawalService.cancelWithdrawal(req.params.id, req.user.id);
    res.json({
      success: true,
      message: 'Withdrawal cancelled',
      withdrawal
    });
  } catch (error) {
    console.error('❌ Cancel withdrawal error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/w9
 * Submit W-9 tax information
 */
router.post('/w9', async (req, res) => {
  try {
    const { legalName, address, ssn } = req.body;

    if (!legalName || !address) {
      return res.status(400).json({ error: 'Legal name and address required' });
    }

    // Note: SSN should be handled very carefully - ideally use a secure form
    // that goes directly to a tax service provider
    const result = await withdrawalService.submitW9(req.user.id, {
      legalName,
      address,
      // Don't pass SSN to our backend - use a secure third-party
    });

    res.json(result);
  } catch (error) {
    console.error('❌ W-9 submission error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /api/withdrawals/admin/pending
 * Get all pending withdrawals (admin)
 */
router.get('/admin/pending', adminMiddleware, async (req, res) => {
  try {
    const withdrawals = await withdrawalService.getPendingWithdrawals();
    res.json({ withdrawals });
  } catch (error) {
    console.error('❌ Error getting pending withdrawals:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/admin/:id/approve
 * Approve a withdrawal (admin)
 */
router.post('/admin/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const withdrawal = await withdrawalService.approveWithdrawal(
      req.params.id,
      req.user.id
    );
    res.json({
      success: true,
      message: 'Withdrawal approved',
      withdrawal
    });
  } catch (error) {
    console.error('❌ Approve withdrawal error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/admin/:id/process
 * Process an approved withdrawal (admin)
 */
router.post('/admin/:id/process', adminMiddleware, async (req, res) => {
  try {
    const withdrawal = await withdrawalService.processWithdrawal(
      req.params.id,
      req.user.id
    );
    res.json({
      success: true,
      message: 'Withdrawal processed',
      withdrawal
    });
  } catch (error) {
    console.error('❌ Process withdrawal error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/admin/:id/reject
 * Reject a withdrawal (admin)
 */
router.post('/admin/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason required' });
    }

    const withdrawal = await withdrawalService.rejectWithdrawal(
      req.params.id,
      req.user.id,
      reason
    );
    res.json({
      success: true,
      message: 'Withdrawal rejected',
      withdrawal
    });
  } catch (error) {
    console.error('❌ Reject withdrawal error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/withdrawals/admin/:id/mark-complete
 * Manually mark withdrawal as complete (for PayPal/Venmo)
 */
router.post('/admin/:id/mark-complete', adminMiddleware, async (req, res) => {
  try {
    const { transactionId, notes } = req.body;
    
    const withdrawal = await WithdrawalRequest.findByPk(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'approved' && withdrawal.status !== 'processing') {
      return res.status(400).json({ error: 'Withdrawal must be approved first' });
    }

    await withdrawal.update({
      status: 'completed',
      completed_at: new Date(),
      admin_notes: notes,
      metadata: {
        ...withdrawal.metadata,
        manual_transaction_id: transactionId,
        completed_by: req.user.id
      }
    });

    // Update transaction status
    const { Transaction } = require('../models');
    await Transaction.update(
      { status: 'completed', type: 'withdrawal' },
      { 
        where: { 
          reference_type: 'withdrawal_request',
          reference_id: withdrawal.id 
        }
      }
    );

    res.json({
      success: true,
      message: 'Withdrawal marked as complete',
      withdrawal
    });
  } catch (error) {
    console.error('❌ Mark complete error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;