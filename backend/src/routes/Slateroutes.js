// backend/src/routes/slateRoutes.js
// Admin routes for slate management + injury swap integration
//
// WORKFLOW:
//   1. Create slate (or use existing active one)
//   2. As game time approaches, admin marks OUT players via POST /api/slates/:slateId/injuries
//   3. Admin locks slate via POST /api/slates/:slateId/lock
//      → This triggers injury swaps on all drafted lineups in the slate
//   4. Games play, scores come in
//   5. Admin settles slate via POST /api/slates/:slateId/settle

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const { Op } = require('sequelize');

// Import injury swap service
let injurySwapService;
try {
  injurySwapService = require('../services/injurySwapService');
} catch (error) {
  console.log('⚠️ Injury swap service not available in slateRoutes');
  injurySwapService = null;
}

// ============================================
// ADMIN CHECK HELPER
// ============================================
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const user = await db.User.findByPk(userId);
    if (!user || (user.username !== 'aaaaaa' && !user.is_admin)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    req.adminUser = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Auth check failed' });
  }
};

// ============================================
// SLATE CRUD
// ============================================

// GET /api/slates - List all slates
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, sport } = req.query;
    const where = {};
    if (status) where.status = status;
    if (sport) where.sport = sport;

    const slates = await db.Slate.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 50
    });

    res.json({ success: true, slates });
  } catch (error) {
    console.error('Error fetching slates:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/slates/:slateId - Get slate details with injury info
router.get('/:slateId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const slate = await db.Slate.findByPk(req.params.slateId);
    if (!slate) return res.status(404).json({ error: 'Slate not found' });

    // Get contests on this slate
    const contests = await db.Contest.findAll({
      where: { slate_id: slate.id },
      attributes: ['id', 'name', 'type', 'sport', 'status', 'current_entries']
    });

    // Get lineup count
    const contestIds = contests.map(c => c.id);
    const lineupCount = contestIds.length > 0
      ? await db.Lineup.count({
          where: { contest_id: { [Op.in]: contestIds }, status: 'drafted' }
        })
      : 0;

    // Get current injuries
    let injuries = {};
    if (injurySwapService) {
      injuries = await injurySwapService.getInjuries(slate.id);
    }

    res.json({
      success: true,
      slate,
      contests,
      lineupCount,
      injuries,
      outPlayerCount: Object.keys(injuries).length
    });
  } catch (error) {
    console.error('Error fetching slate:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// INJURY MANAGEMENT
// ============================================

// GET /api/slates/:slateId/injuries - Get all OUT players for a slate
router.get('/:slateId/injuries', authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    const injuries = await injurySwapService.getInjuries(req.params.slateId);

    res.json({
      success: true,
      slateId: req.params.slateId,
      injuries,
      count: Object.keys(injuries).length
    });
  } catch (error) {
    console.error('Error fetching injuries:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/slates/:slateId/injuries - Mark player(s) as OUT
// Body: { name, position, price } OR { players: [{ name, position, price }] }
router.post('/:slateId/injuries', authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    const { slateId } = req.params;
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) return res.status(404).json({ error: 'Slate not found' });

    const sport = slate.sport || 'nfl';

    // Support single or bulk
    if (req.body.players && Array.isArray(req.body.players)) {
      // Bulk
      const players = req.body.players.map(p => ({
        name: p.name,
        position: p.position,
        price: Number(p.price)
      }));

      await injurySwapService.bulkMarkOut(slateId, players, sport);

      res.json({
        success: true,
        message: `Marked ${players.length} player(s) as OUT`,
        players: players.map(p => p.name)
      });
    } else {
      // Single
      const { name, position, price } = req.body;
      if (!name || !position || price === undefined) {
        return res.status(400).json({ error: 'name, position, and price are required' });
      }

      await injurySwapService.markPlayerOut(slateId, name, position, Number(price), sport);

      res.json({
        success: true,
        message: `Marked "${name}" as OUT`,
        player: { name, position, price: Number(price) }
      });
    }
  } catch (error) {
    console.error('Error marking player OUT:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/slates/:slateId/injuries/:playerName - Mark player as ACTIVE (remove from OUT list)
router.delete('/:slateId/injuries/:playerName', authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    const { slateId, playerName } = req.params;
    const decoded = decodeURIComponent(playerName);

    await injurySwapService.markPlayerActive(slateId, decoded);

    res.json({
      success: true,
      message: `Marked "${decoded}" as ACTIVE`
    });
  } catch (error) {
    console.error('Error marking player active:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/slates/:slateId/injuries - Clear all injuries for a slate
router.delete('/:slateId/injuries', authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    await injurySwapService.clearInjuries(req.params.slateId);

    res.json({
      success: true,
      message: 'All injuries cleared'
    });
  } catch (error) {
    console.error('Error clearing injuries:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SLATE LOCK (TRIGGERS INJURY SWAPS)
// ============================================

// POST /api/slates/:slateId/lock - Lock slate and run injury swaps
router.post('/:slateId/lock', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { slateId } = req.params;
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) return res.status(404).json({ error: 'Slate not found' });

    if (slate.status !== 'active') {
      return res.status(400).json({
        error: `Cannot lock slate — current status is "${slate.status}". Only active slates can be locked.`
      });
    }

    console.log(`\n🔒 LOCKING SLATE: ${slate.name} (${slateId})`);

    // Step 1: Run injury swaps BEFORE locking
    let swapResult = { success: true, totalSwaps: 0 };
    if (injurySwapService) {
      swapResult = await injurySwapService.runSwapsForSlate(slateId);
      if (!swapResult.success) {
        console.error(`⚠️ Injury swaps had errors but proceeding with lock:`, swapResult.error);
      }
    }

    // Step 2: Update slate status to closed
    await slate.update({
      status: 'closed',
      closes_at: new Date()
    });

    // Step 3: Update all contests on this slate to 'live'
    const [updatedCount] = await db.Contest.update(
      { status: 'live' },
      {
        where: {
          slate_id: slateId,
          status: { [Op.in]: ['open', 'closed'] }
        }
      }
    );

    console.log(`✅ Slate locked. ${updatedCount} contest(s) moved to 'live'. ${swapResult.totalSwaps} injury swap(s) made.`);

    res.json({
      success: true,
      message: `Slate locked successfully`,
      slateId,
      slateName: slate.name,
      contestsUpdated: updatedCount,
      injurySwaps: {
        totalSwaps: swapResult.totalSwaps || 0,
        lineupsAffected: swapResult.lineupsAffected || 0,
        lineupsChecked: swapResult.lineupsChecked || 0,
        outPlayers: swapResult.outPlayers || [],
        results: swapResult.results || []
      }
    });
  } catch (error) {
    console.error('Error locking slate:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MANUAL SWAP TRIGGER (for testing / re-runs)
// ============================================

// POST /api/slates/:slateId/run-swaps - Manually trigger injury swaps without locking
router.post('/:slateId/run-swaps', authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    const result = await injurySwapService.runSwapsForSlate(req.params.slateId);
    res.json(result);
  } catch (error) {
    console.error('Error running swaps:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SWAP HISTORY
// ============================================

// GET /api/slates/:slateId/swap-history - Get all swaps for a slate
router.get('/:slateId/swap-history', authMiddleware, requireAdmin, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    const history = await injurySwapService.getSwapHistoryForSlate(req.params.slateId);

    res.json({
      success: true,
      slateId: req.params.slateId,
      swaps: history,
      count: history.length
    });
  } catch (error) {
    console.error('Error fetching swap history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/slates/swap-history/lineup/:lineupId - Get swaps for a specific lineup
router.get('/swap-history/lineup/:lineupId', authMiddleware, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    const history = await injurySwapService.getSwapHistoryForLineup(req.params.lineupId);

    res.json({
      success: true,
      lineupId: req.params.lineupId,
      swaps: history
    });
  } catch (error) {
    console.error('Error fetching lineup swap history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/slates/swap-history/user/:userId - Get swaps for a user
router.get('/swap-history/user/:userId', authMiddleware, async (req, res) => {
  try {
    if (!injurySwapService) {
      return res.status(503).json({ error: 'Injury swap service not available' });
    }

    // Users can only see their own swaps (unless admin)
    const requestingUserId = req.user.id || req.user.userId;
    const targetUserId = req.params.userId;

    if (requestingUserId !== targetUserId) {
      const user = await db.User.findByPk(requestingUserId);
      if (!user || (user.username !== 'aaaaaa' && !user.is_admin)) {
        return res.status(403).json({ error: 'Can only view your own swap history' });
      }
    }

    const history = await injurySwapService.getSwapHistoryForUser(targetUserId);

    res.json({
      success: true,
      userId: targetUserId,
      swaps: history,
      count: history.length
    });
  } catch (error) {
    console.error('Error fetching user swap history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SLATE SETTLEMENT (convenience wrapper)
// ============================================

// POST /api/slates/:slateId/settle - Settle all contests in a slate
router.post('/:slateId/settle', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { slateId } = req.params;
    const slate = await db.Slate.findByPk(slateId);
    if (!slate) return res.status(404).json({ error: 'Slate not found' });

    // Find all contests on this slate that need settling
    const contests = await db.Contest.findAll({
      where: {
        slate_id: slateId,
        status: { [Op.notIn]: ['settled'] }
      }
    });

    if (contests.length === 0) {
      return res.json({ success: true, message: 'No contests to settle', settled: 0 });
    }

    const SettlementService = require('../services/settlement/SettlementService');
    const settlementService = new SettlementService(db, db.sequelize);

    const results = [];
    for (const contest of contests) {
      try {
        // Move contest to 'completed' if it's still 'live' (scores are in)
        if (contest.status === 'live' || contest.status === 'closed') {
          await contest.update({ status: 'completed' });
        }

        const result = await settlementService.settleContest(contest.id);
        results.push({ contestId: contest.id, name: contest.name, ...result });
      } catch (error) {
        console.error(`❌ Failed to settle ${contest.name}:`, error.message);
        results.push({ contestId: contest.id, name: contest.name, success: false, error: error.message });
      }
    }

    // Mark slate as settled
    await slate.update({
      status: 'settled',
      settled_at: new Date()
    });

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      slateId,
      slateName: slate.name,
      contestsSettled: succeeded,
      contestsFailed: failed,
      results
    });
  } catch (error) {
    console.error('Error settling slate:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;