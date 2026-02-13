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

// ==================== SLATE MANAGEMENT ====================

/**
 * GET /api/admin/settlement/slates
 * List all slates with their contests
 */
router.get('/slates', async (req, res) => {
  try {
    const db = require('../../models');
    
    const slates = await db.Slate.findAll({
      include: [{
        model: db.Contest,
        as: 'Contests',
        through: { attributes: [] } // exclude join table fields
      }],
      order: [['created_at', 'DESC']]
    });
    
    // Enrich with entry counts
    const enriched = await Promise.all(slates.map(async (slate) => {
      const contests = await Promise.all((slate.Contests || []).map(async (c) => {
        let entryCount = c.current_entries || 0;
        try {
          if (db.ContestEntry) {
            entryCount = await db.ContestEntry.count({
              where: { 
                contest_id: c.id,
                status: { [db.Sequelize.Op.ne]: 'cancelled' }
              }
            });
          }
        } catch (e) { /* use current_entries */ }
        
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          sport: c.sport || 'nfl',
          status: c.status,
          currentEntries: entryCount,
          maxEntries: c.max_entries,
          prizePool: parseFloat(c.prize_pool || 0),
          entryFee: parseFloat(c.entry_fee || 0),
          settledAt: c.settled_at
        };
      }));
      
      return {
        id: slate.id,
        name: slate.name,
        sport: slate.sport,
        week: slate.week,
        season: slate.season,
        scoresLocked: slate.scores_locked,
        status: slate.status,
        settledAt: slate.settled_at,
        createdAt: slate.created_at,
        contests
      };
    }));
    
    res.json({ success: true, slates: enriched });
  } catch (error) {
    console.error('Error listing slates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates
 * Create a new slate and attach contests to it
 * Body: { name, sport, week, season, contestIds: [...] }
 */
router.post('/slates', async (req, res) => {
  try {
    const { name, sport = 'nba', week = 1, season = 2025, contestIds = [] } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Slate name is required' });
    }
    
    const db = require('../../models');
    
    // Check that none of the contests are already in another slate
    if (contestIds.length > 0) {
      const existing = await db.sequelize.query(
        `SELECT contest_id FROM slate_contests WHERE contest_id IN (:ids)`,
        { replacements: { ids: contestIds }, type: db.Sequelize.QueryTypes.SELECT }
      );
      
      if (existing.length > 0) {
        const taken = existing.map(e => e.contest_id);
        return res.status(400).json({
          success: false,
          error: `${existing.length} contest(s) already assigned to another slate`,
          takenContestIds: taken
        });
      }
    }
    
    const slate = await db.Slate.create({
      name,
      sport,
      week,
      season
    });
    
    // Attach contests
    if (contestIds.length > 0) {
      const rows = contestIds.map(cid => ({
        slate_id: slate.id,
        contest_id: cid,
        created_at: new Date(),
        updated_at: new Date()
      }));
      await db.sequelize.queryInterface.bulkInsert('slate_contests', rows);
    }
    
    console.log(`📋 Created slate "${name}" with ${contestIds.length} contests`);
    
    res.json({
      success: true,
      slate: {
        id: slate.id,
        name: slate.name,
        sport: slate.sport,
        week: slate.week,
        season: slate.season,
        contestCount: contestIds.length
      }
    });
  } catch (error) {
    console.error('Error creating slate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/settlement/slates/:slateId/contests
 * Add or remove contests from a slate
 * Body: { add: [...contestIds], remove: [...contestIds] }
 */
router.put('/slates/:slateId/contests', async (req, res) => {
  try {
    const { slateId } = req.params;
    const { add = [], remove = [] } = req.body;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (slate.status === 'settled') {
      return res.status(400).json({ success: false, error: 'Cannot modify a settled slate' });
    }
    
    // Remove contests
    if (remove.length > 0) {
      await db.sequelize.query(
        `DELETE FROM slate_contests WHERE slate_id = :slateId AND contest_id IN (:ids)`,
        { replacements: { slateId, ids: remove } }
      );
    }
    
    // Add contests (check they're not in another slate)
    if (add.length > 0) {
      const existing = await db.sequelize.query(
        `SELECT contest_id FROM slate_contests WHERE contest_id IN (:ids)`,
        { replacements: { ids: add }, type: db.Sequelize.QueryTypes.SELECT }
      );
      
      const taken = new Set(existing.map(e => e.contest_id));
      const toAdd = add.filter(id => !taken.has(id));
      
      if (toAdd.length > 0) {
        const rows = toAdd.map(cid => ({
          slate_id: slateId,
          contest_id: cid,
          created_at: new Date(),
          updated_at: new Date()
        }));
        await db.sequelize.queryInterface.bulkInsert('slate_contests', rows);
      }
    }
    
    res.json({ success: true, message: 'Slate contests updated' });
  } catch (error) {
    console.error('Error updating slate contests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/settlement/slates/:slateId
 * Delete a slate (does NOT delete contests)
 */
router.delete('/slates/:slateId', async (req, res) => {
  try {
    const { slateId } = req.params;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    // CASCADE will clean up slate_contests
    await slate.destroy();
    
    res.json({ success: true, message: `Slate "${slate.name}" deleted` });
  } catch (error) {
    console.error('Error deleting slate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates/:slateId/lock-scores
 * Lock scores for a slate: finalize week + recalculate all contest entry scores
 */
router.post('/slates/:slateId/lock-scores', async (req, res) => {
  try {
    const { slateId } = req.params;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId, {
      include: [{ model: db.Contest, as: 'Contests', through: { attributes: [] } }]
    });
    
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    // 1. Finalize week scores
    const finalizedCount = await scoringService.finalizeWeekScores(slate.week, slate.season);
    console.log(`🔒 Finalized ${finalizedCount} player scores for Week ${slate.week}`);
    
    // 2. Recalculate scores for each contest in the slate
    let calcCount = 0;
    const errors = [];
    
    for (const contest of slate.Contests || []) {
      if (contest.status === 'settled') continue;
      
      try {
        await scoringService.recalculateContestScores(contest.id, slate.week, slate.season);
        calcCount++;
      } catch (e) {
        errors.push({ contestId: contest.id, error: e.message });
        console.error(`Failed to calc scores for ${contest.id}:`, e.message);
      }
    }
    
    // 3. Mark slate as locked
    await slate.update({ scores_locked: true });
    
    res.json({
      success: true,
      message: `Locked scores: ${finalizedCount} player scores finalized, ${calcCount} contests recalculated`,
      finalizedCount,
      calcCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error locking slate scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates/:slateId/settle
 * Settle all eligible contests in a slate
 * Body: { types: ['cash'] } - which contest types to settle (default: cash only)
 */
router.post('/slates/:slateId/settle', async (req, res) => {
  try {
    const { slateId } = req.params;
    const { types = ['cash'], force = false } = req.body;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId, {
      include: [{ model: db.Contest, as: 'Contests', through: { attributes: [] } }]
    });
    
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    
    if (!slate.scores_locked && !force) {
      return res.status(400).json({
        success: false,
        error: 'Scores must be locked before settling. Lock scores first or use force: true'
      });
    }
    
    console.log(`\n⚡ BATCH SETTLING SLATE "${slate.name}" (types: ${types.join(', ')})`);
    
    const eligible = (slate.Contests || []).filter(c => 
      types.includes(c.type) && 
      c.status !== 'settled' &&
      ['closed', 'completed', 'in_progress'].includes(c.status)
    );
    
    console.log(`Found ${eligible.length} eligible contests to settle`);
    
    const results = [];
    
    for (const contest of eligible) {
      try {
        const result = await settlementService.settleContest(contest.id);
        results.push({
          contestId: contest.id,
          name: contest.name,
          status: 'settled',
          winners: result.totalWinners || result.winners?.length || 0,
          detail: result
        });
        console.log(`✅ ${contest.name} settled`);
      } catch (error) {
        results.push({
          contestId: contest.id,
          name: contest.name,
          status: 'failed',
          error: error.message
        });
        console.error(`❌ ${contest.name} failed:`, error.message);
      }
    }
    
    const settledCount = results.filter(r => r.status === 'settled').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    // If all eligible contests settled, mark slate as settled
    const allContestsSettled = (slate.Contests || []).every(c => 
      c.status === 'settled' || results.some(r => r.contestId === c.id && r.status === 'settled')
    );
    
    if (allContestsSettled) {
      await slate.update({ status: 'settled', settled_at: new Date() });
    }
    
    res.json({
      success: true,
      message: `Settled ${settledCount} of ${eligible.length} contests (${failedCount} failed)`,
      settledCount,
      failedCount,
      results
    });
  } catch (error) {
    console.error('Error settling slate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/slates/:slateId/players
 * Get all unique players across all contests in a slate
 */
router.get('/slates/:slateId/players', async (req, res) => {
  try {
    const { slateId } = req.params;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId, {
      include: [{ model: db.Contest, as: 'Contests', through: { attributes: [] } }]
    });
    
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    const contestIds = (slate.Contests || []).map(c => c.id);
    
    if (contestIds.length === 0) {
      return res.json({ success: true, players: [], uniquePlayers: 0 });
    }
    
    // Get all lineups for contests in this slate
    const lineups = await db.Lineup.findAll({
      where: { contest_id: { [db.Sequelize.Op.in]: contestIds } }
    });
    
    // Also try via contest entries as fallback
    let entryLineups = [];
    if (lineups.length === 0) {
      const entries = await db.ContestEntry.findAll({
        where: {
          contest_id: { [db.Sequelize.Op.in]: contestIds },
          status: { [db.Sequelize.Op.ne]: 'cancelled' }
        }
      });
      
      const entryIds = entries.map(e => e.id);
      if (entryIds.length > 0) {
        entryLineups = await db.Lineup.findAll({
          where: { contest_entry_id: { [db.Sequelize.Op.in]: entryIds } }
        });
      }
    }
    
    const allLineups = [...lineups, ...entryLineups];
    
    // Collect unique players
    const playerMap = new Map();
    
    for (const lineup of allLineups) {
      let roster = lineup.roster;
      if (!roster) continue;
      if (typeof roster === 'string') {
        try { roster = JSON.parse(roster); } catch (e) { continue; }
      }
      
      const players = Array.isArray(roster)
        ? roster
        : Object.values(roster).filter(p => p && p.name);
      
      for (const player of players) {
        if (player && player.name) {
          const key = `${player.name}-${player.team || 'UNK'}`;
          if (playerMap.has(key)) {
            playerMap.get(key).draftCount++;
          } else {
            playerMap.set(key, {
              name: player.name,
              team: player.team || 'UNK',
              position: player.position || player.pos || 'UNK',
              draftCount: 1,
              score: null
            });
          }
        }
      }
    }
    
    // Check if players already have scores for this week/season
    if (scoringService && playerMap.size > 0) {
      try {
        const scores = await scoringService.getWeekScores(slate.week, slate.season);
        const scoreMap = new Map();
        for (const s of scores) {
          scoreMap.set(`${s.player_name}-${s.player_team}`, parseFloat(s.total_points || 0));
        }
        
        for (const [key, player] of playerMap) {
          if (scoreMap.has(key)) {
            player.score = scoreMap.get(key);
          }
        }
      } catch (e) {
        console.error('Error fetching existing scores:', e.message);
      }
    }
    
    const players = Array.from(playerMap.values()).sort((a, b) => {
      const posOrder = { QB: 0, PG: 0, RB: 1, SG: 1, WR: 2, SF: 2, TE: 3, PF: 3, K: 4, C: 4, DEF: 5 };
      const aPos = posOrder[a.position] ?? 99;
      const bPos = posOrder[b.position] ?? 99;
      if (aPos !== bPos) return aPos - bPos;
      return a.name.localeCompare(b.name);
    });
    
    res.json({
      success: true,
      slateId,
      lineupsFound: allLineups.length,
      uniquePlayers: players.length,
      players
    });
  } catch (error) {
    console.error('Error getting slate players:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates/:slateId/bulk-random-scores
 * Set random scores for all players in a slate's contests (testing)
 */
router.post('/slates/:slateId/bulk-random-scores', async (req, res) => {
  try {
    const { slateId } = req.params;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId, {
      include: [{ model: db.Contest, as: 'Contests', through: { attributes: [] } }]
    });
    
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    let totalScored = 0;
    
    for (const contest of slate.Contests || []) {
      if (contest.status === 'settled') continue;
      
      // Reuse existing bulk-set-scores logic per contest
      const lineups = await db.Lineup.findAll({ where: { contest_id: contest.id } });
      
      const playerMap = new Map();
      for (const lineup of lineups) {
        let roster = lineup.roster;
        if (!roster) continue;
        if (typeof roster === 'string') {
          try { roster = JSON.parse(roster); } catch (e) { continue; }
        }
        
        const players = Array.isArray(roster)
          ? roster
          : Object.values(roster).filter(p => p && p.name);
        
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
      
      for (const player of playerMap.values()) {
        let baseScore;
        const pos = player.position;
        // NFL positions
        if (pos === 'QB') baseScore = 18 + Math.random() * 15;
        else if (pos === 'RB') baseScore = 8 + Math.random() * 20;
        else if (pos === 'WR') baseScore = 6 + Math.random() * 22;
        else if (pos === 'TE') baseScore = 4 + Math.random() * 16;
        // NBA positions
        else if (pos === 'PG') baseScore = 20 + Math.random() * 25;
        else if (pos === 'SG') baseScore = 18 + Math.random() * 22;
        else if (pos === 'SF') baseScore = 16 + Math.random() * 24;
        else if (pos === 'PF') baseScore = 18 + Math.random() * 22;
        else if (pos === 'C') baseScore = 20 + Math.random() * 20;
        else baseScore = 5 + Math.random() * 15;
        
        const score = Math.round(baseScore * 10) / 10;
        
        await scoringService.setPlayerScore(
          player.name, player.team, slate.week, slate.season,
          { total: score, breakdown: {} }
        );
        totalScored++;
      }
    }
    
    res.json({
      success: true,
      message: `Set random scores for ${totalScored} players across slate`,
      playersScored: totalScored
    });
  } catch (error) {
    console.error('Error bulk setting slate scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CONTEST LISTING ====================

/**
 * GET /api/admin/settlement/contests
 * List all contests with their settlement status
 */
router.get('/contests', async (req, res) => {
  try {
    const db = require('../../models');
    
    const contests = await db.Contest.findAll({
      order: [['created_at', 'DESC']],
      limit: 200
    });
    
    // Get which contests are already in a slate
    let slateMap = {};
    try {
      const slateContests = await db.sequelize.query(
        `SELECT sc.contest_id, s.id as slate_id, s.name as slate_name 
         FROM slate_contests sc JOIN slates s ON s.id = sc.slate_id`,
        { type: db.Sequelize.QueryTypes.SELECT }
      );
      for (const sc of slateContests) {
        slateMap[sc.contest_id] = { slateId: sc.slate_id, slateName: sc.slate_name };
      }
    } catch (e) {
      // slate tables might not exist yet
    }
    
    const contestsWithStatus = await Promise.all(contests.map(async (c) => {
      let entryCount = c.current_entries || 0;
      try {
        if (db.ContestEntry) {
          entryCount = await db.ContestEntry.count({
            where: { contest_id: c.id, status: { [db.Sequelize.Op.ne]: 'cancelled' } }
          });
        }
      } catch (e) { /* use current_entries */ }
      
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        sport: c.sport || 'nfl',
        status: c.status,
        currentEntries: entryCount,
        maxEntries: c.max_entries,
        prizePool: parseFloat(c.prize_pool || 0),
        entryFee: parseFloat(c.entry_fee || 0),
        settledAt: c.settled_at,
        createdAt: c.created_at,
        slate: slateMap[c.id] || null
      };
    }));
    
    res.json({
      success: true,
      count: contestsWithStatus.length,
      contests: contestsWithStatus
    });
  } catch (error) {
    console.error('Error listing contests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PLAYER SCORE MANAGEMENT ====================
// (All existing routes below are unchanged)

router.get('/scores/:week/:season', async (req, res) => {
  try {
    const { week, season } = req.params;
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const scores = await scoringService.getWeekScores(parseInt(week), parseInt(season));
    res.json({ success: true, week: parseInt(week), season: parseInt(season), count: scores.length, scores });
  } catch (error) {
    console.error('Error getting scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/set-player-score', async (req, res) => {
  try {
    const { playerName, playerTeam, week, season, score, points, breakdown } = req.body;
    if (!playerName || (score === undefined && points === undefined)) {
      return res.status(400).json({ success: false, error: 'playerName and score/points are required' });
    }
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const scoreValue = score !== undefined ? score : points;
    const result = await scoringService.setPlayerScore(
      playerName, playerTeam || 'UNK', week || 1, season || 2025,
      { total: scoreValue, breakdown: breakdown || {} }
    );
    res.json({ success: true, message: `Score set for ${playerName}: ${scoreValue} pts`, result });
  } catch (error) {
    console.error('Error setting player score:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/bulk-import-scores', async (req, res) => {
  try {
    const { week, season, scores } = req.body;
    if (!week || !season || !scores || !Array.isArray(scores)) {
      return res.status(400).json({ success: false, error: 'Missing required fields: week, season, scores (array)' });
    }
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const result = await scoringService.bulkImportScores(scores, parseInt(week), parseInt(season));
    res.json({ success: true, message: `Imported ${result.success} scores (${result.failed} failed)`, ...result });
  } catch (error) {
    console.error('Error bulk importing scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/import-csv', async (req, res) => {
  try {
    const { week, season, csv } = req.body;
    if (!week || !season || !csv) {
      return res.status(400).json({ success: false, error: 'Missing required fields: week, season, csv' });
    }
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const result = await scoringService.importScoresFromCSV(csv, parseInt(week), parseInt(season));
    res.json({ success: true, message: `Imported ${result.success} scores from CSV`, ...result });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/finalize-week', async (req, res) => {
  try {
    const { week, season = 2025 } = req.body;
    if (!week) {
      return res.status(400).json({ success: false, error: 'week is required' });
    }
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const count = await scoringService.finalizeWeekScores(parseInt(week), parseInt(season));
    res.json({ success: true, message: `Finalized ${count} player scores for Week ${week}`, count });
  } catch (error) {
    console.error('Error finalizing week scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CONTEST SCORING ====================

router.post('/calculate-scores/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { week = 1, season = 2025 } = req.body;
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const results = await scoringService.recalculateContestScores(contestId, parseInt(week), parseInt(season));
    res.json({ success: true, message: `Calculated scores for ${results.calculated || results.length} entries`, ...results });
  } catch (error) {
    console.error('Error calculating scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/leaderboard/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { limit = 100 } = req.query;
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const leaderboard = await scoringService.getContestLeaderboard(contestId, parseInt(limit));
    const summary = await scoringService.getContestScoringSummary(contestId);
    res.json({ success: true, contestId, summary, entries: leaderboard.length, leaderboard });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/scoring-summary/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const summary = await scoringService.getContestScoringSummary(contestId);
    res.json({ success: true, contestId, ...summary });
  } catch (error) {
    console.error('Error getting scoring summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SETTLEMENT ====================

router.get('/validate/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const week = parseInt(req.query.week) || 1;
    const season = parseInt(req.query.season) || 2025;
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const validation = await scoringService.validateScoresForSettlement(contestId, week, season);
    res.json({ success: true, contestId, week, season, ...validation });
  } catch (error) {
    console.error('Error validating settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/score-template/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    const template = await scoringService.generateScoreTemplate(contestId);
    res.json({ success: true, contestId, playerCount: template.length, template });
  } catch (error) {
    console.error('Error generating score template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/status/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { week = 1, season = 2025 } = req.query;
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    const status = await settlementService.isReadyToSettle(contestId, parseInt(week), parseInt(season));
    res.json({ success: true, contestId, ...status });
  } catch (error) {
    console.error('Error checking settlement status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/preview/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    const preview = await settlementService.previewSettlement(contestId);
    res.json({ success: true, preview });
  } catch (error) {
    console.error('Error previewing settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/settle/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const { force = false, week = 1, season = 2025 } = req.body;
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    console.log(`\n🔧 Admin ${req.user.username} initiated settlement for contest ${contestId}`);
    
    if (!force && scoringService) {
      const validation = await scoringService.validateScoresForSettlement(contestId, parseInt(week), parseInt(season));
      if (!validation.ready) {
        return res.status(400).json({
          success: false, error: 'Not all players have scores',
          missingCount: validation.missingCount,
          missingScores: validation.missingScores.slice(0, 20),
          hint: 'Import missing scores or use force: true to settle anyway'
        });
      }
    }
    
    if (!force) {
      const status = await settlementService.isReadyToSettle(contestId);
      if (!status.ready && !status.allowForce) {
        return res.status(400).json({ success: false, error: status.reason, canForce: status.allowForce });
      }
    }
    
    const result = await settlementService.settleContest(contestId);
    res.json({ success: true, message: 'Contest settled successfully', result });
  } catch (error) {
    console.error('Error settling contest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/settle-all', async (req, res) => {
  try {
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    console.log(`\n🔧 Admin ${req.user.username} initiated batch settlement`);
    const result = await settlementService.settleAllReady();
    res.json({ success: true, message: `Settled ${result.successful} of ${result.total} contests`, result });
  } catch (error) {
    console.error('Error in batch settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/summary/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    if (!settlementService) {
      return res.status(500).json({ success: false, error: 'Settlement service not initialized' });
    }
    const summary = await settlementService.getSettlementSummary(contestId);
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error getting settlement summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DEBUGGING ====================

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
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });
    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error getting entry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/contest-players/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const db = require('../../models');
    
    const lineups = await db.Lineup.findAll({ where: { contest_id: contestId } });
    
    let allLineups = [...lineups];
    if (lineups.length === 0) {
      const entries = await db.ContestEntry.findAll({
        where: { contest_id: contestId, status: { [db.Sequelize.Op.ne]: 'cancelled' } }
      });
      const entryIds = entries.map(e => e.id);
      if (entryIds.length > 0) {
        const entryLineups = await db.Lineup.findAll({
          where: { contest_entry_id: { [db.Sequelize.Op.in]: entryIds } }
        });
        allLineups = entryLineups;
      }
    }
    
    const playerMap = new Map();
    for (const lineup of allLineups) {
      let roster = lineup.roster;
      if (!roster) continue;
      if (typeof roster === 'string') {
        try { roster = JSON.parse(roster); } catch (e) { continue; }
      }
      const players = Array.isArray(roster) ? roster : Object.values(roster).filter(p => p && p.name);
      for (const player of players) {
        if (player && player.name) {
          const key = `${player.name}-${player.team || 'UNK'}`;
          if (!playerMap.has(key)) {
            playerMap.set(key, { name: player.name, team: player.team || 'UNK', position: player.position || player.pos || 'UNK', price: player.price || 0, draftCount: 1 });
          } else {
            playerMap.get(key).draftCount++;
          }
        }
      }
    }
    
    const players = Array.from(playerMap.values()).sort((a, b) => b.draftCount - a.draftCount);
    res.json({ success: true, contestId, lineupsFound: allLineups.length, uniquePlayers: players.length, players });
  } catch (error) {
    console.error('Error getting contest players:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/bulk-set-scores', async (req, res) => {
  try {
    const { contestId, week = 1, season = 2025, randomize = true } = req.body;
    if (!contestId) return res.status(400).json({ success: false, error: 'contestId is required' });
    if (!scoringService) return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    
    const db = require('../../models');
    const lineups = await db.Lineup.findAll({ where: { contest_id: contestId } });
    
    const playerMap = new Map();
    for (const lineup of lineups) {
      let roster = lineup.roster;
      if (!roster) continue;
      if (typeof roster === 'string') { try { roster = JSON.parse(roster); } catch (e) { continue; } }
      const players = Array.isArray(roster) ? roster : Object.values(roster).filter(p => p && p.name);
      for (const player of players) {
        if (player && player.name) {
          const key = `${player.name}-${player.team || 'UNK'}`;
          if (!playerMap.has(key)) {
            playerMap.set(key, { name: player.name, team: player.team || 'UNK', position: player.position || player.pos || 'UNK' });
          }
        }
      }
    }
    
    const results = [];
    for (const player of playerMap.values()) {
      let baseScore;
      switch (player.position) {
        case 'QB': baseScore = 18 + Math.random() * 15; break;
        case 'RB': baseScore = 8 + Math.random() * 20; break;
        case 'WR': baseScore = 6 + Math.random() * 22; break;
        case 'TE': baseScore = 4 + Math.random() * 16; break;
        default: baseScore = 5 + Math.random() * 15; break;
      }
      const score = randomize ? Math.round(baseScore * 10) / 10 : baseScore;
      await scoringService.setPlayerScore(player.name, player.team, week, season, { total: score, breakdown: {} });
      results.push({ name: player.name, team: player.team, position: player.position, score });
    }
    
    res.json({ success: true, message: `Set scores for ${results.length} players`, playersScored: results.length, results });
  } catch (error) {
    console.error('Error bulk setting scores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { router, initializeRouter };