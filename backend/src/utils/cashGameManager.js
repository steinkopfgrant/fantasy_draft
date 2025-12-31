// backend/src/utils/cashGameManager.js
const Contest = require('../models/Contest');
const User = require('../models/User');
const { generatePlayerBoard } = require('./gameLogic');

class CashGameManager {
  constructor(io) {
    this.io = io;
    this.isRunning = false;
    this.checkInterval = null;
    this.gameCounter = 1;
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Cash Game Manager started');
    
    // Initialize game counter
    await this.initializeGameCounter();
    
    // Initial check
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

  async initializeGameCounter() {
    try {
      const lastGame = await Contest.findOne({
        type: 'cash'
      }).sort({ createdAt: -1 });
      
      if (lastGame && lastGame.name) {
        const match = lastGame.name.match(/Cash Game #(\d+)/);
        if (match) {
          this.gameCounter = parseInt(match[1]) + 1;
        }
      }
      console.log(`Game counter initialized at: ${this.gameCounter}`);
    } catch (error) {
      console.error('Error initializing game counter:', error);
    }
  }

  async ensureOpenCashGames() {
    try {
      // Get all open cash games
      const openGames = await Contest.find({
        type: 'cash',
        status: 'open'
      });
      
      console.log(`Found ${openGames.length} open cash games`);
      
      // We want at least 1 open cash game
      if (openGames.length === 0) {
        console.log('No open cash games found, creating one...');
        await this.createCashGame();
      }
      
      // Clean up old empty games (over 1 hour old)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oldEmptyGames = openGames.filter(game => 
        game.currentEntries === 0 && 
        game.createdAt < oneHourAgo
      );
      
      for (const game of oldEmptyGames) {
        await game.updateOne({ status: 'cancelled' });
        console.log(`Cancelled old empty game: ${game.name}`);
      }
      
    } catch (error) {
      console.error('Error ensuring open cash games:', error);
    }
  }

  async createCashGame() {
    try {
      // Generate unique player board for this game
      const playerBoard = await generatePlayerBoard('nfl');
      
      const contestData = {
        name: `Cash Game #${this.gameCounter}`,
        type: 'cash',
        status: 'open',
        entryFee: 2,
        maxEntries: 5,
        currentEntries: 0,
        prizeStructure: [
          { place: 1, amount: 10, percentage: 100 }
        ],
        startTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        sport: 'nfl',
        scoringSystem: 'standard',
        description: '5-player winner-take-all cash game',
        playerBoard: playerBoard, // Store the generated board
        entries: []
      };
      
      const newGame = await Contest.create(contestData);
      this.gameCounter++;
      
      console.log(`Created new cash game: ${newGame.name}`);
      
      // Emit to all connected clients
      if (this.io) {
        this.io.emit('newCashGame', {
          contest: newGame,
          message: `New cash game available: ${newGame.name}`
        });
      }
      
      return newGame;
      
    } catch (error) {
      console.error('Error creating cash game:', error);
      throw error;
    }
  }

  async handlePlayerJoined(contestId) {
    try {
      const contest = await Contest.findById(contestId);
      if (!contest || contest.type !== 'cash') return;
      
      console.log(`Cash game ${contest.name} now has ${contest.currentEntries}/${contest.maxEntries} players`);
      
      // If game is full, update status
      if (contest.currentEntries >= contest.maxEntries && contest.status === 'open') {
        await contest.updateOne({ status: 'filled' });
        
        // Create a new game to replace it
        console.log(`Cash game ${contest.name} is full, creating new one...`);
        await this.createCashGame();
        
        // Notify all clients
        if (this.io) {
          this.io.emit('cashGameFilled', {
            contestId: contest._id,
            contestName: contest.name
          });
        }
      }
      
      // Broadcast update
      if (this.io) {
        this.io.emit('cashGameUpdate', {
          contestId: contest._id,
          currentEntries: contest.currentEntries,
          maxEntries: contest.maxEntries,
          status: contest.status
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
          console.log(`All players drafting in ${game.name}, starting game...`);
          
          await game.updateOne({ 
            status: 'in_progress',
            startTime: new Date()
          });
          
          if (this.io) {
            this.io.emit('cashGameStarted', {
              contestId: game._id,
              message: `${game.name} has started!`
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
      
      console.log(`Completing cash game: ${contest.name}`);
      
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
          winnerUser.balance += 10; // Prize amount
          await winnerUser.save();
          
          console.log(`${winner.username} won ${contest.name} with ${winner.score} points - $10 prize`);
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
          amount: 10,
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
          results: contest.results
        });
      }
      
      // Ensure a new game is available
      await this.ensureOpenCashGames();
      
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
        games: []
      };
      
      cashGames.forEach(game => {
        if (status.byStatus[game.status] !== undefined) {
          status.byStatus[game.status]++;
        }
        
        status.games.push({
          id: game._id,
          name: game.name,
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
    const contestData = {
      name: params.name || `Cash Game #${this.gameCounter} (Manual)`,
      type: 'cash',
      entryFee: params.entryFee || 2,
      maxEntries: params.maxEntries || 5,
      currentEntries: 0,
      prizeStructure: [{ place: 1, amount: 10, percentage: 100 }],
      startTime: new Date(Date.now() + 5 * 60 * 1000),
      status: 'open',
      sport: params.sport || 'nfl',
      scoringSystem: params.scoringSystem || 'standard',
      description: params.description || 'Admin created cash game',
      playerBoard: await generatePlayerBoard('nfl')
    };
    
    const game = await Contest.create(contestData);
    this.gameCounter++;
    return game;
  }

  async getStatus() {
    const openGames = await Contest.countDocuments({
      type: 'cash',
      status: 'open'
    });
    
    const inProgressGames = await Contest.countDocuments({
      type: 'cash',
      status: 'in_progress'
    });
    
    const completedToday = await Contest.countDocuments({
      type: 'cash',
      status: 'completed',
      completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    return {
      isRunning: this.isRunning,
      openGames,
      inProgressGames,
      completedToday,
      gameCounter: this.gameCounter
    };
  }
}

module.exports = CashGameManager;