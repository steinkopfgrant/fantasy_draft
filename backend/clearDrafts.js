// backend/clearDrafts.js
const db = require('./src/models');

async function clearDrafts() {
  try {
    console.log('Clearing all drafting entries...');
    
    // Reset all drafting entries to cancelled
    const result1 = await db.ContestEntry.update(
      { status: 'cancelled' },
      { where: { status: 'drafting' } }
    );
    console.log(`Updated ${result1[0]} entries from drafting to cancelled`);
    
    // Reset all pending entries to cancelled
    const result2 = await db.ContestEntry.update(
      { status: 'cancelled' },
      { where: { status: 'pending' } }
    );
    console.log(`Updated ${result2[0]} entries from pending to cancelled`);
    
    // Reopen closed contests and reset entry count
    const result3 = await db.Contest.update(
      { status: 'open', current_entries: 0 },
      { where: { status: 'closed' } }
    );
    console.log(`Reopened ${result3[0]} contests`);
    
    console.log('✅ Database cleared!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearDrafts();