// backend/src/scripts/resetCashGames.js
const db = require('../models');
const CashGameReset = require('../utils/cashGameReset');

async function reset() {
  try {
    await db.sequelize.authenticate();
    console.log('Connected to database');
    
    console.log('\n=== Current Cash Game Status ===');
    const beforeStatus = await CashGameReset.getStatus();
    console.log(`Total games: ${beforeStatus.total}`);
    console.log(`Open: ${beforeStatus.byStatus.open}`);
    console.log(`Closed: ${beforeStatus.byStatus.closed}`);
    console.log(`Live: ${beforeStatus.byStatus.live}`);
    console.log(`Completed: ${beforeStatus.byStatus.completed}`);
    
    console.log('\n=== Resetting Cash Games ===');
    const result = await CashGameReset.resetAllCashGames();
    
    console.log(`\n✅ Reset complete!`);
    console.log(`Deleted ${result.gamesDeleted} games`);
    console.log(`Deleted ${result.entriesDeleted} entries`);
    console.log(`Created new game: ${result.newGame.name}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
}

reset();