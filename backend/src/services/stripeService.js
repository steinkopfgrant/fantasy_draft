// backend/src/services/stripeService.js
// Stripe integration for ACH bank transfers and card payments

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not configured - payments will fail');
}

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      maxNetworkRetries: 2,
      timeout: 10000,
    })
  : null;

// Fee structure
const FEES = {
  CARD_PLATFORM_PERCENT: 2.0,  // We absorb 2%
  CARD_USER_PERCENT: 1.0,      // User pays 1%
  ACH_PERCENT: 0.8,            // We absorb 0.8%
  ACH_CAP: 5.00,               // Max $5 ACH fee
};

// Limits
const LIMITS = {
  MIN_DEPOSIT: 10,
  MAX_DEPOSIT: 1000,
  MAX_DAILY_DEPOSIT: 2500,
  MIN_WITHDRAWAL: 20,
  MAX_WITHDRAWAL: 10000,
};

class StripeService {
  constructor(db) {
    this.db = db;
    this.stripe = stripe;
    this.fees = FEES;
    this.limits = LIMITS;
  }

  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================

  async getOrCreateCustomer(user) {
    if (!this.stripe) throw new Error('Stripe not configured');

    if (user.stripe_customer_id) {
      try {
        const customer = await this.stripe.customers.retrieve(user.stripe_customer_id);
        if (!customer.deleted) {
          return customer;
        }
      } catch (error) {
        console.log('Stripe customer not found, creating new one');
      }
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.username,
      metadata: {
        user_id: user.id,
        username: user.username,
        platform: 'bidblitz'
      }
    });

    await user.update({ stripe_customer_id: customer.id });
    console.log(`✅ Created Stripe customer ${customer.id} for user ${user.username}`);
    return customer;
  }

  // ============================================
  // CARD PAYMENTS
  // ============================================

  /**
   * Create PaymentIntent for card deposit
   * User pays 1% fee, we absorb 2%
   */
  async createCardDepositIntent(user, amount, idempotencyKey = null) {
    if (!this.stripe) throw new Error('Stripe not configured');

    // Validate
    if (amount < this.limits.MIN_DEPOSIT) {
      throw new Error(`Minimum deposit is $${this.limits.MIN_DEPOSIT}`);
    }
    if (amount > this.limits.MAX_DEPOSIT) {
      throw new Error(`Maximum deposit is $${this.limits.MAX_DEPOSIT}`);
    }

    // Check daily limit
    const todayDeposits = await this.getTodayDeposits(user.id);
    if (todayDeposits + amount > this.limits.MAX_DAILY_DEPOSIT) {
      throw new Error(`Daily deposit limit of $${this.limits.MAX_DAILY_DEPOSIT} exceeded`);
    }

    // Calculate fee (user pays 1%)
    const userFee = amount * (this.fees.CARD_USER_PERCENT / 100);
    const netAmount = amount - userFee;

    const customer = await this.getOrCreateCustomer(user);
    const amountInCents = Math.round(amount * 100);

    const intentOptions = {
      amount: amountInCents,
      currency: 'usd',
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: {
        user_id: user.id,
        username: user.username,
        type: 'deposit',
        method: 'card',
        gross_amount: amount.toFixed(2),
        user_fee: userFee.toFixed(2),
        net_amount: netAmount.toFixed(2),
        platform: 'bidblitz'
      },
      description: `BidBlitz card deposit - ${user.username}`,
      statement_descriptor_suffix: 'BIDBLITZ',
    };

    const requestOptions = {};
    if (idempotencyKey) {
      requestOptions.idempotencyKey = idempotencyKey;
    }

    const paymentIntent = await this.stripe.paymentIntents.create(intentOptions, requestOptions);

    console.log(`💳 Card PaymentIntent ${paymentIntent.id}: $${amount} (user gets $${netAmount.toFixed(2)})`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      grossAmount: amount,
      userFee: userFee,
      netAmount: netAmount,
      status: paymentIntent.status
    };
  }

  // ============================================
  // ACH BANK PAYMENTS
  // ============================================

  /**
   * Create PaymentIntent for ACH bank transfer
   * We absorb the 0.8% fee (capped at $5)
   */
  async createACHDepositIntent(user, amount, idempotencyKey = null) {
    if (!this.stripe) throw new Error('Stripe not configured');

    // Validate
    if (amount < this.limits.MIN_DEPOSIT) {
      throw new Error(`Minimum deposit is $${this.limits.MIN_DEPOSIT}`);
    }
    if (amount > this.limits.MAX_DEPOSIT) {
      throw new Error(`Maximum deposit is $${this.limits.MAX_DEPOSIT}`);
    }

    const todayDeposits = await this.getTodayDeposits(user.id);
    if (todayDeposits + amount > this.limits.MAX_DAILY_DEPOSIT) {
      throw new Error(`Daily deposit limit of $${this.limits.MAX_DAILY_DEPOSIT} exceeded`);
    }

    const customer = await this.getOrCreateCustomer(user);
    const amountInCents = Math.round(amount * 100);

    const intentOptions = {
      amount: amountInCents,
      currency: 'usd',
      customer: customer.id,
      payment_method_types: ['us_bank_account'],
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ['payment_method', 'balances'],
          },
        },
      },
      metadata: {
        user_id: user.id,
        username: user.username,
        type: 'deposit',
        method: 'ach',
        amount: amount.toFixed(2),
        platform: 'bidblitz'
      },
      description: `BidBlitz ACH deposit - ${user.username}`,
    };

    const requestOptions = {};
    if (idempotencyKey) {
      requestOptions.idempotencyKey = idempotencyKey;
    }

    const paymentIntent = await this.stripe.paymentIntents.create(intentOptions, requestOptions);

    console.log(`🏦 ACH PaymentIntent ${paymentIntent.id}: $${amount}`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amount,
      netAmount: amount, // User gets full amount
      status: paymentIntent.status
    };
  }

  // ============================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================

  async attachPaymentMethod(customerId, paymentMethodId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async listPaymentMethods(customerId, type = 'card') {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: type,
    });
    return paymentMethods.data;
  }

  async listBankAccounts(customerId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account',
    });
    return paymentMethods.data;
  }

  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  // ============================================
  // PAYMENT RETRIEVAL
  // ============================================

  async getPaymentIntent(paymentIntentId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async cancelPaymentIntent(paymentIntentId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    return this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  // ============================================
  // REFUNDS
  // ============================================

  async refundPaymentIntent(paymentIntentId, amount = null) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    const refundOptions = {
      payment_intent: paymentIntentId
    };

    if (amount) {
      refundOptions.amount = Math.round(amount * 100);
    }

    return this.stripe.refunds.create(refundOptions);
  }

  // ============================================
  // WEBHOOKS
  // ============================================

  constructWebhookEvent(payload, signature) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  // ============================================
  // HELPERS
  // ============================================

  async getTodayDeposits(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.db.Transaction.sum('amount', {
      where: {
        user_id: userId,
        type: 'deposit',
        status: 'completed',
        created_at: {
          [this.db.Sequelize.Op.gte]: today
        }
      }
    });

    return Math.abs(result || 0);
  }

  calculateCardFee(amount) {
    return {
      grossAmount: amount,
      userFee: amount * (this.fees.CARD_USER_PERCENT / 100),
      platformFee: amount * (this.fees.CARD_PLATFORM_PERCENT / 100),
      netAmount: amount * (1 - this.fees.CARD_USER_PERCENT / 100)
    };
  }

  calculateACHFee(amount) {
    const fee = Math.min(amount * (this.fees.ACH_PERCENT / 100), this.fees.ACH_CAP);
    return {
      amount: amount,
      platformFee: fee,
      netAmount: amount // User gets full amount
    };
  }

  centsToDollars(cents) {
    return cents / 100;
  }

  dollarsToCents(dollars) {
    return Math.round(dollars * 100);
  }

  getLimits() {
    return this.limits;
  }

  getFees() {
    return this.fees;
  }

  isConfigured() {
    return !!this.stripe;
  }
}

module.exports = StripeService;