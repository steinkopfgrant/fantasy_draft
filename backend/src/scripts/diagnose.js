// backend/src/scripts/diagnose.js
const db = require('../models');
const { Contest, ContestEntry, User } = db;
const chalk = require('chalk');

// If chalk isn't installed, use simple console colors
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`)
};

async function diagnoseContests() {
  console.log('🔍 Starting Contest Diagnostics...\n');

  try {
    // 1. Test Database Connection
    log.info('Testing database connection...');
    await db.sequelize.authenticate();
    log.success('Database connection successful!\n');

    // 2. Check if contests table exists
    log.info('Checking if contests table exists...');
    const tables = await db.sequelize.getQueryInterface().showAllTables();
    console.log('Available tables:', tables);
    
    if (!tables.includes('contests')) {
      log.error('Contests table does not exist!');
      log.info('Run migrations: npm run migrate');
      return;
    }
    log.success('Contests table exists!\n');

    // 3. Check contest count
    log.info('Checking contest count...');
    const contestCount = await Contest.count();
    console.log(`Total contests in database: ${contestCount}`);
    
    if (contestCount === 0) {
      log.warning('No contests found in database!');
      log.info('Creating initial contests...');
      await createInitialContests();
    }

    // 4. List all contests
    log.info('\nListing all contests:');
    const contests = await Contest.findAll({
      attributes: ['id', 'name', 'type', 'status', 'current_entries', 'max_entries', 'entry_fee', 'created_at'],
      order: [['created_at', 'DESC']]
    });

    contests.forEach((contest, index) => {
      console.log(`\n${index + 1}. ${contest.name}`);
      console.log(`   ID: ${contest.id}`);
      console.log(`   Type: ${contest.type}`);
      console.log(`   Status: ${contest.status}`);
      console.log(`   Entries: ${contest.current_entries}/${contest.max_entries}`);
      console.log(`   Entry Fee: $${contest.entry_fee}`);
      console.log(`   Created: ${contest.created_at}`);
    });

    // 5. Check for open contests
    log.info('\nChecking for open contests...');
    const openContests = await Contest.count({ where: { status: 'open' } });
    console.log(`Open contests: ${openContests}`);
    
    if (openContests === 0) {
      log.warning('No open contests available!');
      log.info('Opening all contests...');
      await Contest.update({ status: 'open' }, { where: {} });
      log.success('All contests set to open status');
    }

    // 6. Test API endpoint
    log.info('\nTesting API endpoint...');
    try {
      const fetch = require('node-fetch');
      const response = await fetch('http://localhost:5000/api/contests');
      const data = await response.json();
      
      if (response.ok) {
        log.success(`API returned ${data.length} contests`);
      } else {
        log.error('API returned error:', data);
      }
    } catch (error) {
      log.warning('Could not test API endpoint (server may not be running)');
      console.log('Error:', error.message);
    }

    // 7. Check for data integrity issues
    log.info('\nChecking data integrity...');
    
    // Check for contests with invalid current_entries
    const invalidEntries = await Contest.count({
      where: {
        current_entries: {
          [db.Sequelize.Op.lt]: 0
        }
      }
    });
    
    if (invalidEntries > 0) {
      log.warning(`Found ${invalidEntries} contests with negative entries`);
      await Contest.update(
        { current_entries: 0 },
        { where: { current_entries: { [db.Sequelize.Op.lt]: 0 } } }
      );
      log.success('Fixed negative entry counts');
    }

    // 8. Summary
    console.log('\n📊 DIAGNOSTIC SUMMARY:');
    console.log('====================');
    console.log(`✓ Database: Connected`);
    console.log(`✓ Contests table: Exists`);
    console.log(`✓ Total contests: ${contestCount}`);
    console.log(`✓ Open contests: ${openContests}`);
    console.log(`✓ Data integrity: ${invalidEntries === 0 ? 'Good' : 'Fixed'}`);

    console.log('\n💡 RECOMMENDATIONS:');
    if (contestCount === 0) {
      console.log('- Run the server to create initial contests');
    }
    if (openContests === 0) {
      console.log('- All contests are closed, consider opening some');
    }
    console.log('- Make sure the server is running on port 5000');
    console.log('- Check browser console for any frontend errors');
    console.log('- Verify your authentication token is valid');

  } catch (error) {
    log.error('Diagnostic failed with error:');
    console.error(error);
    
    if (error.message.includes('connect')) {
      console.log('\n💡 Connection error - possible causes:');
      console.log('- PostgreSQL is not running');
      console.log('- Database credentials are incorrect');
      console.log('- Database does not exist');
    }
  } finally {
    await db.sequelize.close();
    console.log('\n✅ Diagnostic complete');
  }
}

async function createInitialContests() {
  const { generatePlayerBoard } = require('../utils/gameLogic');
  
  const contests = [
    {
      name: 'Cash Game #1',
      type: 'cash',
      status: 'open',
      entry_fee: 5,
      max_entries: 5,
      current_entries: 0,
      prize_pool: 25,
      player_board: generatePlayerBoard('cash'),
      start_time: new Date()
    },
    {
      name: 'Daily Bash',
      type: 'bash',
      status: 'open',
      entry_fee: 0,
      max_entries: 1000,
      current_entries: 0,
      prize_pool: 5000,
      player_board: generatePlayerBoard('bash'),
      start_time: new Date()
    },
    {
      name: 'Market Mover',
      type: 'market',
      status: 'open',
      entry_fee: 0,
      max_entries: 1000,
      current_entries: 0,
      prize_pool: 0,
      player_board: generatePlayerBoard('market'),
      start_time: new Date()
    },
    {
      name: 'Trading Floor Firesale',
      type: 'firesale',
      status: 'open',
      entry_fee: 0,
      max_entries: 100,
      current_entries: 0,
      prize_pool: 0,
      player_board: generatePlayerBoard('firesale'),
      start_time: new Date()
    }
  ];

  for (const contestData of contests) {
    try {
      await Contest.create(contestData);
      log.success(`Created ${contestData.name}`);
    } catch (error) {
      log.error(`Failed to create ${contestData.name}: ${error.message}`);
    }
  }
}

// Run diagnostics
diagnoseContests();