// backend/src/scripts/fix-contests.js
const db = require('../models');
const { Contest, ContestEntry } = db;
const { generatePlayerBoard } = require('../utils/gameLogic');

async function fixContests() {
  try {
    console.log('🔧 Starting Contest Fix...\n');

    // Connect to database
    await db.sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // 1. Delete all existing contests (optional - uncomment if needed)
    // console.log('🗑️  Deleting all existing contests...');
    // await ContestEntry.destroy({ where: {} });
    // await Contest.destroy({ where: {} });
    // console.log('✅ All contests deleted\n');

    // 2. Create fresh contests
    console.log('📝 Creating/Updating contests...\n');

    const contestsData = [
      {
        name: 'Cash Game #1',
        type: 'cash',
        status: 'open',
        entry_fee: 5,
        max_entries: 5,
        current_entries: 0,
        prize_pool: 25,
        prizes: [25],
        max_entries_per_user: 1,
        scoring_type: 'standard'
      },
      {
        name: 'Daily Bash',
        type: 'bash',
        status: 'open',
        entry_fee: 0,
        max_entries: 10000,
        current_entries: 0,
        prize_pool: 50000,
        prizes: [15000, 10000, 7500, 5000, 3500, 2500, 2000, 1500, 1000, 500],
        max_entries_per_user: 150,
        scoring_type: 'standard'
      },
      {
        name: 'Market Mover',
        type: 'market',
        status: 'open',
        entry_fee: 0,
        max_entries: 100000,
        current_entries: 0,
        prize_pool: 1000000,
        prizes: [300000, 200000, 150000, 100000, 75000, 50000, 40000, 30000, 20000, 10000],
        max_entries_per_user: 150,
        scoring_type: 'ownership'
      },
      {
        name: 'Trading Floor Firesale',
        type: 'firesale',
        status: 'open',
        entry_fee: 0,
        max_entries: 10000,
        current_entries: 0,
        prize_pool: 250000,
        prizes: [75000, 50000, 37500, 25000, 17500, 12500, 10000, 7500, 5000, 2500],
        max_entries_per_user: 150,
        scoring_type: 'firesale'
      }
    ];

    for (const contestData of contestsData) {
      try {
        // Check if contest exists
        const existing = await Contest.findOne({ 
          where: { type: contestData.type } 
        });

        const board = generatePlayerBoard(contestData.type);
        
        if (existing) {
          // Update existing contest
          await existing.update({
            ...contestData,
            player_board: board,
            start_time: new Date(),
            updated_at: new Date()
          });
          console.log(`✅ Updated ${contestData.name}`);
        } else {
          // Create new contest
          await Contest.create({
            ...contestData,
            player_board: board,
            start_time: new Date(),
            created_at: new Date(),
            updated_at: new Date()
          });
          console.log(`✅ Created ${contestData.name}`);
        }
      } catch (error) {
        console.error(`❌ Error with ${contestData.name}:`, error.message);
      }
    }

    // 3. Verify contests
    console.log('\n📊 Verifying contests...');
    const allContests = await Contest.findAll({
      attributes: ['id', 'name', 'type', 'status', 'current_entries', 'max_entries']
    });

    console.log(`\nTotal contests: ${allContests.length}`);
    allContests.forEach(c => {
      console.log(`- ${c.name}: ${c.status} (${c.current_entries}/${c.max_entries})`);
    });

    console.log('\n✅ Contest fix complete!');
    console.log('\n💡 Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Refresh your frontend');
    console.log('3. Check the lobby for contests');

  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await db.sequelize.close();
  }
}

// Add command line option to force reset
const forceReset = process.argv.includes('--force');

if (forceReset) {
  console.log('⚠️  FORCE RESET MODE - This will delete all contests and entries!\n');
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Are you sure? Type "YES" to continue: ', async (answer) => {
    if (answer === 'YES') {
      // Delete all contests first
      try {
        await db.sequelize.authenticate();
        await ContestEntry.destroy({ where: {}, force: true });
        await Contest.destroy({ where: {}, force: true });
        console.log('✅ All contests deleted');
      } catch (error) {
        console.error('Error deleting contests:', error);
      }
      rl.close();
      await fixContests();
    } else {
      console.log('❌ Reset cancelled');
      rl.close();
      process.exit(0);
    }
  });
} else {
  fixContests();
}