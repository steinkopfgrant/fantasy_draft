// backend/src/routes/teamRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const { Op } = require('sequelize');

// GET /api/teams/active
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const entries = await db.ContestEntry.findAll({
      where: { user_id: userId, status: { [Op.notIn]: ['cancelled'] } },
      include: [{
        model: db.Contest,
        where: { status: { [Op.notIn]: ['settled'] } },
        required: true,
        attributes: ['id', 'name', 'type', 'status', 'entry_fee', 'prize_pool', 'start_time']
      }, {
        model: db.Lineup,
        required: false,
        attributes: ['id', 'roster', 'status']
      }],
      order: [['created_at', 'DESC']]
    });

    const teams = entries.map(entry => {
      const roster = entry.Lineup?.roster || {};
      return {
        id: entry.id,
        contestId: entry.contest_id,
        contestName: entry.Contest?.name || 'Unknown Contest',
        contestType: entry.Contest?.type || 'cash',
        contestStatus: entry.Contest?.status || 'unknown',
        entryFee: parseFloat(entry.Contest?.entry_fee || 0),
        prizePool: parseFloat(entry.Contest?.prize_pool || 0),
        status: entry.status,
        roster,
        playerCount: Object.keys(roster).filter(k => roster[k]?.name).length,
        draftRoomId: entry.draft_room_id,
        createdAt: entry.created_at,
        startTime: entry.Contest?.start_time
      };
    });

    res.json({ success: true, teams, count: teams.length });
  } catch (error) {
    console.error('Error fetching active teams:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/teams/history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: entries } = await db.ContestEntry.findAndCountAll({
      where: { user_id: userId, status: { [Op.notIn]: ['cancelled', 'pending'] } },
      include: [{
        model: db.Contest,
        where: { status: 'settled' },
        required: true,
        attributes: ['id', 'name', 'type', 'status', 'entry_fee', 'prize_pool', 'start_time', 'end_time']
      }, {
        model: db.Lineup,
        required: false,
        attributes: ['id', 'roster', 'status']
      }, {
        model: db.ContestResult,
        as: 'result',
        required: false,
        attributes: ['final_rank', 'total_score', 'payout']
      }],
      order: [['completed_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const teams = entries.map(entry => {
      const roster = entry.Lineup?.roster || {};
      const entryFee = parseFloat(entry.Contest?.entry_fee || 0);
      const prizeWon = parseFloat(entry.result?.payout || entry.prize_won || 0);
      return {
        id: entry.id,
        contestId: entry.contest_id,
        contestName: entry.Contest?.name || 'Unknown Contest',
        contestType: entry.Contest?.type || 'cash',
        entryFee,
        prizePool: parseFloat(entry.Contest?.prize_pool || 0),
        status: 'settled',
        roster,
        playerCount: Object.keys(roster).filter(k => roster[k]?.name).length,
        rank: entry.result?.final_rank || entry.final_rank || null,
        totalPoints: parseFloat(entry.result?.total_score || entry.total_points || 0),
        prizeWon,
        netResult: prizeWon - entryFee,
        isWinner: prizeWon > 0,
        completedAt: entry.completed_at,
        draftRoomId: entry.draft_room_id
      };
    });

    // Summary stats
    const allSettled = await db.ContestEntry.findAll({
      where: { user_id: userId, status: { [Op.notIn]: ['cancelled', 'pending'] } },
      include: [{
        model: db.Contest,
        where: { status: 'settled' },
        required: true,
        attributes: ['entry_fee']
      }, {
        model: db.ContestResult,
        as: 'result',
        required: false,
        attributes: ['payout']
      }],
      attributes: ['id', 'prize_won']
    });

    let totalWagered = 0, totalWon = 0, wins = 0, losses = 0;
    allSettled.forEach(entry => {
      const fee = parseFloat(entry.Contest?.entry_fee || 0);
      const prize = parseFloat(entry.result?.payout || entry.prize_won || 0);
      totalWagered += fee;
      totalWon += prize;
      if (prize > 0) wins++; else losses++;
    });

    res.json({
      success: true,
      teams,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit), hasMore: offset + entries.length < count },
      summary: { totalContests: allSettled.length, wins, losses, winRate: allSettled.length > 0 ? ((wins / allSettled.length) * 100).toFixed(1) : 0, totalWagered, totalWon, netProfit: totalWon - totalWagered }
    });
  } catch (error) {
    console.error('Error fetching team history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/teams/:entryId/details - Detailed team with player scores and winner
router.get('/:entryId/details', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { entryId } = req.params;

    const entry = await db.ContestEntry.findOne({
      where: { id: entryId, user_id: userId },
      include: [{
        model: db.Contest,
        attributes: ['id', 'name', 'type', 'status', 'entry_fee', 'prize_pool']
      }, {
        model: db.Lineup,
        required: false
      }, {
        model: db.ContestResult,
        as: 'result',
        required: false
      }]
    });

    if (!entry) return res.status(404).json({ success: false, error: 'Team not found' });

    const roster = entry.Lineup?.roster || {};
    const entryFee = parseFloat(entry.Contest?.entry_fee || 0);
    const prizeWon = parseFloat(entry.result?.payout || entry.prize_won || 0);

    // Get player scores - use fantasy_points column
    const playerNames = Object.values(roster).filter(p => p?.name).map(p => p.name);
    let playerScores = {};
    
    if (playerNames.length > 0) {
      const scores = await db.PlayerScore.findAll({
        where: { player_name: { [Op.in]: playerNames } },
        order: [['updated_at', 'DESC']]
      });
      scores.forEach(score => {
        if (!playerScores[score.player_name]) {
          playerScores[score.player_name] = parseFloat(score.fantasy_points) || 0;
        }
      });
    }

    // Add scores to roster
    const rosterWithScores = {};
    for (const [pos, player] of Object.entries(roster)) {
      if (player?.name) {
        rosterWithScores[pos] = { ...player, score: playerScores[player.name] || 0 };
      }
    }

    // Get winner - just grab one with final_rank = 1 or lowest rank with payout > 0
    let winners = [];
    const contestType = entry.Contest?.type;
    
    if (contestType === 'cash') {
      // For cash: find winner from same draft room
      const roomWinner = await db.ContestEntry.findOne({
        where: { draft_room_id: entry.draft_room_id },
        include: [{
          model: db.Lineup,
          attributes: ['roster']
        }, {
          model: db.ContestResult,
          as: 'result',
          where: { payout: { [Op.gt]: 0 } },
          required: true
        }],
        order: [[{ model: db.ContestResult, as: 'result' }, 'total_score', 'DESC']],
        limit: 1
      });

      if (roomWinner) {
        const winnerRoster = roomWinner.Lineup?.roster || {};
        const winnerNames = Object.values(winnerRoster).filter(p => p?.name).map(p => p.name);
        let winnerScores = {};
        if (winnerNames.length > 0) {
          const scores = await db.PlayerScore.findAll({
            where: { player_name: { [Op.in]: winnerNames } },
            order: [['updated_at', 'DESC']]
          });
          scores.forEach(s => { if (!winnerScores[s.player_name]) winnerScores[s.player_name] = parseFloat(s.fantasy_points) || 0; });
        }
        const winnerRosterWithScores = {};
        for (const [pos, player] of Object.entries(winnerRoster)) {
          if (player?.name) winnerRosterWithScores[pos] = { ...player, score: winnerScores[player.name] || 0 };
        }
        winners.push({ rank: 1, points: parseFloat(roomWinner.result?.total_score) || 0, roster: winnerRosterWithScores });
      }
    } else {
      // For MM: get #1 (just one, even if tied)
      const topResult = await db.ContestResult.findOne({
        where: { contest_id: entry.contest_id, final_rank: 1 },
        include: [{
          model: db.ContestEntry,
          as: 'entry',
          include: [{ model: db.Lineup, attributes: ['roster'] }]
        }],
        limit: 1
      });

      if (topResult) {
        const winnerRoster = topResult.entry?.Lineup?.roster || {};
        const winnerNames = Object.values(winnerRoster).filter(p => p?.name).map(p => p.name);
        let winnerScores = {};
        if (winnerNames.length > 0) {
          const scores = await db.PlayerScore.findAll({
            where: { player_name: { [Op.in]: winnerNames } },
            order: [['updated_at', 'DESC']]
          });
          scores.forEach(s => { if (!winnerScores[s.player_name]) winnerScores[s.player_name] = parseFloat(s.fantasy_points) || 0; });
        }
        const winnerRosterWithScores = {};
        for (const [pos, player] of Object.entries(winnerRoster)) {
          if (player?.name) winnerRosterWithScores[pos] = { ...player, score: winnerScores[player.name] || 0 };
        }
        winners.push({ rank: 1, points: parseFloat(topResult.total_score) || 0, roster: winnerRosterWithScores });
      }
    }

    res.json({
      success: true,
      team: {
        id: entry.id,
        contestId: entry.contest_id,
        contestName: entry.Contest?.name,
        contestType: entry.Contest?.type,
        contestStatus: entry.Contest?.status,
        entryFee,
        prizePool: parseFloat(entry.Contest?.prize_pool || 0),
        status: entry.status,
        roster: rosterWithScores,
        rank: entry.result?.final_rank || entry.final_rank,
        totalPoints: parseFloat(entry.result?.total_score || entry.total_points || 0),
        prizeWon,
        netResult: prizeWon - entryFee
      },
      winners
    });
  } catch (error) {
    console.error('Error fetching team details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/teams/:entryId - Simple team details
router.get('/:entryId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { entryId } = req.params;

    const entry = await db.ContestEntry.findOne({
      where: { id: entryId, user_id: userId },
      include: [{
        model: db.Contest,
        attributes: ['id', 'name', 'type', 'status', 'entry_fee', 'prize_pool']
      }, {
        model: db.Lineup,
        required: false
      }, {
        model: db.ContestResult,
        as: 'result',
        required: false
      }]
    });

    if (!entry) return res.status(404).json({ success: false, error: 'Team not found' });

    const roster = entry.Lineup?.roster || {};
    const entryFee = parseFloat(entry.Contest?.entry_fee || 0);
    const prizeWon = parseFloat(entry.result?.payout || entry.prize_won || 0);

    res.json({
      success: true,
      team: {
        id: entry.id,
        contestId: entry.contest_id,
        contestName: entry.Contest?.name,
        contestType: entry.Contest?.type,
        contestStatus: entry.Contest?.status,
        entryFee,
        prizePool: parseFloat(entry.Contest?.prize_pool || 0),
        status: entry.status,
        roster,
        rank: entry.result?.final_rank || entry.final_rank,
        totalPoints: parseFloat(entry.result?.total_score || entry.total_points || 0),
        prizeWon,
        netResult: prizeWon - entryFee
      }
    });
  } catch (error) {
    console.error('Error fetching team details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;