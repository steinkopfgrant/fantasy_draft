// backend/src/routes/injuryRoutes.js
// Admin routes for managing player injuries

const express = require('express');
const router = express.Router();
const injurySwapService = require('../services/injurySwapService');
const authMiddleware = require('../middleware/auth');
const db = require('../models');

// Simple admin check middleware
const isAdmin = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const user = await db.User.findByPk(userId);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Auth check failed' });
  }
};

// All routes require admin authentication
router.use(authMiddleware);
router.use(isAdmin);

// ============================================
// INJURY MANAGEMENT
// ============================================

// Get all current injuries
router.get('/injuries', async (req, res) => {
  try {
    const weekId = req.query.week || 'current';
    const injuries = await injurySwapService.getInjuries(weekId);
    res.json({
      success: true,
      weekId,
      injuries,
      count: Object.keys(injuries).length
    });
  } catch (error) {
    console.error('Error getting injuries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark a player as OUT
router.post('/injuries/out', async (req, res) => {
  try {
    const { playerId, weekId = 'current' } = req.body;
    
    if (!playerId) {
      return res.status(400).json({ success: false, error: 'playerId required' });
    }

    await injurySwapService.markPlayerOut(playerId, weekId);
    res.json({ success: true, playerId, status: 'OUT' });
  } catch (error) {
    console.error('Error marking player out:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark a player as active (remove from injury list)
router.post('/injuries/active', async (req, res) => {
  try {
    const { playerId, weekId = 'current' } = req.body;
    
    if (!playerId) {
      return res.status(400).json({ success: false, error: 'playerId required' });
    }

    await injurySwapService.markPlayerActive(playerId, weekId);
    res.json({ success: true, playerId, status: 'ACTIVE' });
  } catch (error) {
    console.error('Error marking player active:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk mark players as OUT
router.post('/injuries/bulk-out', async (req, res) => {
  try {
    const { playerIds, weekId = 'current' } = req.body;
    
    if (!playerIds || !Array.isArray(playerIds)) {
      return res.status(400).json({ success: false, error: 'playerIds array required' });
    }

    await injurySwapService.bulkMarkOut(playerIds, weekId);
    res.json({ 
      success: true, 
      count: playerIds.length,
      playerIds,
      status: 'OUT' 
    });
  } catch (error) {
    console.error('Error bulk marking players out:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all injuries for a week
router.delete('/injuries', async (req, res) => {
  try {
    const weekId = req.query.week || 'current';
    await injurySwapService.clearInjuries(weekId);
    res.json({ success: true, message: `Cleared all injuries for week ${weekId}` });
  } catch (error) {
    console.error('Error clearing injuries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// MANUAL SWAP TRIGGER
// ============================================

// Manually trigger injury swaps for a contest
router.post('/injuries/run-swap/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const result = await injurySwapService.runInjurySwapsForContest(contestId);
    res.json(result);
  } catch (error) {
    console.error('Error running injury swap:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get swap history for an entry
router.get('/injuries/history/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const history = await injurySwapService.getSwapHistory(entryId);
    res.json({
      success: true,
      entryId,
      history
    });
  } catch (error) {
    console.error('Error getting swap history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SCHEDULING INFO
// ============================================

// Get list of scheduled swaps
router.get('/injuries/scheduled', async (req, res) => {
  try {
    const scheduled = [];
    for (const [contestId, timeoutId] of injurySwapService.scheduledSwaps) {
      scheduled.push({ contestId, scheduled: true });
    }
    res.json({
      success: true,
      scheduledSwaps: scheduled,
      count: scheduled.length
    });
  } catch (error) {
    console.error('Error getting scheduled swaps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;