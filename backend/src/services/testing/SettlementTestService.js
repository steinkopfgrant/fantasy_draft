// backend/src/services/testing/SettlementTestService.js
const { v4: uuidv4 } = require('uuid');

class SettlementTestService {
  constructor(models, sequelize, settlementService, scoringService) {
    this.models = models;
    this.sequelize = sequelize;
    this.settlementService = settlementService;
    this.scoringService = scoringService;
    
    // Track created test data for cleanup
    this.testData = {
      users: [],
      contests: [],
      entries: [],
      lineups: []
    };
  }

  /**
   * Run all settlement tests
   */
  async runAllTests() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 SETTLEMENT TEST SUITE');
    console.log('='.repeat(70) + '\n');

    const results = {
      passed: 0,
      failed: 0,
      tests: []
    };

    const testCases = [
      // Cash Game Tests
      { name: 'Cash Game - Clear Winner', fn: () => this.testCashGameClearWinner() },
      { name: 'Cash Game - 2-Way Tie for 1st', fn: () => this.testCashGameTwoWayTie() },
      { name: 'Cash Game - 3-Way Tie for 1st', fn: () => this.testCashGameThreeWayTie() },
      { name: 'Cash Game - Everyone Ties', fn: () => this.testCashGameEveryoneTies() },
      { name: 'Cash Game - Zero Scores', fn: () => this.testCashGameZeroScores() },
      { name: 'Cash Game - Negative Scores', fn: () => this.testCashGameNegativeScores() },
      
      // Market Mover Tests
      { name: 'Market Mover - Top 3 Clear', fn: () => this.testMarketMoverTop3Clear() },
      { name: 'Market Mover - Tie at 1st', fn: () => this.testMarketMoverTieAt1st() },
      { name: 'Market Mover - Tie at Paid Boundary', fn: () => this.testMarketMoverTieAtBoundary() },
      { name: 'Market Mover - Large Tie Group', fn: () => this.testMarketMoverLargeTieGroup() },
      
      // Edge Cases
      { name: 'Edge Case - Single Entry Contest', fn: () => this.testSingleEntry() },
      { name: 'Edge Case - Decimal Score Precision', fn: () => this.testDecimalPrecision() },
    ];

    for (const test of testCases) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🔬 TEST: ${test.name}`);
      console.log('─'.repeat(60));
      
      try {
        const result = await test.fn();
        
        if (result.passed) {
          console.log(`✅ PASSED`);
          results.passed++;
        } else {
          console.log(`❌ FAILED: ${result.reason}`);
          if (result.details) {
            console.log('   Details:', JSON.stringify(result.details, null, 2));
          }
          results.failed++;
        }
        
        results.tests.push({
          name: test.name,
          ...result
        });
        
      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        console.error(error.stack);
        results.failed++;
        results.tests.push({
          name: test.name,
          passed: false,
          reason: `Exception: ${error.message}`,
          error: error.stack
        });
      }
      
      // Cleanup after each test
      await this.cleanup();
    }

    // Final Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📝 Total:  ${results.tests.length}`);
    console.log('='.repeat(70) + '\n');

    return results;
  }

  // ==================== HELPER METHODS ====================

  /**
   * Create a test user with a known starting balance
   */
  async createTestUser(username, balance = 100) {
    const { User } = this.models;
    
    // Generate alphanumeric username (no underscores allowed)
    const timestamp = Date.now().toString().slice(-6);
    const cleanUsername = `test${username}${timestamp}`;
    
    const user = await User.create({
      id: uuidv4(),
      username: cleanUsername,
      email: `${cleanUsername}@test.com`,
      password: 'testpassword123', // At least 6 chars, will be hashed by model hook
      balance: balance,
      is_admin: false
    });
    
    this.testData.users.push(user.id);
    return user;
  }

  /**
   * Create a test contest
   */
  async createTestContest(type, options = {}) {
    const { Contest } = this.models;
    
    const defaults = {
      cash: {
        entry_fee: 5,
        prize_pool: 24,
        max_entries: 5
      },
      market: {
        entry_fee: 25,
        prize_pool: 120000,
        max_entries: 5000
      }
    };
    
    const config = { ...defaults[type], ...options };
    
    const contest = await Contest.create({
      id: uuidv4(),
      name: `Test ${type} ${Date.now()}`,
      type: type,
      status: 'completed', // Ready to settle
      entry_fee: config.entry_fee,
      prize_pool: config.prize_pool,
      max_entries: config.max_entries,
      current_entries: 0,
      player_board: [],
      created_at: new Date(),
      updated_at: new Date()
    });
    
    this.testData.contests.push(contest.id);
    return contest;
  }

  /**
   * Create a test entry with a specific score
   */
  async createTestEntry(userId, contestId, score, options = {}) {
    const { ContestEntry, Lineup } = this.models;
    
    const entryId = uuidv4();
    const roomId = options.roomId || contestId;
    
    // Create fake roster (not important for settlement, but needed for structure)
    const roster = {
      QB: { name: 'Test QB', team: 'TST', position: 'QB', price: 3 },
      RB: { name: 'Test RB', team: 'TST', position: 'RB', price: 3 },
      WR: { name: 'Test WR', team: 'TST', position: 'WR', price: 3 },
      TE: { name: 'Test TE', team: 'TST', position: 'TE', price: 3 },
      FLEX: { name: 'Test FLEX', team: 'TST', position: 'RB', price: 3 }
    };
    
    const entry = await ContestEntry.create({
      id: entryId,
      user_id: userId,
      contest_id: contestId,
      draft_room_id: roomId,
      status: 'completed',
      total_points: score,
      roster: roster,
      entered_at: options.enteredAt || new Date(),
      completed_at: new Date(),
      created_at: options.enteredAt || new Date(),
      updated_at: new Date()
    });
    
    // Also create lineup record
    const lineup = await Lineup.create({
      id: uuidv4(),
      user_id: userId,
      contest_entry_id: entryId,
      contest_id: contestId,
      contest_type: options.contestType || 'cash',
      roster: roster,
      status: 'completed',
      week: 1,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    this.testData.entries.push(entry.id);
    this.testData.lineups.push(lineup.id);
    
    // Update contest entry count
    await this.models.Contest.increment('current_entries', {
      where: { id: contestId }
    });
    
    return entry;
  }

  /**
   * Get user's current balance
   */
  async getBalance(userId) {
    const { User } = this.models;
    const user = await User.findByPk(userId);
    return parseFloat(user.balance || 0);
  }

  /**
   * Run settlement and return results
   */
  async runSettlement(contestId) {
    return await this.settlementService.settleContest(contestId);
  }

  /**
   * Verify payouts match expected values
   */
  async verifyPayouts(expectedPayouts) {
    const errors = [];
    
    for (const { userId, expectedPayout, username } of expectedPayouts) {
      const actualBalance = await this.getBalance(userId);
      const expectedBalance = 100 + expectedPayout; // Starting balance + payout
      
      // Allow for small floating point differences
      const diff = Math.abs(actualBalance - expectedBalance);
      
      if (diff > 0.01) {
        errors.push({
          username,
          userId,
          expectedPayout,
          expectedBalance,
          actualBalance,
          difference: actualBalance - expectedBalance
        });
      }
    }
    
    return {
      passed: errors.length === 0,
      errors
    };
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    const { User, Contest, ContestEntry, Lineup, ContestResult, Transaction } = this.models;
    
    try {
      // Delete in reverse order of dependencies
      if (this.testData.lineups.length > 0) {
        await Lineup.destroy({ where: { id: this.testData.lineups } });
      }
      
      if (this.testData.entries.length > 0) {
        // Delete related records first
        await ContestResult?.destroy({ where: { entry_id: this.testData.entries } });
        await ContestEntry.destroy({ where: { id: this.testData.entries } });
      }
      
      if (this.testData.contests.length > 0) {
        await Contest.destroy({ where: { id: this.testData.contests } });
      }
      
      if (this.testData.users.length > 0) {
        // Delete transactions for test users
        await Transaction?.destroy({ where: { user_id: this.testData.users } });
        await User.destroy({ where: { id: this.testData.users } });
      }
      
      // Reset tracking
      this.testData = { users: [], contests: [], entries: [], lineups: [] };
      
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  }

  // ==================== CASH GAME TESTS ====================

  /**
   * Test: Cash game with clear winner
   * Scores: [150, 120, 90, 80, 70]
   * Expected: Winner gets $24, others $0
   */
  async testCashGameClearWinner() {
    // Setup
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    const scores = [150, 120, 90, 80, 70];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    // Execute
    await this.runSettlement(contest.id);
    
    // Verify
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 24, username: 'alice' },
      { userId: users[1].id, expectedPayout: 0, username: 'bob' },
      { userId: users[2].id, expectedPayout: 0, username: 'carol' },
      { userId: users[3].id, expectedPayout: 0, username: 'dave' },
      { userId: users[4].id, expectedPayout: 0, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null,
      expected: expectedPayouts.map(p => ({ ...p, expectedBalance: 100 + p.expectedPayout }))
    };
  }

  /**
   * Test: Cash game with 2-way tie for 1st
   * Scores: [150, 150, 90, 80, 70]
   * Expected: Top 2 split $24 = $12 each
   */
  async testCashGameTwoWayTie() {
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    const scores = [150, 150, 90, 80, 70];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 12, username: 'alice' },
      { userId: users[1].id, expectedPayout: 12, username: 'bob' },
      { userId: users[2].id, expectedPayout: 0, username: 'carol' },
      { userId: users[3].id, expectedPayout: 0, username: 'dave' },
      { userId: users[4].id, expectedPayout: 0, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Cash game with 3-way tie for 1st
   * Scores: [150, 150, 150, 80, 70]
   * Expected: Top 3 split $24 = $8 each
   */
  async testCashGameThreeWayTie() {
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    const scores = [150, 150, 150, 80, 70];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 8, username: 'alice' },
      { userId: users[1].id, expectedPayout: 8, username: 'bob' },
      { userId: users[2].id, expectedPayout: 8, username: 'carol' },
      { userId: users[3].id, expectedPayout: 0, username: 'dave' },
      { userId: users[4].id, expectedPayout: 0, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Cash game where everyone ties
   * Scores: [100, 100, 100, 100, 100]
   * Expected: Everyone splits $24 = $4.80 each
   */
  async testCashGameEveryoneTies() {
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    const scores = [100, 100, 100, 100, 100];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 4.80, username: 'alice' },
      { userId: users[1].id, expectedPayout: 4.80, username: 'bob' },
      { userId: users[2].id, expectedPayout: 4.80, username: 'carol' },
      { userId: users[3].id, expectedPayout: 4.80, username: 'dave' },
      { userId: users[4].id, expectedPayout: 4.80, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Cash game with zero scores
   * Scores: [0, 0, 0, 0, 0]
   * Expected: Everyone splits $24 = $4.80 each (all tied at 0)
   */
  async testCashGameZeroScores() {
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    const scores = [0, 0, 0, 0, 0];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 4.80, username: 'alice' },
      { userId: users[1].id, expectedPayout: 4.80, username: 'bob' },
      { userId: users[2].id, expectedPayout: 4.80, username: 'carol' },
      { userId: users[3].id, expectedPayout: 4.80, username: 'dave' },
      { userId: users[4].id, expectedPayout: 4.80, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Cash game with negative scores
   * Scores: [10, -5, -10, -15, -20]
   * Expected: Highest score (10) wins $24
   */
  async testCashGameNegativeScores() {
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    const scores = [10, -5, -10, -15, -20];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 24, username: 'alice' },
      { userId: users[1].id, expectedPayout: 0, username: 'bob' },
      { userId: users[2].id, expectedPayout: 0, username: 'carol' },
      { userId: users[3].id, expectedPayout: 0, username: 'dave' },
      { userId: users[4].id, expectedPayout: 0, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  // ==================== MARKET MOVER TESTS ====================

  /**
   * Test: Market Mover with clear top 3
   * 10 entries with distinct scores
   * Expected: 1st=$25000, 2nd=$15000, 3rd=$10000, 4th-5th=$5000, 6th-10th=$1000
   */
  async testMarketMoverTop3Clear() {
    const contest = await this.createTestContest('market');
    
    const users = [];
    const scores = [200, 180, 160, 140, 130, 120, 110, 100, 90, 80];
    
    for (let i = 0; i < 10; i++) {
      const user = await this.createTestUser(`player${i}`);
      users.push(user);
      await this.createTestEntry(user.id, contest.id, scores[i], { contestType: 'market' });
    }
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 25000, username: 'player0' },
      { userId: users[1].id, expectedPayout: 15000, username: 'player1' },
      { userId: users[2].id, expectedPayout: 10000, username: 'player2' },
      { userId: users[3].id, expectedPayout: 5000, username: 'player3' },
      { userId: users[4].id, expectedPayout: 5000, username: 'player4' },
      { userId: users[5].id, expectedPayout: 1000, username: 'player5' },
      { userId: users[6].id, expectedPayout: 1000, username: 'player6' },
      { userId: users[7].id, expectedPayout: 1000, username: 'player7' },
      { userId: users[8].id, expectedPayout: 1000, username: 'player8' },
      { userId: users[9].id, expectedPayout: 1000, username: 'player9' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Market Mover with tie at 1st place
   * 2 players tie for 1st
   * Expected: They split 1st + 2nd prizes = ($25000 + $15000) / 2 = $20000 each
   */
  async testMarketMoverTieAt1st() {
    const contest = await this.createTestContest('market');
    
    const users = [];
    const scores = [200, 200, 160, 140, 130]; // Tie at top
    
    for (let i = 0; i < 5; i++) {
      const user = await this.createTestUser(`player${i}`);
      users.push(user);
      await this.createTestEntry(user.id, contest.id, scores[i], { contestType: 'market' });
    }
    
    await this.runSettlement(contest.id);
    
    // 1st and 2nd split: ($25000 + $15000) / 2 = $20000 each
    // 3rd gets $10000
    // 4th-5th get $5000 each
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 20000, username: 'player0' },
      { userId: users[1].id, expectedPayout: 20000, username: 'player1' },
      { userId: users[2].id, expectedPayout: 10000, username: 'player2' },
      { userId: users[3].id, expectedPayout: 5000, username: 'player3' },
      { userId: users[4].id, expectedPayout: 5000, username: 'player4' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Market Mover tie at paid/unpaid boundary
   * 3 players tie at ranks 499, 500, 501
   * Rank 500 is last paid ($50), rank 501 gets nothing
   * Expected: Split ($50 + $50 + $0) / 3 = $33.33 each
   * 
   * NOTE: This test creates 501 entries to properly test the boundary
   */
  async testMarketMoverTieAtBoundary() {
    const contest = await this.createTestContest('market', { max_entries: 1000 });
    
    // Create 498 entries with high scores (they'll rank 1-498)
    const fillerUsers = [];
    for (let i = 0; i < 498; i++) {
      const user = await this.createTestUser(`filler${i}`);
      fillerUsers.push(user);
      await this.createTestEntry(user.id, contest.id, 1000 - i, { contestType: 'market' });
    }
    
    // Create 3 entries that will tie at the boundary (ranks 499-501)
    const boundaryUsers = [];
    for (let i = 0; i < 3; i++) {
      const user = await this.createTestUser(`boundary${i}`);
      boundaryUsers.push(user);
      // All score 100, will tie at rank 499
      await this.createTestEntry(user.id, contest.id, 100, { contestType: 'market' });
    }
    
    await this.runSettlement(contest.id);
    
    // Ranks 201-500 pay $50 each
    // These 3 tie at rank 499, occupying positions 499, 500, 501
    // Prizes: $50 (rank 499) + $50 (rank 500) + $0 (rank 501) = $100
    // Split: $100 / 3 = $33.33 each
    const expectedPayouts = boundaryUsers.map((user, i) => ({
      userId: user.id,
      expectedPayout: 100 / 3, // ~$33.33
      username: `boundary${i}`
    }));
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch at paid/unpaid boundary',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Market Mover with large tie group
   * 5 players tie for 1st place
   * Expected: Split prizes for ranks 1-5 = ($25000 + $15000 + $10000 + $5000 + $5000) / 5
   */
  async testMarketMoverLargeTieGroup() {
    const contest = await this.createTestContest('market');
    
    const users = [];
    const scores = [200, 200, 200, 200, 200, 100, 90, 80, 70, 60]; // 5-way tie at top
    
    for (let i = 0; i < 10; i++) {
      const user = await this.createTestUser(`player${i}`);
      users.push(user);
      await this.createTestEntry(user.id, contest.id, scores[i], { contestType: 'market' });
    }
    
    await this.runSettlement(contest.id);
    
    // Ranks 1-5 combined: $25000 + $15000 + $10000 + $5000 + $5000 = $60000
    // Split 5 ways = $12000 each
    const tiedPayout = (25000 + 15000 + 10000 + 5000 + 5000) / 5;
    
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: tiedPayout, username: 'player0' },
      { userId: users[1].id, expectedPayout: tiedPayout, username: 'player1' },
      { userId: users[2].id, expectedPayout: tiedPayout, username: 'player2' },
      { userId: users[3].id, expectedPayout: tiedPayout, username: 'player3' },
      { userId: users[4].id, expectedPayout: tiedPayout, username: 'player4' },
      { userId: users[5].id, expectedPayout: 1000, username: 'player5' }, // Rank 6
      { userId: users[6].id, expectedPayout: 1000, username: 'player6' },
      { userId: users[7].id, expectedPayout: 1000, username: 'player7' },
      { userId: users[8].id, expectedPayout: 1000, username: 'player8' },
      { userId: users[9].id, expectedPayout: 1000, username: 'player9' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  // ==================== EDGE CASE TESTS ====================

  /**
   * Test: Single entry contest
   * Only 1 player entered
   * Expected: That player gets the full prize pool
   */
  async testSingleEntry() {
    const contest = await this.createTestContest('cash', { max_entries: 5 });
    const user = await this.createTestUser('solo');
    
    await this.createTestEntry(user.id, contest.id, 100);
    
    await this.runSettlement(contest.id);
    
    const expectedPayouts = [
      { userId: user.id, expectedPayout: 24, username: 'solo' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  /**
   * Test: Decimal score precision
   * Scores with many decimal places
   * Expected: Correct ranking despite floating point issues
   */
  async testDecimalPrecision() {
    const contest = await this.createTestContest('cash');
    const users = await Promise.all([
      this.createTestUser('alice'),
      this.createTestUser('bob'),
      this.createTestUser('carol'),
      this.createTestUser('dave'),
      this.createTestUser('eve')
    ]);
    
    // Very close scores that might cause floating point issues
    const scores = [100.123456789, 100.123456788, 100.123456787, 100.12, 100.11];
    
    for (let i = 0; i < users.length; i++) {
      await this.createTestEntry(users[i].id, contest.id, scores[i]);
    }
    
    await this.runSettlement(contest.id);
    
    // First score is highest (barely)
    const expectedPayouts = [
      { userId: users[0].id, expectedPayout: 24, username: 'alice' },
      { userId: users[1].id, expectedPayout: 0, username: 'bob' },
      { userId: users[2].id, expectedPayout: 0, username: 'carol' },
      { userId: users[3].id, expectedPayout: 0, username: 'dave' },
      { userId: users[4].id, expectedPayout: 0, username: 'eve' }
    ];
    
    const verification = await this.verifyPayouts(expectedPayouts);
    
    return {
      passed: verification.passed,
      reason: verification.passed ? null : 'Payout mismatch - possible floating point issue',
      details: verification.errors.length > 0 ? verification.errors : null
    };
  }

  // ==================== SCENARIO BUILDER ====================

  /**
   * Run a custom test scenario
   * Allows external code to define test cases
   */
  async runCustomScenario(scenario) {
    const { name, contestType, contestOptions, entries, expectedPayouts } = scenario;
    
    console.log(`\n🔬 CUSTOM TEST: ${name}`);
    
    try {
      // Create contest
      const contest = await this.createTestContest(contestType, contestOptions);
      
      // Create users and entries
      const users = [];
      for (const entry of entries) {
        const user = await this.createTestUser(entry.username);
        users.push(user);
        await this.createTestEntry(user.id, contest.id, entry.score, {
          contestType,
          enteredAt: entry.enteredAt
        });
      }
      
      // Run settlement
      await this.runSettlement(contest.id);
      
      // Build expected payouts with created user IDs
      const expectedWithIds = expectedPayouts.map((exp, i) => ({
        userId: users[i].id,
        expectedPayout: exp.payout,
        username: entries[i].username
      }));
      
      // Verify
      const verification = await this.verifyPayouts(expectedWithIds);
      
      // Cleanup
      await this.cleanup();
      
      return {
        name,
        passed: verification.passed,
        reason: verification.passed ? null : 'Payout mismatch',
        details: verification.errors.length > 0 ? verification.errors : null
      };
      
    } catch (error) {
      await this.cleanup();
      return {
        name,
        passed: false,
        reason: `Exception: ${error.message}`,
        error: error.stack
      };
    }
  }
}

module.exports = SettlementTestService;