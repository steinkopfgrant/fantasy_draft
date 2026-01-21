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

// ==================== CONTEST LISTING ====================

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

// ==================== PLAYER SCORE MANAGEMENT ====================

/**
 * GET /api/admin/settlement/scores/:week/:season
 * Get all player scores for a week
 */
router.get('/scores/:week/:season', async (req, res) => {
  try {
    const { week, season } = req.params;
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const scores = await scoringService.getWeekScores(parseInt(week), parseInt(season));
    
    res.json({
      success: true,
      week: parseInt(week),
      season: parseInt(season),
      count: scores.length,
      scores
    });
  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/set-player-score
 * Manually set a player's score
 */
router.post('/set-player-score', async (req, res) => {
  try {
    const { playerName, playerTeam, week, season, score, points, breakdown } = req.body;
    
    if (!playerName || (score === undefined && points === undefined)) {
      return res.status(400).json({
        success: false,
        error: 'playerName and score/points are required'
      });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const scoreValue = score !== undefined ? score : points;
    
    const result = await scoringService.setPlayerScore(
      playerName,
      playerTeam || 'UNK',
      week || 1,
      season || 2025,
      { total: scoreValue, breakdown: breakdown || {} }
    );
    
    res.json({
      success: true,
      message: `Score set for ${playerName}: ${scoreValue} pts`,
      result
    });
  } catch (error) {
    console.error('Error setting player score:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/bulk-import-scores
 * Import multiple player scores at once
 * Body: { week, season, scores: [{ name, team, points }, ...] }
 */
router.post('/bulk-import-scores', async (req, res) => {
  try {
    const { week, season, scores } = req.body;
    
    if (!week || !season || !scores || !Array.isArray(scores)) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: week, season, scores (array)' 
      });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const result = await scoringService.bulkImportScores(
      scores,
      parseInt(week),
      parseInt(season)
    );
    
    res.json({
      success: true,
      message: `Imported ${result.success} scores (${result.failed} failed)`,
      ...result
    });
  } catch (error) {
    console.error('Error bulk importing scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/import-csv
 * Import scores from CSV format
 * Body: { week, season, csv: "PlayerName,Team,Points\n..." }
 */
router.post('/import-csv', async (req, res) => {
  try {
    const { week, season, csv } = req.body;
    
    if (!week || !season || !csv) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: week, season, csv' 
      });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const result = await scoringService.importScoresFromCSV(
      csv,
      parseInt(week),
      parseInt(season)
    );
    
    res.json({
      success: true,
      message: `Imported ${result.success} scores from CSV`,
      ...result
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/finalize-week
 * Mark all scores for a week as final
 */
router.post('/finalize-week', async (req, res) => {
  try {
    const { week, season = 2025 } = req.body;
    
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

// ==================== CONTEST SCORING ====================

/**
 * POST /api/admin/settlement/calculate-scores/:contestId
 * Recalculate all entry scores for a contest
 */
router.post('/calculate-scores/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { week = 1, season = 2025 } = req.body;
    
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
      message: `Calculated scores for ${results.calculated || results.length} entries`,
      ...results
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
    const summary = await scoringService.getContestScoringSummary(contestId);
    
    res.json({
      success: true,
      contestId,
      summary,
      entries: leaderboard.length,
      leaderboard
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/scoring-summary/:contestId
 * Get scoring stats for a contest
 */
router.get('/scoring-summary/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const summary = await scoringService.getContestScoringSummary(contestId);
    
    res.json({
      success: true,
      contestId,
      ...summary
    });
  } catch (error) {
    console.error('Error getting scoring summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SETTLEMENT VALIDATION ====================

/**
 * GET /api/admin/settlement/validate/:contestId
 * Check if all rostered players have scores (pre-settlement check)
 */
router.get('/validate/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const week = parseInt(req.query.week) || 1;
    const season = parseInt(req.query.season) || 2025;
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const validation = await scoringService.validateScoresForSettlement(
      contestId,
      week,
      season
    );
    
    res.json({
      success: true,
      contestId,
      week,
      season,
      ...validation
    });
  } catch (error) {
    console.error('Error validating settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/score-template/:contestId
 * Get a template of all players that need scores
 */
router.get('/score-template/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const template = await scoringService.generateScoreTemplate(contestId);
    
    res.json({
      success: true,
      contestId,
      playerCount: template.length,
      template
    });
  } catch (error) {
    console.error('Error generating score template:', error);
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
    const { week = 1, season = 2025 } = req.query;
    
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

// ==================== SETTLEMENT EXECUTION ====================

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
    const { force = false, week = 1, season = 2025 } = req.body;
    
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    console.log(`\n🔧 Admin ${req.user.username} initiated settlement for contest ${contestId}`);
    
    // Validate scores unless forcing
    if (!force && scoringService) {
      const validation = await scoringService.validateScoresForSettlement(
        contestId,
        parseInt(week),
        parseInt(season)
      );
      
      if (!validation.ready) {
        return res.status(400).json({
          success: false,
          error: 'Not all players have scores',
          missingCount: validation.missingCount,
          missingScores: validation.missingScores.slice(0, 20),
          hint: 'Import missing scores or use force: true to settle anyway'
        });
      }
    }
    
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

// ==================== DEBUGGING / TESTING ====================

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
    
    // Get lineups directly by contest_id
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
      }
    }
    
    // Collect all unique players from lineups
    const playerMap = new Map();
    
    for (const lineup of lineups) {
      let roster = lineup.roster;
      
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
    const { contestId, week = 1, season = 2025, randomize = true } = req.body;
    
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
      let roster = lineup.roster;
      
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