// backend/src/utils/dataInitializer.js
const db = require('../models');
const { generatePlayerBoard } = require('./gameLogic');
const { Op } = require('sequelize');

async function ensureInitialData() {
  try {
    console.log('Checking initial data...');

    // Check if we have any contests
    const contestCount = await db.Contest.count();
    
    if (contestCount === 0) {
      console.log('No contests found. Creating initial cash game...');
      await createInitialContests();
    } else {
      console.log(`Found ${contestCount} existing contests`);
      
      // Only ensure we have an open cash game (tournaments are admin-launched only)
      await ensureCashGame();
    }

    // Clean up any orphaned entries
    await cleanupOrphanedEntries();
    
    // Clean up deprecated bash contests
    await cleanupDeprecatedContests();

  } catch (error) {
    console.error('Error ensuring initial data:', error);
    throw error;
  }
}

async function createInitialContests() {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Create Cash Game ONLY - tournaments are admin-launched
    const cashGame = await db.Contest.create({
      type: 'cash',
      name: 'Cash Game #1',
      status: 'open',
      entry_fee: 5.00,
      prize_pool: 24.00,
      max_entries: 5,
      current_entries: 0,
      max_entries_per_user: 1,
      player_board: generatePlayerBoard(),
      start_time: new Date(),
      end_time: new Date(Date.now() + 7200000), // 2 hours from now
      scoring_type: 'standard',
      max_salary: 15,
      prizes: [24]
    }, { transaction });

    console.log('✅ Created Cash Game #1');

    // NOTE: Market Mover, Daily Bash, and Firesale are NOT auto-created
    // These tournaments must be launched by an admin with guaranteed prize pools
    console.log('ℹ️ Tournament contests (Market Mover, Firesale) must be created by admin');

    await transaction.commit();
    console.log('✅ Initial contests created successfully');

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating initial contests:', error);
    throw error;
  }
}

// Only ensure cash games exist - tournaments are admin-only
async function ensureCashGame() {
  try {
    // Check for open cash game
    const openCashGame = await db.Contest.findOne({
      where: {
        type: 'cash',
        status: 'open'
      }
    });

    if (!openCashGame) {
      console.log('No open cash game found. Creating one...');
      
      // Find highest cash game number
      const cashGames = await db.Contest.findAll({
        where: {
          type: 'cash',
          name: { [Op.like]: 'Cash Game #%' }
        },
        attributes: ['name']
      });

      let maxNumber = 0;
      cashGames.forEach(game => {
        const match = game.name.match(/Cash Game #(\d+)/);
        if (match) {
          maxNumber = Math.max(maxNumber, parseInt(match[1]));
        }
      });

      await db.Contest.create({
        type: 'cash',
        name: `Cash Game #${maxNumber + 1}`,
        status: 'open',
        entry_fee: 5.00,
        prize_pool: 24.00,
        max_entries: 5,
        current_entries: 0,
        max_entries_per_user: 1,
        player_board: generatePlayerBoard(),
        start_time: new Date(),
        end_time: new Date(Date.now() + 7200000),
        scoring_type: 'standard',
        max_salary: 15,
        prizes: [24]
      });

      console.log(`✅ Created Cash Game #${maxNumber + 1}`);
    }

    // NOTE: We do NOT auto-create Market Mover, Daily Bash, or Firesale
    // These are tournament contests that require admin launch with guaranteed prizes

  } catch (error) {
    console.error('Error ensuring cash game:', error);
    throw error;
  }
}

// Clean up deprecated contest types (Daily Bash)
async function cleanupDeprecatedContests() {
  try {
    // Delete any 'bash' type contests - they are deprecated
    const deletedBash = await db.Contest.destroy({
      where: {
        type: 'bash'
      }
    });

    if (deletedBash > 0) {
      console.log(`🗑️ Cleaned up ${deletedBash} deprecated Daily Bash contest(s)`);
    }

  } catch (error) {
    console.error('Error cleaning up deprecated contests:', error);
    // Don't throw - this is just cleanup
  }
}

async function cleanupOrphanedEntries() {
  try {
    // Find entries for non-existent contests
    const orphanedEntries = await db.ContestEntry.findAll({
      include: [{
        model: db.Contest,
        required: false
      }],
      where: {
        '$Contest.id$': null
      }
    });

    if (orphanedEntries.length > 0) {
      console.log(`Found ${orphanedEntries.length} orphaned entries. Cleaning up...`);
      
      for (const entry of orphanedEntries) {
        await entry.destroy();
      }
      
      console.log('✅ Cleaned up orphaned entries');
    }

    // Reset contest entry counts
    const contests = await db.Contest.findAll();
    
    for (const contest of contests) {
      const actualCount = await db.ContestEntry.count({
        where: {
          contest_id: contest.id,
          status: { [Op.notIn]: ['cancelled'] }
        }
      });

      if (contest.current_entries !== actualCount) {
        console.log(`Fixing entry count for ${contest.name}: ${contest.current_entries} -> ${actualCount}`);
        await contest.update({ current_entries: actualCount });
      }
    }

  } catch (error) {
    console.error('Error cleaning up orphaned entries:', error);
    // Don't throw - this is just cleanup
  }
}

// Create test users for development
async function createTestUsers() {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  try {
    const testUsers = [
      {
        username: 'testuser1',
        email: 'test1@example.com',
        password: 'password123',
        balance: 100.00,
        tickets: 10
      },
      {
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'password123',
        balance: 100.00,
        tickets: 10
      }
    ];

    for (const userData of testUsers) {
      const existingUser = await db.User.findOne({
        where: { email: userData.email }
      });

      if (!existingUser) {
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        await db.User.create({
          ...userData,
          password: hashedPassword
        });

        console.log(`✅ Created test user: ${userData.username}`);
      }
    }

  } catch (error) {
    console.error('Error creating test users:', error);
    // Don't throw - test users are optional
  }
}

// ============================================================
// ADMIN FUNCTIONS - For launching tournament contests
// ============================================================

/**
 * Create a Market Mover tournament (admin only)
 * @param {Object} options - Tournament configuration
 * @param {number} options.entryFee - Entry fee (default: 25)
 * @param {number} options.prizePool - Guaranteed prize pool (default: 120000)
 * @param {number} options.maxEntries - Max entries (default: 5000)
 */
async function createMarketMoverTournament(options = {}) {
  const {
    entryFee = 25,
    prizePool = 120000,
    maxEntries = 5000,
    maxEntriesPerUser = 150
  } = options;

  try {
    // Check if there's already an open Market Mover
    const existing = await db.Contest.findOne({
      where: {
        type: 'market',
        status: 'open'
      }
    });

    if (existing) {
      console.log('⚠️ An open Market Mover tournament already exists');
      return existing;
    }

    const tournament = await db.Contest.create({
      type: 'market',
      name: 'Market Mover',
      status: 'open',
      entry_fee: entryFee,
      prize_pool: prizePool,
      max_entries: maxEntries,
      current_entries: 0,
      max_entries_per_user: maxEntriesPerUser,
      player_board: null, // Each room gets unique board with FIRE SALE modifiers
      start_time: new Date(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
      scoring_type: 'standard',
      max_salary: 15
    });

    console.log(`✅ Created Market Mover tournament with $${prizePool.toLocaleString()} prize pool`);
    return tournament;

  } catch (error) {
    console.error('Error creating Market Mover tournament:', error);
    throw error;
  }
}

/**
 * Create a Firesale tournament (admin only)
 * @param {Object} options - Tournament configuration
 */
async function createFiresaleTournament(options = {}) {
  const {
    entryFee = 50,
    prizePool = 250000,
    maxEntries = 10000,
    maxEntriesPerUser = 150
  } = options;

  try {
    const existing = await db.Contest.findOne({
      where: {
        type: 'firesale',
        status: 'open'
      }
    });

    if (existing) {
      console.log('⚠️ An open Firesale tournament already exists');
      return existing;
    }

    const tournament = await db.Contest.create({
      type: 'firesale',
      name: 'Trading Floor Firesale',
      status: 'open',
      entry_fee: entryFee,
      prize_pool: prizePool,
      max_entries: maxEntries,
      current_entries: 0,
      max_entries_per_user: maxEntriesPerUser,
      player_board: generatePlayerBoard(),
      start_time: new Date(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      scoring_type: 'standard',
      max_salary: 15
    });

    console.log(`✅ Created Firesale tournament with $${prizePool.toLocaleString()} prize pool`);
    return tournament;

  } catch (error) {
    console.error('Error creating Firesale tournament:', error);
    throw error;
  }
}

module.exports = {
  ensureInitialData,
  createInitialContests,
  ensureCashGame,
  cleanupOrphanedEntries,
  cleanupDeprecatedContests,
  createTestUsers,
  // Admin functions
  createMarketMoverTournament,
  createFiresaleTournament
};