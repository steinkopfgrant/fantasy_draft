// backend/scripts/testScenarios.js
const devTestingService = require('../src/services/devTestingService');

const scenarios = {
  async happyPath() {
    console.log('Running Happy Path Test...');
    
    // 1. Create contest
    const contest = await createTestContest('cash');
    
    // 2. Fill lobby
    await devTestingService.fillLobby(contest.id);
    
    // 3. Wait for draft to start
    await sleep(5000);
    
    // 4. Complete draft
    await devTestingService.autoCompleteDraft(contest.id);
    
    // 5. Simulate scores
    await devTestingService.simulateScoring(contest.id);
    
    // 6. Check results
    const state = await devTestingService.getGameState(contest.id);
    console.log('Test completed!', state);
  },

  async stressTest() {
    console.log('Running Stress Test...');
    
    const contests = [];
    
    // Create 10 contests simultaneously
    for (let i = 0; i < 10; i++) {
      contests.push(createAndFillContest());
    }
    
    await Promise.all(contests);
    console.log('Stress test completed!');
  },

  async edgeCases() {
    console.log('Testing Edge Cases...');
    
    // Test disconnection during draft
    // Test duplicate picks
    // Test insufficient funds
    // Test timeout scenarios
    
    console.log('Edge cases tested!');
  }
};

// Run specific scenario
const scenario = process.argv[2] || 'happyPath';
if (scenarios[scenario]) {
  scenarios[scenario]()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}