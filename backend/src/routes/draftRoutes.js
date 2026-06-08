// backend/src/routes/draftRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const contestService = require('../services/contestService');
const db = require('../models');

// Lazy-required to avoid potential circular deps; safe even if draftService throws
let draftService = null;
try {
  draftService = require('../services/draftService');
} catch (err) {
  console.warn('[draftRoutes] draftService unavailable on require:', err.message);
}

const TEAM_COLORS = ['green', 'red', 'blue', 'yellow', 'purple'];

/**
 * Build teams[] with rosters for a given draft room.
 *
 * Schema notes (confirmed against Railway prod 2026-06):
 *   contest_entries: id (uuid), user_id, draft_room_id, draft_position, roster (jsonb), total_spent
 *   draft_picks:     id (uuid), entry_id, pick_number, player_data (jsonb), roster_slot
 *
 * IMPORTANT: draft_picks has NO draft_room_id column. We have to join via
 * entry_id. This was the bug in the previous version of this helper —
 * `where: { draft_room_id: roomId }` against draft_picks returns nothing.
 *
 * For bots: bot picks are never written to the DB (see DraftSocketHandler's
 * processPick - "Save to backend only for real players"). To get bot rosters
 * we consult draftService.getDraft() in-memory state.
 */
async function buildTeamsForRoom(roomId) {
  console.log(`\n[buildTeamsForRoom] === Building teams for room ${roomId} ===`);

  // 1) Pull all human entries from DB for this room
  const allEntries = await db.ContestEntry.findAll({
    where: { draft_room_id: roomId },
    include: [{
      model: db.User,
      attributes: ['id', 'username', 'equipped_stamp', 'equipped_avatar']
    }]
  });

  console.log(`[buildTeamsForRoom] Found ${allEntries.length} entries in contest_entries`);
  allEntries.forEach(e => {
    console.log(`  - entry ${e.id} user=${e.User?.username} pos=${e.draft_position} roster_keys=${Object.keys(e.roster || {}).length}`);
  });

  // Sort entries by draft_position so colors and order are deterministic
  allEntries.sort((a, b) => {
    const aPos = a.draft_position ?? 999;
    const bPos = b.draft_position ?? 999;
    return aPos - bPos;
  });

  // 2) Pull all picks for these entries.
  // draft_picks has no draft_room_id - must join via entry_id.
  const entryIds = allEntries.map(e => e.id);
  let allPicks = [];

  if (entryIds.length > 0) {
    try {
      allPicks = await db.DraftPick.findAll({
        where: {
          entry_id: { [db.Sequelize.Op.in]: entryIds }
        },
        order: [['pick_number', 'ASC']]
      });
      console.log(`[buildTeamsForRoom] Found ${allPicks.length} picks across ${entryIds.length} entries`);
    } catch (pickErr) {
      console.error(`[buildTeamsForRoom] DraftPick query failed:`, pickErr.message);
      // Continue with empty picks - we'll still try to populate from entry.roster + draftService
    }
  }

  // 3) Build human team objects with rosters reconstructed from picks
  const teams = allEntries.map((entry, idx) => {
    const draftPos = entry.draft_position ?? idx;
    const roster = {};
    let totalSpent = 0;
    let rosterSource = 'none';

    // Prefer draft_picks (live source during draft).
    // Fall back to entry.roster (set on completion).
    const entryPicks = allPicks.filter(p => p.entry_id === entry.id);

    if (entryPicks.length > 0) {
      entryPicks.forEach(pick => {
        const slot = (pick.roster_slot || '').toString().toUpperCase();
        const playerData = pick.player_data;
        if (slot && playerData) {
          roster[slot] = playerData;
          totalSpent += (playerData.price || 0);
        }
      });
      rosterSource = `${entryPicks.length} draft_picks rows`;
    } else if (entry.roster && typeof entry.roster === 'object' && Object.keys(entry.roster).length > 0) {
      Object.assign(roster, entry.roster);
      totalSpent = entry.total_spent || 0;
      rosterSource = 'entry.roster';
    }

    const rosterPlayerCount = Object.keys(roster).length;
    console.log(`[buildTeamsForRoom] team ${idx} (${entry.User?.username || 'unknown'}): ${rosterPlayerCount} players from ${rosterSource}`);

    return {
      userId: entry.user_id,
      entryId: entry.id,
      username: entry.User?.username || `Player ${idx + 1}`,
      roster,
      budget: Math.max(0, 15 - totalSpent),
      bonus: 0,
      color: TEAM_COLORS[draftPos % TEAM_COLORS.length],
      draftPosition: draftPos,
      equipped_stamp: entry.User?.equipped_stamp || null,
      equipped_avatar: entry.User?.equipped_avatar || null,
      isBot: false
    };
  });

  // 4) Merge in-memory draftService state for bots + fresher human data
  if (draftService && typeof draftService.getDraft === 'function') {
    try {
      const activeDraft = await draftService.getDraft(roomId);
      const memTeams = activeDraft?.teams || [];
      console.log(`[buildTeamsForRoom] draftService.getDraft returned ${memTeams.length} in-memory teams`);

      memTeams.forEach(memTeam => {
        const memUserId = memTeam.userId || memTeam.id;
        if (!memUserId) return;

        const existingIdx = teams.findIndex(t => t.userId === memUserId);
        const isBot = (typeof memUserId === 'string' && memUserId.startsWith('bot_')) || memTeam.isBot === true;

        if (existingIdx === -1 && isBot) {
          const pos = memTeam.position ?? memTeam.draftPosition ?? teams.length;
          const memRosterCount = Object.keys(memTeam.roster || {}).length;
          console.log(`[buildTeamsForRoom] Adding bot ${memTeam.username || memUserId} with ${memRosterCount} players`);
          teams.push({
            userId: memUserId,
            entryId: null,
            username: memTeam.username || `Bot ${pos + 1}`,
            roster: memTeam.roster || {},
            budget: memTeam.budget ?? 15,
            bonus: memTeam.bonus ?? 0,
            color: TEAM_COLORS[pos % TEAM_COLORS.length],
            draftPosition: pos,
            equipped_stamp: null,
            equipped_avatar: null,
            isBot: true
          });
        } else if (existingIdx !== -1 && memTeam.roster) {
          // Human in both - use whichever roster has more picks
          const existing = teams[existingIdx];
          const dbCount = Object.keys(existing.roster).length;
          const memCount = Object.keys(memTeam.roster).length;
          if (memCount > dbCount) {
            console.log(`[buildTeamsForRoom] In-memory has fresher roster for ${existing.username} (${memCount} vs ${dbCount} players), using it`);
            existing.roster = { ...memTeam.roster };
            if (typeof memTeam.budget === 'number') existing.budget = memTeam.budget;
            if (typeof memTeam.bonus === 'number') existing.bonus = memTeam.bonus;
          }
        }
      });

      teams.sort((a, b) => (a.draftPosition ?? 999) - (b.draftPosition ?? 999));
    } catch (memErr) {
      console.warn(`[buildTeamsForRoom] Could not merge in-memory draft state for ${roomId}:`, memErr.message);
    }
  } else {
    console.log(`[buildTeamsForRoom] draftService not available - skipping in-memory merge`);
  }

  const totalPlayers = teams.reduce((sum, t) => sum + Object.keys(t.roster || {}).length, 0);
  console.log(`[buildTeamsForRoom] === FINAL: ${teams.length} teams, ${totalPlayers} total players ===\n`);

  return teams;
}

// Initialize draft endpoint
router.get('/initialize/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id || req.user.userId;

    console.log(`\n=== DRAFT INITIALIZATION ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`User ID: ${userId}`);

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

    const contest = await contestService.getContest(roomStatus.contestId);

    if (!contest) {
      console.error('Contest not found:', roomStatus.contestId);
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Build full teams[] array with rosters from DB + in-memory state
    let teams = [];
    try {
      teams = await buildTeamsForRoom(roomId);
    } catch (teamsErr) {
      console.error('Failed to build teams[] for init response:', teamsErr);
      console.error('Stack:', teamsErr.stack);
      teams = [];
    }

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
        type: contest.type,
        sport: contest.sport || roomStatus.contestSport || 'nfl'
      },
      teams: teams,
      users: roomStatus.entries.map((entry, index) => ({
        userId: entry.userId,
        username: entry.username,
        position: entry.draftPosition || index,
        connected: false,
        entryId: entry.id
      }))
    };

    console.log(`Draft initialization successful. Returning ${teams.length} teams with rosters.`);
    res.json(response);

  } catch (error) {
    console.error('Draft initialization error:', error);
    console.error('Stack:', error.stack);
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

    const roomStatus = await contestService.getRoomStatus(draftId);

    if (!roomStatus) {
      return res.status(404).json({ error: 'Draft not found' });
    }

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

    if (!position || (!playerId && !playerData)) {
      return res.status(400).json({
        error: 'Missing required pick data'
      });
    }

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
// FIX: also query by entry_id since draft_picks has no draft_room_id column
router.get('/:draftId/picks', authMiddleware, async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id || req.user.userId;

    const roomStatus = await contestService.getRoomStatus(draftId);

    if (!roomStatus) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const isParticipant = roomStatus.entries.some(e => e.userId === userId);

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this draft' });
    }

    // Get entry IDs for this room
    const entries = await db.ContestEntry.findAll({
      where: { draft_room_id: draftId },
      attributes: ['id', 'user_id'],
      include: [{
        model: db.User,
        attributes: ['id', 'username']
      }]
    });

    const entryIds = entries.map(e => e.id);
    const entryToUser = {};
    entries.forEach(e => {
      entryToUser[e.id] = { userId: e.user_id, username: e.User?.username };
    });

    const picks = entryIds.length > 0
      ? await db.DraftPick.findAll({
          where: { entry_id: { [db.Sequelize.Op.in]: entryIds } },
          order: [['pick_number', 'ASC']]
        })
      : [];

    const formattedPicks = picks.map(pick => {
      const userInfo = entryToUser[pick.entry_id] || {};
      return {
        id: pick.id,
        userId: userInfo.userId,
        username: userInfo.username,
        playerData: pick.player_data,
        rosterSlot: pick.roster_slot,
        pickNumber: pick.pick_number,
        isAutoPick: pick.is_auto_pick,
        pickTime: pick.created_at
      };
    });

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

    const entry = await db.ContestEntry.findOne({
      where: {
        draft_room_id: draftId,
        user_id: targetUserId
      }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

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

    const pickCount = await db.DraftPick.count({
      where: {
        entry_id: entry.id
      }
    });

    if (pickCount < 5) {
      return res.status(400).json({
        error: `Draft incomplete. You have ${pickCount}/5 picks.`
      });
    }

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

    let activeDraft = null;
    try {
      const ds = draftService || require('../services/draftService');
      const draftState = await ds.getDraft(draftId);
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
      timeRemaining: 30
    });

  } catch (error) {
    console.error('Get timer error:', error);
    res.status(500).json({ error: 'Failed to get timer status' });
  }
});

module.exports = router;