// backend/src/utils/fixCashGames.js
// Run this to check and fix cash games: node src/utils/fixCashGames.js

const db = require('../models');
const cashGameManager = require('./cashGameManager');

async function fixCashGames() {
  try {
    await db.sequelize.authenticate();
    console.log('Connected to database\n');

    // Get all cash games with details
    const cashGames = await db.Contest.findAll({
      where: { type: 'cash' },
      include: [{
        model: db.ContestEntry,
        as: 'ContestEntries',
        include: [{
          model: db.User,
          as: 'User',
          attributes: ['id', 'username']
        }]
      }],
      order: [['created_at', 'DESC']]
    });

    console.log(`Found ${cashGames.length} cash games:\n`);

    for (const game of cashGames) {
      const entries = game.ContestEntries || [];
      const activeEntries = entries.filter(e => 
        ['pending', 'drafting', 'completed'].includes(e.status)
      );
      const completedEntries = entries.filter(e => e.status === 'completed');

      console.log(`${game.name} (ID: ${game.id})`);
      console.log(`  Status: ${game.status}`);
      console.log(`  Current Entries field: ${game.current_entries}`);
      console.log(`  Actual entries: ${activeEntries.length}/${game.max_entries}`);
      console.log(`  Completed drafts: ${completedEntries.length}`);
      console.log(`  Created: ${game.created_at}`);
      
      if (entries.length > 0) {
        console.log('  Players:');
        entries.forEach(e => {
          console.log(`    - ${e.User?.username || 'Unknown'}: ${e.status}`);
        });
      }

      // Fix issues
      if (game.status === 'closed' && completedEntries.length === 5) {
        console.log('  → This game should be processed!');
        await cashGameManager.processCompletedGame(game);
      } else if (game.status === 'closed' && activeEntries.length < 5) {
        console.log('  → This game is marked closed but not full, reopening...');
        await game.update({ status: 'open' });
      } else if (activeEntries.length !== game.current_entries) {
        console.log(`  → Fixing entry count from ${game.current_entries} to ${activeEntries.length}`);
        await game.update({ current_entries: activeEntries.length });
      }
      
      console.log('');
    }

    // Ensure we have at least one open cash game
    console.log('Checking cash game availability...');
    await cashGameManager.ensureCashGamesAvailable();
    
    console.log('\nCash games fixed!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixCashGames();