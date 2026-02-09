// backend/src/routes/paymentRoutes.js
// Unified payment routes for Card, ACH Bank, and Solana USDC/USDT deposits

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const StripeService = require('../services/stripeService');
const SolanaService = require('../services/solanaService');

// Initialize services
const stripeService = new StripeService(db);
const solanaService = new SolanaService(db);

// Rate limiting
const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Too many requests, please try again later' }
});

// All routes require auth
router.use(authMiddleware);

// ============================================
// DEPOSIT INFO / FEES
// ============================================

/**
 * GET /api/payments/deposit-options
 * Get available deposit methods and their fees
 */
router.get('/deposit-options', async (req, res) => {
  try {
    const userId = req.user.id;
    const stripeLimits = stripeService.getLimits();
    const solanaLimits = solanaService.getLimits();
    const todayDeposits = await stripeService.getTodayDeposits(userId);

    res.json({
      success: true,
      options: {
        solana: {
          enabled: solanaService.isConfigured(),
          name: 'Crypto (USDC/USDT)',
          description: 'Instant • Zero fees • Bonus tickets!',
          fee: 0,
          feeType: 'none',
          minDeposit: solanaLimits.MIN_DEPOSIT,
          maxDeposit: solanaLimits.MAX_DEPOSIT,
          bonusTiers: solanaService.getBonusTiers(),
          processingTime: 'Instant (under 1 minute)',
          tokens: ['USDC', 'USDT'],
          network: 'Solana',
          recommended: true
        },
        ach: {
          enabled: stripeService.isConfigured(),
          name: 'Bank Account (ACH)',
          description: 'Free • 3-5 business days',
          fee: 0,
          feeType: 'none',
          minDeposit: stripeLimits.MIN_DEPOSIT,
          maxDeposit: stripeLimits.MAX_DEPOSIT,
          dailyLimit: stripeLimits.MAX_DAILY_DEPOSIT,
          dailyRemaining: stripeLimits.MAX_DAILY_DEPOSIT - todayDeposits,
          processingTime: '3-5 business days'
        },
        card: {
          enabled: stripeService.isConfigured(),
          name: 'Credit/Debit Card',
          description: 'Instant • 1% fee',
          fee: 1,
          feeType: 'percent',
          minDeposit: stripeLimits.MIN_DEPOSIT,
          maxDeposit: stripeLimits.MAX_DEPOSIT,
          dailyLimit: stripeLimits.MAX_DAILY_DEPOSIT,
          dailyRemaining: stripeLimits.MAX_DAILY_DEPOSIT - todayDeposits,
          processingTime: 'Instant'
        }
      }
    });
  } catch (error) {
    console.error('❌ Failed to get deposit options:', error);
    res.status(500).json({ success: false, error: 'Failed to get deposit options' });
  }
});

/**
 * GET /api/payments/calculate-fee
 * Calculate fees for a specific amount and method
 */
router.get('/calculate-fee', (req, res) => {
  try {
    const { amount, method } = req.query;
    const numAmount = parseFloat(amount);

    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    let result;

    switch (method) {
      case 'solana':
        result = {
          grossAmount: numAmount,
          fee: 0,
          netAmount: numAmount,
          bonusTickets: solanaService.calculateBonusTickets(numAmount)
        };
        break;

      case 'ach':
        const achFee = stripeService.calculateACHFee(numAmount);
        result = {
          grossAmount: numAmount,
          fee: 0, // We absorb ACH fees
          netAmount: numAmount,
          platformCost: achFee.platformFee
        };
        break;

      case 'card':
        const cardFee = stripeService.calculateCardFee(numAmount);
        result = {
          grossAmount: numAmount,
          fee: cardFee.userFee,
          netAmount: cardFee.netAmount,
          feePercent: 1
        };
        break;

      default:
        return res.status(400).json({ success: false, error: 'Invalid method' });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Fee calculation error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate fee' });
  }
});

// ============================================
// SOLANA DEPOSITS
// ============================================

/**
 * GET /api/payments/solana/deposit-info
 * Get Solana wallet address and deposit instructions
 */
router.get('/solana/deposit-info', (req, res) => {
  try {
    if (!solanaService.isConfigured()) {
      return res.status(503).json({ 
        success: false, 
        error: 'Crypto deposits not available yet' 
      });
    }

    const user = req.user;
    const depositInfo = solanaService.getDepositInfo(user);

    res.json({
      success: true,
      ...depositInfo
    });
  } catch (error) {
    console.error('❌ Solana deposit info error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/payments/solana/verify
 * Verify a Solana transaction and credit the user
 */
router.post('/solana/verify', depositLimiter, async (req, res) => {
  try {
    const { signature } = req.body;
    const userId = req.user.id;

    if (!signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Transaction signature is required' 
      });
    }

    if (!solanaService.isConfigured()) {
      return res.status(503).json({ 
        success: false, 
        error: 'Crypto deposits not available' 
      });
    }

    const result = await solanaService.verifyTransaction(signature, userId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Deposit successful!',
        amount: result.amount,
        token: result.token,
        bonusTickets: result.bonusTickets,
        newBalance: result.newBalance
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Solana verification error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ============================================
// CARD DEPOSITS
// ============================================

/**
 * POST /api/payments/card/create-intent
 * Create a PaymentIntent for card deposit (1% fee to user)
 */
router.post('/card/create-intent', depositLimiter, async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || isNaN(amount) || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    if (!stripeService.isConfigured()) {
      await transaction.rollback();
      return res.status(503).json({ success: false, error: 'Card payments not available' });
    }

    const user = await db.User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const idempotencyKey = `card_${userId}_${Date.now()}_${uuidv4().slice(0, 8)}`;

    const result = await stripeService.createCardDepositIntent(
      user,
      parseFloat(amount),
      idempotencyKey
    );

    // Create pending transaction
    await db.Transaction.create({
      user_id: userId,
      type: 'deposit',
      amount: result.netAmount, // Credit the NET amount (after user fee)
      balance_after: parseFloat(user.balance),
      status: 'pending',
      stripe_payment_intent_id: result.paymentIntentId,
      idempotency_key: idempotencyKey,
      description: `Card deposit of $${amount} (fee: $${result.userFee.toFixed(2)})`,
      metadata: {
        method: 'card',
        gross_amount: result.grossAmount,
        user_fee: result.userFee,
        net_amount: result.netAmount
      }
    }, { transaction });

    await transaction.commit();

    console.log(`💳 Card deposit intent: User ${user.username}, $${amount} (net: $${result.netAmount.toFixed(2)})`);

    res.json({
      success: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      grossAmount: result.grossAmount,
      fee: result.userFee,
      netAmount: result.netAmount
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Card intent creation failed:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================
// ACH BANK DEPOSITS
// ============================================

/**
 * POST /api/payments/ach/create-intent
 * Create a PaymentIntent for ACH bank transfer (no fee to user)
 */
router.post('/ach/create-intent', depositLimiter, async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || isNaN(amount) || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    if (!stripeService.isConfigured()) {
      await transaction.rollback();
      return res.status(503).json({ success: false, error: 'Bank payments not available' });
    }

    const user = await db.User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const idempotencyKey = `ach_${userId}_${Date.now()}_${uuidv4().slice(0, 8)}`;

    const result = await stripeService.createACHDepositIntent(
      user,
      parseFloat(amount),
      idempotencyKey
    );

    // Create pending transaction
    await db.Transaction.create({
      user_id: userId,
      type: 'deposit',
      amount: result.amount,
      balance_after: parseFloat(user.balance),
      status: 'pending',
      stripe_payment_intent_id: result.paymentIntentId,
      idempotency_key: idempotencyKey,
      description: `ACH bank deposit of $${amount}`,
      metadata: {
        method: 'ach',
        amount: result.amount
      }
    }, { transaction });

    await transaction.commit();

    console.log(`🏦 ACH deposit intent: User ${user.username}, $${amount}`);

    res.json({
      success: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount: result.amount
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ ACH intent creation failed:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================
// PAYMENT METHODS (SAVED CARDS/BANKS)
// ============================================

/**
 * GET /api/payments/methods
 * List saved payment methods (cards and bank accounts)
 */
router.get('/methods', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);

    if (!user.stripe_customer_id || !stripeService.isConfigured()) {
      return res.json({ success: true, cards: [], bankAccounts: [] });
    }

    const [cards, bankAccounts] = await Promise.all([
      stripeService.listPaymentMethods(user.stripe_customer_id, 'card'),
      stripeService.listBankAccounts(user.stripe_customer_id)
    ]);

    res.json({
      success: true,
      cards: cards.map(c => ({
        id: c.id,
        brand: c.card.brand,
        last4: c.card.last4,
        expMonth: c.card.exp_month,
        expYear: c.card.exp_year
      })),
      bankAccounts: bankAccounts.map(b => ({
        id: b.id,
        bankName: b.us_bank_account.bank_name,
        last4: b.us_bank_account.last4,
        accountType: b.us_bank_account.account_type
      }))
    });

  } catch (error) {
    console.error('❌ Failed to list payment methods:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve payment methods' });
  }
});

/**
 * DELETE /api/payments/methods/:id
 * Remove a saved payment method
 */
router.delete('/methods/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!stripeService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Service not available' });
    }

    await stripeService.detachPaymentMethod(id);

    res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    console.error('❌ Failed to remove payment method:', error);
    res.status(500).json({ success: false, error: 'Failed to remove payment method' });
  }
});

// ============================================
// BALANCE & TRANSACTIONS
// ============================================

/**
 * GET /api/payments/balance
 * Get user's current balance and tickets
 */
router.get('/balance', async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id, {
      attributes: ['balance', 'tickets', 'lifetime_deposits', 'lifetime_withdrawals']
    });

    res.json({
      success: true,
      balance: parseFloat(user.balance),
      tickets: user.tickets || 0,
      lifetimeDeposits: parseFloat(user.lifetime_deposits || 0),
      lifetimeWithdrawals: parseFloat(user.lifetime_withdrawals || 0)
    });
  } catch (error) {
    console.error('❌ Failed to get balance:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve balance' });
  }
});

/**
 * GET /api/payments/transactions
 * Get user's transaction history
 */
router.get('/transactions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0, type } = req.query;

    const whereClause = { user_id: userId };
    if (type) whereClause.type = type;

    const { count, rows: transactions } = await db.Transaction.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        status: t.status,
        description: t.description,
        method: t.metadata?.method,
        createdAt: t.created_at
      })),
      total: count,
      hasMore: offset + transactions.length < count
    });
  } catch (error) {
    console.error('❌ Failed to get transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve transactions' });
  }
});

// ============================================
// WITHDRAWAL ROUTES
// ============================================

/**
 * POST /api/payments/withdraw/request
 * Request a withdrawal
 */
router.post('/withdraw/request', async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { amount, method } = req.body;
    const userId = req.user.id;
    const limits = stripeService.getLimits();

    const numAmount = parseFloat(amount);

    // Validations
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    if (numAmount < limits.MIN_WITHDRAWAL) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        error: `Minimum withdrawal is $${limits.MIN_WITHDRAWAL}` 
      });
    }

    if (numAmount > limits.MAX_WITHDRAWAL) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        error: `Maximum withdrawal is $${limits.MAX_WITHDRAWAL}` 
      });
    }

    const user = await db.User.findByPk(userId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (numAmount > parseFloat(user.balance)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    // Check for pending withdrawal
    const pending = await db.WithdrawalRequest?.findOne({
      where: {
        user_id: userId,
        status: ['pending', 'approved', 'processing']
      },
      transaction
    });

    if (pending) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        error: 'You have a pending withdrawal request' 
      });
    }

    // Create withdrawal request
    const withdrawal = await db.WithdrawalRequest.create({
      user_id: userId,
      amount: numAmount,
      status: 'pending',
      payout_method: method || 'bank_transfer'
    }, { transaction });

    // Deduct from balance
    const newBalance = parseFloat(user.balance) - numAmount;
    await user.update({ balance: newBalance }, { transaction });

    // Create transaction record
    await db.Transaction.create({
      user_id: userId,
      type: 'withdrawal',
      amount: -numAmount,
      balance_after: newBalance,
      status: 'pending',
      description: `Withdrawal request of $${numAmount}`,
      metadata: { withdrawal_request_id: withdrawal.id, method: method || 'bank_transfer' }
    }, { transaction });

    await transaction.commit();

    console.log(`💸 Withdrawal request: User ${user.username}, $${numAmount}`);

    res.json({
      success: true,
      withdrawalId: withdrawal.id,
      amount: numAmount,
      status: 'pending',
      message: 'Withdrawal request submitted. Processing time: 1-3 business days.'
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Withdrawal request failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/payments/withdraw/status
 * Get withdrawal request status
 */
router.get('/withdraw/status', async (req, res) => {
  try {
    const withdrawals = await db.WithdrawalRequest.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      withdrawals: withdrawals.map(w => ({
        id: w.id,
        amount: w.amount,
        status: w.status,
        method: w.payout_method,
        createdAt: w.created_at,
        completedAt: w.completed_at,
        rejectionReason: w.rejection_reason
      }))
    });
  } catch (error) {
    console.error('❌ Failed to get withdrawal status:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve status' });
  }
});

/**
 * DELETE /api/payments/withdraw/:id
 * Cancel a pending withdrawal
 */
router.delete('/withdraw/:id', async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { id } = req.params;
    const userId = req.user.id;

    const withdrawal = await db.WithdrawalRequest.findOne({
      where: { id, user_id: userId, status: 'pending' },
      transaction
    });

    if (!withdrawal) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'Pending withdrawal not found' });
    }

    // Restore balance
    const user = await db.User.findByPk(userId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    const previousBalance = parseFloat(user.balance);
    const newBalance = previousBalance + parseFloat(withdrawal.amount);
    await user.update({ balance: newBalance }, { transaction });

    // Create refund transaction record
    await db.Transaction.create({
      user_id: userId,
      type: 'withdrawal_cancelled',
      amount: parseFloat(withdrawal.amount),
      balance_before: previousBalance,
      balance_after: newBalance,
      status: 'completed',
      description: `Withdrawal cancelled - funds restored`,
      reference_type: 'withdrawal',
      reference_id: withdrawal.id,
      metadata: { original_withdrawal_id: withdrawal.id }
    }, { transaction });

    // Update status
    await withdrawal.update({ status: 'cancelled' }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Withdrawal cancelled',
      newBalance
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Failed to cancel withdrawal:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel withdrawal' });
  }
});

module.exports = router;