// backend/src/controllers/contestController.js
const contestService = require('../services/contestService');
const db = require('../models');

const contestController = {
  // Get all contests
  async getContests(req, res) {
    try {
      console.log('=== GET CONTESTS REQUEST ===');
      const contests = await contestService.getContests();
      console.log(`Sending ${contests.length} contests to client`);
      res.json(contests);
    } catch (error) {
      console.error('Error getting contests:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get single contest
  async getContest(req, res) {
    try {
      const { contestId } = req.params;
      console.log(`=== GET CONTEST ${contestId} ===`);
      const contest = await contestService.getContest(contestId);
      
      if (!contest) {
        console.log('Contest not found');
        return res.status(404).json({ error: 'Contest not found' });
      }
      
      console.log('Sending contest:', contest.name);
      res.json(contest);
    } catch (error) {
      console.error('Error getting contest:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get user's contest entries
  async getUserEntries(req, res) {
    try {
      const userId = req.user.id || req.user.userId;
      console.log('=== GET USER ENTRIES ===');
      console.log('User ID:', userId);
      
      const entries = await contestService.getUserEntries(userId);
      console.log(`Found ${entries.length} entries for user`);
      
      // Log first few entries for debugging
      if (entries.length > 0) {
        console.log('Sample entry:', {
          id: entries[0].id,
          contestName: entries[0].contestName,
          status: entries[0].status,
          contestType: entries[0].contestType
        });
      }
      
      res.json(entries);
    } catch (error) {
      console.error('Error getting user entries:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Enter a contest
  async enterContest(req, res) {
    try {
      const { contestId } = req.params;
      const userId = req.user.id || req.user.userId;
      const username = req.user.username;
      
      console.log('=== ENTER CONTEST REQUEST ===');
      console.log(`User ${username} (${userId}) entering contest ${contestId}`);
      
      const result = await contestService.enterContest(contestId, userId, username);
      
      console.log('Contest entry successful:', {
        entryId: result.entryId,
        draftRoomId: result.draftRoomId,
        newBalance: result.newBalance,
        contestFull: result.contestFull,
        newCashGameId: result.newCashGameId
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error entering contest:', error.message);
      
      // Return specific error messages
      if (error.message.includes('Insufficient balance')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('Contest is full')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('Maximum entries')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('Contest is not accepting entries')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('Maximum 20 unfilled draft rooms')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(400).json({ error: error.message });
    }
  },

  // Withdraw from a contest
  async withdrawEntry(req, res) {
    try {
      const { entryId } = req.params;
      const userId = req.user.id || req.user.userId;
      
      console.log('=== WITHDRAW ENTRY REQUEST ===');
      console.log(`User ${userId} withdrawing entry ${entryId}`);
      
      const result = await contestService.withdrawEntry(entryId, userId);
      
      console.log('Withdrawal successful:', {
        refund: result.refund,
        newBalance: result.newBalance
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error withdrawing entry:', error.message);
      
      if (error.message.includes('Entry not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Cannot withdraw')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(400).json({ error: error.message });
    }
  },

  // Debug cash games
  async debugCashGames(req, res) {
    try {
      // Get all cash games
      const cashGames = await db.Contest.findAll({
        where: { type: 'cash' },
        order: [['created_at', 'DESC']],
        attributes: ['id', 'name', 'status', 'current_entries', 'max_entries', 'created_at', 'updated_at']
      });

      // Get recent cash game entries
      const recentEntries = await db.ContestEntry.findAll({
        include: [{
          model: db.Contest,
          where: { type: 'cash' },
          attributes: ['name']
        }, {
          model: db.User,
          attributes: ['username']
        }],
        order: [['created_at', 'DESC']],
        limit: 20
      });

      // Check for open cash games
      const openCashGames = cashGames.filter(game => game.status === 'open');
      const fullCashGames = cashGames.filter(game => 
        game.status === 'closed' && game.current_entries >= game.max_entries
      );

      res.json({
        summary: {
          totalCashGames: cashGames.length,
          openCashGames: openCashGames.length,
          fullCashGames: fullCashGames.length,
          latestCashGame: cashGames[0]?.name || 'None',
          socketStatus: contestService.io ? 'Connected' : 'Not Connected'
        },
        cashGames: cashGames.map(game => ({
          id: game.id,
          name: game.name,
          status: game.status,
          entries: `${game.current_entries}/${game.max_entries}`,
          isFull: game.current_entries >= game.max_entries,
          created: game.created_at,
          updated: game.updated_at
        })),
        recentEntries: recentEntries.map(entry => ({
          contest: entry.Contest.name,
          user: entry.User.username,
          roomId: entry.draft_room_id,
          position: entry.draft_position,
          status: entry.status,
          entered: entry.entered_at
        }))
      });
    } catch (error) {
      console.error('Error in debugCashGames:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Ensure cash game availability
  async ensureCashGame(req, res) {
    try {
      // Check if socket is connected
      if (!contestService.io) {
        return res.status(500).json({ 
          error: 'Socket.IO not initialized. Cannot emit events.' 
        });
      }

      const cashGame = await contestService.ensureCashGameAvailable();
      
      res.json({
        success: true,
        message: 'Cash game availability ensured',
        cashGame: {
          id: cashGame.id,
          name: cashGame.name,
          status: cashGame.status,
          entries: `${cashGame.current_entries}/${cashGame.max_entries}`
        }
      });
    } catch (error) {
      console.error('Error in ensureCashGame:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Test socket emit
  async testSocketEmit(req, res) {
    try {
      if (!contestService.io) {
        return res.status(500).json({ 
          error: 'Socket.IO not initialized' 
        });
      }

      // Emit a test event
      contestService.io.emit('test-event', {
        message: 'Socket connection is working',
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Test event emitted'
      });
    } catch (error) {
      console.error('Error in testSocketEmit:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get active contests for debugging
  async getActiveContests(req, res) {
    try {
      const contests = await db.Contest.findAll({
        where: { 
          status: { 
            [require('sequelize').Op.in]: ['open', 'drafting', 'live'] 
          } 
        },
        order: [['type', 'ASC'], ['created_at', 'DESC']]
      });

      res.json({
        count: contests.length,
        contests: contests.map(c => ({
          id: c.id,
          type: c.type,
          name: c.name,
          status: c.status,
          entries: `${c.current_entries}/${c.max_entries}`,
          created: c.created_at
        }))
      });
    } catch (error) {
      console.error('Error in getActiveContests:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = contestController;