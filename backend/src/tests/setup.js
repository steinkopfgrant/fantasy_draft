// backend/src/tests/setup.js
const db = require('../models');

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});

afterAll(async () => {
  await db.sequelize.close();
});

// backend/src/tests/services/contestService.test.js
const contestService = require('../../services/contestService');
const userService = require('../../services/userService');
const db = require('../../models');

describe('ContestService', () => {
  let testUser;
  let testContest;

  beforeEach(async () => {
    // Create test user
    testUser = await userService.createUser('testuser', 'test@example.com', 'password123');
    
    // Create test contest
    testContest = await db.Contest.create({
      type: 'cash',
      name: 'Test Cash Game',
      entry_fee: 5,
      prize_pool: 25,
      max_entries: 5,
      max_entries_per_user: 1,
      player_board: {},
      start_time: new Date()
    });
  });

  describe('enterContest', () => {
    it('should create entry and deduct balance', async () => {
      const entry = await contestService.enterContest(
        testContest.id,
        testUser.id,
        testUser.username
      );

      expect(entry).toBeDefined();
      expect(entry.userId).toBe(testUser.id);
      
      // Check balance was deducted
      const updatedBalance = await userService.getBalance(testUser.id);
      expect(updatedBalance).toBe(995); // 1000 - 5
    });

    it('should prevent entry with insufficient balance', async () => {
      // Set balance to less than entry fee
      await userService.updateBalance(testUser.id, -996);

      await expect(
        contestService.enterContest(testContest.id, testUser.id, testUser.username)
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('completeDraft', () => {
    it('should save draft results', async () => {
      const entry = await contestService.enterContest(
        testContest.id,
        testUser.id,
        testUser.username
      );

      const roster = {
        QB: { name: 'Josh Allen', team: 'BUF', position: 'QB', price: 5 },
        RB: { name: 'Saquon Barkley', team: 'PHI', position: 'RB', price: 4 },
        WR: { name: 'Justin Jefferson', team: 'MIN', position: 'WR', price: 3 },
        TE: { name: 'Travis Kelce', team: 'KC', position: 'TE', price: 2 },
        FLEX: { name: 'Tyreek Hill', team: 'MIA', position: 'WR', price: 1 }
      };

      await contestService.completeDraft(entry.id, roster, 15);

      const completedEntry = await contestService.getContestEntry(entry.id);
      expect(completedEntry.status).toBe('completed');
      expect(completedEntry.roster).toEqual(roster);
      expect(completedEntry.lineup).toHaveLength(5);
    });
  });
});