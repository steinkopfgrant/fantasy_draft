// backend/src/routes/draftLogs.js
// Admin routes for viewing draft audit logs (dispute resolution)

const express = require('express');
const router = express.Router();
const DraftLogService = require('../services/DraftLogService');

// Note: Auth and admin middleware are applied in app.js when mounting this router

/**
 * GET /api/admin/draft-logs/:contestId
 * Get full draft history for a contest
 */
router.get('/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const logs = await DraftLogService.getDraftHistory(contestId);
    
    res.json({
      success: true,
      contestId: parseInt(contestId),
      totalEvents: logs.length,
      logs: logs.map(log => ({
        id: log.id,
        eventType: log.event_type,
        userId: log.user_id,
        username: log.username,
        pickNumber: log.pick_number,
        turnNumber: log.turn_number,
        player: log.player_name ? {
          name: log.player_name,
          team: log.player_team,
          position: log.player_position,
          price: log.player_price
        } : null,
        boardPosition: log.board_row !== null ? {
          row: log.board_row,
          col: log.board_col
        } : null,
        timeRemaining: log.time_remaining,
        wasAutoPick: log.was_auto_pick,
        timestamp: log.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching draft logs:', error);
    res.status(500).json({ error: 'Failed to fetch draft logs' });
  }
});

/**
 * GET /api/admin/draft-logs/:contestId/recap
 * Get human-readable draft recap
 */
router.get('/:contestId/recap', async (req, res) => {
  try {
    const { contestId } = req.params;
    const recap = await DraftLogService.generateDraftRecap(contestId);
    
    res.json({
      success: true,
      recap
    });
  } catch (error) {
    console.error('Error generating draft recap:', error);
    res.status(500).json({ error: 'Failed to generate draft recap' });
  }
});

/**
 * GET /api/admin/draft-logs/:contestId/board
 * Get the initial board state
 */
router.get('/:contestId/board', async (req, res) => {
  try {
    const { contestId } = req.params;
    const board = await DraftLogService.getInitialBoard(contestId);
    
    if (!board) {
      return res.status(404).json({ error: 'No board snapshot found for this contest' });
    }
    
    res.json({
      success: true,
      contestId: parseInt(contestId),
      board
    });
  } catch (error) {
    console.error('Error fetching initial board:', error);
    res.status(500).json({ error: 'Failed to fetch initial board' });
  }
});

/**
 * GET /api/admin/draft-logs/:contestId/rosters
 * Get final rosters from the draft
 */
router.get('/:contestId/rosters', async (req, res) => {
  try {
    const { contestId } = req.params;
    const rosters = await DraftLogService.getFinalRosters(contestId);
    
    if (!rosters) {
      return res.status(404).json({ error: 'No final rosters found for this contest' });
    }
    
    res.json({
      success: true,
      contestId: parseInt(contestId),
      rosters
    });
  } catch (error) {
    console.error('Error fetching final rosters:', error);
    res.status(500).json({ error: 'Failed to fetch final rosters' });
  }
});

/**
 * GET /api/admin/draft-logs/:contestId/user/:userId
 * Get all picks for a specific user in a contest
 */
router.get('/:contestId/user/:userId', async (req, res) => {
  try {
    const { contestId, userId } = req.params;
    const picks = await DraftLogService.getUserPicks(contestId, parseInt(userId));
    
    res.json({
      success: true,
      contestId: parseInt(contestId),
      userId: parseInt(userId),
      totalPicks: picks.length,
      picks: picks.map(log => ({
        pickNumber: log.pick_number,
        turnNumber: log.turn_number,
        eventType: log.event_type,
        player: log.player_name ? {
          name: log.player_name,
          team: log.player_team,
          position: log.player_position,
          price: log.player_price
        } : null,
        wasAutoPick: log.was_auto_pick,
        rosterAfter: log.roster_snapshot,
        timestamp: log.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching user picks:', error);
    res.status(500).json({ error: 'Failed to fetch user picks' });
  }
});

module.exports = router;