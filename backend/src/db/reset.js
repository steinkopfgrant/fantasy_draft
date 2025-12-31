// backend/src/db/reset.js
const db = require('../models');
const { generatePlayerBoard } = require('../utils/gameLogic');

async function resetDatabase() {
  try {
    console.log('🗑️  Starting database reset...');
    console.log('⚠️  WARNING: This will delete all user data!\n');

    // Start a transaction
    const transaction = await db.sequelize.transaction();

    try {
      // Disable foreign key checks for PostgreSQL
      await db.sequelize.query('SET CONSTRAINTS ALL DEFERRED;', { transaction });

      // Delete all data in reverse order of dependencies
      console.log('📋 Deleting draft picks...');
      await db.DraftPick.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('🎯 Deleting contest entries...');
      await db.ContestEntry.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('🎟️  Deleting ticket transactions...');
      await db.TicketTransaction.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('💰 Deleting balance transactions...');
      await db.Transaction.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('🗳️  Deleting vote history...');
      await db.VoteHistory.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('📊 Deleting vote periods...');
      await db.VotePeriod.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('💹 Deleting bid up players...');
      await db.BidUpPlayer.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('⚡ Deleting circuit breakers...');
      await db.CircuitBreaker.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('👥 Deleting all users...');
      await db.User.destroy({ 
        where: {}, 
        force: true, 
        truncate: true, 
        cascade: true,
        transaction 
      });

      console.log('🏆 Resetting contests...');
      // Reset all contests to initial state
      await db.Contest.update(
        { 
          current_entries: 0,
          status: 'open'
        },
        { 
          where: {},
          transaction 
        }
      );

      // Regenerate player boards for each contest
      const contests = await db.Contest.findAll({ transaction });
      for (const contest of contests) {
        const newBoard = generatePlayerBoard(contest.type);
        await contest.update({ player_board: newBoard }, { transaction });
        console.log(`  ✓ Reset ${contest.name} with fresh player board`);
      }

      // Re-enable foreign key checks
      await db.sequelize.query('SET CONSTRAINTS ALL IMMEDIATE;', { transaction });

      // Commit the transaction
      await transaction.commit();

      console.log('\n✅ Database reset complete!');
      console.log('📊 Summary:');
      console.log('  • All users removed');
      console.log('  • All contest entries cleared');
      console.log('  • All transactions deleted');
      console.log('  • Contests reset to open with 0 entries');
      console.log('  • Fresh player boards generated');
      console.log('\n🎮 Ready for new users!\n');

    } catch (error) {
      // Rollback the transaction on error
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('\n❌ Error resetting database:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Create a confirmation prompt
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Run if called directly
if (require.main === module) {
  console.log('🚨 DATABASE RESET WARNING 🚨');
  console.log('This will permanently delete:');
  console.log('  • All user accounts');
  console.log('  • All contest entries');
  console.log('  • All transaction history');
  console.log('  • All draft data\n');
  
  rl.question('Are you sure you want to continue? Type "RESET" to confirm: ', (answer) => {
    if (answer === 'RESET') {
      resetDatabase()
        .then(() => {
          console.log('✅ Reset complete!');
          process.exit(0);
        })
        .catch(error => {
          console.error('❌ Reset failed:', error);
          process.exit(1);
        })
        .finally(() => {
          rl.close();
        });
    } else {
      console.log('❌ Reset cancelled.');
      rl.close();
      process.exit(0);
    }
  });
}

module.exports = resetDatabase;