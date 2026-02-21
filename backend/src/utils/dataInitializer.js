// backend/src/utils/dataInitializer.js
const db = require('../models');
const { generatePlayerBoard } = require('./gameLogic');
const { Op } = require('sequelize');

/**
 * Get the best available player board for a sport.
 * Inherits from the most recent contest with a real board (>10 players).
 * Falls back to generatePlayerBoard only if no good board exists.
 */
async function getBestBoard(sport) {
  try {
    const { sequelize } = db;
    const recent = await db.Contest.findOne({
      where: {
        type: 'cash',
        sport: sport,
        [Op.and]: sequelize.where(
          sequelize.fn('jsonb_array_length', sequelize.col('player_board')),
          { [Op.gt]: 10 }
        )
      },
      order: [['created_at', 'DESC']],
      attributes: ['player_board']
    });

    if (recent && recent.player_board) {
      const board = typeof recent.player_board === 'string'
        ? JSON.parse(recent.player_board)
        : recent.player_board;
      console.log(`📋 Inherited ${board.length}-player board for ${sport.toUpperCase()}`);
      return board;
    }
  } catch (error) {
    console.error(`Error fetching existing board for ${sport}:`, error);
  }

  console.log(`⚠️ No existing board found, generating fresh for ${sport.toUpperCase()}`);
  return generatePlayerBoard(null, [], [], sport);
}

async function ensureInitialData() {
  try {
    console.log('Checking initial data...');

    // Check if we have any contests
    const contestCount = await db.Contest.count();
    
    if (contestCount === 0) {
      console.log('No contests found. Checking for active slates before creating...');
      await createInitialContests();
    } else {
      console.log(`Found ${contestCount} existing contests`);
      
      // Ensure we have open cash games for each sport WITH an active slate
      await ensureCashGame('nfl');
      await ensureCashGame('nba');
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
    // Only create cash games for sports that have an active slate
    const activeSlates = await db.Slate.findAll({
      where: { status: 'active' },
      transaction
    });

    if (activeSlates.length === 0) {
      console.log('🚫 No active slates found — skipping initial contest creation. Create a slate first from the admin panel.');
      await transaction.commit();
      return;
    }

    for (const slate of activeSlates) {
      const sport = slate.sport || 'nfl';
      const namePrefix = sport === 'nfl' ? 'Cash Game' : `${sport.toUpperCase()} Cash Game`;

      // Check if one already exists for this sport
      const existing = await db.Contest.findOne({
        where: { type: 'cash', sport: sport, status: 'open' },
        transaction
      });

      if (existing) {
        console.log(`✅ ${sport.toUpperCase()} already has open cash game: ${existing.name}`);
        continue;
      }

      await db.Contest.create({
        type: 'cash',
        name: `${namePrefix} #1`,
        sport: sport,
        status: 'open',
        slate_id: slate.id,
        entry_fee: 5.00,
        prize_pool: 24.00,
        max_entries: 5,
        current_entries: 0,
        max_entries_per_user: 1,
        player_board: await getBestBoard(sport),
        start_time: new Date(),
        end_time: new Date(Date.now() + 7200000),
        scoring_type: 'standard',
        max_salary: 15,
        prizes: [24]
      }, { transaction });

      console.log(`✅ Created ${namePrefix} #1 → slate ${slate.name}`);
    }

    console.log('ℹ️ Tournament contests (Market Mover, Firesale) must be created by admin');

    await transaction.commit();
    console.log('✅ Initial contests created successfully');

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating initial contests:', error);
    throw error;
  }
}

// Ensure cash games exist for a specific sport — ONLY if an active slate exists
async function ensureCashGame(sport = 'nfl') {
  try {
    const sportLabel = sport.toUpperCase();
    const namePrefix = sport === 'nfl' ? 'Cash Game' : 'NBA Cash Game';
    
    // *** SLATE GATE: No active slate = no contest on lobby ***
    const activeSlate = await db.Slate.findOne({
      where: { sport: sport, status: 'active' }
    });

    if (!activeSlate) {
      console.log(`🚫 No active slate for ${sportLabel} — skipping cash game creation`);
      return;
    }

    // Check for open cash game for this sport
    const openCashGame = await db.Contest.findOne({
      where: {
        type: 'cash',
        sport: sport,
        status: 'open'
      }
    });

    if (!openCashGame) {
      console.log(`No open ${sportLabel} cash game found. Creating one...`);
      
      // Find highest cash game number for this sport
      const cashGames = await db.Contest.findAll({
        where: {
          type: 'cash',
          sport: sport,
          name: { [Op.like]: `${namePrefix} #%` }
        },
        attributes: ['name']
      });

      let maxNumber = 0;
      cashGames.forEach(game => {
        const match = game.name.match(/#(\d+)/);
        if (match) {
          maxNumber = Math.max(maxNumber, parseInt(match[1]));
        }
      });

      await db.Contest.create({
        type: 'cash',
        name: `${namePrefix} #${maxNumber + 1}`,
        sport: sport,
        status: 'open',
        slate_id: activeSlate.id,
        entry_fee: 5.00,
        prize_pool: 24.00,
        max_entries: 5,
        current_entries: 0,
        max_entries_per_user: 1,
        player_board: await getBestBoard(sport),
        start_time: new Date(),
        end_time: new Date(Date.now() + 7200000),
        scoring_type: 'standard',
        max_salary: 15,
        prizes: [24]
      });

      console.log(`✅ Created ${namePrefix} #${maxNumber + 1} → slate ${activeSlate.name}`);
    }

  } catch (error) {
    console.error(`Error ensuring ${sport} cash game:`, error);
    throw error;
  }
}

// Clean up deprecated contest types (Daily Bash)
async function cleanupDeprecatedContests() {
  try {
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
  }
}

async function cleanupOrphanedEntries() {
  try {
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
  }
}

// ============================================================
// ADMIN FUNCTIONS - For launching tournament contests
// ============================================================

/**
 * Create a Market Mover tournament (admin only)
 */
async function createMarketMoverTournament(options = {}) {
  const {
    entryFee = 25,
    prizePool = 120000,
    maxEntries = 5000,
    maxEntriesPerUser = 150,
    sport = 'nfl'
  } = options;

  try {
    const existing = await db.Contest.findOne({
      where: {
        type: 'market',
        sport: sport,
        status: 'open'
      }
    });

    if (existing) {
      console.log(`⚠️ An open ${sport.toUpperCase()} Market Mover tournament already exists`);
      return existing;
    }

    const sportLabel = sport === 'nfl' ? '' : `${sport.toUpperCase()} `;
    
    const tournament = await db.Contest.create({
      type: 'market',
      name: `${sportLabel}Market Mover`,
      sport: sport,
      status: 'open',
      entry_fee: entryFee,
      prize_pool: prizePool,
      max_entries: maxEntries,
      current_entries: 0,
      max_entries_per_user: maxEntriesPerUser,
      player_board: null,
      start_time: new Date(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      scoring_type: 'standard',
      max_salary: 15
    });

    console.log(`✅ Created ${sport.toUpperCase()} Market Mover tournament with $${prizePool.toLocaleString()} prize pool`);
    return tournament;

  } catch (error) {
    console.error('Error creating Market Mover tournament:', error);
    throw error;
  }
}

/**
 * Create a Firesale tournament (admin only)
 */
async function createFiresaleTournament(options = {}) {
  const {
    entryFee = 50,
    prizePool = 250000,
    maxEntries = 10000,
    maxEntriesPerUser = 150,
    sport = 'nfl'
  } = options;

  try {
    const existing = await db.Contest.findOne({
      where: {
        type: 'firesale',
        sport: sport,
        status: 'open'
      }
    });

    if (existing) {
      console.log(`⚠️ An open ${sport.toUpperCase()} Firesale tournament already exists`);
      return existing;
    }

    const sportLabel = sport === 'nfl' ? '' : `${sport.toUpperCase()} `;

    const tournament = await db.Contest.create({
      type: 'firesale',
      name: `${sportLabel}Trading Floor Firesale`,
      sport: sport,
      status: 'open',
      entry_fee: entryFee,
      prize_pool: prizePool,
      max_entries: maxEntries,
      current_entries: 0,
      max_entries_per_user: maxEntriesPerUser,
      player_board: await getBestBoard(sport),
      start_time: new Date(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      scoring_type: 'standard',
      max_salary: 15
    });

    console.log(`✅ Created ${sport.toUpperCase()} Firesale tournament with $${prizePool.toLocaleString()} prize pool`);
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