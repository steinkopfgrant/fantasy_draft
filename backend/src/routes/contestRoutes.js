// backend/src/routes/contestRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const { Contest, ContestEntry, User, DraftPick, Transaction } = db;
const { v4: uuidv4 } = require('uuid');
const contestService = require('../services/contestService');

// Import injury swap service (optional)
let injurySwapService;
try {
  injurySwapService = require('../services/injurySwapService');
} catch (error) {
  console.log('⚠️ Injury swap service not available');
  injurySwapService = null;
}

// Log middleware
router.use((req, res, next) => {
  console.log(`Contest Route: ${req.method} ${req.path}`);
  next();
});

// ==================== PUBLIC ROUTES ====================

router.get('/test', (req, res) => {
  res.json({ message: 'Contest routes working!', timestamp: new Date().toISOString() });
});

router.get('/', async (req, res) => {
  try {
    const contests = await contestService.getContests();
    res.json(contests);
  } catch (error) {
    console.error('Get contests error:', error);
    res.status(500).json({ error: 'Failed to fetch contests', message: error.message });
  }
});

router.get('/contest/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    const contest = await contestService.getContest(contestId);
    
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contest.id,
        status: { [db.Sequelize.Op.in]: ['pending', 'drafting', 'completed'] }
      },
      include: [{ model: User, attributes: ['id', 'username'] }]
    });
    
    res.json({
      ...contest,
      entries: entries.map(e => ({
        id: e.id,
        odId: e.user_id,
        username: e.User?.username || 'Unknown',
        status: e.status,
        draftRoomId: e.draft_room_id
      }))
    });
  } catch (error) {
    console.error('Get contest error:', error);
    res.status(500).json({ error: 'Failed to fetch contest' });
  }
});

router.get('/room/:roomId/status', async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log('Getting room status for:', roomId);
    
    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const response = {
      roomId,
      contestId: roomStatus.contestId,
      currentPlayers: roomStatus.currentPlayers,
      maxPlayers: 5,
      status: roomStatus.status,
      players: roomStatus.entries.map(e => ({
        id: e.userId,
        username: e.username,
        entryId: e.id,
        joinedAt: e.enteredAt
      }))
    };
    
    console.log(`Room ${roomId}: ${response.currentPlayers}/5 players`);
    res.json(response);
  } catch (error) {
    console.error('Get room status error:', error);
    res.status(500).json({ error: 'Failed to get room status' });
  }
});

// ==================== AUTHENTICATED ROUTES ====================

router.get('/my-entries', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const entries = await contestService.getUserEntries(userId);
    res.json(entries);
  } catch (error) {
    console.error('Get user entries error:', error);
    res.status(500).json({ error: 'Failed to fetch entries', message: error.message });
  }
});

router.post('/enter/:contestId', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const userId = req.user.id || req.user.userId;
    const username = req.user.username || 'Player';
    
    console.log(`\n=== CONTEST ENTRY: ${username} (${userId}) -> ${contestId} ===`);
    
    const result = await contestService.enterContest(contestId, userId, username);
    
    if (result.draftRoomId) {
      const roomStatus = await contestService.getRoomStatus(result.draftRoomId);
      if (roomStatus) {
        result.roomStatus = {
          currentPlayers: roomStatus.currentPlayers,
          maxPlayers: 5,
          status: roomStatus.status,
          players: roomStatus.entries.map(e => ({
            id: e.userId,
            username: e.username,
            entryId: e.id,
            joinedAt: e.enteredAt
          }))
        };
        console.log(`✅ Room ${result.draftRoomId}: ${roomStatus.currentPlayers}/5 players`);
      }
    }
    
    const io = req.app.get('io');
    if (io && result.draftRoomId) {
      io.emit('room-player-joined', {
        roomId: result.draftRoomId,
        contestId,
        currentPlayers: result.roomStatus?.currentPlayers || 1,
        maxPlayers: 5,
        players: result.roomStatus?.players || [],
        newPlayer: { id: userId, username, entryId: result.entryId }
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Enter contest error:', error);
    res.status(400).json({ error: error.message || 'Failed to enter contest' });
  }
});

router.post('/withdraw/:entryId', authMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.id || req.user.userId;
    const result = await contestService.withdrawEntry(entryId, userId);
    res.json(result);
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/draft/:entryId/pick', authMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { player, position } = req.body;
    const userId = req.user.id || req.user.userId;
    
    const entry = await contestService.getEntry(entryId);
    if (!entry || entry.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await contestService.handlePlayerPick(entry.draftRoomId, userId, player, position);
    res.json({ success: true });
  } catch (error) {
    console.error('Draft pick error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/draft/:entryId/complete', authMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { roster, totalSpent } = req.body;
    const userId = req.user.id || req.user.userId;
    
    console.log('=== SAVING COMPLETED DRAFT ===');
    console.log('Entry:', entryId, 'User:', userId);
    
    const entry = await ContestEntry.findOne({
      where: { id: entryId, user_id: userId },
      include: [{ model: Contest, attributes: ['id', 'type', 'name'] }]
    });
    
    if (!entry) {
      console.error('Entry not found:', { entryId, userId });
      return res.status(404).json({ success: false, error: 'Contest entry not found' });
    }
    
    const existingLineup = await db.Lineup.findOne({
      where: { contest_entry_id: entryId }
    });
    
    if (existingLineup) {
      if (existingLineup.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Entry belongs to another user' });
      }
      
      await existingLineup.update({ roster, status: 'drafted', updated_at: new Date() });
      console.log('✅ Lineup updated');
      
      return res.json({
        success: true,
        message: 'Draft updated!',
        lineup: { id: existingLineup.id, roster: existingLineup.roster, status: existingLineup.status }
      });
    }
    
    const lineup = await db.Lineup.create({
      user_id: userId,
      contest_entry_id: entryId,
      contest_id: entry.contest_id,
      contest_type: entry.Contest.type,
      roster,
      status: 'drafted',
      week: 1
    });
    
    await entry.update({ status: 'drafted' });
    console.log('✅ New lineup created:', lineup.id);
    
    res.json({
      success: true,
      message: 'Draft completed!',
      lineup: { id: lineup.id, roster: lineup.roster, status: lineup.status }
    });
  } catch (error) {
    console.error('Save draft error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, error: 'Draft already saved' });
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to save draft' });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const history = await contestService.getUserContestHistory(userId, limit);
    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch contest history' });
  }
});

// ==================== SOCKET ROUTES ====================

router.post('/:contestId/join-lobby', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const userId = req.user.id || req.user.userId;
    const io = req.app.get('io');
    if (io) io.to(`user_${userId}`).emit('join-contest-lobby', { contestId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join lobby' });
  }
});

router.post('/:contestId/leave-lobby', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const userId = req.user.id || req.user.userId;
    const io = req.app.get('io');
    if (io) io.to(`user_${userId}`).emit('leave-contest-lobby', { contestId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave lobby' });
  }
});

// ==================== MARKET MOVER ====================

router.post('/:contestId/ownership', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const { playerName } = req.body;
    const userId = req.user.id || req.user.userId;
    
    const user = await User.findByPk(userId);
    if (!user || user.tickets < 1) {
      return res.status(400).json({ error: 'Insufficient tickets' });
    }
    
    const ownership = await contestService.calculateOwnership(contestId, playerName);
    await user.decrement('tickets', { by: 1 });
    
    res.json({ success: true, ownership, playerName, remainingTickets: user.tickets - 1 });
  } catch (error) {
    console.error('Ownership error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ==================== DEBUG/ADMIN ROUTES ====================

router.get('/health', async (req, res) => {
  try {
    const health = await contestService.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: 'Health check failed' });
  }
});

router.post('/ensure-cash-game', async (req, res) => {
  try {
    await contestService.ensureCashGameAvailable();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/debug/all', async (req, res) => {
  try {
    const contests = await contestService.getAllContests(true);
    res.json({ count: contests.length, contests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/debug/create-test-contest', async (req, res) => {
  try {
    const { generatePlayerBoard } = require('../utils/gameLogic');
    
    const contest = await Contest.create({
      name: `Test Contest ${Date.now()}`,
      type: 'cash',
      status: 'open',
      entry_fee: 0,
      max_entries: 5,
      current_entries: 0,
      prize_pool: 25,
      prizes: [25],
      max_entries_per_user: 1,
      player_board: generatePlayerBoard('cash'),
      start_time: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    });
    
    if (injurySwapService && contest.start_time) {
      injurySwapService.scheduleSwapForContest(contest.id, contest.start_time);
    }
    
    res.json({ success: true, contest: { id: contest.id, name: contest.name, type: contest.type } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/create', authMiddleware, async (req, res) => {
  try {
    const { name, type, entry_fee, prize_pool, max_entries, start_time, sport = 'NFL' } = req.body;
    const { generatePlayerBoard } = require('../utils/gameLogic');
    
    const contest = await Contest.create({
      id: uuidv4(),
      name,
      type,
      status: 'open',
      sport,
      entry_fee: entry_fee || 0,
      prize_pool: prize_pool || 0,
      max_entries: max_entries || 100,
      current_entries: 0,
      scoring_type: 'standard',
      player_board: generatePlayerBoard(type),
      start_time: start_time ? new Date(start_time) : null,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    if (injurySwapService && ['cash', 'market_mover'].includes(type) && contest.start_time) {
      injurySwapService.scheduleSwapForContest(contest.id, contest.start_time);
    }
    
    res.json({
      success: true,
      contest: { id: contest.id, name: contest.name, type: contest.type, start_time: contest.start_time }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/admin/:contestId/start-time', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const { start_time } = req.body;
    
    const contest = await Contest.findByPk(contestId);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    
    if (injurySwapService) injurySwapService.cancelScheduledSwap(contestId);
    
    await contest.update({ start_time: start_time ? new Date(start_time) : null, updated_at: new Date() });
    
    if (injurySwapService && ['cash', 'market_mover'].includes(contest.type) && start_time) {
      injurySwapService.scheduleSwapForContest(contestId, new Date(start_time));
    }
    
    res.json({ success: true, contest: { id: contest.id, start_time: contest.start_time } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/debug/launch-draft/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) return res.status(404).json({ error: 'Room not found' });
    
    const contest = await Contest.findByPk(roomStatus.contestId);
    await contestService.launchDraft(roomId, roomStatus, contest);
    
    res.json({ success: true, message: 'Draft launched' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN: FILL ROOM WITH BOTS ====================

router.post('/admin/fill-room/:roomId', authMiddleware, async (req, res) => {
  try {
    console.log('🤖🤖🤖 FILL ROOM ENDPOINT HIT 🤖🤖🤖');
    
    const userId = req.user.id || req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user || (user.username !== 'aaaaaa' && !user.is_admin)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    
    const { roomId } = req.params;
    console.log(`🤖 Fill room request for: ${roomId}`);
    
    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const slotsNeeded = 5 - roomStatus.currentPlayers;
    console.log(`🤖 Room has ${roomStatus.currentPlayers}/5, need ${slotsNeeded} bots`);
    
    if (slotsNeeded <= 0) {
      return res.json({ success: true, message: 'Room already full', botsAdded: 0 });
    }
    
    const contest = await Contest.findByPk(roomStatus.contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    // Use RAW SQL to find bots already in room (Sequelize include doesn't work without associations)
    const existingBots = await db.sequelize.query(`
      SELECT u.username 
      FROM contest_entries ce
      JOIN users u ON ce.user_id = u.id
      WHERE ce.draft_room_id = :roomId
      AND ce.status NOT IN ('cancelled')
      AND u.username LIKE 'botuser%'
    `, {
      replacements: { roomId },
      type: db.sequelize.QueryTypes.SELECT
    });
    
    const botsInRoom = new Set(existingBots.map(b => b.username));
    console.log(`🤖 Bots already in room: ${Array.from(botsInRoom).join(', ') || 'none'}`);
    
    const botEntries = [];
    let botNum = 1;
    const maxBotNum = 20;
    
    while (botEntries.length < slotsNeeded && botNum <= maxBotNum) {
      const botUsername = `botuser${botNum}`;
      
      if (botsInRoom.has(botUsername)) {
        console.log(`⏭️ ${botUsername} already in room, skipping`);
        botNum++;
        continue;
      }
      
      try {
        const [botUser] = await User.findOrCreate({
          where: { username: botUsername },
          defaults: {
            email: `${botUsername}@bot.local`,
            password: '$2b$10$dummyhashvalueforbotusersonly1234567890abc',
            balance: 10000
          }
        });
        
        // Double-check bot doesn't already have entry in this room
        const existingEntry = await ContestEntry.findOne({
          where: {
            draft_room_id: roomId,
            user_id: botUser.id,
            status: { [db.Sequelize.Op.notIn]: ['cancelled'] }
          }
        });
        
        if (existingEntry) {
          console.log(`⏭️ ${botUsername} already has entry (id: ${existingEntry.id}), skipping`);
          botNum++;
          continue;
        }
        
        const currentEntries = await ContestEntry.count({
          where: {
            draft_room_id: roomId,
            status: { [db.Sequelize.Op.notIn]: ['cancelled'] }
          }
        });
        
        const entry = await ContestEntry.create({
          id: uuidv4(),
          user_id: botUser.id,
          contest_id: roomStatus.contestId,
          draft_room_id: roomId,
          draft_position: currentEntries,
          status: 'pending',
          roster: {},
          total_spent: 0,
          entered_at: new Date()
        });
        
        await contest.increment('current_entries');
        botEntries.push(botUsername);
        console.log(`✅ ${botUsername} joined room at position ${currentEntries}`);
        
      } catch (err) {
        console.error(`❌ ${botUsername} failed:`, err.message);
      }
      
      botNum++;
      await new Promise(r => setTimeout(r, 100));
    }
    
    const updatedStatus = await contestService.getRoomStatus(roomId);
    
    // Emit socket update
    const io = req.app.get('io');
    if (io) {
      io.to(`room_${roomId}`).emit('room-update', {
        roomId,
        currentPlayers: updatedStatus?.currentPlayers || 0,
        maxPlayers: 5,
        players: updatedStatus?.entries?.map(e => ({
          id: e.userId,
          username: e.username,
          entryId: e.id
        })) || []
      });
    }
    
    if (updatedStatus && updatedStatus.currentPlayers >= 5) {
      console.log(`🚀 Room ${roomId} is full, launching draft...`);
      await contestService.launchDraft(roomId, updatedStatus, contest);
    }
    
    console.log(`🤖 Fill complete: added ${botEntries.length} bots, room now ${updatedStatus?.currentPlayers || 0}/5`);
    
    res.json({ 
      success: true, 
      botsAdded: botEntries.length,
      bots: botEntries,
      roomPlayers: updatedStatus?.currentPlayers || 0
    });
    
  } catch (error) {
    console.error('Fill room error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;