// backend/src/utils/cashGameManager.js
const Contest = require('../models/Contest');
const User = require('../models/User');
const { generatePlayerBoard } = require('./gameLogic');

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
        
        const lastGame = await Contest.findOne({
          type: 'cash',
          sport: sport
        }).sort({ createdAt: -1 });
        
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
      const openGames = await Contest.find({
        type: 'cash',
        sport: sport,
        status: 'open'
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
        game.currentEntries === 0 && 
        game.createdAt < oneHourAgo
      );
      
      for (const game of oldEmptyGames) {
        await game.updateOne({ status: 'cancelled' });
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
      const playerBoard = await generatePlayerBoard(null, [], [], sport);
      
      const gameNumber = this.gameCounters[sport] || 1;
      const gameName = `${config.namePrefix} #${gameNumber}`;
      
      const contestData = {
        name: gameName,
        type: 'cash',
        status: 'open',
        entryFee: config.entryFee,
        maxEntries: 5,
        currentEntries: 0,
        prizeStructure: [
          { place: 1, amount: config.prizeAmount, percentage: 100 }
        ],
        startTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        sport: sport,
        scoringSystem: 'standard',
        description: `5-player winner-take-all ${sport.toUpperCase()} cash game`,
        playerBoard: playerBoard,
        entries: []
      };
      
      const newGame = await Contest.create(contestData);
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
      const contest = await Contest.findById(contestId);
      if (!contest || contest.type !== 'cash') return;
      
      const sport = contest.sport || 'nfl';
      console.log(`${sport.toUpperCase()} cash game ${contest.name} now has ${contest.currentEntries}/${contest.maxEntries} players`);
      
      // If game is full, update status
      if (contest.currentEntries >= contest.maxEntries && contest.status === 'open') {
        await contest.updateOne({ status: 'filled' });
        
        // Create a new game FOR THE SAME SPORT to replace it
        console.log(`${sport.toUpperCase()} cash game ${contest.name} is full, creating new ${sport.toUpperCase()} game...`);
        await this.createCashGame(sport);
        
        // Notify all clients
        if (this.io) {
          this.io.emit('cashGameFilled', {
            contestId: contest._id,
            contestName: contest.name,
            sport: sport
          });
        }
      }
      
      // Broadcast update
      if (this.io) {
        this.io.emit('cashGameUpdate', {
          contestId: contest._id,
          currentEntries: contest.currentEntries,
          maxEntries: contest.maxEntries,
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
      const filledGames = await Contest.find({
        type: 'cash',
        status: 'filled'
      }).populate('entries.draftId');
      
      for (const game of filledGames) {
        // Check if all players have started drafting
        const allDrafting = game.entries.every(entry => 
          entry.draftId && ['active', 'completed'].includes(entry.draftId.status)
        );
        
        if (allDrafting) {
          const sport = game.sport || 'nfl';
          console.log(`All players drafting in ${game.name} (${sport.toUpperCase()}), starting game...`);
          
          await game.updateOne({ 
            status: 'in_progress',
            startTime: new Date()
          });
          
          if (this.io) {
            this.io.emit('cashGameStarted', {
              contestId: game._id,
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
      const activeGames = await Contest.find({
        type: 'cash',
        status: 'in_progress'
      }).populate('entries.userId entries.draftId');
      
      console.log(`Checking ${activeGames.length} active cash games for completion`);
      
      for (const game of activeGames) {
        // Check if all drafts are completed
        const allComplete = game.entries.every(entry => 
          entry.draftId && entry.draftId.status === 'completed'
        );
        
        if (allComplete) {
          await this.completeCashGame(game._id);
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
      const contest = await Contest.findById(contestId)
        .populate('entries.userId entries.draftId');
      
      if (!contest || contest.type !== 'cash' || contest.status === 'completed') {
        return;
      }
      
      const sport = contest.sport || 'nfl';
      const config = SPORTS_CONFIG[sport] || SPORTS_CONFIG.nfl;
      
      console.log(`Completing ${sport.toUpperCase()} cash game: ${contest.name}`);
      
      // Calculate scores for each entry
      const entryScores = [];
      
      for (const entry of contest.entries) {
        if (entry.draftId && entry.draftId.players) {
          // Simple scoring: sum of all player values * 10
          let totalScore = 0;
          entry.draftId.players.forEach(player => {
            totalScore += (player.playerValue || 5) * 10;
          });
          
          entryScores.push({
            userId: entry.userId._id,
            username: entry.userId.username,
            entryId: entry._id,
            score: totalScore
          });
        }
      }
      
      // Sort by score (highest first)
      entryScores.sort((a, b) => b.score - a.score);
      
      // Pay the winner
      if (entryScores.length > 0) {
        const winner = entryScores[0];
        const winnerUser = await User.findById(winner.userId);
        
        if (winnerUser) {
          winnerUser.balance += config.prizeAmount;
          await winnerUser.save();
          
          console.log(`${winner.username} won ${contest.name} (${sport.toUpperCase()}) with ${winner.score} points - $${config.prizeAmount} prize`);
        }
      }
      
      // Update contest with results
      contest.results = {
        scores: entryScores.map((entry, index) => ({
          userId: entry.userId,
          username: entry.username,
          score: entry.score,
          rank: index + 1
        })),
        payouts: [{
          userId: entryScores[0]?.userId,
          username: entryScores[0]?.username,
          amount: config.prizeAmount,
          place: 1
        }],
        processedAt: new Date()
      };
      
      contest.status = 'completed';
      contest.completedAt = new Date();
      await contest.save();
      
      // Notify everyone
      if (this.io) {
        this.io.emit('cashGameCompleted', {
          contestId: contest._id,
          contestName: contest.name,
          results: contest.results,
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
      const cashGames = await Contest.find({ type: 'cash' })
        .sort({ createdAt: -1 })
        .limit(20);
      
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
          id: game._id,
          name: game.name,
          sport: sport,
          status: game.status,
          currentEntries: game.currentEntries,
          maxEntries: game.maxEntries,
          createdAt: game.createdAt,
          playerBoard: game.playerBoard ? 'Generated' : 'Missing'
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
    
    const contestData = {
      name: params.name || `${config.namePrefix} #${gameNumber} (Manual)`,
      type: 'cash',
      entryFee: params.entryFee || config.entryFee,
      maxEntries: params.maxEntries || 5,
      currentEntries: 0,
      prizeStructure: [{ place: 1, amount: config.prizeAmount, percentage: 100 }],
      startTime: new Date(Date.now() + 5 * 60 * 1000),
      status: 'open',
      sport: sport,
      scoringSystem: params.scoringSystem || 'standard',
      description: params.description || `Admin created ${sport.toUpperCase()} cash game`,
      playerBoard: await generatePlayerBoard(null, [], [], sport)
    };
    
    const game = await Contest.create(contestData);
    this.gameCounters[sport] = gameNumber + 1;
    return game;
  }

  async getStatus() {
    const statusBySport = {};
    
    for (const sport of Object.keys(SPORTS_CONFIG)) {
      const openGames = await Contest.countDocuments({
        type: 'cash',
        sport: sport,
        status: 'open'
      });
      
      const inProgressGames = await Contest.countDocuments({
        type: 'cash',
        sport: sport,
        status: 'in_progress'
      });
      
      const completedToday = await Contest.countDocuments({
        type: 'cash',
        sport: sport,
        status: 'completed',
        completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
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