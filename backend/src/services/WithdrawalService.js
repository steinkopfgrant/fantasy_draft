// backend/src/services/withdrawalService.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, Transaction, WithdrawalRequest } = require('../models');
const { Op } = require('sequelize');

class WithdrawalService {
  constructor() {
    this.SMALL_WITHDRAWAL_LIMIT = 50;    // Minimum withdrawal
    this.TAX_THRESHOLD = 600;             // IRS 1099 threshold
    this.DAILY_LIMIT = 10000;             // Daily withdrawal limit
    this.PROCESSING_FEE = 0;              // No fee for now
  }

  /**
   * Get user's withdrawal eligibility and limits
   */
  async getWithdrawalInfo(userId) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const balance = parseFloat(user.balance);
    
    // Get today's withdrawals
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayWithdrawals = await WithdrawalRequest.sum('amount', {
      where: {
        user_id: userId,
        status: { [Op.in]: ['pending', 'approved', 'processing', 'completed'] },
        created_at: { [Op.gte]: todayStart }
      }
    }) || 0;

    // Get YTD payouts for 1099 tracking
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdPayouts = await WithdrawalRequest.sum('amount', {
      where: {
        user_id: userId,
        status: 'completed',
        created_at: { [Op.gte]: yearStart }
      }
    }) || 0;

    // Check if user has W-9 on file
    const hasW9 = user.w9_submitted || false;
    const needsW9 = ytdPayouts >= this.TAX_THRESHOLD || balance >= this.TAX_THRESHOLD;

    // Get pending withdrawals
    const pendingWithdrawals = await WithdrawalRequest.findAll({
      where: {
        user_id: userId,
        status: { [Op.in]: ['pending', 'approved', 'processing'] }
      },
      order: [['created_at', 'DESC']]
    });

    const pendingAmount = pendingWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount), 0);

    return {
      balance,
      availableBalance: Math.max(0, balance - pendingAmount),
      minWithdrawal: this.SMALL_WITHDRAWAL_LIMIT,
      maxWithdrawal: Math.min(balance - pendingAmount, this.DAILY_LIMIT - todayWithdrawals),
      dailyLimit: this.DAILY_LIMIT,
      dailyUsed: todayWithdrawals,
      ytdPayouts,
      taxThreshold: this.TAX_THRESHOLD,
      needsW9,
      hasW9,
      pendingWithdrawals,
      pendingAmount
    };
  }

  /**
   * Request a withdrawal
   */
  async requestWithdrawal(userId, amount, method, payoutDetails) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    amount = parseFloat(amount);
    const balance = parseFloat(user.balance);

    // Validation
    if (amount < this.SMALL_WITHDRAWAL_LIMIT) {
      throw new Error(`Minimum withdrawal is $${this.SMALL_WITHDRAWAL_LIMIT}`);
    }

    if (amount > balance) {
      throw new Error('Insufficient balance');
    }

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayWithdrawals = await WithdrawalRequest.sum('amount', {
      where: {
        user_id: userId,
        status: { [Op.in]: ['pending', 'approved', 'processing', 'completed'] },
        created_at: { [Op.gte]: todayStart }
      }
    }) || 0;

    if (todayWithdrawals + amount > this.DAILY_LIMIT) {
      throw new Error(`Daily withdrawal limit is $${this.DAILY_LIMIT}`);
    }

    // Check W-9 requirement for large withdrawals
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdPayouts = await WithdrawalRequest.sum('amount', {
      where: {
        user_id: userId,
        status: 'completed',
        created_at: { [Op.gte]: yearStart }
      }
    }) || 0;

    if ((ytdPayouts + amount >= this.TAX_THRESHOLD) && !user.w9_submitted) {
      throw new Error('W-9 required for withdrawals totaling $600+ per year');
    }

    // Validate payout method
    const validMethods = ['bank_ach', 'paypal', 'venmo'];
    if (!validMethods.includes(method)) {
      throw new Error('Invalid payout method');
    }

    // For bank ACH, require bank info
    if (method === 'bank_ach' && !payoutDetails?.bankAccountId && !payoutDetails?.bankLast4) {
      throw new Error('Bank account required for ACH withdrawal');
    }

    // Create withdrawal request
    const withdrawal = await WithdrawalRequest.create({
      user_id: userId,
      amount,
      status: 'pending',
      payout_method: method,
      metadata: {
        payoutDetails,
        requestedAt: new Date().toISOString(),
        ipAddress: payoutDetails?.ipAddress,
        userAgent: payoutDetails?.userAgent
      }
    });

    // Deduct from user balance immediately (hold)
    const newBalance = balance - amount;
    await user.update({ balance: newBalance });

    // Create transaction record
    await Transaction.create({
      user_id: userId,
      type: 'withdrawal_pending',
      amount: -amount,
      balance_before: balance,
      balance_after: newBalance,
      status: 'pending',
      reference_type: 'withdrawal_request',
      reference_id: withdrawal.id,
      description: `Withdrawal request - ${method}`,
      metadata: { withdrawal_id: withdrawal.id }
    });

    console.log(`💸 Withdrawal requested: ${user.username} - $${amount} via ${method}`);

    return withdrawal;
  }

  /**
   * Admin: Get all pending withdrawals
   */
  async getPendingWithdrawals() {
    return WithdrawalRequest.findAll({
      where: {
        status: { [Op.in]: ['pending', 'approved', 'processing'] }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email', 'balance', 'w9_submitted']
      }],
      order: [['created_at', 'ASC']]
    });
  }

  /**
   * Admin: Approve withdrawal
   */
  async approveWithdrawal(withdrawalId, adminUserId) {
    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }

    if (withdrawal.status !== 'pending') {
      throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
    }

    await withdrawal.update({
      status: 'approved',
      reviewed_by: adminUserId,
      reviewed_at: new Date()
    });

    console.log(`✅ Withdrawal ${withdrawalId} approved by admin ${adminUserId}`);

    return withdrawal;
  }

  /**
   * Admin: Process approved withdrawal (send money)
   */
  async processWithdrawal(withdrawalId, adminUserId) {
    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }

    if (withdrawal.status !== 'approved') {
      throw new Error(`Cannot process withdrawal with status: ${withdrawal.status}`);
    }

    await withdrawal.update({ status: 'processing' });

    try {
      let result;

      switch (withdrawal.payout_method) {
        case 'bank_ach':
          result = await this.processStripeACH(withdrawal);
          break;
        case 'paypal':
        case 'venmo':
          // Manual process for now - admin sends via PayPal
          result = { manual: true, instructions: 'Send via PayPal/Venmo manually' };
          break;
        default:
          throw new Error('Unknown payout method');
      }

      // Mark as completed
      await withdrawal.update({
        status: 'completed',
        completed_at: new Date(),
        metadata: {
          ...withdrawal.metadata,
          payoutResult: result
        }
      });

      // Update transaction status
      await Transaction.update(
        { status: 'completed', type: 'withdrawal' },
        { 
          where: { 
            reference_type: 'withdrawal_request',
            reference_id: withdrawalId 
          }
        }
      );

      // Update user lifetime withdrawals
      await withdrawal.user.increment('lifetime_withdrawals', { 
        by: parseFloat(withdrawal.amount) 
      });

      console.log(`💸 Withdrawal ${withdrawalId} completed: $${withdrawal.amount}`);

      return withdrawal;

    } catch (error) {
      // Rollback on failure
      await withdrawal.update({
        status: 'failed',
        admin_notes: error.message
      });

      // Refund balance
      const user = await User.findByPk(withdrawal.user_id);
      await user.increment('balance', { by: parseFloat(withdrawal.amount) });

      // Update transaction
      await Transaction.update(
        { status: 'failed' },
        { 
          where: { 
            reference_type: 'withdrawal_request',
            reference_id: withdrawalId 
          }
        }
      );

      // Create refund transaction
      await Transaction.create({
        user_id: withdrawal.user_id,
        type: 'withdrawal_refund',
        amount: parseFloat(withdrawal.amount),
        balance_before: parseFloat(user.balance),
        balance_after: parseFloat(user.balance) + parseFloat(withdrawal.amount),
        status: 'completed',
        reference_type: 'withdrawal_request',
        reference_id: withdrawalId,
        description: `Withdrawal failed - funds returned`
      });

      throw error;
    }
  }

  /**
   * Process Stripe ACH payout
   */
  async processStripeACH(withdrawal) {
    // For Stripe payouts, you need Stripe Connect or use Transfers
    // This is a simplified version - in production you'd use Stripe Connect
    
    const payoutDetails = withdrawal.metadata?.payoutDetails;
    
    if (!payoutDetails?.stripeConnectedAccountId) {
      // Manual ACH - just mark for manual processing
      return {
        manual: true,
        method: 'bank_ach',
        amount: withdrawal.amount,
        instructions: 'Process via bank dashboard'
      };
    }

    // If user has Stripe Connect account, transfer to them
    const transfer = await stripe.transfers.create({
      amount: Math.round(withdrawal.amount * 100), // cents
      currency: 'usd',
      destination: payoutDetails.stripeConnectedAccountId,
      metadata: {
        withdrawal_id: withdrawal.id,
        user_id: withdrawal.user_id
      }
    });

    return {
      stripe_transfer_id: transfer.id,
      amount: withdrawal.amount,
      status: transfer.status
    };
  }

  /**
   * Admin: Reject withdrawal
   */
  async rejectWithdrawal(withdrawalId, adminUserId, reason) {
    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }

    if (!['pending', 'approved'].includes(withdrawal.status)) {
      throw new Error(`Cannot reject withdrawal with status: ${withdrawal.status}`);
    }

    // Refund the balance
    const user = withdrawal.user;
    const currentBalance = parseFloat(user.balance);
    const refundAmount = parseFloat(withdrawal.amount);

    await user.update({ balance: currentBalance + refundAmount });

    // Update withdrawal
    await withdrawal.update({
      status: 'rejected',
      reviewed_by: adminUserId,
      reviewed_at: new Date(),
      rejection_reason: reason
    });

    // Update transaction
    await Transaction.update(
      { status: 'cancelled', type: 'withdrawal_cancelled' },
      { 
        where: { 
          reference_type: 'withdrawal_request',
          reference_id: withdrawalId 
        }
      }
    );

    // Create refund transaction
    await Transaction.create({
      user_id: user.id,
      type: 'withdrawal_refund',
      amount: refundAmount,
      balance_before: currentBalance,
      balance_after: currentBalance + refundAmount,
      status: 'completed',
      reference_type: 'withdrawal_request',
      reference_id: withdrawalId,
      description: `Withdrawal rejected: ${reason}`,
      admin_user_id: adminUserId
    });

    console.log(`❌ Withdrawal ${withdrawalId} rejected: ${reason}`);

    return withdrawal;
  }

  /**
   * User: Cancel pending withdrawal
   */
  async cancelWithdrawal(withdrawalId, userId) {
    const withdrawal = await WithdrawalRequest.findOne({
      where: { id: withdrawalId, user_id: userId }
    });

    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }

    if (withdrawal.status !== 'pending') {
      throw new Error('Can only cancel pending withdrawals');
    }

    // Refund the balance
    const user = await User.findByPk(userId);
    const currentBalance = parseFloat(user.balance);
    const refundAmount = parseFloat(withdrawal.amount);

    await user.update({ balance: currentBalance + refundAmount });

    // Update withdrawal
    await withdrawal.update({ status: 'cancelled' });

    // Update transaction
    await Transaction.update(
      { status: 'cancelled', type: 'withdrawal_cancelled' },
      { 
        where: { 
          reference_type: 'withdrawal_request',
          reference_id: withdrawalId 
        }
      }
    );

    // Create refund transaction
    await Transaction.create({
      user_id: userId,
      type: 'withdrawal_refund',
      amount: refundAmount,
      balance_before: currentBalance,
      balance_after: currentBalance + refundAmount,
      status: 'completed',
      reference_type: 'withdrawal_request',
      reference_id: withdrawalId,
      description: 'Withdrawal cancelled by user'
    });

    console.log(`🚫 Withdrawal ${withdrawalId} cancelled by user`);

    return withdrawal;
  }

  /**
   * Get user's withdrawal history
   */
  async getWithdrawalHistory(userId, limit = 20) {
    return WithdrawalRequest.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Submit W-9 info
   */
  async submitW9(userId, w9Data) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // In production, you'd store this securely and verify
    // For now, just flag that W-9 was submitted
    await user.update({
      w9_submitted: true,
      w9_submitted_at: new Date(),
      // Don't store SSN in plain text - use encryption or a secure vault
      legal_name: w9Data.legalName,
      tax_address: w9Data.address
    });

    console.log(`📋 W-9 submitted for user ${user.username}`);

    return { success: true };
  }
}

module.exports = new WithdrawalService();