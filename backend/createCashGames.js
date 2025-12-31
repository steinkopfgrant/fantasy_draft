const { sequelize, Contest } = require('./src/models');
const { Op } = require('sequelize');
const { generatePlayerBoard } = require('./src/utils/gameLogic');

async function createCashGames() {
  try {
    console.log('💰 Creating Cash Game...');
    
    // Check for existing cash games to get the next number
    const existingCashGames = await Contest.findAll({
      where: {
        type: 'cash',
        name: { [Op.like]: 'Cash Game #%' }
      },
      attributes: ['name']
    });

    let maxNumber = 0;
    existingCashGames.forEach(game => {
      const match = game.name.match(/Cash Game #(\d+)/);
      if (match) {
        maxNumber = Math.max(maxNumber, parseInt(match[1]));
      }
    });

    const nextNumber = maxNumber + 1;
    
    // Create the cash game with all required fields
    const newCashGame = await Contest.create({
      type: 'cash',
      name: `Cash Game #${nextNumber}`,
      status: 'open',
      entry_fee: 5,
      prize_pool: 25,
      max_entries: 5,
      current_entries: 0,
      max_entries_per_user: 1,
      player_board: generatePlayerBoard(), // This generates the player grid
      start_time: new Date(),
      end_time: new Date(Date.now() + 7200000), // 2 hours from now
      scoring_type: 'standard',
      max_salary: 15
    });
    
    console.log(`✅ Created: ${newCashGame.name} (ID: ${newCashGame.id})`);
    console.log('Go to http://localhost:3000/lobby to see it');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

createCashGames();