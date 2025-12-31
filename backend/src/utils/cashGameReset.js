// backend/src/utils/cashGameReset.js - Complete fixed file
const db = require('../models');
const { Contest, ContestEntry, Transaction, DraftPick } = db;

class CashGameReset {
  // Clean up completed cash games
  static async cleanupCompletedGames() {
    try {
      // Find all completed cash games
      const completedGames = await Contest.findAll({
        where: {
          type: 'cash',
          status: 'completed'
        }
      });
      
      console.log(`Found ${completedGames.length} completed cash games to clean up`);
      
      // Delete related data for each completed game
      for (const game of completedGames) {
        // Delete draft picks
        await DraftPick.destroy({
          where: {
            entry_id: {
              [db.Sequelize.Op.in]: db.sequelize.literal(
                `(SELECT id FROM contest_entries WHERE contest_id = '${game.id}')`
              )
            }
          }
        });
        
        // Delete contest entries
        await ContestEntry.destroy({
          where: { contest_id: game.id }
        });
        
        // Delete the contest itself
        await game.destroy();
        
        console.log(`Cleaned up cash game: ${game.name}`);
      }
      
      return completedGames.length;
    } catch (error) {
      console.error('Error cleaning up completed games:', error);
      throw error;
    }
  }
  
  // Reset all cash games
  static async resetAllCashGames() {
    try {
      console.log('Resetting all cash games...');
      
      // Delete all draft picks for cash game entries
      try {
        const draftPicksDeleted = await db.sequelize.query(`
          DELETE FROM draft_picks 
          WHERE entry_id IN (
            SELECT ce.id 
            FROM contest_entries ce
            JOIN contests c ON ce.contest_id = c.id
            WHERE c.type = 'cash'
          )
        `, { type: db.Sequelize.QueryTypes.DELETE });
        console.log(`Deleted ${draftPicksDeleted} draft picks`);
      } catch (e) {
        console.log('No draft picks to delete');
      }
      
      // Delete all cash game entries
      const entriesDeleted = await ContestEntry.destroy({
        where: {
          contest_id: {
            [db.Sequelize.Op.in]: db.sequelize.literal(
              `(SELECT id FROM contests WHERE type = 'cash')`
            )
          }
        }
      });
      
      // Delete all cash games
      const gamesDeleted = await Contest.destroy({
        where: { type: 'cash' }
      });
      
      console.log(`Deleted ${gamesDeleted} cash games and ${entriesDeleted} entries`);
      
      // Create a new cash game with player board
      // Import here to avoid circular dependency
      const cashGameManager = require('./cashGameManager');
      const newGame = await cashGameManager.createCashGame();
      
      console.log(`Created new cash game: ${newGame.name}`);
      
      return {
        gamesDeleted,
        entriesDeleted,
        newGame
      };
    } catch (error) {
      console.error('Error resetting cash games:', error);
      throw error;
    }
  }
  
  // Force reset a specific cash game
  static async resetSpecificGame(gameId) {
    try {
      const game = await Contest.findByPk(gameId);
      
      if (!game || game.type !== 'cash') {
        throw new Error('Cash game not found');
      }
      
      // Delete draft picks
      await DraftPick.destroy({
        where: {
          entry_id: {
            [db.Sequelize.Op.in]: db.sequelize.literal(
              `(SELECT id FROM contest_entries WHERE contest_id = '${gameId}')`
            )
          }
        }
      });
      
      // Delete entries
      await ContestEntry.destroy({
        where: { contest_id: gameId }
      });
      
      // Reset the game
      const { generatePlayerBoard } = require('./gameLogic');
      await game.update({
        status: 'open',
        current_entries: 0,
        completed_at: null,
        player_board: generatePlayerBoard()
      });
      
      console.log(`Reset cash game: ${game.name}`);
      
      return game;
    } catch (error) {
      console.error('Error resetting specific game:', error);
      throw error;
    }
  }
  
  // Get cash game status
  static async getStatus() {
    try {
      const cashGames = await Contest.findAll({
        where: { type: 'cash' },
        include: [{
          model: ContestEntry,
          as: 'ContestEntries',
          attributes: ['id', 'user_id', 'status'],
          required: false
        }],
        order: [['created_at', 'DESC']]
      });
      
      const summary = {
        total: cashGames.length,
        byStatus: {
          open: 0,
          closed: 0,
          live: 0,
          completed: 0
        },
        games: []
      };
      
      cashGames.forEach(game => {
        const activeEntries = game.ContestEntries.filter(e => 
          ['pending', 'drafting', 'completed'].includes(e.status)
        );
        
        if (summary.byStatus[game.status] !== undefined) {
          summary.byStatus[game.status]++;
        }
        
        summary.games.push({
          id: game.id,
          name: game.name,
          status: game.status,
          entries: activeEntries.length,
          maxEntries: game.max_entries,
          createdAt: game.created_at,
          hasPlayerBoard: !!game.player_board
        });
      });
      
      return summary;
    } catch (error) {
      console.error('Error getting cash game status:', error);
      throw error;
    }
  }
  
  // Validate cash games (check for issues)
  static async validateCashGames() {
    try {
      const issues = [];
      
      const cashGames = await Contest.findAll({
        where: { type: 'cash' },
        include: [{
          model: ContestEntry,
          as: 'ContestEntries',
          required: false
        }]
      });
      
      for (const game of cashGames) {
        // Check for missing player board
        if (!game.player_board) {
          issues.push({
            gameId: game.id,
            gameName: game.name,
            issue: 'Missing player board',
            severity: 'high'
          });
        }
        
        // Check for incorrect entry count
        const actualEntries = game.ContestEntries.filter(e => 
          ['pending', 'drafting', 'completed'].includes(e.status)
        ).length;
        
        if (game.current_entries !== actualEntries) {
          issues.push({
            gameId: game.id,
            gameName: game.name,
            issue: `Entry count mismatch: DB says ${game.current_entries}, actual is ${actualEntries}`,
            severity: 'medium'
          });
        }
        
        // Check for stuck games
        if (game.status === 'closed' && actualEntries < 5) {
          issues.push({
            gameId: game.id,
            gameName: game.name,
            issue: `Game marked as closed but only has ${actualEntries}/5 entries`,
            severity: 'high'
          });
        }
        
        // Check for games that should be completed
        const completedEntries = game.ContestEntries.filter(e => e.status === 'completed').length;
        if (game.status === 'live' && completedEntries === 5) {
          issues.push({
            gameId: game.id,
            gameName: game.name,
            issue: 'Game should be marked as completed',
            severity: 'medium'
          });
        }
      }
      
      return issues;
    } catch (error) {
      console.error('Error validating cash games:', error);
      throw error;
    }
  }
}

module.exports = CashGameReset;