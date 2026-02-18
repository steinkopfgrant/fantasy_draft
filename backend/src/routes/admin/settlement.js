// backend/src/routes/admin/settlement.js
const express = require('express');
const router = express.Router();

let settlementService = null;
let scoringService = null;

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

router.use(checkAdmin);

// ==================== SLATE MANAGEMENT (V2 - Upstream Controller) ====================

/**
 * GET /api/admin/settlement/slates
 * List all slates with their contests (via direct FK on contests)
 */
router.get('/slates', async (req, res) => {
  try {
    const db = require('../../models');
    
    const slates = await db.Slate.findAll({
      order: [['created_at', 'DESC']]
    });
    
    const enriched = await Promise.all(slates.map(async (slate) => {
      // Get contests via direct FK
      const contests = await db.Contest.findAll({
        where: { slate_id: slate.id },
        order: [['created_at', 'DESC']]
      });
      
      const contestData = await Promise.all(contests.map(async (c) => {
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
        gameStartTime: slate.game_start_time,
        closesAt: slate.closes_at,
        scoresLocked: slate.scores_locked,
        status: slate.status,
        settledAt: slate.settled_at,
        createdAt: slate.created_at,
        contests: contestData
      };
    }));
    
    res.json({ success: true, slates: enriched });
  } catch (error) {
    console.error('Error listing slates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/settlement/slates/active
 * Get the currently active slate per sport (or all active slates)
 */
router.get('/slates/active', async (req, res) => {
  try {
    const db = require('../../models');
    const { sport } = req.query;
    
    const where = { status: 'active' };
    if (sport) where.sport = sport.toLowerCase();
    
    const slates = await db.Slate.findAll({ where });
    
    res.json({ 
      success: true, 
      slates: slates.map(s => ({
        id: s.id,
        name: s.name,
        sport: s.sport,
        week: s.week,
        season: s.season,
        gameStartTime: s.game_start_time,
        closesAt: s.closes_at
      }))
    });
  } catch (error) {
    console.error('Error getting active slates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates
 * Create a new slate (upstream controller for a sport's scoring period)
 * Body: { name, sport, week, season, gameStartTime? }
 * 
 * Creating a slate makes it the ACTIVE slate for that sport.
 * Only one active slate per sport at a time.
 * Any existing active slate for that sport stays as-is (should be closed first).
 */
router.post('/slates', async (req, res) => {
  try {
    const { name, sport = 'nba', week = 1, season = 2025, gameStartTime } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Slate name is required' });
    }
    
    const db = require('../../models');
    
    // Check if there's already an active slate for this sport
    const existingActive = await db.Slate.findOne({
      where: { sport: sport.toLowerCase(), status: 'active' }
    });
    
    if (existingActive) {
      return res.status(400).json({
        success: false,
        error: `There's already an active ${sport.toUpperCase()} slate: "${existingActive.name}". Close it before creating a new one.`,
        existingSlateId: existingActive.id
      });
    }
    
    // Calculate closes_at (5 min before game start) if gameStartTime provided
    let closesAt = null;
    if (gameStartTime) {
      closesAt = new Date(new Date(gameStartTime).getTime() - 5 * 60 * 1000);
    }
    
    const slate = await db.Slate.create({
      name,
      sport: sport.toLowerCase(),
      week,
      season,
      game_start_time: gameStartTime || null,
      closes_at: closesAt,
      status: 'active'
    });
    
    // Auto-assign any existing unassigned cash contests for this sport to the new slate
    const [assignedCount] = await db.sequelize.query(
      `UPDATE contests SET slate_id = :slateId 
       WHERE sport = :sport AND type = 'cash' AND slate_id IS NULL 
       AND status NOT IN ('settled', 'completed')`,
      { replacements: { slateId: slate.id, sport: sport.toLowerCase() } }
    );
    
    console.log(`📋 Created slate "${name}" for ${sport.toUpperCase()} (auto-assigned ${assignedCount?.rowCount || 0} existing contests)`);
    
    res.json({
      success: true,
      slate: {
        id: slate.id,
        name: slate.name,
        sport: slate.sport,
        week: slate.week,
        season: slate.season,
        gameStartTime: slate.game_start_time,
        closesAt: slate.closes_at,
        status: slate.status
      },
      autoAssigned: assignedCount?.rowCount || 0
    });
  } catch (error) {
    console.error('Error creating slate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/settlement/slates/:slateId
 * Update slate details (name, gameStartTime, etc.)
 */
router.put('/slates/:slateId', async (req, res) => {
  try {
    const { slateId } = req.params;
    const { name, gameStartTime, week, season } = req.body;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    const updates = {};
    if (name) updates.name = name;
    if (week) updates.week = week;
    if (season) updates.season = season;
    if (gameStartTime) {
      updates.game_start_time = gameStartTime;
      updates.closes_at = new Date(new Date(gameStartTime).getTime() - 5 * 60 * 1000);
    }
    
    await slate.update(updates);
    
    res.json({ success: true, message: 'Slate updated', slate });
  } catch (error) {
    console.error('Error updating slate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates/:slateId/close
 * Close a slate — closes all its contests (no more entries)
 * This happens automatically 5 min before game_start_time, or manually
 */
router.post('/slates/:slateId/close', async (req, res) => {
  try {
    const { slateId } = req.params;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (slate.status !== 'active') {
      return res.status(400).json({ success: false, error: `Slate is already ${slate.status}` });
    }
    
    // Close all contests in this slate that are still open
    const [result] = await db.sequelize.query(
      `UPDATE contests SET status = 'closed' WHERE slate_id = :slateId AND status = 'open'`,
      { replacements: { slateId } }
    );
    
    await slate.update({ status: 'closed' });
    
    console.log(`🔒 Closed slate "${slate.name}" — ${result?.rowCount || 0} contests closed`);
    
    res.json({
      success: true,
      message: `Slate "${slate.name}" closed`,
      contestsClosed: result?.rowCount || 0
    });
  } catch (error) {
    console.error('Error closing slate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates/:slateId/assign-contests
 * Manually assign existing contests to this slate (for retroactive grouping)
 * Body: { contestIds: [...] }
 */
router.post('/slates/:slateId/assign-contests', async (req, res) => {
  try {
    const { slateId } = req.params;
    const { contestIds = [] } = req.body;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (contestIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No contest IDs provided' });
    }
    
    const [result] = await db.sequelize.query(
      `UPDATE contests SET slate_id = :slateId WHERE id IN (:ids) AND (slate_id IS NULL OR slate_id = :slateId)`,
      { replacements: { slateId, ids: contestIds } }
    );
    
    res.json({
      success: true,
      message: `Assigned ${result?.rowCount || 0} contests to slate`,
      assigned: result?.rowCount || 0
    });
  } catch (error) {
    console.error('Error assigning contests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/settlement/slates/:slateId/unassign-contests
 * Remove contests from this slate
 * Body: { contestIds: [...] }
 */
router.post('/slates/:slateId/unassign-contests', async (req, res) => {
  try {
    const { slateId } = req.params;
    const { contestIds = [] } = req.body;
    const db = require('../../models');
    
    const [result] = await db.sequelize.query(
      `UPDATE contests SET slate_id = NULL WHERE id IN (:ids) AND slate_id = :slateId`,
      { replacements: { slateId, ids: contestIds } }
    );
    
    res.json({
      success: true,
      message: `Unassigned ${result?.rowCount || 0} contests`,
      unassigned: result?.rowCount || 0
    });
  } catch (error) {
    console.error('Error unassigning contests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/settlement/slates/:slateId
 * Delete a slate (sets slate_id = NULL on contests, does NOT delete them)
 */
router.delete('/slates/:slateId', async (req, res) => {
  try {
    const { slateId } = req.params;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    // Clear slate_id from contests (ON DELETE SET NULL handles this, but be explicit)
    await db.sequelize.query(
      `UPDATE contests SET slate_id = NULL WHERE slate_id = :slateId`,
      { replacements: { slateId } }
    );
    
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
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    // Get contests for this slate
    const contests = await db.Contest.findAll({
      where: { slate_id: slateId }
    });
    
    // 1. Finalize week scores
    const finalizedCount = await scoringService.finalizeWeekScores(slate.week, slate.season);
    console.log(`🔒 Finalized ${finalizedCount} player scores for Week ${slate.week}`);
    
    // 2. Recalculate scores for each contest in the slate
    let calcCount = 0;
    const errors = [];
    
    for (const contest of contests) {
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
 * Body: { types: ['cash'], force: false }
 */
router.post('/slates/:slateId/settle', async (req, res) => {
  try {
    const { slateId } = req.params;
    const { types = ['cash'], force = false } = req.body;
    const db = require('../../models');
    
    const slate = await db.Slate.findByPk(slateId);
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
    
    const contests = await db.Contest.findAll({
      where: { slate_id: slateId }
    });
    
    console.log(`\n⚡ BATCH SETTLING SLATE "${slate.name}" (types: ${types.join(', ')})`);
    
    const eligible = contests.filter(c => 
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
    
    // Check if ALL contests in slate are now settled
    const allContests = await db.Contest.findAll({ where: { slate_id: slateId } });
    const allSettled = allContests.every(c => 
      c.status === 'settled' || results.some(r => r.contestId === c.id && r.status === 'settled')
    );
    
    if (allSettled && allContests.length > 0) {
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
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    const contests = await db.Contest.findAll({
      where: { slate_id: slateId }
    });
    
    const contestIds = contests.map(c => c.id);
    
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
    
    // Check existing scores - DIRECT DB QUERY (bypasses scoringService which may filter by is_final)
    if (playerMap.size > 0) {
      try {
        const scores = await db.sequelize.query(
          `SELECT player_name, player_team, fantasy_points FROM player_scores 
           WHERE week = :week AND season = :season`,
          { 
            replacements: { week: slate.week, season: slate.season },
            type: db.Sequelize.QueryTypes.SELECT 
          }
        );
        console.log(`📊 Found ${scores.length} player scores for Week ${slate.week}, Season ${slate.season}`);
        
        const scoreMap = new Map();
        for (const s of scores) {
          scoreMap.set(`${s.player_name}-${s.player_team}`, parseFloat(s.fantasy_points || 0));
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
    
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) {
      return res.status(404).json({ success: false, error: 'Slate not found' });
    }
    
    if (!scoringService) {
      return res.status(500).json({ success: false, error: 'Scoring service not initialized' });
    }
    
    const contests = await db.Contest.findAll({
      where: { slate_id: slateId }
    });
    
    let totalScored = 0;
    
    for (const contest of contests) {
      if (contest.status === 'settled') continue;
      
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
        if (pos === 'QB') baseScore = 18 + Math.random() * 15;
        else if (pos === 'RB') baseScore = 8 + Math.random() * 20;
        else if (pos === 'WR') baseScore = 6 + Math.random() * 22;
        else if (pos === 'TE') baseScore = 4 + Math.random() * 16;
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
 * List all contests with their settlement status and slate info
 */
router.get('/contests', async (req, res) => {
  try {
    const db = require('../../models');
    
    const contests = await db.Contest.findAll({
      order: [['created_at', 'DESC']],
      limit: 200
    });
    
    // Build slate lookup
    let slateMap = {};
    try {
      const slates = await db.Slate.findAll({ attributes: ['id', 'name'] });
      for (const s of slates) {
        slateMap[s.id] = s.name;
      }
    } catch (e) { /* slate table might not exist */ }
    
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
        slateId: c.slate_id || null,
        slateName: c.slate_id ? (slateMap[c.slate_id] || null) : null
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