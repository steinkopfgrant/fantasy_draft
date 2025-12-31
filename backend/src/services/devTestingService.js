// backend/src/services/devTestingService.js
const db = require('../models');
const contestService = require('./contestService');
const draftService = require('./draftService');
const Redis = require('ioredis');

class DevTestingService {
  constructor() {
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { keyPrefix: 'ffsale:' });
    } else {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        keyPrefix: 'ffsale:'
      });
    }
    this.testUsers = [];
    this.activeTestRooms = new Map();
  }

  // Create test users with predictable credentials
  async createTestUsers(count = 8) {
    const users = [];
    for (let i = 1; i <= count; i++) {
      try {
        const user = await db.User.findOrCreate({
          where: { username: `testuser${i}` },
          defaults: {
            email: `test${i}@test.com`,
            password: 'test123',
            balance: 10000,
            tickets: 100
          }
        });
        users.push(user[0]);
      } catch (error) {
        console.log(`Test user ${i} already exists`);
      }
    }
    this.testUsers = users;
    return users;
  }

  // Instant lobby fill with test users
  async fillLobby(contestId, realUserId = null) {
    const testUsers = await this.createTestUsers(4);
    const results = [];
    
    // Add real user first if provided
    if (realUserId) {
      const entry = await contestService.enterContest(
        contestId, 
        realUserId, 
        'RealPlayer'
      );
      results.push(entry);
    }
    
    // Fill with test users
    for (let i = 0; i < (realUserId ? 4 : 5); i++) {
      if (i < testUsers.length) {
        const entry = await contestService.enterContest(
          contestId,
          testUsers[i].id,
          testUsers[i].username
        );
        results.push(entry);
        
        // Small delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  // Auto-complete draft with strategic picks
  async autoCompleteDraft(roomId, options = {}) {
    const {
      strategy = 'balanced', // 'balanced', 'value', 'stars', 'random'
      timePerPick = 100,
      leaveOneForUser = false
    } = options;

    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) throw new Error('Room not found');

    const draft = await draftService.getDraft(roomId);
    if (!draft) throw new Error('Draft not started');

    // Simulate picks based on strategy
    while (draft.status === 'active' && draft.currentTurn < draft.draftOrder.length) {
      // Skip user's turns if requested
      const currentPlayerIndex = draft.draftOrder[draft.currentTurn];
      if (leaveOneForUser && currentPlayerIndex === 0) {
        console.log('Skipping user turn for manual testing');
        break;
      }

      // Pick based on strategy
      const pick = this.selectPlayerByStrategy(
        draft.playerBoard, 
        strategy,
        draft.teams[currentPlayerIndex]
      );

      if (pick) {
        await contestService.handlePlayerPick(
          roomId,
          draft.teams[currentPlayerIndex].userId,
          pick.player,
          pick.position
        );
      }

      await new Promise(resolve => setTimeout(resolve, timePerPick));
    }

    return draft;
  }

  // Generate mock scoring data
  async simulateScoring(contestId, options = {}) {
    const {
      randomize = true,
      winnerIndex = null,
      scoreRange = [50, 150]
    } = options;

    const entries = await db.ContestEntry.findAll({
      where: { contest_id: contestId, status: 'completed' }
    });

    const scores = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      let score;
      
      if (winnerIndex !== null && i === winnerIndex) {
        score = scoreRange[1]; // Ensure winner has high score
      } else if (randomize) {
        score = Math.random() * (scoreRange[1] - scoreRange[0]) + scoreRange[0];
      } else {
        score = scoreRange[1] - (i * 10); // Descending scores
      }

      await entry.update({
        total_points: score,
        final_rank: null // Will calculate after all scores
      });

      scores.push({ entryId: entry.id, score });
    }

    // Calculate ranks
    scores.sort((a, b) => b.score - a.score);
    for (let i = 0; i < scores.length; i++) {
      await db.ContestEntry.update(
        { final_rank: i + 1 },
        { where: { id: scores[i].entryId } }
      );
    }

    return scores;
  }

  // Time travel - manipulate game state timing
  async timeTravel(contestId, target = 'draft_end') {
    const targets = {
      'draft_start': -300000,  // 5 min before
      'draft_end': 0,          // Now
      'game_start': 3600000,   // 1 hour later
      'game_end': 14400000     // 4 hours later
    };

    const offset = targets[target] || 0;
    const newTime = new Date(Date.now() + offset);

    await db.Contest.update(
      { 
        end_time: target === 'game_end' ? newTime : undefined,
        start_time: target === 'game_start' ? newTime : undefined 
      },
      { where: { id: contestId } }
    );

    return newTime;
  }

  // Get comprehensive game state
  async getGameState(identifier) {
    const state = {
      contest: null,
      entries: [],
      draftState: null,
      redisData: {},
      socketRooms: [],
      errors: []
    };

    try {
      // Check if identifier is contestId or roomId
      state.contest = await db.Contest.findByPk(identifier);
      
      if (!state.contest) {
        // Try finding by room ID
        const entry = await db.ContestEntry.findOne({
          where: { draft_room_id: identifier }
        });
        if (entry) {
          state.contest = await db.Contest.findByPk(entry.contest_id);
        }
      }

      if (state.contest) {
        state.entries = await db.ContestEntry.findAll({
          where: { contest_id: state.contest.id },
          include: [db.User]
        });
      }

      // Get Redis draft state
      const draftKey = `draft:state:${identifier}`;
      const draftData = await this.redis.get(draftKey.replace('ffsale:', ''));
      if (draftData) {
        state.draftState = JSON.parse(draftData);
      }

      // Get all related Redis keys
      const pattern = `*${identifier}*`;
      const keys = await this.redis.keys(pattern);
      for (const key of keys) {
        const value = await this.redis.get(key.replace('ffsale:', ''));
        state.redisData[key] = value;
      }

    } catch (error) {
      state.errors.push(error.message);
    }

    return state;
  }

  // Reset everything for clean testing
  async resetTestEnvironment() {
    // Clear test user entries
    for (const user of this.testUsers) {
      await db.ContestEntry.destroy({
        where: { user_id: user.id }
      });
      
      // Reset balance and tickets
      await user.update({
        balance: 10000,
        tickets: 100
      });
    }

    // Clear Redis test data
    const keys = await this.redis.keys('test:*');
    for (const key of keys) {
      await this.redis.del(key.replace('ffsale:', ''));
    }

    return { success: true, message: 'Test environment reset' };
  }

  // Helper to select players by strategy
  selectPlayerByStrategy(board, strategy, team) {
    const available = [];
    
    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        const player = board[row][col];
        if (!player.drafted && player.price <= team.budget) {
          available.push({ ...player, row, col });
        }
      }
    }

    if (available.length === 0) return null;

    let selected;
    switch (strategy) {
      case 'value':
        // Pick cheapest first
        selected = available.sort((a, b) => a.price - b.price)[0];
        break;
      case 'stars':
        // Pick most expensive affordable
        selected = available.sort((a, b) => b.price - a.price)[0];
        break;
      case 'random':
        selected = available[Math.floor(Math.random() * available.length)];
        break;
      case 'balanced':
      default:
        // Pick from middle price range
        available.sort((a, b) => a.price - b.price);
        const midIndex = Math.floor(available.length / 2);
        selected = available[midIndex];
    }

    // Determine roster slot
    const position = this.getAvailableSlot(team.roster, selected);
    
    return {
      player: selected,
      position: { 
        row: selected.row, 
        col: selected.col, 
        slot: position 
      }
    };
  }

  getAvailableSlot(roster, player) {
    const pos = player.position || player.originalPosition;
    
    if (!roster[pos]) return pos;
    
    if (!roster.FLEX && ['RB', 'WR', 'TE'].includes(pos)) {
      return 'FLEX';
    }
    
    return null;
  }
}

module.exports = new DevTestingService();