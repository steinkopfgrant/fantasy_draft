// backend/src/routes/draftRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const contestService = require('../services/contestService');
const db = require('../models');

// Initialize draft - NEW ENDPOINT that DraftScreen needs
router.get('/initialize/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    console.log(`\n=== DRAFT INITIALIZATION ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`User ID: ${userId}`);
    
    // Get room status
    const roomStatus = await contestService.getRoomStatus(roomId);
    
    if (!roomStatus) {
      console.error('Room not found:', roomId);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    console.log(`Room status:`, {
      contestId: roomStatus.contestId,
      currentPlayers: roomStatus.currentPlayers,
      maxPlayers: roomStatus.maxPlayers,
      status: roomStatus.status
    });
    
    // Find user's entry in this room
    const userEntry = roomStatus.entries.find(e => e.userId === userId);
    
    if (!userEntry) {
      console.error('User not in room:', userId);
      return res.status(403).json({ error: 'Not a participant in this draft' });
    }
    
    console.log(`User entry found:`, {
      entryId: userEntry.id,
      position: userEntry.draftPosition,
      status: userEntry.status
    });
    
    // Get contest details
    const contest = await contestService.getContest(roomStatus.contestId);
    
    if (!contest) {
      console.error('Contest not found:', roomStatus.contestId);
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    // Build response with all necessary data
    const response = {
      success: true,
      roomId: roomId,
      contestId: roomStatus.contestId,
      contestType: contest.type,
      entryId: userEntry.id,
      userDraftPosition: userEntry.draftPosition || 0,
      status: roomStatus.status,
      playerBoard: roomStatus.playerBoard || contest.playerBoard,
      currentPlayers: roomStatus.currentPlayers,
      maxPlayers: roomStatus.maxPlayers,
      contestData: {
        contestId: contest.id,
        name: contest.name,
        type: contest.type
      },
      users: roomStatus.entries.map((entry, index) => ({
        userId: entry.userId,
        username: entry.username,
        position: entry.draftPosition || index,
        connected: false, // Will be updated via socket
        entryId: entry.id
      }))
    };
    
    console.log('Draft initialization successful');
    res.json(response);
    
  } catch (error) {
    console.error('Draft initialization error:', error);
    res.status(500).json({ 
      error: 'Failed to initialize draft',
      message: error.message 
    });
  }
});

// Get draft status
router.get('/:draftId/status', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    // Get draft/room status
    const roomStatus = await contestService.getRoomStatus(draftId);
    
    if (!roomStatus) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    // Check if user is part of this draft
    const isParticipant = roomStatus.entries.some(e => e.userId === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this draft' });
    }
    
    res.json(roomStatus);
    
  } catch (error) {
    console.error('Get draft status error:', error);
    res.status(500).json({ error: 'Failed to get draft status' });
  }
});

// Get user's active drafts
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    const activeEntries = await db.ContestEntry.findAll({
      where: {
        user_id: userId,
        status: { [db.Sequelize.Op.in]: ['pending', 'drafting'] }
      },
      include: [{
        model: db.Contest,
        attributes: ['id', 'name', 'type', 'player_board']
      }]
    });
    
    const activeDrafts = activeEntries.map(entry => ({
      entryId: entry.id,
      contestId: entry.contest_id,
      contestName: entry.Contest?.name,
      contestType: entry.Contest?.type,
      draftRoomId: entry.draft_room_id,
      status: entry.status,
      enteredAt: entry.entered_at
    }));
    
    res.json(activeDrafts);
    
  } catch (error) {
    console.error('Get active drafts error:', error);
    res.status(500).json({ error: 'Failed to get active drafts' });
  }
});

// Make a draft pick
router.post('/:draftId/pick', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    const { playerId, playerData, position } = req.body;
    const userId = req.user.id || req.user.userId;
    
    // Validate pick data
    if (!position || (!playerId && !playerData)) {
      return res.status(400).json({ 
        error: 'Missing required pick data' 
      });
    }
    
    // Process pick through contest service
    await contestService.handlePlayerPick(
      draftId, 
      userId, 
      playerData || { id: playerId }, 
      position
    );
    
    res.json({ 
      success: true,
      message: 'Pick recorded successfully'
    });
    
  } catch (error) {
    console.error('Make pick error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Auto-pick for user
router.post('/:draftId/auto-pick', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    // Trigger auto-pick
    await contestService.handleAutoPick(draftId, userId);
    
    res.json({ 
      success: true,
      message: 'Auto-pick triggered'
    });
    
  } catch (error) {
    console.error('Auto-pick error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get draft picks for a room
router.get('/:draftId/picks', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    // Get room status to verify user is participant
    const roomStatus = await contestService.getRoomStatus(draftId);
    
    if (!roomStatus) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    const isParticipant = roomStatus.entries.some(e => e.userId === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this draft' });
    }
    
    // Get all picks for this draft room
    const picks = await db.DraftPick.findAll({
      where: { draft_room_id: draftId },
      include: [{
        model: db.User,
        attributes: ['id', 'username']
      }],
      order: [['pick_number', 'ASC']]
    });
    
    const formattedPicks = picks.map(pick => ({
      id: pick.id,
      userId: pick.user_id,
      username: pick.User?.username,
      playerData: pick.player_data,
      rosterSlot: pick.roster_slot,
      pickNumber: pick.pick_number,
      isAutoPick: pick.is_auto_pick,
      pickTime: pick.created_at
    }));
    
    res.json(formattedPicks);
    
  } catch (error) {
    console.error('Get picks error:', error);
    res.status(500).json({ error: 'Failed to get picks' });
  }
});

// Get user's lineup for a draft
router.get('/:draftId/lineup/:userId', authMiddleware, async (req, res) => {
  try {
    const { draftId, userId: targetUserId } = req.params;
    const requestingUserId = req.user.id || req.user.userId;
    
    // Get the entry
    const entry = await db.ContestEntry.findOne({
      where: {
        draft_room_id: draftId,
        user_id: targetUserId
      }
    });
    
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    // Only allow viewing own lineup or if draft is completed
    if (targetUserId !== requestingUserId && entry.status !== 'completed') {
      return res.status(403).json({ error: 'Cannot view other lineups during draft' });
    }
    
    res.json({
      lineup: entry.lineup || [],
      roster: entry.roster || {},
      totalSpent: entry.total_spent || 0,
      status: entry.status
    });
    
  } catch (error) {
    console.error('Get lineup error:', error);
    res.status(500).json({ error: 'Failed to get lineup' });
  }
});

// Complete draft manually (in case of issues)
router.post('/:draftId/complete', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    // Get user's entry for this draft
    const entry = await db.ContestEntry.findOne({
      where: {
        draft_room_id: draftId,
        user_id: userId,
        status: 'drafting'
      }
    });
    
    if (!entry) {
      return res.status(404).json({ error: 'Active draft entry not found' });
    }
    
    // Check if user has completed all picks
    const pickCount = await db.DraftPick.count({
      where: {
        entry_id: entry.id
      }
    });
    
    if (pickCount < 5) { // Changed from 8 to 5 for your game
      return res.status(400).json({ 
        error: `Draft incomplete. You have ${pickCount}/5 picks.` 
      });
    }
    
    // Get all picks and build roster
    const picks = await db.DraftPick.findAll({
      where: { entry_id: entry.id },
      order: [['pick_number', 'ASC']]
    });
    
    const roster = {};
    const lineup = [];
    let totalSpent = 0;
    
    picks.forEach(pick => {
      roster[pick.roster_slot] = pick.player_data;
      lineup.push({
        player: pick.player_data,
        rosterSlot: pick.roster_slot
      });
      totalSpent += pick.player_data.price || 0;
    });
    
    // Complete the draft
    await contestService.completeDraft(entry.id, roster, totalSpent);
    
    res.json({
      success: true,
      message: 'Draft completed successfully',
      totalSpent,
      pickCount: picks.length
    });
    
  } catch (error) {
    console.error('Complete draft error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get draft timer status
router.get('/:draftId/timer', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    
    // Try to get active draft from draftService if available
    let activeDraft = null;
    try {
      const draftService = require('../services/draftService');
      const draftState = await draftService.getDraft(draftId);
      if (draftState) {
        activeDraft = {
          participants: draftState.teams,
          picks: draftState.picks,
          currentTurn: draftState.currentTurn
        };
      }
    } catch (error) {
      console.log('Draft service not available, using contest service');
    }
    
    if (!activeDraft) {
      // Fallback to contest service
      const roomStatus = await contestService.getRoomStatus(draftId);
      if (!roomStatus) {
        return res.status(404).json({ error: 'No active draft found' });
      }
      
      return res.json({
        currentPick: 0,
        totalPicks: roomStatus.maxPlayers * 5,
        currentPlayer: null,
        timeRemaining: 30
      });
    }
    
    const draftOrder = contestService.createSnakeDraftOrder(activeDraft.participants.length);
    const currentPlayerIndex = draftOrder[activeDraft.currentTurn] || 0;
    const currentPlayer = activeDraft.participants[currentPlayerIndex];
    
    res.json({
      currentPick: activeDraft.currentTurn + 1,
      totalPicks: activeDraft.participants.length * 5,
      currentPlayer: currentPlayer ? {
        userId: currentPlayer.userId,
        username: currentPlayer.username || currentPlayer.name
      } : null,
      timeRemaining: 30 // Always 30 seconds per pick
    });
    
  } catch (error) {
    console.error('Get timer error:', error);
    res.status(500).json({ error: 'Failed to get timer status' });
  }
});

module.exports = router;