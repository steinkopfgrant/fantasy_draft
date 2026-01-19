#!/usr/bin/env node
// backend/src/scripts/runSettlementTests.js
// 
// Run settlement tests from command line:
//   node src/scripts/runSettlementTests.js
//   node src/scripts/runSettlementTests.js --test cash-clear-winner
//   node src/scripts/runSettlementTests.js --category cash
//

require('dotenv').config();

const db = require('../models');

async function main() {
  console.log('🔧 Initializing test environment...\n');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const testArg = args.find(a => a.startsWith('--test='))?.split('=')[1];
  const categoryArg = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const helpArg = args.includes('--help') || args.includes('-h');
  
  if (helpArg) {
    console.log(`
Settlement Test Runner

Usage:
  node src/scripts/runSettlementTests.js [options]

Options:
  --test=<n>       Run a single test by name
  --category=<cat>    Run all tests in a category (cash, market, edge)
  --help, -h          Show this help

Available tests:
  cash-clear-winner       Cash game with clear winner
  cash-two-way-tie        Cash game with 2-way tie
  cash-three-way-tie      Cash game with 3-way tie  
  cash-everyone-ties      Cash game where everyone ties
  cash-zero-scores        Cash game with zero scores
  cash-negative-scores    Cash game with negative scores
  market-top-3-clear      Market Mover with clear top 3
  market-tie-at-1st       Market Mover with tie at 1st
  market-tie-at-boundary  Market Mover tie at paid/unpaid boundary
  market-large-tie-group  Market Mover with 5-way tie at top
  single-entry            Single entry contest
  decimal-precision       Decimal score precision edge case

Categories:
  cash    All cash game tests
  market  All Market Mover tests
  edge    Edge case tests
`);
    process.exit(0);
  }
  
  try {
    // Wait for database connection
    await db.sequelize.authenticate();
    console.log('✅ Database connected\n');
    
    // Initialize services
    const PayoutService = require('../services/PayoutService');
    const ScoringService = require('../services/ScoringService');
    const { SettlementService } = require('../services/settlement');
    const SettlementTestService = require('../services/testing/SettlementTestService');
    
    const payoutService = new PayoutService(db, db.sequelize);
    const scoringService = new ScoringService(db);
    const settlementService = new SettlementService(db, db.sequelize, payoutService);
    
    const testService = new SettlementTestService(
      db,
      db.sequelize,
      settlementService,
      scoringService
    );
    
    let results;
    
    if (testArg) {
      // Run single test
      console.log(`Running single test: ${testArg}\n`);
      
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
      
      const testFn = testMap[testArg];
      if (!testFn) {
        console.error(`❌ Unknown test: ${testArg}`);
        console.log('Available tests:', Object.keys(testMap).join(', '));
        process.exit(1);
      }
      
      const result = await testFn();
      await testService.cleanup();
      
      results = {
        passed: result.passed ? 1 : 0,
        failed: result.passed ? 0 : 1,
        tests: [{ name: testArg, ...result }]
      };
      
    } else if (categoryArg) {
      // Run tests by category
      console.log(`Running ${categoryArg} category tests\n`);
      
      const categoryTests = {
        cash: [
          { name: 'Cash Game - Clear Winner', fn: () => testService.testCashGameClearWinner() },
          { name: 'Cash Game - 2-Way Tie', fn: () => testService.testCashGameTwoWayTie() },
          { name: 'Cash Game - 3-Way Tie', fn: () => testService.testCashGameThreeWayTie() },
          { name: 'Cash Game - Everyone Ties', fn: () => testService.testCashGameEveryoneTies() },
          { name: 'Cash Game - Zero Scores', fn: () => testService.testCashGameZeroScores() },
          { name: 'Cash Game - Negative Scores', fn: () => testService.testCashGameNegativeScores() }
        ],
        market: [
          { name: 'Market Mover - Top 3 Clear', fn: () => testService.testMarketMoverTop3Clear() },
          { name: 'Market Mover - Tie at 1st', fn: () => testService.testMarketMoverTieAt1st() },
          { name: 'Market Mover - Tie at Boundary', fn: () => testService.testMarketMoverTieAtBoundary() },
          { name: 'Market Mover - Large Tie Group', fn: () => testService.testMarketMoverLargeTieGroup() }
        ],
        edge: [
          { name: 'Single Entry', fn: () => testService.testSingleEntry() },
          { name: 'Decimal Precision', fn: () => testService.testDecimalPrecision() }
        ]
      };
      
      const tests = categoryTests[categoryArg];
      if (!tests) {
        console.error(`❌ Unknown category: ${categoryArg}`);
        console.log('Available categories:', Object.keys(categoryTests).join(', '));
        process.exit(1);
      }
      
      results = { passed: 0, failed: 0, tests: [] };
      
      for (const test of tests) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`🔬 TEST: ${test.name}`);
        console.log('─'.repeat(60));
        
        try {
          const result = await test.fn();
          await testService.cleanup();
          
          if (result.passed) {
            console.log('✅ PASSED');
            results.passed++;
          } else {
            console.log(`❌ FAILED: ${result.reason}`);
            if (result.details) {
              console.log('   Details:', JSON.stringify(result.details, null, 2));
            }
            results.failed++;
          }
          
          results.tests.push({ name: test.name, ...result });
          
        } catch (error) {
          console.log(`❌ ERROR: ${error.message}`);
          results.failed++;
          results.tests.push({ name: test.name, passed: false, reason: error.message });
          await testService.cleanup();
        }
      }
      
    } else {
      // Run all tests
      results = await testService.runAllTests();
    }
    
    // Exit with appropriate code
    console.log('\n' + '='.repeat(70));
    if (results.failed === 0) {
      console.log('🎉 ALL TESTS PASSED!');
      process.exit(0);
    } else {
      console.log(`⚠️  ${results.failed} TEST(S) FAILED`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();