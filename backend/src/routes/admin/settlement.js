// backend/src/routes/admin/settlement.js
const express = require('express');
const router = express.Router();

// These will be set when the router is initialized
let settlementService = null;
let scoringService = null;

/**
 * Initialize the router with services
 */
const initializeRouter = (services) => {
  settlementService = services.settlementService;
  scoringService = services.scoringService;
  return router;
};

// Simple admin check middleware
const checkAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const db = require('../../models');
    const user = await db.User.findByPk(decoded.id || decoded.userId);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    
    if (!user.is_admin && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error.message);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Apply admin check to all routes
router.use(checkAdmin);

/**
 * GET /api/admin/settlement/contests
 * List all contests with their settlement status
 */
router.get('/contests', async (req, res) => {
  try {
    console.log('📋 Fetching all contests for settlement panel...');
    const db = require('../../models');
    
    if (!db.Contest) {
      console.error('❌ Contest model not found!');
      return res.status(500).json({ success: false, error: 'Contest model not available' });
    }
    
    const contests = await db.Contest.findAll({
      order: [['created_at', 'DESC']],
      limit: 100
    });
    
    console.log(`📋 Found ${contests.length} contests`);
    
    // Count entries for each contest
    const contestsWithStatus = await Promise.all(contests.map(async (c) => {
      let entryCount = c.current_entries || 0;
      
      // Try to get actual entry count
      try {
        if (db.ContestEntry) {
          entryCount = await db.ContestEntry.count({
            where: { 
              contest_id: c.id,
              status: { [db.Sequelize.Op.ne]: 'cancelled' }
            }
          });
        }
      } catch (e) {
        // Use current_entries if count fails
      }
      
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        currentEntries: entryCount,
        maxEntries: c.max_entries,
        prizePool: parseFloat(c.prize_pool || 0),
        entryFee: parseFloat(c.entry_fee || 0),
        settledAt: c.settled_at,
        createdAt: c.created_at
      };
    }));
    
    res.json({
      success: true,
      count: contestsWithStatus.length,
      contests: contestsWithStatus
    });
  } catch (error) {
    console.error('❌ Error listing contests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/status/:contestId
 * Check if a contest is ready to settle
 */
router.get('/status/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { week = 1, season = 2024 } = req.query;
    
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    const status = await settlementService.isReadyToSettle(contestId, parseInt(week), parseInt(season));
    
    res.json({
      success: true,
      contestId,
      ...status
    });
  } catch (error) {
    console.error('Error checking settlement status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/preview/:contestId
 * Preview settlement results without committing
 */
router.get('/preview/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    const preview = await settlementService.previewSettlement(contestId);
    
    res.json({
      success: true,
      preview
    });
  } catch (error) {
    console.error('Error previewing settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/settle/:contestId
 * Settle a specific contest
 */
router.post('/settle/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { force = false } = req.body;
    
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    console.log(`\n🔧 Admin ${req.user.username} initiated settlement for contest ${contestId}`);
    
    // Check readiness unless forcing
    if (!force) {
      const status = await settlementService.isReadyToSettle(contestId);
      if (!status.ready && !status.allowForce) {
        return res.status(400).json({
          success: false,
          error: status.reason,
          canForce: status.allowForce
        });
      }
    }
    
    const result = await settlementService.settleContest(contestId);
    
    res.json({
      success: true,
      message: 'Contest settled successfully',
      result
    });
  } catch (error) {
    console.error('Error settling contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/settle-all
 * Settle all contests that are ready
 */
router.post('/settle-all', async (req, res) => {
  try {
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    console.log(`\n🔧 Admin ${req.user.username} initiated batch settlement`);
    
    const result = await settlementService.settleAllReady();
    
    res.json({
      success: true,
      message: `Settled ${result.successful} of ${result.total} contests`,
      result
    });
  } catch (error) {
    console.error('Error in batch settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/summary/:contestId
 * Get settlement summary for a contest
 */
router.get('/summary/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    const summary = await settlementService.getSettlementSummary(contestId);
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error getting settlement summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/calculate-scores/:contestId
 * Recalculate all entry scores for a contest
 */
router.post('/calculate-scores/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { week = 1, season = 2024 } = req.body;
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    console.log(`\n🔧 Admin ${req.user.username} calculating scores for contest ${contestId}`);
    
    const results = await scoringService.recalculateContestScores(
      contestId,
      parseInt(week),
      parseInt(season)
    );
    
    res.json({
      success: true,
      message: `Calculated scores for ${results.length} entries`,
      results
    });
  } catch (error) {
    console.error('Error calculating scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/leaderboard/:contestId
 * Get current leaderboard for a contest
 */
router.get('/leaderboard/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { limit = 100 } = req.query;
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const leaderboard = await scoringService.getContestLeaderboard(contestId, parseInt(limit));
    
    res.json({
      success: true,
      contestId,
      entries: leaderboard.length,
      leaderboard
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/set-player-score
 * Manually set a player's score (for testing)
 */
router.post('/set-player-score', async (req, res) => {
  try {
    const { playerName, playerTeam, week, season, score, breakdown } = req.body;
    
    if (!playerName || !playerTeam || score === undefined) {
      return res.status(400).json({
        success: false,
        error: 'playerName, playerTeam, and score are required'
      });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const result = await scoringService.setPlayerScore(
      playerName,
      playerTeam,
      week || 1,
      season || 2024,
      { total: score, breakdown: breakdown || {} }
    );
    
    res.json({
      success: true,
      message: `Score set for ${playerName}: ${score} pts`,
      result
    });
  } catch (error) {
    console.error('Error setting player score:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/finalize-week
 * Mark all scores for a week as final
 */
router.post('/finalize-week', async (req, res) => {
  try {
    const { week, season = 2024 } = req.body;
    
    if (!week) {
      return res.status(400).json({
        success: false,
        error: 'week is required'
      });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const count = await scoringService.finalizeWeekScores(parseInt(week), parseInt(season));
    
    res.json({
      success: true,
      message: `Finalized ${count} player scores for Week ${week}`,
      count
    });
  } catch (error) {
    console.error('Error finalizing week scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/entry/:entryId
 * Get details for a specific entry
 */
router.get('/entry/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;
    const db = require('../../models');
    
    const entry = await db.ContestEntry.findByPk(entryId, {
      include: [
        { model: db.User, attributes: ['id', 'username'] },
        { model: db.Contest, attributes: ['id', 'name', 'type'] },
        { model: db.Lineup }
      ]
    });
    
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    
    res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('Error getting entry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/contest-players/:contestId
 * Get all unique players drafted in a contest (for bulk scoring)
 */
router.get('/contest-players/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const db = require('../../models');
    
    console.log(`📋 Getting drafted players for contest ${contestId}`);
    
    // Get lineups directly by contest_id (lineups table has contest_id column!)
    const lineups = await db.Lineup.findAll({
      where: { contest_id: contestId }
    });
    
    console.log(`📋 Found ${lineups.length} lineups directly for this contest`);
    
    // If no lineups found by contest_id, try via entry IDs as fallback
    if (lineups.length === 0) {
      const entries = await db.ContestEntry.findAll({
        where: { 
          contest_id: contestId,
          status: { [db.Sequelize.Op.ne]: 'cancelled' }
        }
      });
      
      console.log(`📋 Found ${entries.length} entries, checking their lineups...`);
      const entryIds = entries.map(e => e.id);
      
      const entryLineups = await db.Lineup.findAll({
        where: {
          contest_entry_id: { [db.Sequelize.Op.in]: entryIds }
        }
      });
      
      if (entryLineups.length > 0) {
        lineups.push(...entryLineups);
        console.log(`📋 Found ${entryLineups.length} lineups via entry IDs`);
      } else {
        // Debug: show sample lineups to find working contests
        const sampleLineups = await db.Lineup.findAll({ 
          attributes: ['contest_id'],
          group: ['contest_id'],
          limit: 5 
        });
        console.log(`📋 Contests with lineups:`, sampleLineups.map(l => l.contest_id));
      }
    }
    
    // Collect all unique players from lineups
    const playerMap = new Map();
    
    for (const lineup of lineups) {
      let roster = lineup.roster;  // Changed from lineup.players
      
      // Handle different storage formats
      if (!roster) {
        console.log(`📋 Lineup ${lineup.id} has no roster field`);
        continue;
      }
      
      console.log(`📋 Lineup roster type: ${typeof roster}`);
      
      if (typeof roster === 'string') {
        try {
          roster = JSON.parse(roster);
        } catch (e) {
          console.log('Failed to parse roster JSON:', e.message);
          continue;
        }
      }
      
      // Handle if it's an object with position keys vs array
      let players;
      if (Array.isArray(roster)) {
        players = roster;
      } else {
        console.log(`📋 Roster is object with keys:`, Object.keys(roster));
        // Format is { QB: {...}, RB: {...}, WR: {...}, TE: {...}, FLEX: {...} }
        players = Object.values(roster).filter(p => p && p.name);
      }
      
      console.log(`📋 Lineup has ${players.length} players`);
      
      for (const player of players) {
        if (player && player.name) {
          const key = `${player.name}-${player.team || 'UNK'}`;
          if (!playerMap.has(key)) {
            playerMap.set(key, {
              name: player.name,
              team: player.team || 'UNK',
              position: player.position || player.pos || 'UNK',
              price: player.price || 0,
              draftCount: 1
            });
          } else {
            playerMap.get(key).draftCount++;
          }
        }
      }
    }
    
    const players = Array.from(playerMap.values())
      .sort((a, b) => b.draftCount - a.draftCount);
    
    console.log(`📋 Found ${players.length} unique players`);
    
    res.json({
      success: true,
      contestId,
      lineupsFound: lineups.length,
      uniquePlayers: players.length,
      players
    });
  } catch (error) {
    console.error('Error getting contest players:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/bulk-set-scores
 * Set random scores for all players in a contest (for testing)
 */
router.post('/bulk-set-scores', async (req, res) => {
  try {
    const { contestId, week = 1, season = 2024, randomize = true } = req.body;
    
    if (!contestId) {
      return res.status(400).json({ success: false, error: 'contestId is required' });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const db = require('../../models');
    
    // Get lineups directly by contest_id
    const lineups = await db.Lineup.findAll({
      where: { contest_id: contestId }
    });
    
    console.log(`📊 Found ${lineups.length} lineups for contest ${contestId}`);
    
    // Collect unique players
    const playerMap = new Map();
    
    for (const lineup of lineups) {
      let roster = lineup.roster;  // Changed from lineup.players
      
      if (!roster) continue;
      if (typeof roster === 'string') {
        try {
          roster = JSON.parse(roster);
        } catch (e) {
          continue;
        }
      }
      
      // Handle object format { QB: {...}, RB: {...}, ... }
      let players;
      if (Array.isArray(roster)) {
        players = roster;
      } else {
        players = Object.values(roster).filter(p => p && p.name);
      }
      
      for (const player of players) {
        if (player && player.name) {
          const key = `${player.name}-${player.team || 'UNK'}`;
          if (!playerMap.has(key)) {
            playerMap.set(key, {
              name: player.name,
              team: player.team || 'UNK',
              position: player.position || player.pos || 'UNK'
            });
          }
        }
      }
    }
    
    // Set scores for each player
    const results = [];
    for (const player of playerMap.values()) {
      // Generate score based on position
      let baseScore;
      switch (player.position) {
        case 'QB': baseScore = 18 + Math.random() * 15; break; // 18-33
        case 'RB': baseScore = 8 + Math.random() * 20; break;  // 8-28
        case 'WR': baseScore = 6 + Math.random() * 22; break;  // 6-28
        case 'TE': baseScore = 4 + Math.random() * 16; break;  // 4-20
        default: baseScore = 5 + Math.random() * 15; break;    // 5-20
      }
      
      const score = randomize ? Math.round(baseScore * 10) / 10 : baseScore;
      
      await scoringService.setPlayerScore(
        player.name,
        player.team,
        week,
        season,
        { total: score, breakdown: {} }
      );
      
      results.push({ name: player.name, team: player.team, position: player.position, score });
    }
    
    console.log(`📊 Bulk set scores for ${results.length} players in contest ${contestId}`);
    
    res.json({
      success: true,
      message: `Set scores for ${results.length} players`,
      playersScored: results.length,
      results
    });
  } catch (error) {
    console.error('Error bulk setting scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { router, initializeRouter };