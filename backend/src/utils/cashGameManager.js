// backend/src/utils/cashGameManager.js DEAD??!!!! DELETE???!!!
const db = require('../models');
const { generatePlayerBoard } = require('./gameLogic');
const { Op } = require('sequelize');

// Supported sports configuration
const SPORTS_CONFIG = {
  nfl: {
    namePrefix: 'Cash Game',
    entryFee: 2,
    prizeAmount: 10
  },
  nba: {
    namePrefix: 'NBA Cash Game',
    entryFee: 2,
    prizeAmount: 10
  }
};

class CashGameManager {
  constructor(io) {
    this.io = io;
    this.isRunning = false;
    this.checkInterval = null;
    // Track game counters per sport
    this.gameCounters = {
      nfl: 1,
      nba: 1
    };
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Cash Game Manager started (multi-sport)');
    
    // Initialize game counters for all sports
    await this.initializeGameCounters();
    
    // Initial check for all sports
    await this.ensureOpenCashGames();
    
    // Check every 30 seconds
    this.checkInterval = setInterval(async () => {
      await this.ensureOpenCashGames();
      await this.checkGamesForCompletion();
    }, 30000);
  }

  stop() {
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    console.log('Cash Game Manager stopped');
  }

  async initializeGameCounters() {
    try {
      // Initialize counter for each sport
      for (const sport of Object.keys(SPORTS_CONFIG)) {
        const config = SPORTS_CONFIG[sport];
        
        const lastGame = await db.Contest.findOne({
          where: {
            type: 'cash',
            sport: sport
          },
          order: [['created_at', 'DESC']]
        });
        
        if (lastGame && lastGame.name) {
          // Match pattern like "Cash Game #5" or "NBA Cash Game #3"
          const match = lastGame.name.match(/#(\d+)/);
          if (match) {
            this.gameCounters[sport] = parseInt(match[1]) + 1;
          }
        }
        
        console.log(`${sport.toUpperCase()} game counter initialized at: ${this.gameCounters[sport]}`);
      }
    } catch (error) {
      console.error('Error initializing game counters:', error);
    }
  }

  async ensureOpenCashGames() {
    try {
      // Ensure open cash games for EACH sport
      for (const sport of Object.keys(SPORTS_CONFIG)) {
        await this.ensureOpenCashGameForSport(sport);
      }
    } catch (error) {
      console.error('Error ensuring open cash games:', error);
    }
  }

  async ensureOpenCashGameForSport(sport) {
    try {
      const config = SPORTS_CONFIG[sport];
      if (!config) {
        console.error(`Unknown sport: ${sport}`);
        return;
      }

      // Get open cash games for this sport
      const openGames = await db.Contest.findAll({
        where: {
          type: 'cash',
          sport: sport,
          status: 'open'
        }
      });
      
      console.log(`Found ${openGames.length} open ${sport.toUpperCase()} cash games`);
      
      // We want at least 1 open cash game per sport
      if (openGames.length === 0) {
        console.log(`No open ${sport.toUpperCase()} cash games found, creating one...`);
        await this.createCashGame(sport);
      }
      
      // Clean up old empty games (over 1 hour old)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oldEmptyGames = openGames.filter(game => 
        game.current_entries === 0 && 
        new Date(game.created_at) < oneHourAgo
      );
      
      for (const game of oldEmptyGames) {
        await game.update({ status: 'cancelled' });
        console.log(`Cancelled old empty ${sport.toUpperCase()} game: ${game.name}`);
      }
      
    } catch (error) {
      console.error(`Error ensuring open ${sport} cash games:`, error);
    }
  }

  async createCashGame(sport = 'nfl') {
    try {
      const config = SPORTS_CONFIG[sport];
      if (!config) {
        console.error(`Unknown sport: ${sport}, defaulting to NFL`);
        sport = 'nfl';
      }

      // Generate sport-specific player board
      const playerBoard = generatePlayerBoard(null, [], [], sport);
      
      const gameNumber = this.gameCounters[sport] || 1;
      const gameName = `${config.namePrefix} #${gameNumber}`;
      
      const { v4: uuidv4 } = require('uuid');
      
      const contestData = {
        id: uuidv4(),
        name: gameName,
        type: 'cash',
        status: 'open',
        entry_fee: config.entryFee,
        prize_pool: config.prizeAmount,
        max_entries: 5,
        current_entries: 0,
        start_time: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        end_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        sport: sport,
        player_board: playerBoard
      };
      
      const newGame = await db.Contest.create(contestData);
      this.gameCounters[sport] = gameNumber + 1;
      
      console.log(`✅ Created new ${sport.toUpperCase()} cash game: ${newGame.name}`);
      
      // Emit to all connected clients
      if (this.io) {
        this.io.emit('newCashGame', {
          contest: newGame,
          sport: sport,
          message: `New ${sport.toUpperCase()} cash game available: ${newGame.name}`
        });
      }
      
      return newGame;
      
    } catch (error) {
      console.error(`Error creating ${sport} cash game:`, error);
      throw error;
    }
  }

  async handlePlayerJoined(contestId) {
    try {
      const contest = await db.Contest.findByPk(contestId);
      if (!contest || contest.type !== 'cash') return;
      
      const sport = contest.sport || 'nfl';
      console.log(`${sport.toUpperCase()} cash game ${contest.name} now has ${contest.current_entries}/${contest.max_entries} players`);
      
      // If game is full, update status
      if (contest.current_entries >= contest.max_entries && contest.status === 'open') {
        await contest.update({ status: 'filled' });
        
        // Create a new game FOR THE SAME SPORT to replace it
        console.log(`${sport.toUpperCase()} cash game ${contest.name} is full, creating new ${sport.toUpperCase()} game...`);
        await this.createCashGame(sport);
        
        // Notify all clients
        if (this.io) {
          this.io.emit('cashGameFilled', {
            contestId: contest.id,
            contestName: contest.name,
            sport: sport
          });
        }
      }
      
      // Broadcast update
      if (this.io) {
        this.io.emit('cashGameUpdate', {
          contestId: contest.id,
          currentEntries: contest.current_entries,
          maxEntries: contest.max_entries,
          status: contest.status,
          sport: sport
        });
      }
    } catch (error) {
      console.error('Error handling player joined:', error);
    }
  }

  async checkGamesForStart() {
    try {
      // Find filled games that should start
      const filledGames = await db.Contest.findAll({
        where: {
          type: 'cash',
          status: 'filled'
        }
      });
      
      for (const game of filledGames) {
        const sport = game.sport || 'nfl';
        console.log(`Checking filled ${sport.toUpperCase()} game ${game.name} for start...`);
        
        // Check entries for this game
        const entries = await db.ContestEntry.findAll({
          where: { contest_id: game.id }
        });
        
        // Check if all players have started drafting
        const allDrafting = entries.every(entry => 
          entry.status === 'drafting' || entry.status === 'completed'
        );
        
        if (allDrafting && entries.length >= game.max_entries) {
          console.log(`All players drafting in ${game.name} (${sport.toUpperCase()}), starting game...`);
          
          await game.update({ 
            status: 'in_progress',
            start_time: new Date()
          });
          
          if (this.io) {
            this.io.emit('cashGameStarted', {
              contestId: game.id,
              message: `${game.name} has started!`,
              sport: sport
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking games for start:', error);
    }
  }

  async checkGamesForCompletion() {
    try {
      // Find in-progress games
      const activeGames = await db.Contest.findAll({
        where: {
          type: 'cash',
          status: 'in_progress'
        }
      });
      
      console.log(`Checking ${activeGames.length} active cash games for completion`);
      
      for (const game of activeGames) {
        const entries = await db.ContestEntry.findAll({
          where: { contest_id: game.id }
        });
        
        // Check if all drafts are completed
        const allComplete = entries.every(entry => 
          entry.status === 'completed'
        );
        
        if (allComplete && entries.length > 0) {
          await this.completeCashGame(game.id);
        }
      }
      
      // Also check filled games to see if they should start
      await this.checkGamesForStart();
      
    } catch (error) {
      console.error('Error checking games for completion:', error);
    }
  }

  async completeCashGame(contestId) {
    try {
      const contest = await db.Contest.findByPk(contestId);
      
      if (!contest || contest.type !== 'cash' || contest.status === 'completed') {
        return;
      }
      
      const sport = contest.sport || 'nfl';
      const config = SPORTS_CONFIG[sport] || SPORTS_CONFIG.nfl;
      
      console.log(`Completing ${sport.toUpperCase()} cash game: ${contest.name}`);
      
      // Get entries with user info
      const entries = await db.ContestEntry.findAll({
        where: { contest_id: contestId },
        include: [{ model: db.User, as: 'user' }]
      });
      
      // Calculate scores for each entry
      const entryScores = [];
      
      for (const entry of entries) {
        // Simple scoring: sum of roster values
        let totalScore = 0;
        if (entry.roster) {
          Object.values(entry.roster).forEach(player => {
            if (player && player.price) {
              totalScore += player.price * 10;
            }
          });
        }
        
        entryScores.push({
          oddsId: entry.user?.id,
          username: entry.user?.username || 'Unknown',
          entryId: entry.id,
          score: totalScore
        });
      }
      
      // Sort by score (highest first)
      entryScores.sort((a, b) => b.score - a.score);
      
      // Pay the winner
      if (entryScores.length > 0 && entryScores[0].oddsId) {
        const winner = entryScores[0];
        const winnerUser = await db.User.findByPk(winner.oddsId);
        
        if (winnerUser) {
          await winnerUser.increment('balance', { by: config.prizeAmount });
          console.log(`${winner.username} won ${contest.name} (${sport.toUpperCase()}) with ${winner.score} points - $${config.prizeAmount} prize`);
        }
      }
      
      // Update contest status
      await contest.update({
        status: 'completed'
      });
      
      // Notify everyone
      if (this.io) {
        this.io.emit('cashGameCompleted', {
          contestId: contest.id,
          contestName: contest.name,
          results: entryScores,
          sport: sport
        });
      }
      
      // Ensure a new game is available FOR THIS SPORT
      await this.ensureOpenCashGameForSport(sport);
      
    } catch (error) {
      console.error('Error completing cash game:', error);
    }
  }

  async getCashGameStatus() {
    try {
      const cashGames = await db.Contest.findAll({
        where: { type: 'cash' },
        order: [['created_at', 'DESC']],
        limit: 20
      });
      
      const status = {
        total: cashGames.length,
        byStatus: {
          open: 0,
          filled: 0,
          in_progress: 0,
          completed: 0,
          cancelled: 0
        },
        bySport: {},
        games: []
      };
      
      // Initialize sport tracking
      for (const sport of Object.keys(SPORTS_CONFIG)) {
        status.bySport[sport] = { open: 0, filled: 0, in_progress: 0, completed: 0 };
      }
      
      cashGames.forEach(game => {
        const sport = game.sport || 'nfl';
        
        if (status.byStatus[game.status] !== undefined) {
          status.byStatus[game.status]++;
        }
        
        if (status.bySport[sport] && status.bySport[sport][game.status] !== undefined) {
          status.bySport[sport][game.status]++;
        }
        
        status.games.push({
          id: game.id,
          name: game.name,
          sport: sport,
          status: game.status,
          currentEntries: game.current_entries,
          maxEntries: game.max_entries,
          createdAt: game.created_at,
          playerBoard: game.player_board ? 'Generated' : 'Missing'
        });
      });
      
      return status;
      
    } catch (error) {
      console.error('Error getting cash game status:', error);
      throw error;
    }
  }

  // Admin methods for debugging
  async forceCreateCashGame(params = {}) {
    const sport = params.sport || 'nfl';
    const config = SPORTS_CONFIG[sport] || SPORTS_CONFIG.nfl;
    const gameNumber = this.gameCounters[sport] || 1;
    
    const { v4: uuidv4 } = require('uuid');
    
    const contestData = {
      id: uuidv4(),
      name: params.name || `${config.namePrefix} #${gameNumber} (Manual)`,
      type: 'cash',
      entry_fee: params.entryFee || config.entryFee,
      prize_pool: config.prizeAmount,
      max_entries: params.maxEntries || 5,
      current_entries: 0,
      start_time: new Date(Date.now() + 5 * 60 * 1000),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: 'open',
      sport: sport,
      player_board: generatePlayerBoard(null, [], [], sport)
    };
    
    const game = await db.Contest.create(contestData);
    this.gameCounters[sport] = gameNumber + 1;
    return game;
  }

  async getStatus() {
    const statusBySport = {};
    
    for (const sport of Object.keys(SPORTS_CONFIG)) {
      const openGames = await db.Contest.count({
        where: {
          type: 'cash',
          sport: sport,
          status: 'open'
        }
      });
      
      const inProgressGames = await db.Contest.count({
        where: {
          type: 'cash',
          sport: sport,
          status: 'in_progress'
        }
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const completedToday = await db.Contest.count({
        where: {
          type: 'cash',
          sport: sport,
          status: 'completed',
          updated_at: { [Op.gte]: today }
        }
      });
      
      statusBySport[sport] = {
        openGames,
        inProgressGames,
        completedToday,
        gameCounter: this.gameCounters[sport]
      };
    }
    
    return {
      isRunning: this.isRunning,
      sports: Object.keys(SPORTS_CONFIG),
      bySport: statusBySport,
      gameCounters: this.gameCounters
    };
  }
}

module.exports = CashGameManager;