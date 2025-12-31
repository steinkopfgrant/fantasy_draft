// backend/src/db/fix-contests.js
const db = require('../models');

async function fixContests() {
  try {
    await db.sequelize.authenticate();
    console.log('Connected to database');

    // Update existing contests with proper max_entries
    const updates = [
      { type: 'cash', max_entries: 5, current_entries: 0 },
      { type: 'bash', max_entries: 10000, current_entries: 0 },
      { type: 'market', max_entries: 100000, current_entries: 0 },
      { type: 'firesale', max_entries: 10000, current_entries: 0 }
    ];

    for (const update of updates) {
      const result = await db.Contest.update(
        { 
          max_entries: update.max_entries,
          current_entries: update.current_entries,
          status: 'open'
        },
        { where: { type: update.type } }
      );
      console.log(`Updated ${update.type} contest: ${result[0]} rows affected`);
    }

    // Verify the updates
    const contests = await db.Contest.findAll();
    console.log('\nVerified contests:');
    contests.forEach(c => {
      console.log(`${c.name}: ${c.current_entries}/${c.max_entries} (status: ${c.status})`);
    });

    console.log('\n✅ Fixed contests successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.sequelize.close();
  }
}

fixContests();