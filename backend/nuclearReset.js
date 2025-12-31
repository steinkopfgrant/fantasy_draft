// nuclearReset.js
const db = require('./src/models');
const { generatePlayerBoard } = require('./src/utils/gameLogic');

async function nuclearReset() {
  try {
    console.log('☢️ NUCLEAR RESET - Starting fresh...\n');
    
    // 1. Clear EVERYTHING
    await db.ContestEntry.destroy({ where: {} });
    await db.DraftPick.destroy({ where: {} });
    await db.Contest.destroy({ where: {} });
    
    console.log('✅ All data cleared');
    
    // 2. Clear Redis
    const Redis = require('ioredis');
    const redis = new Redis();
    await redis.flushall();
    await redis.quit();
    console.log('✅ Redis cleared');
    
    // 3. Create new cash game
    const cashGame = await db.Contest.create({
      type: 'cash',
      name: 'Cash Game #1',
      status: 'open',
      entry_fee: 5,
      prize_pool: 25,
      max_entries: 5,
      current_entries: 0,
      max_entries_per_user: 1,
      player_board: generatePlayerBoard(),
      start_time: new Date(),
      end_time: new Date(Date.now() + 7200000),
      scoring_type: 'standard',
      max_salary: 15
    });
    
    console.log(`✅ Created: ${cashGame.name}`);
    console.log('\n🎮 IMPORTANT STEPS:');
    console.log('1. RESTART your backend (Ctrl+C and npm run dev)');
    console.log('2. Clear browser: DevTools → Application → Clear site data');
    console.log('3. Close ALL browser tabs');
    console.log('4. Open fresh tab and go to lobby');
    console.log('5. Join with ONE account first');
    console.log('6. Open incognito windows for other test accounts');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

nuclearReset();