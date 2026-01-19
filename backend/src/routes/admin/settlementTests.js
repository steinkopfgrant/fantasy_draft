// backend/src/routes/admin/settlementTests.js
const express = require('express');
const router = express.Router();

let testService = null;

const initializeRouter = (services) => {
  const SettlementTestService = require('../../services/testing/SettlementTestService');
  const db = require('../../models');
  
  testService = new SettlementTestService(
    db,
    db.sequelize,
    services.settlementService,
    services.scoringService
  );
  
  return router;
};

// Simple admin check middleware
const checkAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const db = require('../../models');
    const user = await db.User.findByPk(decoded.id || decoded.userId);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    
    if (!user.is_admin && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

router.use(checkAdmin);

/**
 * GET /api/admin/settlement-tests/status
 * Check if test service is initialized
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    initialized: !!testService,
    message: testService ? 'Test service ready' : 'Test service not initialized'
  });
});

/**
 * POST /api/admin/settlement-tests/run-all
 * Run all settlement tests
 */
router.post('/run-all', async (req, res) => {
  if (!testService) {
    return res.status(500).json({ success: false, error: 'Test service not initialized' });
  }
  
  console.log(`\n🧪 Admin ${req.user.username} initiated full settlement test suite`);
  
  try {
    const results = await testService.runAllTests();
    
    res.json({
      success: true,
      summary: {
        passed: results.passed,
        failed: results.failed,
        total: results.tests.length
      },
      tests: results.tests
    });
  } catch (error) {
    console.error('Test suite error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement-tests/run-single
 * Run a single named test
 */
router.post('/run-single', async (req, res) => {
  if (!testService) {
    return res.status(500).json({ success: false, error: 'Test service not initialized' });
  }
  
  const { testName } = req.body;
  if (!testName) {
    return res.status(400).json({ success: false, error: 'testName required' });
  }
  
  const testMap = {
    'cash-clear-winner': () => testService.testCashGameClearWinner(),
    'cash-two-way-tie': () => testService.testCashGameTwoWayTie(),
    'cash-three-way-tie': () => testService.testCashGameThreeWayTie(),
    'cash-everyone-ties': () => testService.testCashGameEveryoneTies(),
    'cash-zero-scores': () => testService.testCashGameZeroScores(),
    'cash-negative-scores': () => testService.testCashGameNegativeScores(),
    'market-top-3-clear': () => testService.testMarketMoverTop3Clear(),
    'market-tie-at-1st': () => testService.testMarketMoverTieAt1st(),
    'market-tie-at-boundary': () => testService.testMarketMoverTieAtBoundary(),
    'market-large-tie-group': () => testService.testMarketMoverLargeTieGroup(),
    'single-entry': () => testService.testSingleEntry(),
    'decimal-precision': () => testService.testDecimalPrecision()
  };
  
  const testFn = testMap[testName];
  if (!testFn) {
    return res.status(400).json({
      success: false,
      error: `Unknown test: ${testName}`,
      availableTests: Object.keys(testMap)
    });
  }
  
  console.log(`\n🧪 Admin ${req.user.username} running test: ${testName}`);
  
  try {
    const result = await testFn();
    await testService.cleanup();
    
    res.json({
      success: true,
      testName,
      result
    });
  } catch (error) {
    await testService.cleanup();
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement-tests/run-custom
 * Run a custom test scenario
 */
router.post('/run-custom', async (req, res) => {
  if (!testService) {
    return res.status(500).json({ success: false, error: 'Test service not initialized' });
  }
  
  const { scenario } = req.body;
  if (!scenario || !scenario.entries || !scenario.expectedPayouts) {
    return res.status(400).json({
      success: false,
      error: 'Invalid scenario. Required: { name, contestType, entries: [{username, score}], expectedPayouts: [{payout}] }'
    });
  }
  
  console.log(`\n🧪 Admin ${req.user.username} running custom test: ${scenario.name}`);
  
  try {
    const result = await testService.runCustomScenario(scenario);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement-tests/available
 * List available tests
 */
router.get('/available', (req, res) => {
  res.json({
    success: true,
    tests: [
      { id: 'cash-clear-winner', name: 'Cash Game - Clear Winner', category: 'cash' },
      { id: 'cash-two-way-tie', name: 'Cash Game - 2-Way Tie', category: 'cash' },
      { id: 'cash-three-way-tie', name: 'Cash Game - 3-Way Tie', category: 'cash' },
      { id: 'cash-everyone-ties', name: 'Cash Game - Everyone Ties', category: 'cash' },
      { id: 'cash-zero-scores', name: 'Cash Game - Zero Scores', category: 'cash' },
      { id: 'cash-negative-scores', name: 'Cash Game - Negative Scores', category: 'cash' },
      { id: 'market-top-3-clear', name: 'Market Mover - Top 3 Clear', category: 'market' },
      { id: 'market-tie-at-1st', name: 'Market Mover - Tie at 1st', category: 'market' },
      { id: 'market-tie-at-boundary', name: 'Market Mover - Tie at Paid Boundary', category: 'market' },
      { id: 'market-large-tie-group', name: 'Market Mover - Large Tie Group', category: 'market' },
      { id: 'single-entry', name: 'Edge Case - Single Entry', category: 'edge' },
      { id: 'decimal-precision', name: 'Edge Case - Decimal Precision', category: 'edge' }
    ],
    customScenarioExample: {
      name: 'My Custom Test',
      contestType: 'cash',
      contestOptions: { prize_pool: 24 },
      entries: [
        { username: 'player1', score: 150 },
        { username: 'player2', score: 150 },
        { username: 'player3', score: 100 },
        { username: 'player4', score: 90 },
        { username: 'player5', score: 80 }
      ],
      expectedPayouts: [
        { payout: 12 },
        { payout: 12 },
        { payout: 0 },
        { payout: 0 },
        { payout: 0 }
      ]
    }
  });
});

module.exports = { router, initializeRouter };