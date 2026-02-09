// backend/src/services/solanaService.js
// Solana USDC/USDT deposit monitoring service

const { Connection, PublicKey } = require('@solana/web3.js');

// Solana token addresses (mainnet)
const TOKENS = {
  USDC: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    name: 'USD Coin'
  },
  USDT: {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    name: 'Tether USD'
  }
};

// Bonus ticket tiers
const BONUS_TIERS = [
  { min: 10, max: 49.99, tickets: 1 },
  { min: 50, max: 99.99, tickets: 2 },
  { min: 100, max: 249.99, tickets: 3 },
  { min: 250, max: 499.99, tickets: 5 },
  { min: 500, max: Infinity, tickets: 10 }
];

// Limits
const LIMITS = {
  MIN_DEPOSIT: 10,
  MAX_DEPOSIT: 10000,
};

class SolanaService {
  constructor(db) {
    this.db = db;
    this.tokens = TOKENS;
    this.limits = LIMITS;
    this.bonusTiers = BONUS_TIERS;
    
    // Your deposit wallet address (set in env)
    this.depositWallet = process.env.SOLANA_DEPOSIT_WALLET;
    
    // RPC connection (use Helius, QuickNode, or public RPC)
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Track processed signatures to avoid double-crediting
    this.processedSignatures = new Set();
    
    // Polling interval (null until started)
    this.pollInterval = null;
  }

  // ============================================
  // DEPOSIT ADDRESS GENERATION
  // ============================================

  /**
   * Get deposit info for a user
   * For simplicity, we use a single deposit wallet + memo system
   * Memo = user ID for identification
   */
  getDepositInfo(user) {
    if (!this.depositWallet) {
      throw new Error('SOLANA_DEPOSIT_WALLET not configured');
    }

    return {
      wallet: this.depositWallet,
      memo: user.id.slice(0, 16), // Use first 16 chars of user ID as memo
      supportedTokens: [
        { symbol: 'USDC', name: 'USD Coin', mint: TOKENS.USDC.mint },
        { symbol: 'USDT', name: 'Tether USD', mint: TOKENS.USDT.mint }
      ],
      network: 'Solana',
      minDeposit: this.limits.MIN_DEPOSIT,
      maxDeposit: this.limits.MAX_DEPOSIT,
      bonusTiers: this.bonusTiers,
      instructions: [
        '1. Copy the wallet address below',
        '2. Send USDC or USDT from your Solana wallet (Phantom, Solflare, etc.)',
        '3. IMPORTANT: Include the memo code in your transaction',
        '4. Wait for confirmation (usually under 1 minute)',
        '5. Your balance will be credited automatically + bonus tickets!'
      ]
    };
  }

  // ============================================
  // BONUS TICKET CALCULATION
  // ============================================

  calculateBonusTickets(amount) {
    for (const tier of this.bonusTiers) {
      if (amount >= tier.min && amount <= tier.max) {
        return tier.tickets;
      }
    }
    return 0;
  }

  // ============================================
  // TRANSACTION VERIFICATION
  // ============================================

  /**
   * Verify a Solana transaction manually (user submits tx signature)
   * 
   * CRITICAL FIX: Relies on database unique constraint for idempotency
   * instead of check-then-insert pattern which has a race condition.
   * 
   * REQUIRES: CREATE UNIQUE INDEX idx_solana_signature 
   *           ON transactions((metadata->>'solana_signature')) 
   *           WHERE metadata->>'solana_signature' IS NOT NULL;
   */
  async verifyTransaction(signature, userId) {
    try {
      // Fetch transaction from Solana FIRST
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx) {
        return {
          success: false,
          error: 'Transaction not found. Please wait a moment and try again.'
        };
      }

      if (tx.meta?.err) {
        return {
          success: false,
          error: 'Transaction failed on-chain'
        };
      }

      // Parse the transaction for token transfers
      const depositInfo = await this.parseTokenTransfer(tx, userId);

      if (!depositInfo) {
        return {
          success: false,
          error: 'No valid USDC/USDT transfer found to our deposit wallet'
        };
      }

      // Validate amount
      if (depositInfo.amount < this.limits.MIN_DEPOSIT) {
        return {
          success: false,
          error: `Minimum deposit is $${this.limits.MIN_DEPOSIT}`
        };
      }

      // ================================================================
      // CREDIT USER - Database constraint handles idempotency
      // If signature already exists, the INSERT will fail with unique violation
      // ================================================================
      try {
        const result = await this.creditDeposit(userId, depositInfo, signature);
        
        return {
          success: true,
          amount: depositInfo.amount,
          token: depositInfo.token,
          bonusTickets: result.bonusTickets,
          newBalance: result.newBalance,
          transactionId: result.transactionId
        };
        
      } catch (error) {
        // Check if it's a unique constraint violation (duplicate signature)
        if (error.name === 'SequelizeUniqueConstraintError' || 
            error.message?.includes('unique') ||
            error.message?.includes('duplicate') ||
            error.message?.includes('idx_solana_signature')) {
          console.log(`⚠️ Duplicate Solana signature blocked by DB constraint: ${signature}`);
          return {
            success: false,
            error: 'This transaction has already been processed'
          };
        }
        throw error;
      }

    } catch (error) {
      console.error('❌ Solana verification error:', error);
      return {
        success: false,
        error: error.message || 'Failed to verify transaction'
      };
    }
  }

  /**
   * Parse a Solana transaction for USDC/USDT transfers
   */
  async parseTokenTransfer(tx, userId) {
    const instructions = tx.transaction.message.instructions;
    const innerInstructions = tx.meta?.innerInstructions || [];

    // Look for token transfer instructions
    for (const ix of instructions) {
      if (ix.program === 'spl-token' && ix.parsed?.type === 'transferChecked') {
        const info = ix.parsed.info;
        
        // Check if it's to our wallet
        if (info.destination === this.depositWallet || 
            await this.isOurTokenAccount(info.destination)) {
          
          // Check if it's USDC or USDT
          const token = this.identifyToken(info.mint);
          if (token) {
            const amount = parseFloat(info.tokenAmount.uiAmount);
            
            // Try to extract memo for user identification
            const memo = this.extractMemo(tx);
            
            return {
              token: token,
              amount: amount,
              mint: info.mint,
              memo: memo,
              sender: info.authority
            };
          }
        }
      }
    }

    // Also check inner instructions (for wrapped transactions)
    for (const inner of innerInstructions) {
      for (const ix of inner.instructions) {
        if (ix.program === 'spl-token' && ix.parsed?.type === 'transferChecked') {
          const info = ix.parsed.info;
          const token = this.identifyToken(info.mint);
          
          if (token && await this.isOurTokenAccount(info.destination)) {
            return {
              token: token,
              amount: parseFloat(info.tokenAmount.uiAmount),
              mint: info.mint,
              memo: this.extractMemo(tx)
            };
          }
        }
      }
    }

    return null;
  }

  identifyToken(mint) {
    if (mint === TOKENS.USDC.mint) return 'USDC';
    if (mint === TOKENS.USDT.mint) return 'USDT';
    return null;
  }

  extractMemo(tx) {
    // Look for memo program instruction
    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if (ix.program === 'spl-memo' || ix.programId?.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
        return ix.parsed || ix.data;
      }
    }
    return null;
  }

  async isOurTokenAccount(address) {
    // Check if this is a token account owned by our deposit wallet
    try {
      const accountInfo = await this.connection.getParsedAccountInfo(new PublicKey(address));
      if (accountInfo.value?.data?.parsed?.info?.owner === this.depositWallet) {
        return true;
      }
    } catch (e) {
      // Not a valid address or not our account
    }
    return false;
  }

  // ============================================
  // CREDIT DEPOSIT
  // ============================================

  /**
   * Credit deposit to user
   * 
   * CRITICAL: Relies on database unique constraint on metadata->>'solana_signature'
   * If duplicate, the INSERT will fail and we catch the error in verifyTransaction
   */
  async creditDeposit(userId, depositInfo, signature) {
    const dbTransaction = await this.db.sequelize.transaction({
      isolationLevel: this.db.Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });

    try {
      // Get user with lock
      const user = await this.db.User.findByPk(userId, {
        lock: dbTransaction.LOCK.UPDATE,
        transaction: dbTransaction
      });

      if (!user) {
        throw new Error('User not found');
      }

      const amount = depositInfo.amount;
      const bonusTickets = this.calculateBonusTickets(amount);
      const currentBalance = parseFloat(user.balance);
      const currentTickets = user.tickets || 0;
      const newBalance = currentBalance + amount;
      const newTickets = currentTickets + bonusTickets;

      // Update user
      await user.update({
        balance: newBalance,
        tickets: newTickets,
        lifetime_deposits: parseFloat(user.lifetime_deposits || 0) + amount
      }, { transaction: dbTransaction });

      // Create transaction record
      // If solana_signature already exists, this will FAIL due to unique index
      // That's the idempotency protection!
      const txRecord = await this.db.Transaction.create({
        user_id: userId,
        type: 'deposit',
        amount: amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: 'completed',
        description: `Solana ${depositInfo.token} deposit`,
        metadata: {
          method: 'solana',
          token: depositInfo.token,
          solana_signature: signature,  // UNIQUE INDEXED - duplicate will fail
          sender: depositInfo.sender,
          bonus_tickets: bonusTickets,
          network: 'solana'
        }
      }, { transaction: dbTransaction });

      // Create bonus ticket transaction if applicable
      if (bonusTickets > 0) {
        await this.db.Transaction.create({
          user_id: userId,
          type: 'ticket_bonus',
          amount: 0,
          balance_after: newBalance,
          status: 'completed',
          description: `Crypto deposit bonus: +${bonusTickets} tickets`,
          metadata: {
            tickets_awarded: bonusTickets,
            deposit_transaction_id: txRecord.id,
            deposit_amount: amount
          }
        }, { transaction: dbTransaction });
      }

      await dbTransaction.commit();

      console.log(`✅ Solana deposit credited: User ${user.username}, $${amount} ${depositInfo.token}, +${bonusTickets} tickets`);

      return {
        transactionId: txRecord.id,
        amount: amount,
        bonusTickets: bonusTickets,
        newBalance: newBalance,
        newTickets: newTickets
      };

    } catch (error) {
      await dbTransaction.rollback();
      throw error;
    }
  }

  // ============================================
  // BACKGROUND POLLING (OPTIONAL)
  // ============================================

  /**
   * Start polling for incoming transactions
   * Alternative to user-submitted verification
   */
  async startPolling(intervalMs = 30000) {
    if (this.pollInterval) {
      console.log('Polling already running');
      return;
    }

    if (!this.depositWallet) {
      console.error('Cannot start polling: SOLANA_DEPOSIT_WALLET not set');
      return;
    }

    console.log(`🔄 Starting Solana deposit polling every ${intervalMs / 1000}s`);

    this.pollInterval = setInterval(async () => {
      try {
        await this.checkForNewDeposits();
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, intervalMs);

    // Run immediately on start
    await this.checkForNewDeposits();
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('🛑 Stopped Solana deposit polling');
    }
  }

  async checkForNewDeposits() {
    // Get recent signatures for our wallet
    const pubkey = new PublicKey(this.depositWallet);
    const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit: 20 });

    for (const sigInfo of signatures) {
      if (this.processedSignatures.has(sigInfo.signature)) {
        continue;
      }

      // Check if already in database
      const existing = await this.db.Transaction.findOne({
        where: this.db.sequelize.literal(`metadata->>'solana_signature' = '${sigInfo.signature}'`)
      });

      if (existing) {
        this.processedSignatures.add(sigInfo.signature);
        continue;
      }

      // Process this transaction
      // Note: We need to figure out which user it belongs to via memo
      // This is more complex - for MVP, user-submitted verification is simpler
      console.log(`📥 New Solana tx detected: ${sigInfo.signature}`);
    }
  }

  // ============================================
  // UTILITIES
  // ============================================

  getLimits() {
    return this.limits;
  }

  getBonusTiers() {
    return this.bonusTiers;
  }

  isConfigured() {
    return !!this.depositWallet;
  }
}

module.exports = SolanaService;