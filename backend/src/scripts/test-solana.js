// backend/test-solana.js
// Run: node test-solana.js
// Tests all Solana deposit verification paths without real transactions

const db = require('../models');
const SolanaService = require('../services/solanaService');

const solanaService = new SolanaService(db);

// Test user ID — use a real user from your DB
let TEST_USER_ID = null;
const FAKE_SIGNATURE = '5Kz7YQgR8mVxN3pGJ9LqH2vFbTnNvRcXwYpZj6K9dJmWeCqYhA4kN7pL3xMfQ2rT8wBvU6sHnD4gCjE9aF1bYk';
const FAKE_SIGNATURE_2 = '3Hy5TPeR6mSwK1nFG7JpE4rD8BuQcVwXsYh4H9bHfJjUcAqWfB2iL5nG1tKdN9pR6sCtV4qFmD7eBgA8dE3aWhKx';

// Build a realistic mock parsed transaction
function buildMockTransaction(opts = {}) {
  const {
    token = 'USDC',
    amount = 25.00,
    memo = null,
    destination = solanaService.depositWallet || 'FakeWallet123',
    failed = false,
    mint = null
  } = opts;

  const tokenMint = mint || (token === 'USDC' 
    ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    : 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

  const instructions = [
    {
      program: 'spl-token',
      parsed: {
        type: 'transferChecked',
        info: {
          destination: destination,
          mint: tokenMint,
          tokenAmount: { uiAmount: amount },
          authority: 'SenderWalletABC123'
        }
      }
    }
  ];

  // Add memo instruction if provided
  if (memo) {
    instructions.push({
      program: 'spl-memo',
      programId: { toString: () => 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' },
      parsed: memo
    });
  }

  return {
    meta: { err: failed ? { SomeError: true } : null, innerInstructions: [] },
    transaction: { message: { instructions } },
    slot: 300000000
  };
}

// Override the Solana connection methods with mocks
function mockConnection(service, mockTx) {
  service.connection = {
    getParsedTransaction: async (sig, opts) => {
      console.log(`    [mock RPC] getParsedTransaction(${sig.slice(0, 20)}..., commitment: ${opts?.commitment || 'confirmed'})`);
      return mockTx;
    },
    getParsedAccountInfo: async () => ({ value: null }),
    getSignaturesForAddress: async () => []
  };
}

// Also mock isOurTokenAccount to return true for our wallet's token accounts
function mockTokenAccount(service) {
  service.isOurTokenAccount = async (address) => {
    return address === solanaService.depositWallet;
  };
}

async function runTests() {
  console.log('\n========================================');
  console.log('  SOLANA DEPOSIT VERIFICATION TESTS');
  console.log('========================================\n');

  // Connect to DB
  await db.sequelize.authenticate();
  console.log('✅ Database connected\n');

  // Get a real test user
  const testUser = await db.User.findOne({ where: { is_admin: true } });
  if (!testUser) {
    console.error('❌ No admin user found — create one first');
    process.exit(1);
  }
  TEST_USER_ID = testUser.id;
  const expectedMemo = TEST_USER_ID.slice(0, 16);
  console.log(`Using test user: ${testUser.username} (${TEST_USER_ID})`);
  console.log(`Expected memo: ${expectedMemo}`);
  console.log(`Deposit wallet: ${solanaService.depositWallet || 'NOT SET'}\n`);

  if (!solanaService.depositWallet) {
    console.log('⚠️  SOLANA_DEPOSIT_WALLET not set — some tests will behave differently');
    solanaService.depositWallet = 'TestDepositWallet123';
    console.log(`   Using fake wallet: ${solanaService.depositWallet}\n`);
  }

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}\n`);
      passed++;
    } catch (err) {
      console.log(`  ❌ FAIL: ${name}`);
      console.log(`     Error: ${err.message}\n`);
      failed++;
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  // ========================================
  // TEST 1: Invalid signature format
  // ========================================
  await test('Rejects invalid signature format', async () => {
    mockConnection(solanaService, null);
    const result = await solanaService.verifyTransaction('not-a-real-sig!!!', TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('Invalid'), `Expected format error, got: ${result.error}`);
  });

  // ========================================
  // TEST 2: Empty / null signature
  // ========================================
  await test('Rejects empty signature', async () => {
    const result = await solanaService.verifyTransaction('', TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('required'), `Expected required error, got: ${result.error}`);
  });

  await test('Rejects null signature', async () => {
    const result = await solanaService.verifyTransaction(null, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
  });

  // ========================================
  // TEST 3: Transaction not found on chain
  // ========================================
  await test('Handles transaction not found', async () => {
    mockConnection(solanaService, null);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('not found'), `Expected not found, got: ${result.error}`);
  });

  // ========================================
  // TEST 4: Failed on-chain transaction
  // ========================================
  await test('Rejects failed on-chain transaction', async () => {
    const mockTx = buildMockTransaction({ failed: true, memo: expectedMemo });
    mockConnection(solanaService, mockTx);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('failed'), `Expected failed error, got: ${result.error}`);
  });

  // ========================================
  // TEST 5: Missing memo
  // ========================================
  await test('Rejects transaction with missing memo', async () => {
    const mockTx = buildMockTransaction({ amount: 25, memo: null });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('memo'), `Expected memo error, got: ${result.error}`);
  });

  // ========================================
  // TEST 6: Wrong memo (cross-user replay)
  // ========================================
  await test('Rejects wrong memo (cross-user replay attack)', async () => {
    const mockTx = buildMockTransaction({ amount: 25, memo: 'someone-elses-id' });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('memo does not match'), `Expected memo mismatch, got: ${result.error}`);
  });

  // ========================================
  // TEST 7: Below minimum deposit
  // ========================================
  await test('Rejects deposit below minimum ($10)', async () => {
    const mockTx = buildMockTransaction({ amount: 5.00, memo: expectedMemo });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('Minimum'), `Expected min error, got: ${result.error}`);
  });

  // ========================================
  // TEST 8: Above maximum deposit
  // ========================================
  await test('Rejects deposit above maximum ($10,000)', async () => {
    const mockTx = buildMockTransaction({ amount: 15000, memo: expectedMemo });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('Maximum'), `Expected max error, got: ${result.error}`);
  });

  // ========================================
  // TEST 9: Wrong token (not USDC/USDT)
  // ========================================
  await test('Rejects non-USDC/USDT token', async () => {
    const mockTx = buildMockTransaction({ 
      amount: 50, 
      memo: expectedMemo, 
      mint: 'So11111111111111111111111111111111111111112' // SOL mint
    });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('No valid USDC/USDT'), `Expected token error, got: ${result.error}`);
  });

  // ========================================
  // TEST 10: Wrong destination wallet
  // ========================================
  await test('Rejects transfer to wrong wallet', async () => {
    const mockTx = buildMockTransaction({ 
      amount: 50, 
      memo: expectedMemo, 
      destination: 'SomeOtherWalletNotOurs123' 
    });
    mockConnection(solanaService, mockTx);
    // Don't mock isOurTokenAccount — let it return false
    solanaService.isOurTokenAccount = async () => false;
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('No valid'), `Expected wallet error, got: ${result.error}`);
  });

  // ========================================
  // TEST 11: Valid USDC deposit (happy path)
  // ========================================
  await test('Accepts valid USDC deposit', async () => {
    const balanceBefore = parseFloat(testUser.balance);
    const mockTx = buildMockTransaction({ token: 'USDC', amount: 25.00, memo: expectedMemo });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(result.success, `Should succeed, got error: ${result.error}`);
    assert(result.amount === 25.00, `Expected $25, got $${result.amount}`);
    assert(result.token === 'USDC', `Expected USDC, got ${result.token}`);
    assert(result.bonusTickets === 1, `Expected 1 bonus ticket, got ${result.bonusTickets}`);
    assert(result.newBalance === balanceBefore + 25.00, `Balance mismatch`);
    
    console.log(`    Deposited: $${result.amount} USDC, +${result.bonusTickets} ticket, balance: $${result.newBalance}`);
  });

  // ========================================
  // TEST 12: Duplicate signature (double-credit attempt)
  // ========================================
  await test('Rejects duplicate signature (double-credit attack)', async () => {
    const mockTx = buildMockTransaction({ token: 'USDC', amount: 25.00, memo: expectedMemo });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    
    // Try to submit same signature again
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE, TEST_USER_ID);
    assert(!result.success, 'Should not succeed');
    assert(result.error.includes('already been processed'), `Expected duplicate error, got: ${result.error}`);
  });

  // ========================================
  // TEST 13: Valid USDT deposit
  // ========================================
  await test('Accepts valid USDT deposit', async () => {
    const user = await db.User.findByPk(TEST_USER_ID);
    const balanceBefore = parseFloat(user.balance);
    const mockTx = buildMockTransaction({ token: 'USDT', amount: 100.00, memo: expectedMemo });
    mockConnection(solanaService, mockTx);
    mockTokenAccount(solanaService);
    
    const result = await solanaService.verifyTransaction(FAKE_SIGNATURE_2, TEST_USER_ID);
    assert(result.success, `Should succeed, got error: ${result.error}`);
    assert(result.amount === 100.00, `Expected $100, got $${result.amount}`);
    assert(result.token === 'USDT', `Expected USDT, got ${result.token}`);
    assert(result.bonusTickets === 3, `Expected 3 bonus tickets for $100, got ${result.bonusTickets}`);
    
    console.log(`    Deposited: $${result.amount} USDT, +${result.bonusTickets} tickets, balance: $${result.newBalance}`);
  });

  // ========================================
  // CLEANUP: Reverse test deposits
  // ========================================
  console.log('  🧹 Cleaning up test deposits...');
  try {
    // Delete test transactions
    const deleted = await db.Transaction.destroy({
      where: {
        user_id: TEST_USER_ID,
        [db.Sequelize.Op.or]: [
          db.sequelize.where(
            db.sequelize.fn('jsonb_extract_path_text', db.sequelize.col('metadata'), 'solana_signature'),
            { [db.Sequelize.Op.in]: [FAKE_SIGNATURE, FAKE_SIGNATURE_2] }
          )
        ]
      }
    });

    // Also delete associated ticket bonus records
    await db.Transaction.destroy({
      where: {
        user_id: TEST_USER_ID,
        type: 'ticket_bonus',
        description: { [db.Sequelize.Op.like]: 'Crypto deposit bonus%' }
      }
    });

    // Restore user balance (subtract the $125 we added)
    const user = await db.User.findByPk(TEST_USER_ID);
    const restoredBalance = parseFloat(user.balance) - 125.00;
    await user.update({ 
      balance: Math.max(0, restoredBalance),
      tickets: Math.max(0, (user.tickets || 0) - 4), // 1 + 3 tickets
      lifetime_deposits: Math.max(0, parseFloat(user.lifetime_deposits || 0) - 125.00)
    });

    console.log(`    Deleted ${deleted} test transaction records`);
    console.log(`    Restored balance to $${Math.max(0, restoredBalance).toFixed(2)}\n`);
  } catch (cleanupErr) {
    console.log(`    ⚠️ Cleanup error (manual cleanup may be needed): ${cleanupErr.message}\n`);
  }

  // ========================================
  // RESULTS
  // ========================================
  console.log('========================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  await db.sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});