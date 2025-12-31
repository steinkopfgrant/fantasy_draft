// backend/src/routes/playerScoreRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const { PlayerScore, Contest, ContestEntry } = db;

// Get player scores for a contest
router.get('/contest/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    
    const scores = await PlayerScore.findAll({
      where: { contest_id: contestId },
      order: [['points', 'DESC']]
    });
    
    res.json(scores);
  } catch (error) {
    console.error('Get player scores error:', error);
    res.status(500).json({ error: 'Failed to fetch player scores' });
  }
});

// Update player scores (admin only or automated system)
router.post('/update', authMiddleware, async (req, res) => {
  try {
    const { contestId, playerScores } = req.body;
    
    // Verify contest exists
    const contest = await Contest.findByPk(contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    // Bulk create or update scores
    const scoreData = playerScores.map(score => ({
      contest_id: contestId,
      player_id: score.playerId,
      player_name: score.playerName,
      position: score.position,
      points: score.points,
      stats: score.stats || {}
    }));
    
    await PlayerScore.bulkCreate(scoreData, {
      updateOnDuplicate: ['points', 'stats']
    });
    
    // Update contest entry scores
    const entries = await ContestEntry.findAll({
      where: { 
        contest_id: contestId,
        status: 'completed'
      }
    });
    
    for (const entry of entries) {
      if (!entry.lineup) continue;
      
      let totalPoints = 0;
      const lineup = entry.lineup;
      
      for (const player of lineup) {
        const playerScore = playerScores.find(s => s.playerId === player.id);
        if (playerScore) {
          totalPoints += playerScore.points;
        }
      }
      
      await entry.update({ total_points: totalPoints });
    }
    
    res.json({ 
      success: true, 
      message: 'Scores updated successfully',
      updatedCount: scoreData.length 
    });
    
  } catch (error) {
    console.error('Update scores error:', error);
    res.status(500).json({ error: 'Failed to update scores' });
  }
});

// Get live scoring updates
router.get('/live/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    
    // Get all entries with their lineups
    const entries = await ContestEntry.findAll({
      where: { 
        contest_id: contestId,
        status: 'completed'
      },
      include: [{
        model: db.User,
        as: 'User',
        attributes: ['id', 'username']
      }]
    });
    
    // Get all player scores for this contest
    const playerScores = await PlayerScore.findAll({
      where: { contest_id: contestId }
    });
    
    // Create a map for quick lookup
    const scoreMap = {};
    playerScores.forEach(ps => {
      scoreMap[ps.player_id] = ps.points;
    });
    
    // Calculate standings
    const standings = entries.map(entry => {
      let totalPoints = 0;
      const lineupWithScores = [];
      
      if (entry.lineup) {
        entry.lineup.forEach(player => {
          const points = scoreMap[player.id] || 0;
          totalPoints += points;
          lineupWithScores.push({
            ...player,
            points
          });
        });
      }
      
      return {
        entryId: entry.id,
        userId: entry.user_id,
        username: entry.User?.username,
        totalPoints,
        lineup: lineupWithScores
      };
    });
    
    // Sort by points
    standings.sort((a, b) => b.totalPoints - a.totalPoints);
    
    res.json({
      contestId,
      standings,
      lastUpdate: new Date()
    });
    
  } catch (error) {
    console.error('Get live scores error:', error);
    res.status(500).json({ error: 'Failed to fetch live scores' });
  }
});

module.exports = router;