// backend/src/routes/webhookRoutes.js
// Stripe webhook handler - WHERE BALANCE ACTUALLY GETS UPDATED
//
// ⚠️ CRITICAL: This route uses express.raw() NOT express.json()
// Mount this BEFORE your express.json() middleware!

const express = require('express');
const router = express.Router();
const db = require('../models');
const StripeService = require('../services/stripeService');

const stripeService = new StripeService(db);

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      console.error('❌ Webhook: Missing stripe-signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    let event;

    try {
      event = stripeService.constructWebhookEvent(req.body, signature);
    } catch (error) {
      console.error('❌ Webhook signature verification failed:', error.message);
      return res.status(400).json({ error: `Webhook Error: ${error.message}` });
    }

    console.log(`📨 Stripe webhook: ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        case 'payment_intent.processing':
          // ACH payments go through processing state
          console.log(`⏳ Payment processing: ${event.data.object.id}`);
          break;

        case 'charge.refunded':
          await handleRefund(event.data.object);
          break;

        case 'charge.dispute.created':
          await handleDispute(event.data.object);
          break;

        default:
          console.log(`ℹ️ Unhandled webhook event: ${event.type}`);
      }

      res.json({ received: true });

    } catch (error) {
      console.error(`❌ Webhook processing error (${event.type}):`, error);
      // Still return 200 to prevent retries - log for manual investigation
      res.json({ received: true, error: error.message });
    }
  }
);

// ============================================
// WEBHOOK HANDLERS
// ============================================

/**
 * Handle successful payment - CREDIT USER BALANCE HERE
 */
async function handlePaymentSucceeded(paymentIntent) {
  const transaction = await db.sequelize.transaction();

  try {
    const { id: paymentIntentId, amount, metadata } = paymentIntent;
    const userId = metadata?.user_id;

    if (!userId) {
      console.error('❌ PaymentIntent missing user_id:', paymentIntentId);
      await transaction.rollback();
      return;
    }

    // Check idempotency - already processed?
    const existing = await db.Transaction.findOne({
      where: {
        stripe_payment_intent_id: paymentIntentId,
        status: 'completed'
      },
      transaction
    });

    if (existing) {
      console.log(`ℹ️ Payment ${paymentIntentId} already processed`);
      await transaction.rollback();
      return;
    }

    // Find pending transaction
    const pendingTx = await db.Transaction.findOne({
      where: {
        stripe_payment_intent_id: paymentIntentId,
        status: 'pending'
      },
      transaction
    });

    if (!pendingTx) {
      console.error(`❌ No pending transaction for: ${paymentIntentId}`);
      await transaction.rollback();
      return;
    }

    // Get user with lock
    const user = await db.User.findByPk(userId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!user) {
      console.error(`❌ User not found: ${userId}`);
      await transaction.rollback();
      return;
    }

    // Calculate credit amount
    // For cards: credit NET amount (gross - user fee) which is stored in pendingTx.amount
    // For ACH: credit full amount
    const creditAmount = parseFloat(pendingTx.amount);
    const currentBalance = parseFloat(user.balance);
    const newBalance = currentBalance + creditAmount;

    // Update user
    await user.update({
      balance: newBalance,
      lifetime_deposits: parseFloat(user.lifetime_deposits || 0) + creditAmount
    }, { transaction });

    // Update transaction
    await pendingTx.update({
      status: 'completed',
      balance_after: newBalance,
      stripe_charge_id: paymentIntent.latest_charge,
      metadata: {
        ...pendingTx.metadata,
        completed_at: new Date().toISOString(),
        stripe_amount: amount
      }
    }, { transaction });

    await transaction.commit();

    const method = metadata.method || 'unknown';
    console.log(`✅ ${method.toUpperCase()} deposit complete: ${user.username} +$${creditAmount}, balance: $${newBalance}`);

    // TODO: Emit socket event to update frontend balance in real-time
    // const io = app.get('io');
    // io.to(`user_${userId}`).emit('balance_updated', { balance: newBalance });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ handlePaymentSucceeded error:', error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent) {
  try {
    const { id: paymentIntentId, last_payment_error, metadata } = paymentIntent;

    const pendingTx = await db.Transaction.findOne({
      where: {
        stripe_payment_intent_id: paymentIntentId,
        status: 'pending'
      }
    });

    if (pendingTx) {
      await pendingTx.update({
        status: 'failed',
        metadata: {
          ...pendingTx.metadata,
          error_code: last_payment_error?.code,
          error_message: last_payment_error?.message,
          decline_code: last_payment_error?.decline_code,
          failed_at: new Date().toISOString()
        }
      });
    }

    console.log(`❌ Payment failed: ${paymentIntentId} - ${last_payment_error?.message}`);

    // TODO: Notify user via email/push

  } catch (error) {
    console.error('❌ handlePaymentFailed error:', error);
    throw error;
  }
}

/**
 * Handle refund - debit user balance
 */
async function handleRefund(charge) {
  const transaction = await db.sequelize.transaction();

  try {
    const { payment_intent: paymentIntentId, amount_refunded } = charge;

    // Find original deposit
    const originalTx = await db.Transaction.findOne({
      where: {
        stripe_payment_intent_id: paymentIntentId,
        status: 'completed',
        type: 'deposit'
      },
      transaction
    });

    if (!originalTx) {
      console.log(`ℹ️ No completed deposit for refund: ${paymentIntentId}`);
      await transaction.rollback();
      return;
    }

    // Check if refund already processed
    const existingRefund = await db.Transaction.findOne({
      where: {
        stripe_payment_intent_id: paymentIntentId,
        type: 'refund'
      },
      transaction
    });

    if (existingRefund) {
      console.log(`ℹ️ Refund already processed: ${paymentIntentId}`);
      await transaction.rollback();
      return;
    }

    const refundAmount = amount_refunded / 100; // Convert cents to dollars

    // Get user and debit
    const user = await db.User.findByPk(originalTx.user_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    const newBalance = Math.max(0, parseFloat(user.balance) - refundAmount);

    await user.update({
      balance: newBalance,
      lifetime_deposits: Math.max(0, parseFloat(user.lifetime_deposits || 0) - refundAmount)
    }, { transaction });

    // Create refund record
    await db.Transaction.create({
      user_id: user.id,
      type: 'refund',
      amount: -refundAmount,
      balance_after: newBalance,
      status: 'completed',
      stripe_payment_intent_id: paymentIntentId,
      description: `Refund: $${refundAmount}`,
      metadata: {
        original_transaction_id: originalTx.id
      }
    }, { transaction });

    await transaction.commit();

    console.log(`💸 Refund processed: ${user.username} -$${refundAmount}, balance: $${newBalance}`);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ handleRefund error:', error);
    throw error;
  }
}

/**
 * Handle dispute/chargeback
 */
async function handleDispute(dispute) {
  try {
    const { payment_intent: paymentIntentId, amount, reason } = dispute;

    const originalTx = await db.Transaction.findOne({
      where: {
        stripe_payment_intent_id: paymentIntentId,
        status: 'completed'
      }
    });

    if (!originalTx) {
      console.log(`ℹ️ No transaction for dispute: ${paymentIntentId}`);
      return;
    }

    const disputeAmount = amount / 100;

    // Flag the user account
    const user = await db.User.findByPk(originalTx.user_id);

    // Hold funds
    const newBalance = Math.max(0, parseFloat(user.balance) - disputeAmount);

    await user.update({
      balance: newBalance,
      withdrawal_eligible: false // Suspend withdrawals during dispute
    });

    // Log the dispute
    await db.Transaction.create({
      user_id: user.id,
      type: 'dispute_hold',
      amount: -disputeAmount,
      balance_after: newBalance,
      status: 'pending',
      stripe_payment_intent_id: paymentIntentId,
      description: `Dispute hold: ${reason}`,
      metadata: {
        dispute_id: dispute.id,
        reason: reason
      }
    });

    console.log(`⚠️ DISPUTE: ${user.username}, $${disputeAmount}, reason: ${reason}`);

    // TODO: Send admin notification
    // TODO: Send user notification

  } catch (error) {
    console.error('❌ handleDispute error:', error);
    throw error;
  }
}

module.exports = router;