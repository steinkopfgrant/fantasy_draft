// backend/src/routes/debugRoutes.js
const express = require('express');
const router = express.Router();
const devTestingService = require('../services/devTestingService');
const authMiddleware = require('../middleware/auth');

// Only enable in development
if (process.env.NODE_ENV !== 'production') {
  
  // Create test users
  router.post('/create-test-users', async (req, res) => {
    try {
      const { count = 8 } = req.body;
      const users = await devTestingService.createTestUsers(count);
      res.json({ success: true, users: users.map(u => ({ 
        id: u.id, 
        username: u.username 
      })) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fill lobby instantly
  router.post('/fill-lobby/:contestId', authMiddleware, async (req, res) => {
    try {
      const { contestId } = req.params;
      const { includeMe = true } = req.body;
      
      const entries = await devTestingService.fillLobby(
        contestId, 
        includeMe ? req.user.userId : null
      );
      
      res.json({ 
        success: true, 
        entries: entries.length,
        message: 'Lobby filled with test users' 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-complete draft
  router.post('/auto-draft/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { strategy = 'balanced', leaveOneForUser = false } = req.body;
      
      const result = await devTestingService.autoCompleteDraft(roomId, {
        strategy,
        leaveOneForUser
      });
      
      res.json({ 
        success: true, 
        message: 'Draft auto-completed',
        state: result 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Simulate scoring
  router.post('/simulate-scoring/:contestId', async (req, res) => {
    try {
      const { contestId } = req.params;
      const scores = await devTestingService.simulateScoring(contestId, req.body);
      
      res.json({ 
        success: true, 
        scores 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get complete game state
  router.get('/game-state/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      const state = await devTestingService.getGameState(identifier);
      
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Time travel
  router.post('/time-travel/:contestId', async (req, res) => {
    try {
      const { contestId } = req.params;
      const { target } = req.body;
      
      const newTime = await devTestingService.timeTravel(contestId, target);
      
      res.json({ 
        success: true, 
        newTime 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset test environment
  router.post('/reset', async (req, res) => {
    try {
      const result = await devTestingService.resetTestEnvironment();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = router;