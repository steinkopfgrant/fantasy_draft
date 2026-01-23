// backend/src/routes/contestRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../models');
const { Contest, ContestEntry, User, DraftPick, Transaction } = db;
const { v4: uuidv4 } = require('uuid');
const contestService = require('../services/contestService');

// ============================================================================
// ⚠️  IMPORTANT: NEVER USE "odId" - ALWAYS USE "userId"
// ⚠️  This has caused multiple bugs. The correct variable is ALWAYS "userId"
// ⚠️  which comes from: const userId = req.user.id || req.user.userId;
// ============================================================================

// Import injury swap service (optional - won't break if not present)
let injurySwapService;
try {
  injurySwapService = require('../services/injurySwapService');
} catch (error) {
  console.log('⚠️ Injury swap service not available in contestRoutes');
  injurySwapService = null;
}

// Log middleware for debugging
router.use((req, res, next) => {
  console.log(`Contest Route: ${req.method} ${req.path}`);
  next();
});

// ==================== PUBLIC ROUTES (NO AUTH REQUIRED) ====================

// Test route to verify routes are loaded
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Contest routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Get all active contests - PUBLIC ROUTE (NO AUTH)
router.get('/', async (req, res) => {
  try {
    console.log('Fetching all contests...');
    
    // Use contestService to get contests
    const contests = await contestService.getContests();
    
    console.log(`Returning ${contests.length} contests`);
    res.json(contests);
    
  } catch (error) {
    console.error('Get contests error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch contests',
      message: error.message 
    });
  }
});

// Get single contest details - PUBLIC ROUTE
router.get('/contest/:contestId', async (req, res) => {
  try {
    const { contestId } = req.params;
    console.log('Fetching contest:', contestId);
    
    const contest = await contestService.getContest(contestId);
    
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    // Get entries if needed
    const entries = await ContestEntry.findAll({
      where: {
        contest_id: contest.id,
        status: {
          [db.Sequelize.Op.in]: ['pending', 'drafting', 'completed']
        }
      },
      include: [{
        model: User,
        attributes: ['id', 'username']
      }]
    });
    
    const formattedContest = {
      ...contest,
      entries: entries.map(e => ({
        id: e.id,
        odId: e.user_id,
        username: e.User?.username || 'Unknown',
        status: e.status,
        draftRoomId: e.draft_room_id
      }))
    };
    
    res.json(formattedContest);
    
  } catch (error) {
    console.error('Get contest error:', error);
    res.status(500).json({ error: 'Failed to fetch contest' });
  }
});

// Get room status - NEW ENDPOINT
router.get('/room/:roomId/status', async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log('Getting room status for:', roomId);
    
    const roomStatus = await contestService.getRoomStatus(roomId);
    
    if (!roomStatus) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Format response
    const response = {
      roomId: roomId,
      contestId: roomStatus.contestId,
      currentPlayers: roomStatus.currentPlayers,
      maxPlayers: 5, // HARDCODE 5
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

// Get user's contest entries
router.get('/my-entries', authMiddleware, async (req, res) => {
  try {
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    console.log('Fetching entries for user:', userId);
    
    const entries = await contestService.getUserEntries(userId);
    
    console.log(`Found ${entries.length} entries for user`);
    res.json(entries);
    
  } catch (error) {
    console.error('Get user entries error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch entries',
      message: error.message 
    });
  }
});

// Enter a contest - FIXED TO RETURN ROOM STATUS
router.post('/enter/:contestId', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    const username = req.user.username || 'Player';
    
    console.log(`\n=== CONTEST ENTRY REQUEST ===`);
    console.log(`User: ${username} (${userId})`);
    console.log(`Contest: ${contestId}`);
    
    // Use contest service to handle entry
    const result = await contestService.enterContest(contestId, userId, username);
    
    // Get room status to include current players
    if (result.draftRoomId) {
      const roomStatus = await contestService.getRoomStatus(result.draftRoomId);
      
      if (roomStatus) {
        result.roomStatus = {
          currentPlayers: roomStatus.currentPlayers,
          maxPlayers: 5, // HARDCODE 5 for all rooms
          status: roomStatus.status,
          players: roomStatus.entries.map(e => ({
            id: e.userId,
            username: e.username,
            entryId: e.id,
            joinedAt: e.enteredAt
          }))
        };
        
        console.log(`✅ Room ${result.draftRoomId} now has ${roomStatus.currentPlayers}/5 players`);
        
        // Log if room is almost full
        if (roomStatus.currentPlayers === 4) {
          console.log(`⚠️ Room ${result.draftRoomId} needs only 1 more player!`);
        } else if (roomStatus.currentPlayers === 5) {
          console.log(`🎉 Room ${result.draftRoomId} is FULL! Draft will start soon.`);
        }
      }
    }
    
    // Emit socket events for real-time updates
    const io = req.app.get('io');
    if (io && result.draftRoomId) {
      // Emit to all clients about the room update
      io.emit('room-player-joined', {
        roomId: result.draftRoomId,
        contestId: contestId,
        currentPlayers: result.roomStatus?.currentPlayers || 1,
        maxPlayers: 5,
        players: result.roomStatus?.players || [],
        newPlayer: {
          id: userId,
          username: username,
          entryId: result.entryId
        }
      });
      
      // Join user to the room for targeted updates
      io.to(`user_${userId}`).emit('joined-room', {
        roomId: result.draftRoomId,
        contestId: contestId,
        currentPlayers: result.roomStatus?.currentPlayers || 1,
        players: result.roomStatus?.players || []
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Enter contest error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to enter contest' 
    });
  }
});

// Withdraw from contest
router.post('/withdraw/:entryId', authMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    
    const result = await contestService.withdrawEntry(entryId, userId);
    
    res.json(result);
    
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Save draft pick
router.post('/draft/:entryId/pick', authMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { player, position } = req.body;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    
    // Verify user owns this entry
    const entry = await contestService.getEntry(entryId);
    if (!entry || entry.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Handle the pick through contest service
    await contestService.handlePlayerPick(entry.draftRoomId, userId, player, position);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Draft pick error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Complete draft - FIXED TO HANDLE DUPLICATES AND ERRORS PROPERLY
router.post('/draft/:entryId/complete', authMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { roster, totalSpent } = req.body;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    
    console.log('=== SAVING COMPLETED DRAFT ===');
    console.log('Entry ID:', entryId);
    console.log('User ID from auth:', userId);
    console.log('User object:', req.user);
    console.log('Roster:', JSON.stringify(roster));
    
    // Get the contest entry with contest details
    // ⚠️ FIXED: Changed odId to userId
    const entry = await ContestEntry.findOne({
      where: { 
        id: entryId,
        user_id: userId 
      },
      include: [{
        model: Contest,
        attributes: ['id', 'type', 'name']
      }]
    });
    
    if (!entry) {
      // ⚠️ FIXED: Changed odId to userId in error log
      console.error('Entry not found or unauthorized:', {
        entryId,
        userId,
        query: `SELECT * FROM contest_entries WHERE id = '${entryId}' AND user_id = '${userId}'`
      });
      return res.status(404).json({ 
        success: false, 
        error: 'Contest entry not found or unauthorized' 
      });
    }
    
    console.log('Found entry:', {
      entryId: entry.id,
      entryUserId: entry.user_id,
      contestId: entry.contest_id,
      contestName: entry.Contest?.name
    });
    
    // Check if a lineup already exists for this contest_entry_id
    const existingLineup = await db.Lineup.findOne({
      where: { contest_entry_id: entryId }
    });
    
    if (existingLineup) {
      console.log('⚠️ Lineup already exists for entry:', entryId);
      console.log('Existing lineup user_id:', existingLineup.user_id);
      console.log('Current user_id:', userId);
      
      // If lineup belongs to different user, this is a problem
      if (existingLineup.user_id !== userId) {
        console.error('❌ Entry ID collision! Multiple users using same entry ID!');
        console.error('Entry belongs to:', existingLineup.user_id);
        console.error('Current user:', userId);
        return res.status(403).json({ 
          success: false, 
          error: 'This entry belongs to another user' 
        });
      }
      
      // Update existing lineup for this user
      console.log('Updating existing lineup for user...');
      await existingLineup.update({
        roster: roster,
        status: 'drafted',
        updated_at: new Date()
      });
      
      console.log('✅ Lineup updated successfully');
      
      res.json({
        success: true,
        message: 'Draft updated successfully!',
        lineup: {
          id: existingLineup.id,
          roster: existingLineup.roster,
          status: existingLineup.status
        }
      });
    } else {
      // Create new lineup
      console.log('Creating new lineup...');
      console.log('Data to insert:', {
        user_id: userId,
        contest_entry_id: entryId,
        contest_id: entry.contest_id,
        contest_type: entry.Contest.type
      });
      
      const lineup = await db.Lineup.create({
        user_id: userId,
        contest_entry_id: entryId,
        contest_id: entry.contest_id,
        contest_type: entry.Contest.type,
        roster: roster,
        status: 'drafted',
        week: 1
      });
      
      // Update contest entry status
      await entry.update({ status: 'drafted' });
      
      console.log('✅ New lineup created:', lineup.id);
      console.log('For user:', userId);
      console.log('With roster:', Object.keys(roster));
      
      res.json({
        success: true,
        message: 'Draft completed and lineup saved!',
        lineup: {
          id: lineup.id,
          roster: lineup.roster,
          status: lineup.status
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error saving draft:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      sql: error.sql
    });
    
    // Check for specific database errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      console.error('Unique constraint violation - duplicate entry attempted');
      console.error('Constraint details:', error.fields);
      res.status(409).json({ 
        success: false,
        error: 'Draft already saved for this entry'
      });
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
      console.error('Foreign key constraint violation');
      res.status(400).json({ 
        success: false,
        error: 'Invalid reference in draft data'
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to save draft'
      });
    }
  }
});

// Get user's contest history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    
    const history = await contestService.getUserContestHistory(userId, limit);
    
    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch contest history' });
  }
});

// ==================== SOCKET INTEGRATION ROUTES ====================

// Join contest lobby (for real-time updates)
router.post('/:contestId/join-lobby', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('join-contest-lobby', { contestId });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join lobby' });
  }
});

// Leave contest lobby
router.post('/:contestId/leave-lobby', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('leave-contest-lobby', { contestId });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave lobby' });
  }
});

// ==================== MARKET MOVER ROUTES ====================

// Calculate ownership for Market Mover
router.post('/:contestId/ownership', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const { playerName } = req.body;
    // ⚠️ ALWAYS use userId, NEVER odId
    const userId = req.user.id || req.user.userId;
    
    // Check if user has tickets
    const user = await User.findByPk(userId);
    if (!user || user.tickets < 1) {
      return res.status(400).json({ error: 'Insufficient tickets' });
    }
    
    // Calculate ownership
    const ownership = await contestService.calculateOwnership(contestId, playerName);
    
    // Deduct ticket
    await user.decrement('tickets', { by: 1 });
    
    res.json({
      success: true,
      ownership,
      playerName,
      remainingTickets: user.tickets - 1
    });
    
  } catch (error) {
    console.error('Ownership calculation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ==================== ADMIN/DEBUG ROUTES ====================

// Health check
router.get('/health', async (req, res) => {
  try {
    const health = await contestService.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Ensure cash game available
router.post('/ensure-cash-game', async (req, res) => {
  try {
    await contestService.ensureCashGameAvailable();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug route to see all contests
router.get('/debug/all', async (req, res) => {
  try {
    const contests = await contestService.getAllContests(true);
    res.json({ 
      count: contests.length,
      contests 
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create test contest
router.post('/debug/create-test-contest', async (req, res) => {
  try {
    const { generatePlayerBoard } = require('../utils/gameLogic');
    
    const contest = await Contest.create({
      name: `Test Contest ${Date.now()}`,
      type: 'cash',
      status: 'open',
      entry_fee: 0,
      max_entries: 5, // Changed to 5 for testing
      current_entries: 0,
      prize_pool: 25,
      prizes: [25],
      max_entries_per_user: 1,
      player_board: generatePlayerBoard('cash'),
      start_time: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    });
    
    // Schedule injury swap if service available and start_time exists
    if (injurySwapService && contest.start_time) {
      injurySwapService.scheduleSwapForContest(contest.id, contest.start_time);
    }
    
    res.json({
      success: true,
      contest: {
        id: contest.id,
        name: contest.name,
        type: contest.type
      }
    });
  } catch (error) {
    console.error('Create test contest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN CONTEST CREATION ====================

// Create a new contest (admin route)
router.post('/admin/create', authMiddleware, async (req, res) => {
  try {
    const { 
      name, 
      type, 
      entry_fee, 
      prize_pool, 
      max_entries, 
      start_time,
      sport = 'NFL'
    } = req.body;
    
    // TODO: Add admin check here
    // const user = await User.findByPk(req.user.id);
    // if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    
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
    
    // Schedule injury swap for cash and market_mover contests
    if (injurySwapService && ['cash', 'market_mover'].includes(type) && contest.start_time) {
      injurySwapService.scheduleSwapForContest(contest.id, contest.start_time);
      console.log(`📅 Scheduled injury swap for contest ${contest.id}`);
    }
    
    res.json({
      success: true,
      contest: {
        id: contest.id,
        name: contest.name,
        type: contest.type,
        start_time: contest.start_time,
        injurySwapScheduled: !!contest.start_time
      }
    });
    
  } catch (error) {
    console.error('Create contest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update contest start time (and reschedule injury swap)
router.put('/admin/:contestId/start-time', authMiddleware, async (req, res) => {
  try {
    const { contestId } = req.params;
    const { start_time } = req.body;
    
    const contest = await Contest.findByPk(contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    // Cancel existing scheduled swap
    if (injurySwapService) {
      injurySwapService.cancelScheduledSwap(contestId);
    }
    
    // Update start time
    await contest.update({ 
      start_time: start_time ? new Date(start_time) : null,
      updated_at: new Date()
    });
    
    // Reschedule injury swap if applicable
    if (injurySwapService && ['cash', 'market_mover'].includes(contest.type) && start_time) {
      injurySwapService.scheduleSwapForContest(contestId, new Date(start_time));
      console.log(`📅 Rescheduled injury swap for contest ${contestId}`);
    }
    
    res.json({
      success: true,
      contest: {
        id: contest.id,
        start_time: contest.start_time,
        injurySwapScheduled: !!start_time
      }
    });
    
  } catch (error) {
    console.error('Update start time error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force launch draft (admin only)
router.post('/debug/launch-draft/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const contest = await Contest.findByPk(roomStatus.contestId);
    await contestService.launchDraft(roomId, roomStatus, contest);
    
    res.json({ 
      success: true,
      message: 'Draft launched'
    });
  } catch (error) {
    console.error('Force launch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN: FILL ROOM WITH BOTS ====================

// Admin: Fill lobby with bots (for testing)
router.post('/admin/fill-room/:roomId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const user = await User.findByPk(userId);
    
    // Admin check
    if (!user || (user.username !== 'aaaaaa' && !user.is_admin)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    
    const { roomId } = req.params;
    
    // Get room status - this uses the same query as the frontend sees
    const roomStatus = await contestService.getRoomStatus(roomId);
    if (!roomStatus) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    console.log(`\n=== FILL ROOM DEBUG ===`);
    console.log(`Room: ${roomId}`);
    console.log(`Current players (from getRoomStatus): ${roomStatus.currentPlayers}`);
    
    const slotsNeeded = 5 - roomStatus.currentPlayers;
    if (slotsNeeded <= 0) {
      return res.json({ success: true, message: 'Room already full', botsAdded: 0, roomPlayers: roomStatus.currentPlayers });
    }
    
    console.log(`Slots needed: ${slotsNeeded}`);
    
    // Get the contest
    const contest = await Contest.findByPk(roomStatus.contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    
    // Get ALL entries in this room to determine used positions
    // Include ALL statuses to avoid position conflicts with DB constraints
    const allEntriesInRoom = await ContestEntry.findAll({
      where: {
        draft_room_id: roomId
      },
      include: [{
        model: User,
        attributes: ['id', 'username'],
        required: false
      }],
      attributes: ['id', 'user_id', 'draft_position', 'status']
    });
    
    // Track which positions are taken (by ANY entry, regardless of status)
    const usedPositions = new Set();
    const userIdsInRoom = new Set();
    const botUsernamesInRoom = new Set();
    
    allEntriesInRoom.forEach(entry => {
      if (entry.draft_position !== null) {
        usedPositions.add(entry.draft_position);
      }
      userIdsInRoom.add(entry.user_id);
      if (entry.User?.username?.startsWith('botuser')) {
        botUsernamesInRoom.add(entry.User.username);
      }
    });
    
    console.log(`Used positions: ${Array.from(usedPositions).sort().join(', ') || 'none'}`);
    console.log(`Bots already in room: ${Array.from(botUsernamesInRoom).join(', ') || 'none'}`);
    
    // Find available positions (0-4)
    const availablePositions = [];
    for (let pos = 0; pos < 5; pos++) {
      if (!usedPositions.has(pos)) {
        availablePositions.push(pos);
      }
    }
    
    console.log(`Available positions: ${availablePositions.join(', ') || 'NONE'}`);
    
    if (availablePositions.length === 0) {
      console.log(`❌ No available positions in room ${roomId}`);
      return res.status(400).json({ 
        success: false, 
        error: 'No available positions in room',
        debug: {
          usedPositions: Array.from(usedPositions),
          totalEntries: allEntriesInRoom.length
        }
      });
    }
    
    const botEntries = [];
    const errors = [];
    let botNum = 1;
    const maxBotNum = 20;
    let positionIndex = 0;
    
    while (botEntries.length < slotsNeeded && botNum <= maxBotNum && positionIndex < availablePositions.length) {
      const botUsername = `botuser${botNum}`;
      
      // Skip if this specific bot is already in room
      if (botUsernamesInRoom.has(botUsername)) {
        console.log(`  ⏭️ ${botUsername} already in room, trying next bot`);
        botNum++;
        continue;
      }
      
      try {
        // Find or create bot user
        const [botUser, created] = await User.findOrCreate({
          where: { username: botUsername },
          defaults: {
            email: `${botUsername}@bot.local`,
            password: '$2b$10$dummyhashvalueforbotusersonly1234567890abc',
            balance: 10000
          }
        });
        
        if (created) {
          console.log(`  🤖 Created new bot user: ${botUsername}`);
        }
        
        // Check if this bot user (by ID) already has an entry in this room
        if (userIdsInRoom.has(botUser.id)) {
          console.log(`  ⏭️ ${botUsername} (ID: ${botUser.id}) already has entry in room, trying next bot`);
          botNum++;
          continue;
        }
        
        // Get the next available position
        const assignedPosition = availablePositions[positionIndex];
        
        console.log(`  📝 Creating entry for ${botUsername} at position ${assignedPosition}...`);
        
        // Create entry with explicit position
        const entry = await ContestEntry.create({
          id: uuidv4(),
          user_id: botUser.id,
          contest_id: roomStatus.contestId,
          draft_room_id: roomId,
          draft_position: assignedPosition,
          status: 'pending',
          roster: {},
          total_spent: 0,
          entered_at: new Date()
        });
        
        // Mark this position and user as used
        usedPositions.add(assignedPosition);
        userIdsInRoom.add(botUser.id);
        positionIndex++;
        
        // Increment contest entry count
        await contest.increment('current_entries');
        
        botEntries.push({
          username: botUsername,
          odId: botUser.id,
          entryId: entry.id,
          position: assignedPosition
        });
        
        console.log(`  ✅ ${botUsername} joined at position ${assignedPosition}`);
        
      } catch (err) {
        const errorMsg = `${botUsername}: ${err.message}`;
        console.log(`  ❌ Failed to add ${botUsername}: ${err.message}`);
        errors.push(errorMsg);
        
        // If it's a unique constraint error, the position might have been taken
        if (err.name === 'SequelizeUniqueConstraintError') {
          console.log(`  ⚠️ Position conflict detected, skipping position ${availablePositions[positionIndex]}`);
          positionIndex++; // Skip this position
        }
      }
      
      botNum++;
      
      // Small delay to prevent race conditions
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Get updated room status
    const updatedStatus = await contestService.getRoomStatus(roomId);
    const finalPlayerCount = updatedStatus?.currentPlayers || 0;
    
    console.log(`\n=== FILL ROOM RESULT ===`);
    console.log(`Bots added: ${botEntries.length}`);
    console.log(`Final player count: ${finalPlayerCount}/5`);
    if (errors.length > 0) {
      console.log(`Errors: ${errors.join(', ')}`);
    }
    
    // Emit socket event for room update
    const io = req.app.get('io');
    if (io && updatedStatus) {
      io.emit('room-player-joined', {
        roomId: roomId,
        contestId: roomStatus.contestId,
        currentPlayers: finalPlayerCount,
        maxPlayers: 5,
        players: updatedStatus.players || []
      });
    }
    
    // Check if room is now full and should launch draft
    if (finalPlayerCount >= 5) {
      console.log(`🚀 Room ${roomId} is full (${finalPlayerCount}/5), launching draft...`);
      try {
        await contestService.launchDraft(roomId, updatedStatus, contest);
      } catch (launchError) {
        console.error(`❌ Failed to launch draft: ${launchError.message}`);
        errors.push(`Draft launch failed: ${launchError.message}`);
      }
    }
    
    res.json({ 
      success: botEntries.length > 0 || finalPlayerCount >= 5,
      botsAdded: botEntries.length,
      roomPlayers: finalPlayerCount,
      bots: botEntries,
      errors: errors.length > 0 ? errors : undefined,
      message: finalPlayerCount >= 5 ? 'Room full, draft launching!' : 
               botEntries.length > 0 ? `Added ${botEntries.length} bot(s)` :
               'Could not add bots - check errors'
    });
    
  } catch (error) {
    console.error('Fill room error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;