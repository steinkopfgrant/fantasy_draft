// backend/src/controllers/draftController.js
const contestService = require('../services/contestService');
const ticketService = require('../services/ticketService');

const savePick = async (req, res) => {
  try {
    const { entryId, pick, rosterSlot } = req.body;
    const userId = req.user.id;
    
    console.log('Saving pick:', { entryId, userId, playerName: pick?.player?.name, rosterSlot });
    
    // Save the pick
    const result = await contestService.saveDraftPick(entryId, {
      player: pick.player,
      rosterSlot: pick.rosterSlot || rosterSlot,
      userId,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Pick saved',
      pick: result
    });
  } catch (error) {
    console.error('Error saving pick:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const completeDraft = async (req, res) => {
  try {
    const { entryId, roster, totalSpent } = req.body;
    const userId = req.user.id;
    
    console.log('Completing draft:', { entryId, userId, totalSpent });
    
    // Verify the entry belongs to this user
    const entry = await contestService.getContestEntry(entryId);
    if (!entry || entry.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    // Complete the draft
    const updatedEntry = await contestService.completeDraft(entryId, roster, totalSpent);
    
    // Award ticket for completing draft
    const ticketResult = await ticketService.awardDraftCompletion(userId, entry.contestId);
    console.log(`Awarded 1 ticket to user ${userId} for completing draft`);
    
    res.json({
      success: true,
      message: 'Draft completed successfully',
      entry: updatedEntry,
      ticketAwarded: true,
      newTicketBalance: ticketResult.newBalance
    });
  } catch (error) {
    console.error('Error completing draft:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const getDraft = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.id;
    
    // Get draft data
    const entry = await contestService.getContestEntry(entryId);
    
    // Verify user owns this entry
    if (!entry || entry.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    res.json({
      success: true,
      draft: entry
    });
  } catch (error) {
    console.error('Error getting draft:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = {
  savePick,
  completeDraft,
  getDraft
};