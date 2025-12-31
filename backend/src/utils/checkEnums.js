// backend/src/utils/checkEnums.js
// Run this to check enum values: node src/utils/checkEnums.js

const db = require('../models');

async function checkEnums() {
  try {
    // Connect to database
    await db.sequelize.authenticate();
    console.log('Connected to database\n');

    // Check contest status enum
    const contestStatusResult = await db.sequelize.query(`
      SELECT unnest(enum_range(NULL::enum_contests_status)) AS status_value;
    `);
    
    console.log('Valid Contest Status Values:');
    contestStatusResult[0].forEach(row => {
      console.log(`  - ${row.status_value}`);
    });
    console.log('');

    // Check contest type enum
    const contestTypeResult = await db.sequelize.query(`
      SELECT unnest(enum_range(NULL::enum_contests_type)) AS type_value;
    `);
    
    console.log('Valid Contest Type Values:');
    contestTypeResult[0].forEach(row => {
      console.log(`  - ${row.type_value}`);
    });
    console.log('');

    // Check contest entry status enum
    const entryStatusResult = await db.sequelize.query(`
      SELECT unnest(enum_range(NULL::enum_contest_entries_status)) AS status_value;
    `);
    
    console.log('Valid Contest Entry Status Values:');
    entryStatusResult[0].forEach(row => {
      console.log(`  - ${row.status_value}`);
    });
    console.log('');

    // Check current contests
    const contests = await db.Contest.findAll({
      attributes: ['id', 'name', 'type', 'status'],
      raw: true
    });
    
    console.log('Current Contests:');
    contests.forEach(contest => {
      console.log(`  - ${contest.name}: type=${contest.type}, status=${contest.status}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEnums();