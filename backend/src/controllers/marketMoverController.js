// backend/src/controllers/marketMoverController.js
const marketMoverService = require('../services/marketMoverService');
const db = require('../models');
const { validationResult } = require('express-validator');

const marketMoverController = {
  // Get current market mover status
  async getStatus(req, res) {
    try {
      const status = await marketMoverService.getVotingStatus();
      
      // Add user-specific data if authenticated
      if (req.user?.id) {
        const user = await db.User.findByPk(req.user.id);
        status.userTickets = user?.tickets || 0;
        
        const eligibility = await marketMoverService.canUserVote(req.user.id);
        status.userCanVote = eligibility.canVote;
        status.userVoteReason = eligibility.reason;
      }
      
      res.json({
        success: true,
        ...status
      });
    } catch (error) {
      console.error('Error getting market mover status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get market mover status'
      });
    }
  },

  // Get vote leaderboard
  async getVoteLeaders(req, res) {
    try {
      const leaders = await marketMoverService.getVoteLeaders();
      
      res.json({
        success: true,
        leaderboard: leaders
      });
    } catch (error) {
      console.error('Error getting vote leaders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get vote leaders'
      });
    }
  },

  // Get current bid up player
  async getBidUpPlayer(req, res) {
    try {
      const bidUpPlayer = await marketMoverService.getCurrentBidUpPlayer();
      
      res.json({
        success: true,
        currentBidUpPlayer: bidUpPlayer
      });
    } catch (error) {
      console.error('Error getting bid up player:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get bid up player'
      });
    }
  },

  // Vote for a player
  async voteForPlayer(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user.id || req.user.userId;
      const { playerName, playerId } = req.body;
      
      if (!playerName) {
        return res.status(400).json({
          success: false,
          error: 'Player name is required'
        });
      }

      // Check if user can vote
      const eligibility = await marketMoverService.canUserVote(userId);
      if (!eligibility.canVote) {
        return res.status(400).json({
          success: false,
          error: eligibility.reason
        });
      }

      // Process the vote
      const result = await marketMoverService.voteForPlayer(userId, playerName, playerId);
      
      res.json({
        success: true,
        message: result.message,
        newTickets: result.newTicketBalance
      });
    } catch (error) {
      console.error('Error voting for player:', error);
      
      if (error.message.includes('already voted')) {
        return res.status(400).json({
          success: false,
          error: 'You have already voted in this period'
        });
      }
      
      if (error.message.includes('Insufficient tickets')) {
        return res.status(400).json({
          success: false,
          error: 'You need at least 1 ticket to vote'
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process vote'
      });
    }
  },

  // Check player ownership
  async checkOwnership(req, res) {
    try {
      const userId = req.user.id || req.user.userId;
      const { contestId, playerName } = req.body;
      
      if (!contestId || !playerName) {
        return res.status(400).json({
          success: false,
          error: 'Contest ID and player name are required'
        });
      }

      // Check if user has tickets
      const user = await db.User.findByPk(userId);
      if (!user || user.tickets < 1) {
        return res.status(400).json({
          success: false,
          error: 'You need at least 1 ticket to check ownership'
        });
      }

      // Deduct ticket
      await user.decrement('tickets', { by: 1 });
      await user.reload(); // Refresh to get updated ticket count
      
      // Create ticket transaction with all required fields
      await db.TicketTransaction.create({
        user_id: userId,
        type: 'use',
        reason: 'ownership_check',
        amount: -1,
        balance_after: user.tickets,
        description: `Ownership check: ${playerName}`
      });

      // Calculate ownership
      const ownership = await marketMoverService.calculateOwnership(contestId, playerName);
      
      res.json({
        success: true,
        ownership: ownership,
        playerName: playerName,
        contestId: contestId,
        newTickets: user.tickets
      });
    } catch (error) {
      console.error('Error checking ownership:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check player ownership'
      });
    }
  },

  // Get available players
  async getAvailablePlayers(req, res) {
    try {
      const players = marketMoverService.getAvailablePlayers();
      
      res.json({
        success: true,
        players: players
      });
    } catch (error) {
      console.error('Error getting available players:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get available players'
      });
    }
  },

  // Get active contests
  async getActiveContests(req, res) {
    try {
      const contestService = require('../services/contestService');
      const allContests = await contestService.getContests();
      
      const marketMoverContests = allContests.filter(contest => 
        contest.type === 'market' && contest.status === 'open'
      );
      
      res.json({
        success: true,
        contests: marketMoverContests.map(contest => ({
          id: contest.id,
          name: contest.name,
          currentEntries: contest.currentEntries,
          maxEntries: contest.maxEntries,
          entryFee: contest.entryFee,
          prizePool: contest.prizePool,
          status: contest.status
        }))
      });
    } catch (error) {
      console.error('Error getting active contests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active contests'
      });
    }
  },

  // Check voting eligibility
  async checkVotingEligibility(req, res) {
    try {
      const userId = req.user.id || req.user.userId;
      const eligibility = await marketMoverService.canUserVote(userId);
      
      res.json({
        success: true,
        canVote: eligibility.canVote,
        reason: eligibility.reason || null
      });
    } catch (error) {
      console.error('Error checking voting eligibility:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check voting eligibility'
      });
    }
  },

  // Get voting history
  async getVotingHistory(req, res) {
    try {
      const userId = req.user.id || req.user.userId;
      
      const history = await db.TicketTransaction.findAll({
        where: {
          user_id: userId,
          type: 'vote'
        },
        order: [['created_at', 'DESC']],
        limit: 20
      });
      
      res.json({
        success: true,
        history: history
      });
    } catch (error) {
      console.error('Error getting voting history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get voting history'
      });
    }
  },

  // Admin set bid up player
  async setBidUpPlayer(req, res) {
    try {
      if (!req.user.isAdmin && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const { playerName } = req.body;
      
      if (!playerName) {
        return res.status(400).json({
          success: false,
          error: 'Player name is required'
        });
      }

      // Manually add player to FIRE SALE list
      const votingData = await marketMoverService.redis.get('voting:current');
      const voting = JSON.parse(votingData);
      
      if (!voting.fireSaleList) {
        voting.fireSaleList = [];
      }
      
      // Add player to top of FIRE SALE list
      voting.fireSaleList.unshift({
        playerId: `admin_${playerName.toLowerCase().replace(/\s+/g, '_')}`,
        name: playerName,
        votes: 999,
        modifier: 1.0
      });
      
      // Limit to 3 FIRE SALE players
      voting.fireSaleList = voting.fireSaleList.slice(0, 3);
      
      await marketMoverService.redis.set('voting:current', JSON.stringify(voting));
      
      res.json({
        success: true,
        message: `Set ${playerName} as FIRE SALE player`,
        fireSaleList: voting.fireSaleList
      });
    } catch (error) {
      console.error('Error setting bid up player:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set bid up player'
      });
    }
  }
};

module.exports = marketMoverController;