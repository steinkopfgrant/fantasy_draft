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

// Signature format: base58 encoded, typically 87-88 chars
const SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;

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
   * Security layers:
   * 1. Signature format validation (reject garbage input)
   * 2. On-chain verification (tx exists and succeeded)
   * 3. Token transfer validation (USDC/USDT to our wallet)
   * 4. Memo validation (prevents cross-user replay attacks)
   * 5. Amount validation (min/max limits)
   * 6. Confirmation depth check (finalized for large deposits)
   * 7. DB unique constraint on signature (prevents double-credit)
   * 
   * REQUIRES: CREATE UNIQUE INDEX idx_solana_signature 
   *           ON transactions((metadata->>'solana_signature')) 
   *           WHERE metadata->>'solana_signature' IS NOT NULL;
   */
  async verifyTransaction(signature, userId) {
    try {
      // ================================================================
      // 1. VALIDATE SIGNATURE FORMAT (prevent injection / garbage)
      // ================================================================
      if (!signature || typeof signature !== 'string') {
        return { success: false, error: 'Transaction signature is required' };
      }

      const trimmedSig = signature.trim();
      if (!SIGNATURE_REGEX.test(trimmedSig)) {
        return { success: false, error: 'Invalid transaction signature format' };
      }

      // ================================================================
      // 2. CHECK IF ALREADY PROCESSED (fast path before RPC call)
      // Uses parameterized query — NOT string interpolation
      // ================================================================
      const existingTx = await this.db.Transaction.findOne({
        where: this.db.sequelize.where(
          this.db.sequelize.fn('jsonb_extract_path_text', 
            this.db.sequelize.col('metadata'), 'solana_signature'),
          trimmedSig
        )
      });

      if (existingTx) {
        console.log(`⚠️ Duplicate Solana signature (pre-check): ${trimmedSig.slice(0, 20)}...`);
        return { success: false, error: 'This transaction has already been processed' };
      }

      // ================================================================
      // 3. FETCH AND VALIDATE ON-CHAIN TRANSACTION
      // ================================================================
      const tx = await this.connection.getParsedTransaction(trimmedSig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!tx) {
        return {
          success: false,
          error: 'Transaction not found. Please wait a moment and try again.'
        };
      }

      if (tx.meta?.err) {
        return { success: false, error: 'Transaction failed on-chain' };
      }

      // ================================================================
      // 4. PARSE TOKEN TRANSFER (validates destination is our wallet)
      // ================================================================
      const depositInfo = await this.parseTokenTransfer(tx, userId);

      if (!depositInfo) {
        return {
          success: false,
          error: 'No valid USDC/USDT transfer found to our deposit wallet'
        };
      }

      // ================================================================
      // 5. MEMO VALIDATION (prevents cross-user replay attacks)
      // User B cannot submit User A's transaction and get credited
      // ================================================================
      const expectedMemo = userId.slice(0, 16);
      if (!depositInfo.memo) {
        return {
          success: false,
          error: 'Transaction is missing the required memo. Please include your memo code when sending.'
        };
      }

      if (depositInfo.memo !== expectedMemo) {
        console.warn(`⚠️ Memo mismatch: expected "${expectedMemo}", got "${depositInfo.memo}" (user: ${userId}, sig: ${trimmedSig.slice(0, 20)}...)`);
        return {
          success: false,
          error: 'Transaction memo does not match your account. Each deposit must include your unique memo code.'
        };
      }

      // ================================================================
      // 6. AMOUNT VALIDATION (min and max)
      // Amount comes from on-chain data, not from the client
      // ================================================================
      if (depositInfo.amount < this.limits.MIN_DEPOSIT) {
        return {
          success: false,
          error: `Minimum deposit is $${this.limits.MIN_DEPOSIT}. You sent $${depositInfo.amount.toFixed(2)}.`
        };
      }

      if (depositInfo.amount > this.limits.MAX_DEPOSIT) {
        console.warn(`⚠️ Over-limit deposit attempt: $${depositInfo.amount} by user ${userId}`);
        return {
          success: false,
          error: `Maximum deposit is $${this.limits.MAX_DEPOSIT}. Please contact support for larger deposits.`
        };
      }

      // ================================================================
      // 7. CONFIRMATION DEPTH CHECK
      // For large deposits, require finalized commitment (max safety)
      // ================================================================
      const FINALIZED_THRESHOLD = 100; // $100+

      if (depositInfo.amount >= FINALIZED_THRESHOLD) {
        const finalizedTx = await this.connection.getParsedTransaction(trimmedSig, {
          maxSupportedTransactionVersion: 0,
          commitment: 'finalized'
        });

        if (!finalizedTx) {
          return {
            success: false,
            error: 'Transaction is not yet finalized. For deposits over $100, please wait ~30 seconds and try again.'
          };
        }
      }

      // ================================================================
      // 8. CREDIT USER — DB unique constraint handles idempotency
      // If signature already exists, the INSERT will fail with unique violation
      // ================================================================
      try {
        const result = await this.creditDeposit(userId, depositInfo, trimmedSig);
        
        console.log(`✅ Solana deposit verified: User ${userId}, $${depositInfo.amount} ${depositInfo.token}, sig: ${trimmedSig.slice(0, 20)}...`);
        
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
          console.log(`⚠️ Duplicate Solana signature blocked by DB constraint: ${trimmedSig.slice(0, 20)}...`);
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
        error: 'Failed to verify transaction. Please try again.'
      };
    }
  }

  /**
   * Parse a Solana transaction for USDC/USDT transfers to our wallet
   */
  async parseTokenTransfer(tx, userId) {
    const instructions = tx.transaction.message.instructions;
    const innerInstructions = tx.meta?.innerInstructions || [];

    // Check top-level instructions
    const result = await this._checkInstructions(instructions);
    if (result) {
      result.memo = this.extractMemo(tx);
      return result;
    }

    // Also check inner instructions (for wrapped/aggregated transactions)
    for (const inner of innerInstructions) {
      const result = await this._checkInstructions(inner.instructions);
      if (result) {
        result.memo = this.extractMemo(tx);
        return result;
      }
    }

    return null;
  }

  /**
   * Check a set of instructions for valid token transfers to our wallet
   */
  async _checkInstructions(instructions) {
    for (const ix of instructions) {
      if (ix.program !== 'spl-token') continue;
      
      const type = ix.parsed?.type;
      if (type !== 'transferChecked' && type !== 'transfer') continue;

      const info = ix.parsed.info;
      
      // For transferChecked, verify the mint is USDC or USDT
      const mint = info.mint;
      const token = mint ? this.identifyToken(mint) : null;

      // Determine destination and amount based on instruction type
      let destination, amount;
      
      if (type === 'transferChecked') {
        destination = info.destination;
        amount = parseFloat(info.tokenAmount?.uiAmount || 0);
        if (!token) continue; // Must be USDC or USDT
      } else if (type === 'transfer') {
        destination = info.destination;
        // For plain transfers, amount is in raw units — need to check token account
        amount = parseFloat(info.amount || 0);
        // Raw transfer doesn't include mint, we'll verify via account ownership
      }

      if (!destination) continue;

      // Check if destination is our wallet or our token account
      const isOurs = destination === this.depositWallet || 
                     await this.isOurTokenAccount(destination);
      
      if (!isOurs) continue;

      // For transferChecked we already have the UI amount
      if (type === 'transferChecked' && token) {
        return {
          token,
          amount,
          mint,
          sender: info.authority
        };
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
    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if (ix.program === 'spl-memo' || 
          ix.programId?.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
        // Memo can be in parsed field or data field
        const memo = ix.parsed || ix.data;
        // Clean up memo — trim whitespace, handle base64 encoding
        if (typeof memo === 'string') {
          return memo.trim();
        }
        return memo;
      }
    }
    return null;
  }

  async isOurTokenAccount(address) {
    try {
      const pubkey = new PublicKey(address);
      const accountInfo = await this.connection.getParsedAccountInfo(pubkey);
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
   * Credit deposit to user atomically
   * 
   * CRITICAL: Relies on database unique constraint on metadata->>'solana_signature'
   * If duplicate, the INSERT will fail and we catch the error in verifyTransaction
   */
  async creditDeposit(userId, depositInfo, signature) {
    const dbTransaction = await this.db.sequelize.transaction({
      isolationLevel: this.db.Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });

    try {
      // Get user with row lock
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

      // Update user balance + tickets + lifetime deposits
      await user.update({
        balance: newBalance,
        tickets: newTickets,
        lifetime_deposits: parseFloat(user.lifetime_deposits || 0) + amount
      }, { transaction: dbTransaction });

      // Create transaction record
      // If solana_signature already exists in metadata, this will FAIL
      // due to the unique index — that's our idempotency protection
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
          solana_signature: signature,  // UNIQUE INDEXED
          sender: depositInfo.sender,
          memo: depositInfo.memo,
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
    try {
      const pubkey = new PublicKey(this.depositWallet);
      const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit: 20 });

      for (const sigInfo of signatures) {
        // Parameterized query — no SQL injection
        const existing = await this.db.Transaction.findOne({
          where: this.db.sequelize.where(
            this.db.sequelize.fn('jsonb_extract_path_text',
              this.db.sequelize.col('metadata'), 'solana_signature'),
            sigInfo.signature
          )
        });

        if (existing) continue;

        // Note: For auto-polling, we'd need to parse the memo to identify the user
        // For MVP, user-submitted verification is simpler and safer
        console.log(`📥 New unprocessed Solana tx detected: ${sigInfo.signature.slice(0, 20)}...`);
      }
    } catch (error) {
      console.error('Error checking for new deposits:', error);
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