// backend/src/db/init.js
const db = require('../models');

async function initDatabase() {
  try {
    // Test connection
    await db.sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Sync all models (creates tables)
    await db.sequelize.sync({ alter: true });
    console.log('✅ All models were synchronized successfully.');

    // Only create cash game if no contests exist
    // Tournament contests (Market Mover, Firesale) are admin-launched only
    const existingContest = await db.Contest.findOne({ where: { type: 'cash' } });
    
    if (!existingContest) {
      const { generatePlayerBoard } = require('../utils/gameLogic');
      await db.Contest.create({
        type: 'cash',
        name: 'Cash Game #1',
        status: 'open',
        entry_fee: 5,
        prize_pool: 24,
        max_entries: 5,
        max_entries_per_user: 1,
        player_board: generatePlayerBoard(),
        start_time: new Date()
      });
      console.log('✅ Created Cash Game #1');
    }

    // Clean up any deprecated bash contests
    const deletedBash = await db.Contest.destroy({ where: { type: 'bash' } });
    if (deletedBash > 0) {
      console.log(`🗑️ Cleaned up ${deletedBash} deprecated Daily Bash contest(s)`);
    }

    console.log('✅ Database initialization complete!');
    console.log('ℹ️ Tournament contests (Market Mover, Firesale) must be created by admin');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase().then(() => process.exit(0));
}

module.exports = initDatabase;