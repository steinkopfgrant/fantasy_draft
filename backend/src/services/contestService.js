// backend/src/services/contestService.js
const { Op } = require('sequelize');
const db = require('../models');
const { generatePlayerBoard } = require('../utils/gameLogic');
const draftService = require('./draftService');
const lineupManager = require('./lineupManager');
const Redis = require('ioredis');

// Constants
const ROOM_SIZES = {
  cash: 5,
  market: 5,
  bash: 5,
  firesale: 5
};

const CONTEST_LIMITS = {
  cash: 1,
  market: 150,
  bash: 150,
  firesale: 150
};

const UNFILLED_ROOM_LIMIT = 20;

class ContestService {
  constructor() {
    this.io = null;
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { keyPrefix: 'ffsale:' });
    } else {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        keyPrefix: 'ffsale:'
      });
    }
    this.activeDrafts = new Map();
    this.draftTimers = new Map();
    
    // Track emitted events to prevent duplicates
    this.recentEvents = new Map();
    this.eventCleanupInterval = null;
    this.stalledDraftInterval = null;
  }

  setSocketIO(io) {
    this.io = io;
    draftService.setSocketIO(io);
    console.log('Socket.IO instance set in ContestService');
    
    // Start cleanup interval for recent events
    if (this.eventCleanupInterval) {
      clearInterval(this.eventCleanupInterval);
    }
    this.eventCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [eventId, timestamp] of this.recentEvents) {
        if (now - timestamp > 5000) {
          this.recentEvents.delete(eventId);
        }
      }
    }, 1000);
    
    // Start stalled draft checker - runs every 15 seconds
    if (this.stalledDraftInterval) {
      clearInterval(this.stalledDraftInterval);
    }
    this.stalledDraftInterval = setInterval(() => {
      this.checkAllStalledDrafts();
    }, 15000);
    console.log('🔄 Started stalled draft checker (every 15s)');
  }

  setIo(io) {
    this.setSocketIO(io);
  }

  // Emit event with deduplication
  emitOnce(eventName, data, eventId = null) {
    if (!this.io) return;
    
    if (!eventId) {
      eventId = `${eventName}_${JSON.stringify(data)}_${Date.now()}`;
    }
    
    if (this.recentEvents.has(eventId)) {
      console.log(`Skipping duplicate event: ${eventName}`);
      return;
    }
    
    this.recentEvents.set(eventId, Date.now());
    this.io.emit(eventName, data);
  }

  // Distributed lock using Redis
  async acquireLock(key, timeout = 5000) {
    const lockKey = `lock:${key}`;
    const lockValue = Date.now() + timeout;
    
    const acquired = await this.redis.set(
      lockKey, 
      lockValue, 
      'PX', 
      timeout, 
      'NX'
    );
    
    return acquired === 'OK';
  }

  async releaseLock(key) {
    const lockKey = `lock:${key}`;
    await this.redis.del(lockKey);
  }

  // Get all open contests - UPDATED with Market Mover data
  async getContests() {
    try {
      const contests = await db.Contest.findAll({
        where: { 
          status: 'open'
        },
        order: [
          ['type', 'ASC'],
          ['created_at', 'DESC']
        ]
      });

      // For cash games, only show the latest open one
      const cashGames = contests.filter(c => c.type === 'cash');
      const latestOpenCashGame = cashGames.length > 0 ? cashGames[0] : null;
      const otherContests = contests.filter(c => c.type !== 'cash');
      
      const finalContests = [];
      if (latestOpenCashGame) {
        finalContests.push(latestOpenCashGame);
      }
      finalContests.push(...otherContests);

      // For Market Mover contests, include FIRE SALE status
      const marketMoverService = require('./marketMoverService');
      const marketMoverStatus = await marketMoverService.getVotingStatus();

      return finalContests.map(contest => ({
        id: contest.id,
        type: contest.type,
        name: contest.name,
        status: contest.status,
        entryFee: parseFloat(contest.entry_fee),
        prizePool: parseFloat(contest.prize_pool),
        maxEntries: contest.max_entries,
        currentEntries: contest.current_entries || 0,
        maxEntriesPerUser: contest.max_entries_per_user || (contest.type === 'cash' ? 1 : 150),
        playerBoard: contest.player_board,
        startTime: contest.start_time,
        endTime: contest.end_time,
        scoringType: contest.scoring_type,
        maxSalary: contest.max_salary,
        // Add Market Mover specific data
        ...(contest.type === 'market' && {
          fireSaleList: marketMoverStatus.fireSaleList,
          coolDownList: marketMoverStatus.coolDownList,
          votingActive: marketMoverStatus.votingActive,
          voteLeaderboard: marketMoverStatus.leaderboard
        })
      }));
    } catch (error) {
      console.error('Error getting contests:', error);
      return [];
    }
  }

  async getContest(contestId) {
    try {
      const contest = await db.Contest.findByPk(contestId);
      if (!contest) return null;
      
      const result = {
        id: contest.id,
        type: contest.type,
        name: contest.name,
        status: contest.status,
        entryFee: parseFloat(contest.entry_fee),
        prizePool: parseFloat(contest.prize_pool),
        maxEntries: contest.max_entries,
        currentEntries: contest.current_entries || 0,
        maxEntriesPerUser: contest.max_entries_per_user || (contest.type === 'cash' ? 1 : 150),
        playerBoard: contest.player_board,
        startTime: contest.start_time,
        endTime: contest.end_time
      };

      // Add Market Mover specific data
      if (contest.type === 'market') {
        const marketMoverService = require('./marketMoverService');
        const marketMoverStatus = await marketMoverService.getVotingStatus();
        result.fireSaleList = marketMoverStatus.fireSaleList;
        result.coolDownList = marketMoverStatus.coolDownList;
        result.votingActive = marketMoverStatus.votingActive;
      }

      return result;
    } catch (error) {
      console.error('Error getting contest:', error);
      return null;
    }
  }

  async getUserEntries(userId) {
    try {
      const entries = await db.ContestEntry.findAll({
        where: { 
          user_id: userId,
          status: { [Op.ne]: 'cancelled' }
        },
        include: [{
          model: db.Contest,
          attributes: ['name', 'type', 'entry_fee', 'prize_pool', 'player_board', 'status', 'current_entries', 'max_entries']
        }],
        order: [['created_at', 'DESC']]
      });

      return entries.map(entry => ({
        id: entry.id,
        userId: entry.user_id,
        contestId: entry.contest_id,
        contestName: entry.Contest?.name,
        contestType: entry.Contest?.type,
        contestStatus: entry.Contest?.status,
        entryFee: entry.Contest ? parseFloat(entry.Contest.entry_fee) : 0,
        prizePool: entry.Contest ? parseFloat(entry.Contest.prize_pool) : 0,
        draftRoomId: entry.draft_room_id,
        status: entry.status,
        roster: entry.roster,
        lineup: entry.lineup,
        totalSpent: entry.total_spent,
        totalPoints: parseFloat(entry.total_points || 0),
        finalRank: entry.final_rank,
        prizeWon: parseFloat(entry.prize_won || 0),
        enteredAt: entry.entered_at,
        completedAt: entry.completed_at,
        Contest: entry.Contest
      }));
    } catch (error) {
      console.error('Error getting user entries:', error);
      return [];
    }
  }

  async getUserUnfilledRoomsCount(userId) {
    try {
      const pendingEntries = await db.ContestEntry.findAll({
        where: {
          user_id: userId,
          status: 'pending'
        },
        include: [{
          model: db.Contest,
          attributes: ['type']
        }]
      });

      const unfilledRooms = new Set();

      for (const entry of pendingEntries) {
        const roomEntryCount = await db.ContestEntry.count({
          where: {
            draft_room_id: entry.draft_room_id,
            status: { [Op.in]: ['pending', 'drafting'] }
          }
        });

        const maxPlayers = 5;
        if (roomEntryCount < maxPlayers) {
          unfilledRooms.add(entry.draft_room_id);
        }
      }

      return unfilledRooms.size;
    } catch (error) {
      console.error('Error checking unfilled rooms:', error);
      return 0;
    }
  }

  // Main enter contest method - FIXED for MarketMaker multi-entry
  async enterContest(contestId, userId, username) {
    const lockKey = `contest:${contestId}:user:${userId}`;
    const lockAcquired = await this.acquireLock(lockKey);
    
    if (!lockAcquired) {
      throw new Error('Another request is being processed. Please try again.');
    }

    const transaction = await db.sequelize.transaction({
      isolationLevel: db.Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });

    try {
      // 1. Get and validate contest with row lock
      const contest = await db.Contest.findByPk(contestId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!contest) {
        throw new Error('Contest not found');
      }

      console.log(`Entering contest: ${contest.name} (${contest.type}), Status: ${contest.status}, Entries: ${contest.current_entries}/${contest.max_entries}`);

      if (contest.status !== 'open') {
        throw new Error('Contest is not accepting entries');
      }

      if (contest.current_entries >= contest.max_entries) {
        throw new Error('Contest is full');
      }

      // 2. Get and validate user with row lock
      const user = await db.User.findByPk(userId, { 
        lock: transaction.LOCK.UPDATE,
        transaction 
      });
      
      if (!user) {
        throw new Error('User not found');
      }

      const userBalance = parseFloat(user.balance);
      const entryFee = parseFloat(contest.entry_fee);
      
      if (userBalance < entryFee) {
        throw new Error(`Insufficient balance. You need $${entryFee.toFixed(2)} but only have $${userBalance.toFixed(2)}`);
      }

      // 3. FIXED: Check user entry limits - properly handle MarketMaker
      if (contest.type === 'market') {
        // For MarketMaker, count ALL user entries (not cancelled)
        const totalUserEntries = await db.ContestEntry.count({
          where: {
            contest_id: contestId,
            user_id: userId,
            status: { [Op.notIn]: ['cancelled'] }
          },
          transaction
        });
        
        const maxEntriesPerUser = 150; // MarketMaker allows 150 entries
        
        if (totalUserEntries >= maxEntriesPerUser) {
          throw new Error(`Maximum entries (${maxEntriesPerUser}) reached for MarketMaker tournament`);
        }
        
        console.log(`MarketMaker: User has ${totalUserEntries}/${maxEntriesPerUser} entries`);
        
      } else if (contest.type === 'cash') {
        // For cash games, only allow one entry
        const existingEntry = await db.ContestEntry.findOne({
          where: {
            contest_id: contestId,
            user_id: userId,
            status: { [Op.notIn]: ['cancelled'] }
          },
          transaction
        });
        
        if (existingEntry) {
          throw new Error('You already have an entry in this cash game');
        }
      } else {
        // For other contest types
        const totalUserEntries = await db.ContestEntry.count({
          where: {
            contest_id: contestId,
            user_id: userId,
            status: { [Op.notIn]: ['cancelled'] }
          },
          transaction
        });

        const effectiveLimit = contest.max_entries_per_user || 150;

        if (totalUserEntries >= effectiveLimit) {
          throw new Error(`Maximum entries (${effectiveLimit}) reached for this contest`);
        }
      }

      // 4. Check unfilled rooms for non-cash contests
      if (contest.type !== 'cash') {
        const unfilledCount = await this.getUserUnfilledRoomsCount(userId);
        if (unfilledCount >= UNFILLED_ROOM_LIMIT) {
          throw new Error(`Maximum ${UNFILLED_ROOM_LIMIT} unfilled draft rooms allowed. Please wait for your drafts to start.`);
        }
      }

      // 5. Find or create room and assign position
      let roomId = contestId; // Cash games use contest ID as room
      let draftPosition = null;
      let entry = null;

      if (contest.type === 'cash') {
        // Cash game room assignment logic
        const currentEntries = await db.ContestEntry.findAll({
          where: {
            contest_id: contestId,
            status: { [Op.notIn]: ['cancelled', 'completed'] }
          },
          attributes: ['id', 'draft_position'],
          order: [['draft_position', 'ASC'], ['entered_at', 'ASC']],
          transaction,
          lock: true
        });

        if (currentEntries.length >= 5) {
          throw new Error('Contest room is full');
        }

        const usedPositions = new Set();
        for (const e of currentEntries) {
          if (e.draft_position !== null) {
            usedPositions.add(e.draft_position);
          }
        }
        
        for (let pos = 0; pos < 5; pos++) {
          if (!usedPositions.has(pos)) {
            draftPosition = pos;
            break;
          }
        }

        if (draftPosition === null) {
          throw new Error('No draft positions available in room');
        }

        console.log(`Cash game: Assigning position ${draftPosition} to user ${username} (${currentEntries.length + 1}/5 players after join)`);
        
        // Create entry for cash game
        entry = await db.ContestEntry.create({
          user_id: userId,
          contest_id: contestId,
          draft_room_id: roomId,
          draft_position: draftPosition,
          status: 'pending',
          entered_at: new Date()
        }, { transaction });

        console.log(`Created entry for ${username} with position ${draftPosition} in room ${roomId}`);
        
      } else if (['market', 'bash', 'firesale'].includes(contest.type)) {
        // Tournament games use the findOrCreateRoom method
        const roomAssignment = await this.findOrCreateRoom(contestId, userId, transaction);
        roomId = roomAssignment.roomId;
        draftPosition = roomAssignment.position;
        
        // Store room board in Redis for Market Mover
        if (contest.type === 'market') {
          const boardKey = `board:${roomId}`;
          const existingBoard = await this.redis.get(boardKey);
          
          if (!existingBoard) {
            // Fetch Fire Sale and Cool Down lists for board generation
            const marketMoverService = require('./marketMoverService');
            const mmStatus = await marketMoverService.getVotingStatus();
            
            // Generate board with Fire Sale/Cool Down modifiers built in
            let newBoard = generatePlayerBoard('market', mmStatus.fireSaleList || [], mmStatus.coolDownList || []);
            
            await this.redis.set(boardKey, JSON.stringify(newBoard), 'EX', 86400);
            console.log(`Generated new Market Mover board for room ${roomId} with FIRE SALE modifiers`);
          }
        }
        
        // Create entry for tournament
        entry = await db.ContestEntry.create({
          user_id: userId,
          contest_id: contestId,
          draft_room_id: roomId,
          draft_position: draftPosition,
          status: 'pending',
          entered_at: new Date()
        }, { transaction });

        console.log(`Created entry for ${username} with position ${draftPosition} in room ${roomId}`);
      }

      if (!entry) {
        throw new Error('Failed to create contest entry');
      }

      // 7. Update user balance
      const newBalance = userBalance - entryFee;
      await user.update({ balance: newBalance }, { transaction });

      // 8. Create transaction record
      await db.Transaction.create({
        user_id: userId,
        type: 'contest_entry',
        amount: -entryFee,
        balance_after: newBalance,
        contest_id: contestId,
        description: `Entry fee for ${contest.name}`
      }, { transaction });

      // 9. Update contest entries
      await contest.increment('current_entries', { transaction });
      await contest.reload({ transaction });
      
      const newEntryCount = contest.current_entries;
      
      console.log(`Contest ${contestId} entry count now: ${newEntryCount} (max: ${contest.max_entries})`);
      
      let newCashGameCreated = false;
      let newCashGameData = null;
      
      // 10. Handle full contest - ONLY create new cash games, NOT market/tournament
      if (newEntryCount >= contest.max_entries) {
        console.log(`Contest ${contestId} (${contest.name}) is now full with ${newEntryCount}/${contest.max_entries} entries`);
        
        // ONLY auto-create new contests for cash games
        if (contest.type === 'cash') {
          console.log(`Cash game ${contestId} is full, creating replacement...`);
          
          try {
            const cashGames = await db.Contest.findAll({
              where: {
                type: 'cash',
                name: { [Op.like]: 'Cash Game #%' }
              },
              attributes: ['name'],
              transaction
            });

            let maxNumber = 0;
            cashGames.forEach(game => {
              const match = game.name.match(/Cash Game #(\d+)/);
              if (match) {
                maxNumber = Math.max(maxNumber, parseInt(match[1]));
              }
            });

            const nextNumber = maxNumber + 1;
            
            const newCashGame = await db.Contest.create({
              type: 'cash',
              name: `Cash Game #${nextNumber}`,
              status: 'open',
              entry_fee: contest.entry_fee,
              prize_pool: contest.prize_pool,
              max_entries: contest.max_entries,
              current_entries: 0,
              max_entries_per_user: 1,
              player_board: generatePlayerBoard(),
              start_time: new Date(),
              end_time: new Date(Date.now() + 7200000),
              scoring_type: contest.scoring_type,
              max_salary: 15
            }, { transaction });
            
            console.log(`Successfully created new cash game: ${newCashGame.id} (${newCashGame.name})`);
            
            newCashGameCreated = true;
            newCashGameData = {
              id: newCashGame.id,
              type: newCashGame.type,
              name: newCashGame.name,
              status: newCashGame.status,
              entryFee: parseFloat(newCashGame.entry_fee),
              prizePool: parseFloat(newCashGame.prize_pool),
              maxEntries: newCashGame.max_entries,
              currentEntries: 0,
              maxEntriesPerUser: 1,
              playerBoard: newCashGame.player_board,
              startTime: newCashGame.start_time,
              endTime: newCashGame.end_time,
              scoringType: newCashGame.scoring_type,
              maxSalary: newCashGame.max_salary
            };
          } catch (error) {
            console.error('Error creating new cash game:', error);
          }
        }
        // Market/Tournament contests do NOT auto-create - admin launches them
        
        await contest.update({ status: 'closed' }, { transaction });
      }
      
      await transaction.commit();

      // 11. Post-commit actions
      const freshContest = await db.Contest.findByPk(contestId);
      const actualCurrentEntries = freshContest.current_entries;
      const actualStatus = freshContest.status;

      // Get room status for response
      const roomStatus = await this.getRoomStatus(roomId);

      if (this.io) {
        const eventId = `contest_update_${contestId}_${actualCurrentEntries}_${Date.now()}`;
        
        this.emitOnce('contest-updated', {
          contest: {
            id: freshContest.id,
            type: freshContest.type,
            name: freshContest.name,
            status: actualStatus,
            currentEntries: actualCurrentEntries,
            maxEntries: freshContest.max_entries
          }
        }, eventId);

        if (newCashGameCreated && newCashGameData) {
          setTimeout(() => {
            const cashGameEventId = `cash_game_created_${newCashGameData.id}_${Date.now()}`;
            this.emitOnce('contest-created', {
              contest: newCashGameData,
              replacedContestId: contestId,
              message: `${contest.name} is full. ${newCashGameData.name} is now available!`
            }, cashGameEventId);
          }, 100);
        }
      }

      // Check if draft should start
      setTimeout(async () => {
        console.log(`📋 Checking draft launch for room ${roomId} after entry creation`);
        try {
          await this.checkAndLaunchDraft(roomId, freshContest);
        } catch (error) {
          console.error(`❌ Error checking draft launch:`, error);
        }
      }, 1000);

      console.log(`User ${username} entered ${contest.name}. Entries: ${actualCurrentEntries}/${contest.max_entries}`);

      return {
        success: true,
        id: entry.id,
        entry: {
          id: entry.id,
          userId: entry.user_id,
          contestId: contestId,
          draftRoomId: roomId,
          draftPosition: draftPosition,
          status: entry.status,
          enteredAt: entry.entered_at
        },
        entryId: entry.id,
        draftRoomId: roomId,
        contestId: contestId,
        newBalance: newBalance,
        contestFull: actualCurrentEntries >= contest.max_entries,
        newCashGameId: newCashGameData?.id,
        roomStatus: roomStatus
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Error entering contest:', error);
      throw error;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  // FIXED: findOrCreateRoom - checks ALL rooms including empty ones
  async findOrCreateRoom(contestId, userId, transaction) {
    console.log(`\n=== FINDING ROOM FOR USER ${userId} IN CONTEST ${contestId} ===`);
    
    const contest = await db.Contest.findByPk(contestId, { transaction });
    console.log(`Contest type: ${contest?.type}, status: ${contest?.status}`);
    
    for (let attempt = 0; attempt < 3; attempt++) {
      // FIXED: Get ALL distinct rooms for this contest (including those with only cancelled entries)
      const allRooms = await db.ContestEntry.findAll({
        attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('draft_room_id')), 'draft_room_id']],
        where: {
          contest_id: contestId,
          draft_room_id: { [Op.like]: `${contestId}_room_%` }
        },
        raw: true,
        transaction
      });

      console.log(`Attempt ${attempt + 1}: Found ${allRooms.length} total rooms for contest`);

      // For each room, get active entry count and check if user can join
      const roomsWithCounts = [];
      for (const room of allRooms) {
        const roomId = room.draft_room_id;
        
        // Count ACTIVE entries only
        const activeCount = await db.ContestEntry.count({
          where: {
            draft_room_id: roomId,
            status: { [Op.notIn]: ['cancelled', 'completed'] }
          },
          transaction
        });

        // Check if user already has ACTIVE entry in this room
        const userActiveInRoom = await db.ContestEntry.count({
          where: {
            draft_room_id: roomId,
            user_id: userId,
            status: { [Op.notIn]: ['cancelled', 'completed'] }
          },
          transaction
        });

        // Extract room number for sorting
        const roomNumMatch = roomId.match(/_room_(\d+)$/);
        const roomNum = roomNumMatch ? parseInt(roomNumMatch[1]) : 999999;

        // Room is available if < 5 active entries AND user doesn't have active entry there
        if (activeCount < 5 && userActiveInRoom === 0) {
          roomsWithCounts.push({ roomId, activeCount, roomNum });
        }
      }

      // Sort by: 1) fullest first (most active entries), 2) lowest room number (oldest)
      roomsWithCounts.sort((a, b) => {
        const countDiff = b.activeCount - a.activeCount;
        if (countDiff !== 0) return countDiff;
        return a.roomNum - b.roomNum;
      });
      
      console.log(`Available rooms: ${roomsWithCounts.map(r => `room_${r.roomNum}(${r.activeCount}/5)`).join(', ') || 'NONE'}`);

      // Try to join an existing room
      for (const room of roomsWithCounts) {
        const roomId = room.roomId;
        
        try {
          // Lock and verify room state
          const currentEntries = await db.ContestEntry.findAll({
            where: { draft_room_id: roomId },
            attributes: ['draft_position', 'user_id', 'status'],
            order: [['draft_position', 'ASC']],
            transaction,
            lock: true
          });

          const activeEntries = currentEntries.filter(e => !['cancelled', 'completed'].includes(e.status));
          
          if (activeEntries.length >= 5) {
            console.log(`  ⏭️ Skipping room_${room.roomNum}: filled up during lock (${activeEntries.length}/5)`);
            continue;
          }

          // Double-check user isn't in room after lock
          const userInThisRoom = activeEntries.some(e => e.user_id === userId);
          if (userInThisRoom) {
            console.log(`  ⏭️ Skipping room_${room.roomNum}: user already has active entry`);
            continue;
          }

          // Find available position (only from active entries)
          const usedPositions = activeEntries.map(e => e.draft_position).filter(p => p !== null);
          let assignedPosition = null;
          for (let pos = 0; pos < 5; pos++) {
            if (!usedPositions.includes(pos)) {
              assignedPosition = pos;
              break;
            }
          }

          if (assignedPosition !== null) {
            console.log(`✅ Assigning user to room_${room.roomNum} at position ${assignedPosition} (${activeEntries.length + 1}/5 players)`);
            return { roomId, position: assignedPosition };
          }
        } catch (error) {
          console.log(`  ⚠️ Error checking room_${room.roomNum}: ${error.message}`);
          continue;
        }
      }
      
      // If we get here on first attempt, no rooms available - create new one
      if (attempt === 0) {
        break; // Exit retry loop to create new room
      }
    }

    // Create new room - get max room number from DB
    const existingRooms = await db.ContestEntry.findAll({
      attributes: ['draft_room_id'],
      where: {
        contest_id: contestId,
        draft_room_id: { [Op.like]: `${contestId}_room_%` }
      },
      group: ['draft_room_id'],
      raw: true,
      transaction
    });

    let maxRoomNumber = 0;
    for (const room of existingRooms) {
      const match = room.draft_room_id.match(/_room_(\d+)$/);
      if (match) {
        maxRoomNumber = Math.max(maxRoomNumber, parseInt(match[1], 10));
      }
    }

    const newRoomNumber = maxRoomNumber + 1;
    const newRoomId = `${contestId}_room_${newRoomNumber}`;
    console.log(`📦 Creating new room_${newRoomNumber} (max existing was ${maxRoomNumber})`);

    return { roomId: newRoomId, position: 0 };
  }

  // FIXED: withdrawEntry to allow withdrawal for pending entries
  async withdrawEntry(entryId, userId) {
    const lockKey = `withdraw:${entryId}:${userId}`;
    const lockAcquired = await this.acquireLock(lockKey);
    
    if (!lockAcquired) {
      throw new Error('Another request is being processed. Please try again.');
    }

    const transaction = await db.sequelize.transaction({
      isolationLevel: db.Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });

    try {
      const entry = await db.ContestEntry.findOne({
        where: {
          id: entryId,
          user_id: userId
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!entry) {
        throw new Error('Entry not found');
      }

      // Allow withdrawal only for pending status
      if (entry.status === 'drafting' || entry.status === 'completed') {
        throw new Error('Cannot withdraw after draft has started');
      }

      const contest = await db.Contest.findByPk(entry.contest_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!contest) {
        throw new Error('Contest not found');
      }

      // Update entry status
      await entry.update({ status: 'cancelled' }, { transaction });
      
      console.log(`🚪 User ${userId} withdrew from room ${entry.draft_room_id} (position ${entry.draft_position})`);

      // Refund user
      const user = await db.User.findByPk(userId, { 
        lock: transaction.LOCK.UPDATE,
        transaction 
      });
      
      const refundAmount = parseFloat(contest.entry_fee);
      const newBalance = parseFloat(user.balance) + refundAmount;
      
      await user.update({ balance: newBalance }, { transaction });

      // Create transaction record for refund
      await db.Transaction.create({
        user_id: userId,
        type: 'contest_refund',
        amount: refundAmount,
        balance_after: newBalance,
        contest_id: entry.contest_id,
        description: `Refund for ${contest.name} withdrawal`
      }, { transaction });

      // Update contest entry count
      if (contest.current_entries > 0) {
        await contest.decrement('current_entries', { transaction });
        
        // If contest was closed/full and now has space, reopen it
        if (contest.status === 'closed' && contest.current_entries - 1 < contest.max_entries) {
          await contest.update({ status: 'open' }, { transaction });
          console.log(`Reopened contest ${contest.id} after withdrawal`);
        }
      }

      await transaction.commit();

      console.log(`User ${userId} withdrew from ${contest.name}. Entries: ${contest.current_entries - 1}/${contest.max_entries}`);

      // Fetch fresh data after commit
      const freshContest = await db.Contest.findByPk(entry.contest_id);

      // Emit socket event for contest update
      if (this.io) {
        const eventId = `contest_update_${freshContest.id}_${freshContest.current_entries}_${Date.now()}`;
        this.emitOnce('contest-updated', {
          contest: {
            id: freshContest.id,
            type: freshContest.type,
            name: freshContest.name,
            status: freshContest.status,
            currentEntries: freshContest.current_entries,
            maxEntries: freshContest.max_entries
          }
        }, eventId);
      }

      return { 
        success: true, 
        refund: refundAmount,
        newBalance: newBalance
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Error withdrawing entry:', error);
      throw error;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  // NEW: Find the lowest priority entry to withdraw (room with fewest players)
  // This helps users withdraw from rooms least likely to fill
  async getLowestPriorityEntry(contestId, userId) {
    try {
      // Get all user's pending entries for this contest
      const userEntries = await db.ContestEntry.findAll({
        where: {
          contest_id: contestId,
          user_id: userId,
          status: 'pending'
        }
      });

      if (userEntries.length === 0) {
        return null;
      }

      if (userEntries.length === 1) {
        return userEntries[0];
      }

      // For each entry, get the room's player count
      const entriesWithCounts = await Promise.all(
        userEntries.map(async (entry) => {
          const roomCount = await db.ContestEntry.count({
            where: {
              draft_room_id: entry.draft_room_id,
              status: { [Op.in]: ['pending', 'drafting'] }
            }
          });
          return { entry, roomCount };
        })
      );

      // Sort by room count ascending (fewest players = lowest priority)
      // Then by room number descending (newer rooms = lower priority)
      entriesWithCounts.sort((a, b) => {
        if (a.roomCount !== b.roomCount) {
          return a.roomCount - b.roomCount; // Fewer players first
        }
        // Extract room numbers for tie-breaking
        const aNum = parseInt(a.entry.draft_room_id.match(/_room_(\d+)$/)?.[1] || '0');
        const bNum = parseInt(b.entry.draft_room_id.match(/_room_(\d+)$/)?.[1] || '0');
        return bNum - aNum; // Higher room number (newer) first
      });

      console.log(`🎯 Lowest priority entry for user ${userId}: room ${entriesWithCounts[0].entry.draft_room_id} (${entriesWithCounts[0].roomCount}/5 players)`);
      
      return entriesWithCounts[0].entry;
    } catch (error) {
      console.error('Error finding lowest priority entry:', error);
      return null;
    }
  }

  // Clean up old room boards from Redis
  async cleanupRoomBoards() {
    try {
      console.log('🧹 Starting room board cleanup...');
      
      const keys = await this.redis.keys('ffsale:board:*');
      
      if (keys.length === 0) {
        console.log('No room boards to clean up');
        return 0;
      }
      
      let cleanedCount = 0;
      const ONE_DAY = 24 * 60 * 60 * 1000;
      
      for (const key of keys) {
        const roomId = key.replace('ffsale:board:', '');
        
        const activeEntries = await db.ContestEntry.count({
          where: {
            draft_room_id: roomId,
            status: { [Op.in]: ['pending', 'drafting'] }
          }
        });
        
        if (activeEntries === 0) {
          const ttl = await this.redis.ttl(key);
          
          if (ttl === -1 || ttl > ONE_DAY / 1000) {
            await this.redis.expire(key.replace('ffsale:', ''), ONE_DAY / 1000);
            cleanedCount++;
            console.log(`Set expiry for board ${roomId}`);
          }
        }
      }
      
      const draftKeys = await this.redis.keys('ffsale:draft:*');
      for (const key of draftKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1 || ttl > ONE_DAY / 1000) {
          await this.redis.expire(key.replace('ffsale:', ''), ONE_DAY / 1000);
          cleanedCount++;
        }
      }
      
      const counterKeys = await this.redis.keys('ffsale:room_counter:*');
      for (const key of counterKeys) {
        const contestId = key.replace('ffsale:room_counter:', '');
        
        const contest = await db.Contest.findByPk(contestId);
        if (!contest || contest.status === 'completed' || contest.status === 'cancelled') {
          await this.redis.del(key.replace('ffsale:', ''));
          cleanedCount++;
          console.log(`Removed counter for completed contest ${contestId}`);
        }
      }
      
      console.log(`✅ Room board cleanup complete. Processed ${cleanedCount} keys`);
      return cleanedCount;
      
    } catch (error) {
      console.error('Error cleaning up room boards:', error);
      return 0;
    }
  }

  // Enhanced getRoomStatus with Market Mover support
  async getRoomStatus(roomId) {
    try {
      console.log(`\n=== GET ROOM STATUS DEBUG ===`);
      console.log(`Getting room status for: ${roomId}`);
      
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId);
      
      // For cash games, use the contest directly
      if (isUUID) {
        const contest = await db.Contest.findByPk(roomId);
        if (contest && contest.type === 'cash') {
          let entries = await db.ContestEntry.findAll({
            where: {
              contest_id: roomId,
              status: { [Op.notIn]: ['cancelled', 'completed'] }
            },
            include: [{
              model: db.User,
              attributes: ['username']
            }],
            order: [['entered_at', 'ASC']],
            limit: 5
          });
          
          // Fix null positions
          let positionFixed = false;
          const usedPositions = new Set();
          
          entries.forEach(entry => {
            if (entry.draft_position !== null) {
              usedPositions.add(entry.draft_position);
            }
          });
          
          for (const entry of entries) {
            if (entry.draft_position === null) {
              let newPosition = 0;
              while (usedPositions.has(newPosition) && newPosition < 5) {
                newPosition++;
              }
              
              if (newPosition < 5) {
                await db.ContestEntry.update(
                  { draft_position: newPosition },
                  { where: { id: entry.id } }
                );
                entry.draft_position = newPosition;
                usedPositions.add(newPosition);
                positionFixed = true;
                console.log(`Fixed null position for ${entry.User?.username}, assigned position ${newPosition}`);
              }
            }
          }
          
          if (positionFixed) {
            entries = await db.ContestEntry.findAll({
              where: {
                contest_id: roomId,
                status: { [Op.notIn]: ['cancelled', 'completed'] }
              },
              include: [{
                model: db.User,
                attributes: ['username']
              }],
              order: [['draft_position', 'ASC'], ['entered_at', 'ASC']],
              limit: 5
            });
          }
          
          console.log(`Cash game room - Found ${entries.length} entries`);

          return {
            id: roomId,
            roomId: roomId,
            contestId: roomId,
            contestType: 'cash',
            entries: entries.map((e, index) => ({
              id: e.id,
              userId: e.user_id,
              username: e.User?.username || 'Unknown',
              contestId: e.contest_id,
              draftRoomId: e.draft_room_id,
              draftPosition: e.draft_position !== null ? e.draft_position : index,
              status: e.status,
              enteredAt: e.entered_at
            })),
            currentPlayers: entries.length,
            maxPlayers: 5,
            status: entries.length === 5 ? 'ready' : 'waiting',
            playerBoard: contest.player_board,
            players: entries.map(e => ({
              username: e.User?.username || 'Unknown',
              userId: e.user_id,
              position: e.draft_position
            }))
          };
        }
      }

      // For tournament rooms
      console.log(`Checking tournament room: ${roomId}`);
      
      let entries = await db.ContestEntry.findAll({
        where: {
          draft_room_id: roomId,
          status: { [Op.notIn]: ['cancelled', 'completed'] }
        },
        include: [{
          model: db.User,
          attributes: ['username']
        }, {
          model: db.Contest,
          attributes: ['type', 'player_board']
        }],
        order: [['entered_at', 'ASC']],
        limit: 5
      });

      // Fix null positions for tournament rooms
      let positionFixed = false;
      const usedPositions = new Set();
      
      entries.forEach(entry => {
        if (entry.draft_position !== null) {
          usedPositions.add(entry.draft_position);
        }
      });
      
      for (const entry of entries) {
        if (entry.draft_position === null) {
          let newPosition = 0;
          while (usedPositions.has(newPosition) && newPosition < 5) {
            newPosition++;
          }
          
          if (newPosition < 5) {
            await db.ContestEntry.update(
              { draft_position: newPosition },
              { where: { id: entry.id } }
            );
            entry.draft_position = newPosition;
            usedPositions.add(newPosition);
            positionFixed = true;
            console.log(`Fixed null position for ${entry.User?.username}, assigned position ${newPosition}`);
          }
        }
      }
      
      if (positionFixed) {
        entries = await db.ContestEntry.findAll({
          where: {
            draft_room_id: roomId,
            status: { [Op.notIn]: ['cancelled', 'completed'] }
          },
          include: [{
            model: db.User,
            attributes: ['username']
          }, {
            model: db.Contest,
            attributes: ['type', 'player_board']
          }],
          order: [['draft_position', 'ASC'], ['entered_at', 'ASC']],
          limit: 5
        });
      }

      console.log(`Active entries: ${entries.length}`);

      if (entries.length > 0) {
        const contest = entries[0].Contest;
        let playerBoard;
        
        // Get board based on contest type
        if (contest && contest.type === 'market') {
          // Market Mover: Get unique board from Redis with FIRE SALE modifiers
          const boardKey = `board:${roomId}`;
          const boardData = await this.redis.get(boardKey);
          
          if (boardData) {
            playerBoard = JSON.parse(boardData);
          } else {
            // Generate board with Fire Sale/Cool Down modifiers built in
            const marketMoverService = require('./marketMoverService');
            const mmStatus = await marketMoverService.getVotingStatus();
            playerBoard = generatePlayerBoard('market', mmStatus.fireSaleList || [], mmStatus.coolDownList || []);
            
            await this.redis.set(boardKey, JSON.stringify(playerBoard), 'EX', 86400);
            console.log(`Generated new Market Mover board for room ${roomId} with FIRE SALE modifiers`);
          }
        } else if (contest) {
          // Daily Bash & Firesale: Use the contest's preset board
          playerBoard = contest.player_board;
        }
        
        const result = {
          id: roomId,
          roomId: roomId,
          contestId: entries[0].contest_id,
          contestType: contest?.type,
          entries: entries.map((e, index) => ({
            id: e.id,
            userId: e.user_id,
            username: e.User?.username || 'Unknown',
            contestId: e.contest_id,
            draftRoomId: e.draft_room_id,
            draftPosition: e.draft_position !== null ? e.draft_position : index,
            status: e.status,
            enteredAt: e.entered_at
          })),
          currentPlayers: entries.length,
          maxPlayers: 5,
          status: entries.length === 5 ? 'ready' : 'waiting',
          playerBoard: playerBoard,
          players: entries.map(e => ({
            username: e.User?.username || 'Unknown',
            userId: e.user_id,
            position: e.draft_position
          }))
        };
        
        console.log(`Returning room status: ${result.currentPlayers}/5 players, status: ${result.status}`);
        return result;
      }

      // Empty room - try to get contest info
      console.log(`No entries found for room ${roomId}`);
      
      if (roomId.includes('_room_')) {
        const contestId = roomId.split('_room_')[0];
        const contest = await db.Contest.findByPk(contestId);
        if (contest) {
          console.log(`Found contest ${contest.name} for empty room`);
          let playerBoard;
          
          if (contest.type === 'market') {
            const boardKey = `board:${roomId}`;
            const boardData = await this.redis.get(boardKey);
            
            if (boardData) {
              playerBoard = JSON.parse(boardData);
            } else {
              // Generate board with Fire Sale/Cool Down modifiers built in
              const marketMoverService = require('./marketMoverService');
              const mmStatus = await marketMoverService.getVotingStatus();
              playerBoard = generatePlayerBoard('market', mmStatus.fireSaleList || [], mmStatus.coolDownList || []);
              
              await this.redis.set(boardKey, JSON.stringify(playerBoard), 'EX', 86400);
            }
          } else {
            playerBoard = contest.player_board;
          }
          
          return {
            id: roomId,
            roomId: roomId,
            contestId: contestId,
            contestType: contest.type,
            entries: [],
            currentPlayers: 0,
            maxPlayers: 5,
            status: 'waiting',
            playerBoard: playerBoard,
            players: []
          };
        }
      }

      console.log(`Room ${roomId} not found`);
      return null;
    } catch (error) {
      console.error('Error getting room status:', error);
      return null;
    }
  }

  async completeDraft(entryId, roster, totalSpent) {
    const transaction = await db.sequelize.transaction();

    try {
      const entry = await db.ContestEntry.findByPk(entryId, {
        include: [db.Contest],
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!entry) {
        throw new Error('Entry not found');
      }

      const lineup = [];
      Object.entries(roster).forEach(([slot, player]) => {
        if (player) {
          lineup.push({
            player,
            rosterSlot: slot
          });
        }
      });

      await entry.update({
        status: 'completed',
        roster,
        lineup,
        total_spent: totalSpent,
        completed_at: new Date()
      }, { transaction });

      const lineupRecord = await db.Lineup.create({
        user_id: entry.user_id,
        contest_entry_id: entryId,
        contest_id: entry.contest_id,
        contest_type: entry.Contest.type,
        roster: roster,
        status: 'drafted'
      }, { transaction });

      const user = await db.User.findByPk(entry.user_id, { 
        lock: transaction.LOCK.UPDATE,
        transaction 
      });
      
      if (user) {
        await user.increment('tickets', { by: 1, transaction });
        
        await db.TicketTransaction.create({
          user_id: entry.user_id,
          type: 'draft_completion',
          amount: 1,
          balance_after: user.tickets + 1,
          reason: `Completed draft for ${entry.Contest.name}`
        }, { transaction });
      }

      await transaction.commit();

      console.log(`✅ Entry ${entryId} completed with lineup ${lineupRecord.id}`);
      
      return { 
        entry, 
        lineup: lineupRecord 
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Error completing draft:', error);
      throw error;
    }
  }

  async checkAndLaunchDraft(roomId, contest) {
    try {
      console.log(`\n=== CHECKING DRAFT LAUNCH FOR ROOM ${roomId} ===`);
      
      const roomStatus = await this.getRoomStatus(roomId);
      if (!roomStatus) {
        console.log('❌ Room status not found');
        return;
      }

      console.log(`Room ${roomId}: ${roomStatus.currentPlayers}/5 players`);
      console.log(`Room status: ${roomStatus.status}`);

      if (roomStatus.currentPlayers === 5 && roomStatus.status === 'ready') {
        console.log(`✅ Room ${roomId} has exactly 5 players! Launching draft...`);
        
        setTimeout(async () => {
          await this.launchDraft(roomId, roomStatus, contest);
        }, 500);
      } else if (roomStatus.currentPlayers < 5) {
        console.log(`⏳ Room ${roomId} waiting for more players (${roomStatus.currentPlayers}/5)`);
      } else {
        console.log(`⚠️ Room ${roomId} in unexpected state - players: ${roomStatus.currentPlayers}`);
      }
    } catch (error) {
      console.error('Error checking draft launch:', error);
    }
  }

  async launchDraft(roomId, roomStatus, contest) {
    try {
      console.log(`\n🚀 LAUNCHING DRAFT for room ${roomId}`);
      console.log(`Contest type: ${roomStatus.contestType}, Players: ${roomStatus.entries.length}`);
      
      if (this.activeDrafts.has(roomId)) {
        console.log(`Draft already active for room ${roomId}`);
        return;
      }

      if (!this.io) {
        console.error('❌ Socket.IO not available, cannot launch draft');
        return;
      }

      const socketRoomId = `room_${roomId}`;
      const socketsInRoom = await this.io.in(socketRoomId).fetchSockets();
      console.log(`📡 Sockets currently in ${socketRoomId}: ${socketsInRoom.length}`);

      // Generate fresh player board if empty or invalid
      const { generatePlayerBoard } = require('../utils/gameLogic');
      let playerBoard = roomStatus.playerBoard;
      if (!playerBoard || !Array.isArray(playerBoard) || playerBoard.length === 0) {
        console.log('📋 Generating fresh player board for draft');
        playerBoard = generatePlayerBoard('nfl');
      }

      const draftState = await draftService.startDraft(
        roomId,
        roomStatus.entries,
        playerBoard
      );

      this.activeDrafts.set(roomId, {
        roomId,
        contestId: roomStatus.contestId,
        contestType: roomStatus.contestType,
        startTime: new Date(),
        participants: roomStatus.entries,
        currentTurn: 0,
        picks: []
      });

      await db.ContestEntry.update(
        { status: 'drafting' },
        {
          where: {
            draft_room_id: roomId,
            status: 'pending'
          }
        }
      );

      console.log(`📢 Emitting draft-countdown to ${socketRoomId}`);
      
      this.io.to(socketRoomId).emit('draft-countdown', {
        roomId,
        contestId: roomStatus.contestId,
        contestType: roomStatus.contestType,
        seconds: 5,
        message: 'Draft starting in 5 seconds!'
      });

      setTimeout(() => {
        console.log(`📢 Emitting draft-starting to ${socketRoomId}`);
        
        const draftStartData = {
          roomId: roomId,
          contestId: roomStatus.contestId,
          contestType: roomStatus.contestType,
          playerBoard: roomStatus.playerBoard,
          participants: roomStatus.entries.map((e, index) => ({
            entryId: e.id,
            userId: e.userId,
            username: e.username,
            draftPosition: e.draftPosition !== null ? e.draftPosition : index
          })),
          teams: draftState.teams,
          draftOrder: draftState.draftOrder,
          currentTurn: 0,
          status: 'active'
        };
        
        this.io.to(socketRoomId).emit('draft-starting', draftStartData);
        this.io.to(socketRoomId).emit('draft-state', draftState);
        
        console.log(`✅ Emitted draft-starting with complete data`);

 // Countdown before first pick - gives frontend time to load
        let countdown = 5;
        this.io.to(socketRoomId).emit('draft-countdown', {
          roomId,
          seconds: countdown,
          message: `First pick in ${countdown}...`
        });
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            this.io.to(socketRoomId).emit('draft-countdown', {
              roomId,
              seconds: countdown,
              message: `First pick in ${countdown}...`
            });
          } else {
            clearInterval(countdownInterval);
            console.log(`🎲 Starting first pick for room ${roomId}`);
            this.startNextPick(roomId);
          }
        }, 1000);
      }, 5000);

      console.log(`✅ Draft launch sequence initiated for room ${roomId}`);
      
    } catch (error) {
      console.error('❌ Error launching draft:', error);
      this.activeDrafts.delete(roomId);
      throw error;
    }
  }

  // FIXED: startNextPick with proper timer error handling and cleanup
  async startNextPick(roomId) {
    let draft = this.activeDrafts.get(roomId);
    
    // If draft not in memory, reconstruct from database
    if (!draft) {
      console.log(`⚠️ startNextPick: Draft ${roomId} not in activeDrafts, reconstructing...`);
      const entry = await db.ContestEntry.findOne({
        where: { draft_room_id: roomId, status: 'drafting' },
        include: [{ model: db.Contest, attributes: ['id', 'type'] }]
      });
      if (!entry) {
        console.log(`❌ startNextPick: No drafting entries found for room ${roomId}`);
        return;
      }
      draft = {
        roomId,
        contestId: entry.contest_id,
        contestType: entry.Contest?.type
      };
      this.activeDrafts.set(roomId, draft);
      console.log(`✅ startNextPick: Reconstructed draft for room ${roomId}`);
    }

    const draftState = await draftService.getDraft(roomId);
    
    // If no draft state in Redis, the draft may have been lost - try to complete it
    if (!draftState) {
      console.log(`⚠️ startNextPick: No draft state in Redis for ${roomId}, checking if draft should complete...`);
      
      // Check if there are drafting entries - if so, complete the draft
      const draftingEntries = await db.ContestEntry.count({
        where: { draft_room_id: roomId, status: 'drafting' }
      });
      
      if (draftingEntries > 0) {
        console.log(`🔄 Found ${draftingEntries} drafting entries, forcing draft completion...`);
        await this.completeDraftForRoom(roomId);
      }
      return;
    }

    const totalPicks = draftState.teams.length * 5;
    
    if (draftState.currentTurn >= totalPicks) {
      await this.completeDraftForRoom(roomId);
      return;
    }

    const currentPlayerIndex = draftState.draftOrder[draftState.currentTurn];
    const currentPlayer = draftState.teams[currentPlayerIndex];
    
    // Validate currentPlayer exists
    if (!currentPlayer || !currentPlayer.userId) {
      console.error(`❌ startNextPick: Invalid currentPlayer at index ${currentPlayerIndex}`);
      console.log(`  draftOrder: ${JSON.stringify(draftState.draftOrder)}`);
      console.log(`  currentTurn: ${draftState.currentTurn}`);
      console.log(`  teams: ${draftState.teams.map(t => t?.username || 'undefined').join(', ')}`);
      // Try to skip to next turn or complete
      await this.completeDraftForRoom(roomId);
      return;
    }

    // Calculate remaining budget for current player
    let remainingBudget = 15; // Max salary
    if (currentPlayer.roster) {
      const spent = Object.values(currentPlayer.roster)
        .filter(p => p && p.price)
        .reduce((sum, p) => sum + (p.price || 0), 0);
      remainingBudget = 15 - spent;
    }
    
    // Use 3-second timer if player has $0 budget, otherwise 30 seconds
    const timeLimit = remainingBudget <= 0 ? 3 : 30;
    
    if (remainingBudget <= 0) {
      console.log(`💸 ${currentPlayer.username} has $0 budget - using ${timeLimit}s quick timer`);
    }

    // Store turn start timestamp in Redis for stall detection
    const turnKey = `turn:${roomId}`;
    await this.redis.set(turnKey, JSON.stringify({
      turnStartedAt: Date.now(),
      currentTurn: draftState.currentTurn,
      currentUserId: currentPlayer.userId,
      timeLimit: timeLimit
    }), 'EX', 3600); // 1 hour expiry

    if (this.io) {
      this.io.to(`room_${roomId}`).emit('draft-turn', {
        roomId,
        currentPick: draftState.currentTurn + 1,
        totalPicks,
        currentPlayer: {
          userId: currentPlayer.userId,
          username: currentPlayer.username,
          position: currentPlayerIndex
        },
        timeLimit: timeLimit,
        teams: draftState.teams,
        playerBoard: draftState.playerBoard,
        picks: draftState.picks,
        draftOrder: draftState.draftOrder,
        currentTurn: draftState.currentTurn
      });
      
      this.io.to(`room_${roomId}`).emit('draft-state', draftState);
    }

    // Clear any existing timer for this room/user combo AND delete the entry
    const existingTimerKey = `${roomId}_${currentPlayer.userId}`;
    if (this.draftTimers.has(existingTimerKey)) {
      clearTimeout(this.draftTimers.get(existingTimerKey));
      this.draftTimers.delete(existingTimerKey);
    }

    // Capture values for closure to avoid any reference issues
    const capturedRoomId = roomId;
    const capturedUserId = currentPlayer.userId;
    const capturedUsername = currentPlayer.username;
    const capturedTimerKey = existingTimerKey;

    const timerId = setTimeout(async () => {
      console.log(`⏰ Timer FIRED for ${capturedUsername} in room ${capturedRoomId}`);
      
      // Remove timer entry immediately since it's firing
      this.draftTimers.delete(capturedTimerKey);
      
      try {
        await this.handleAutoPick(capturedRoomId, capturedUserId);
      } catch (error) {
        console.error(`❌ Timer callback error for ${capturedRoomId}:`, error);
        // Still try to advance the draft even if autopick failed
        try {
          await this.startNextPick(capturedRoomId);
        } catch (advanceError) {
          console.error(`❌ Failed to advance draft after timer error:`, advanceError);
          // Last resort - try to complete the draft
          try {
            await this.completeDraftForRoom(capturedRoomId);
          } catch (completeError) {
            console.error(`❌ Failed to complete draft:`, completeError);
          }
        }
      }
    }, timeLimit * 1000);

    this.draftTimers.set(existingTimerKey, timerId);
    console.log(`⏱️ Started ${timeLimit}s timer for ${currentPlayer.username} in room ${roomId} (budget: $${remainingBudget})`);
  }

  // UPDATED: Check if a draft is stalled and restart timer if needed
  async checkAndRestartStalledDraft(roomId) {
    try {
      const draftState = await draftService.getDraft(roomId);
      if (!draftState || draftState.status === 'completed') {
        return { stalled: false, reason: 'no_active_draft' };
      }

      const totalPicks = draftState.teams.length * 5;
      if (draftState.currentTurn >= totalPicks) {
        // Draft should be completed - do it now
        console.log(`🔄 Draft ${roomId} should be completed, finalizing...`);
        await this.completeDraftForRoom(roomId);
        return { stalled: false, reason: 'completed' };
      }

      // Check if there's an active timer
      const currentPlayerIndex = draftState.draftOrder[draftState.currentTurn];
      const currentPlayer = draftState.teams[currentPlayerIndex];
      
      if (!currentPlayer || !currentPlayer.userId) {
        console.log(`⚠️ Invalid currentPlayer in checkAndRestartStalledDraft for ${roomId}`);
        await this.completeDraftForRoom(roomId);
        return { stalled: true, action: 'completed_invalid_player' };
      }
      
      const timerKey = `${roomId}_${currentPlayer.userId}`;
      
      if (this.draftTimers.has(timerKey)) {
        return { stalled: false, reason: 'timer_active' };
      }

      // No active timer - check how long the turn has been going
      const turnKey = `turn:${roomId}`;
      const turnData = await this.redis.get(turnKey);
      
      if (turnData) {
        const { turnStartedAt, currentTurn, timeLimit: storedTimeLimit } = JSON.parse(turnData);
        const elapsed = Date.now() - turnStartedAt;
        
        // Use stored timeLimit if available, otherwise calculate it
        let timeLimit = storedTimeLimit || 30;
        if (!storedTimeLimit && currentPlayer.roster) {
          const spent = Object.values(currentPlayer.roster)
            .filter(p => p && p.price)
            .reduce((sum, p) => sum + (p.price || 0), 0);
          const remainingBudget = 15 - spent;
          timeLimit = remainingBudget <= 0 ? 3 : 30;
        }
        
        const timeLimitMs = timeLimit * 1000;
        
        // If same turn and more than timeLimit elapsed, auto-pick immediately
        if (currentTurn === draftState.currentTurn && elapsed > timeLimitMs) {
          console.log(`⚠️ Draft ${roomId} stalled for ${Math.round(elapsed/1000)}s (limit: ${timeLimit}s) - auto-picking now`);
          
          // Ensure draft is in activeDrafts
          if (!this.activeDrafts.has(roomId)) {
            const entry = await db.ContestEntry.findOne({
              where: { draft_room_id: roomId, status: 'drafting' }
            });
            if (entry) {
              this.activeDrafts.set(roomId, {
                roomId,
                contestId: entry.contest_id,
                startTime: new Date(turnStartedAt),
                participants: draftState.teams
              });
            }
          }
          
          // Trigger auto-pick
          await this.handleAutoPick(roomId, currentPlayer.userId);
          return { stalled: true, action: 'auto_picked' };
        }
        
        // Turn started but less than timeLimit - restart timer for remaining time
        if (currentTurn === draftState.currentTurn) {
          const remaining = Math.max(1000, timeLimitMs - elapsed);
          console.log(`🔄 Restarting timer for ${roomId} with ${Math.round(remaining/1000)}s remaining (limit: ${timeLimit}s)`);
          
          // Ensure draft is in activeDrafts
          if (!this.activeDrafts.has(roomId)) {
            const entry = await db.ContestEntry.findOne({
              where: { draft_room_id: roomId, status: 'drafting' }
            });
            if (entry) {
              this.activeDrafts.set(roomId, {
                roomId,
                contestId: entry.contest_id,
                startTime: new Date(turnStartedAt),
                participants: draftState.teams
              });
            }
          }
          
          // Capture values for closure
          const capturedRoomId = roomId;
          const capturedUserId = currentPlayer.userId;
          const capturedTimerKey = timerKey;
          
          const timerId = setTimeout(async () => {
            console.log(`⏰ Restarted timer FIRED for ${currentPlayer.username} in room ${capturedRoomId}`);
            this.draftTimers.delete(capturedTimerKey);
            try {
              await this.handleAutoPick(capturedRoomId, capturedUserId);
            } catch (error) {
              console.error(`❌ Restarted timer callback error:`, error);
              await this.startNextPick(capturedRoomId);
            }
          }, remaining);
          
          this.draftTimers.set(timerKey, timerId);
          return { stalled: true, action: 'timer_restarted', remaining };
        }
      }
      
      // No turn data - start fresh turn
      console.log(`🔄 No turn data for ${roomId} - starting fresh pick`);
      
      // Ensure draft is in activeDrafts
      if (!this.activeDrafts.has(roomId)) {
        const entry = await db.ContestEntry.findOne({
          where: { draft_room_id: roomId, status: 'drafting' }
        });
        if (entry) {
          this.activeDrafts.set(roomId, {
            roomId,
            contestId: entry.contest_id,
            startTime: new Date(),
            participants: draftState.teams
          });
        }
      }
      
      await this.startNextPick(roomId);
      return { stalled: true, action: 'restarted' };
      
    } catch (error) {
      console.error(`Error checking stalled draft ${roomId}:`, error);
      return { stalled: false, error: error.message };
    }
  }

  // Background checker for all stalled drafts - runs every 15 seconds
  async checkAllStalledDrafts() {
    try {
      // Find all entries with 'drafting' status
      const draftingEntries = await db.ContestEntry.findAll({
        where: { status: 'drafting' },
        attributes: ['draft_room_id', 'created_at'],
        group: ['draft_room_id', 'created_at'],
        raw: true
      });
      
      if (draftingEntries.length === 0) return;
      
      const uniqueRooms = [...new Set(draftingEntries.map(e => e.draft_room_id))];
      console.log(`🔍 checkAllStalledDrafts: Found ${uniqueRooms.length} rooms with drafting entries`);
      
      for (const roomId of uniqueRooms) {
        // Check if this room has an active timer
        let hasActiveTimer = false;
        for (const [key] of this.draftTimers) {
          if (key.startsWith(`${roomId}_`)) {
            hasActiveTimer = true;
            break;
          }
        }
        
        if (!hasActiveTimer) {
          console.log(`🔍 Checking potentially stalled draft: ${roomId}`);
          
          // Check if draft state exists in Redis
          const draftState = await draftService.getDraft(roomId);
          
          if (!draftState) {
            // No Redis state - force complete the draft
            console.log(`⚠️ No Redis state for ${roomId} - forcing completion`);
            await this.completeDraftForRoom(roomId);
          } else {
            // Has Redis state - use normal stall check
            await this.checkAndRestartStalledDraft(roomId);
          }
        }
      }
    } catch (error) {
      console.error('Error in checkAllStalledDrafts:', error);
    }
  }

  async handlePlayerPick(roomId, userId, playerData, positionData) {
    const draft = this.activeDrafts.get(roomId);
    if (!draft) {
      throw new Error('Draft not found');
    }

    const rosterSlot = typeof positionData === 'string' ? positionData : positionData?.slot;
    const row = positionData?.row;
    const col = positionData?.col;

    console.log(`Processing pick: Room ${roomId}, User ${userId}, Slot ${rosterSlot}, Row ${row}, Col ${col}`);

    // Clear AND delete timer for this user
    const timerKey = `${roomId}_${userId}`;
    const timerId = this.draftTimers.get(timerKey);
    if (timerId) {
      clearTimeout(timerId);
      this.draftTimers.delete(timerKey);
    }

    const updatedDraft = await draftService.makePick(roomId, userId, {
      player: playerData,
      rosterSlot: rosterSlot,
      row: row !== undefined ? row : playerData?.row,
      col: col !== undefined ? col : playerData?.col,
      contestType: draft.contestType
    });

    if (updatedDraft.playerBoard && row !== undefined && col !== undefined) {
      if (updatedDraft.playerBoard[row] && updatedDraft.playerBoard[row][col]) {
        updatedDraft.playerBoard[row][col].drafted = true;
        updatedDraft.playerBoard[row][col].draftedBy = userId;
        
        const boardKey = `board:${roomId}`;
        await this.redis.set(boardKey, JSON.stringify(updatedDraft.playerBoard), 'EX', 86400);
        
        console.log(`✅ Marked player at [${row}][${col}] as drafted`);
      }
    }

    const entry = await db.ContestEntry.findOne({
      where: {
        draft_room_id: roomId,
        user_id: userId,
        status: 'drafting'
      }
    });

    if (entry) {
      await this.saveDraftPick(entry.id, {
        player: playerData,
        rosterSlot: rosterSlot,
        pickNumber: updatedDraft.picks.length,
        isAutoPick: false
      });
    }

    if (this.io) {
      const socketRoom = `room_${roomId}`;
      
      this.io.to(socketRoom).emit('player-picked', {
        roomId,
        userId,
        player: playerData,
        position: rosterSlot,
        row: row,
        col: col,
        pickNumber: updatedDraft.picks.length,
        playerBoard: updatedDraft.playerBoard,
        teams: updatedDraft.teams,
        currentTurn: updatedDraft.currentTurn,
        currentPick: updatedDraft.currentTurn + 1,
        picks: updatedDraft.picks
      });
      
      this.io.to(socketRoom).emit('draft-state', {
        ...updatedDraft,
        playerBoard: updatedDraft.playerBoard
      });
      
      console.log(`📢 Broadcasted pick to ${socketRoom} with updated playerBoard`);
    }

    await this.startNextPick(roomId);
  }

  // FIXED: handleAutoPick with error handling to ensure draft completes
  async handleAutoPick(roomId, userId) {
    console.log(`Auto-picking for user ${userId} in room ${roomId}`);
    
    // Clear timer entry for this user (in case called directly, not from timer)
    const timerKey = `${roomId}_${userId}`;
    if (this.draftTimers.has(timerKey)) {
      clearTimeout(this.draftTimers.get(timerKey));
      this.draftTimers.delete(timerKey);
    }
    
    try {
      const updatedDraft = await draftService.autoPick(roomId, userId);
      
      if (updatedDraft && this.io) {
        const lastPick = updatedDraft.picks[updatedDraft.picks.length - 1];
        
        if (lastPick && !lastPick.skipped) {
          const socketRoom = `room_${roomId}`;
          
          // SAVE THE PICK TO DATABASE
          const entry = await db.ContestEntry.findOne({
            where: {
              draft_room_id: roomId,
              user_id: userId,
              status: 'drafting'
            }
          });

          if (entry) {
            await this.saveDraftPick(entry.id, {
              player: lastPick.player,
              rosterSlot: lastPick.rosterSlot,
              pickNumber: updatedDraft.picks.length,
              isAutoPick: true
            });
            console.log(`💾 Saved AUTO-PICK to database: ${lastPick.player?.name} for ${entry.id}`);
          }
          
          this.io.to(socketRoom).emit('player-picked', {
            roomId,
            userId,
            player: lastPick.player,
            position: lastPick.rosterSlot,
            row: lastPick.row,
            col: lastPick.col,
            pickNumber: updatedDraft.picks.length,
            playerBoard: updatedDraft.playerBoard,
            teams: updatedDraft.teams,
            currentTurn: updatedDraft.currentTurn,
            currentPick: updatedDraft.currentTurn + 1,
            picks: updatedDraft.picks,
            isAutoPick: true
          });
          
          this.io.to(socketRoom).emit('draft-state', {
            ...updatedDraft,
            playerBoard: updatedDraft.playerBoard
          });
          
          console.log(`📢 Broadcasted AUTO-PICK to ${socketRoom}: ${lastPick.player?.name}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error in handleAutoPick for room ${roomId}:`, error.message);
    }
    
    // ALWAYS try to continue or complete the draft, even if autopick failed
    try {
      await this.startNextPick(roomId);
    } catch (error) {
      console.error(`❌ Error in startNextPick after autopick for room ${roomId}:`, error.message);
      // Last resort: try to force complete the draft
      try {
        await this.completeDraftForRoom(roomId);
      } catch (completeError) {
        console.error(`❌ Failed to force complete draft ${roomId}:`, completeError.message);
      }
    }
  }

  // FIXED: completeDraftForRoom - reconstructs from DB if not in activeDrafts
  async completeDraftForRoom(roomId) {
    console.log(`\n🔔🔔🔔 completeDraftForRoom CALLED for room ${roomId} 🔔🔔🔔`);
    
    let draft = this.activeDrafts.get(roomId);
    
    // If draft not in memory, reconstruct from database
    if (!draft) {
      console.log(`⚠️ Draft ${roomId} not in activeDrafts, reconstructing from database...`);
      const entry = await db.ContestEntry.findOne({
        where: { draft_room_id: roomId, status: 'drafting' },
        include: [{ model: db.Contest, attributes: ['id', 'type'] }]
      });
      if (!entry) {
        console.log(`❌ No drafting entries found for room ${roomId}, cannot complete`);
        return;
      }
      draft = {
        roomId,
        contestId: entry.contest_id,
        contestType: entry.Contest?.type
      };
      // Add to activeDrafts so cleanup works
      this.activeDrafts.set(roomId, draft);
    }

    console.log(`\n============================================================`);
    console.log(`COMPLETING DRAFT FOR ROOM ${roomId}`);
    console.log(`============================================================`);

    // Get the final draft state with rosters
    const draftState = await draftService.getDraft(roomId);

    // Get all entries that were drafting in this room
    const entries = await db.ContestEntry.findAll({
      where: {
        draft_room_id: roomId,
        status: 'drafting'
      },
      include: [{
        model: db.User,
        attributes: ['id', 'username', 'tickets']
      }, {
        model: db.Contest,
        attributes: ['id', 'name', 'type']
      }]
    });

    console.log(`Found ${entries.length} entries to complete`);

    // Build roster map from draft state
    const rosterMap = new Map();
    if (draftState && draftState.teams) {
      for (const team of draftState.teams) {
        if (team.userId && team.roster) {
          rosterMap.set(team.userId, team.roster);
        }
      }
    }
    console.log(`Built roster map for ${rosterMap.size} users`);

    // Save lineups for ALL entries
    console.log(`\n============================================================`);
    console.log(`SAVING LINEUPS TO DATABASE`);
    console.log(`============================================================`);

    let successCount = 0;
    let failCount = 0;

    for (const entry of entries) {
      try {
        const userId = entry.user_id;
        const roster = rosterMap.get(userId) || {};
        
        // Clean the roster
        const cleanRoster = {};
        let playerCount = 0;
        ['QB', 'RB', 'WR', 'TE', 'FLEX'].forEach(position => {
          if (roster[position] && roster[position].name) {
            cleanRoster[position] = {
              name: roster[position].name,
              team: roster[position].team,
              position: roster[position].position || position,
              price: roster[position].price || 0,
              value: roster[position].value || roster[position].price || 0,
              playerId: roster[position].playerId || `${position}-${userId}`
            };
            playerCount++;
          }
        });

        console.log(`\n💾 Saving ${entry.User?.username} (${userId}):`);
        console.log(`   Players: ${playerCount}`);
        console.log(`   Positions: ${Object.keys(cleanRoster).join(', ') || 'none'}`);

        // ALWAYS update entry status to completed, even with empty roster
        await entry.update({
          status: 'completed',
          completed_at: new Date(),
          roster: cleanRoster
        });

        if (playerCount === 0) {
          console.log(`   ⚠️ No players in roster - entry marked completed but no lineup created`);
          // Still count as success since entry was updated
          successCount++;
          continue;
        }

        // Check for existing lineup
        const existingLineup = await db.Lineup.findOne({
          where: { contest_entry_id: entry.id }
        });

        if (existingLineup) {
          console.log(`   ⚠️ Updating existing lineup ${existingLineup.id}`);
          await existingLineup.update({
            roster: cleanRoster,
            status: 'drafted',
            updated_at: new Date()
          });
        } else {
          console.log(`   Creating new lineup...`);
          const { v4: uuidv4 } = require('uuid');
          
          const lineup = await db.Lineup.create({
            id: uuidv4(),
            user_id: userId,
            contest_entry_id: entry.id,
            contest_id: entry.contest_id,
            contest_type: entry.Contest?.type || 'cash',
            roster: cleanRoster,
            status: 'drafted',
            week: 1,
            created_at: new Date(),
            updated_at: new Date()
          });
          
          console.log(`   ✅ CREATED lineup ${lineup.id} with ${playerCount} players`);
        }

        successCount++;

      } catch (error) {
        failCount++;
        console.error(`\n❌ ERROR saving ${entry.User?.username}:`, error.message);
      }
    }

    console.log(`\n============================================================`);
    console.log(`LINEUP SAVE RESULTS: ${successCount} succeeded, ${failCount} failed`);
    console.log(`============================================================`);

    // Award tickets to each user
    console.log(`\n============================================================`);
    console.log(`AWARDING DRAFT COMPLETION TICKETS`);
    console.log(`============================================================`);

    const ticketService = require('./ticketService');

    for (const entry of entries) {
      if (entry.User) {
        try {
          const result = await ticketService.awardDraftCompletion(
            entry.User.id, 
            entry.id
          );
          
          if (result.success) {
            console.log(`🎟️ Awarded 1 ticket to ${entry.User.username}. New balance: ${result.newBalance}`);
            
            // Emit ticket update to user
            if (this.io) {
              this.io.emit('tickets-updated', {
                userId: entry.User.id,
                tickets: result.newBalance,
                reason: 'draft_completion'
              });
            }
          } else {
            console.log(`⚠️ Ticket already awarded to ${entry.User.username} for this contest`);
          }
        } catch (error) {
          console.error(`❌ Error awarding ticket to ${entry.User.username}:`, error.message);
        }
      }
    }

    // Complete the draft in draft service
    await draftService.completeDraft(roomId);

    // Emit draft complete event
    if (this.io) {
      this.io.to(`room_${roomId}`).emit('draft-complete', {
        roomId,
        contestId: draft.contestId,
        message: 'Draft completed! Good luck!'
      });
    }

    // Cleanup
    this.activeDrafts.delete(roomId);
    
    // Clear ALL timers for this room
    for (const [key, timerId] of this.draftTimers) {
      if (key.startsWith(`${roomId}_`)) {
        clearTimeout(timerId);
        this.draftTimers.delete(key);
      }
    }

    // Sync entry count to fix any race condition discrepancies
    if (draft.contestId) {
      const actualCount = await db.ContestEntry.count({
        where: { 
          contest_id: draft.contestId,
          status: { [db.Sequelize.Op.notIn]: ['cancelled'] }
        }
      });
      await db.Contest.update(
        { current_entries: actualCount },
        { where: { id: draft.contestId } }
      );
      console.log(`📊 Synced entry count for contest ${draft.contestId}: ${actualCount}`);
    }

    console.log(`✅ Draft completed for room ${roomId}`);
    console.log(`============================================================\n`);
  }

  async saveDraftPick(entryId, pickData) {
    const transaction = await db.sequelize.transaction();

    try {
      const entry = await db.ContestEntry.findByPk(entryId, { 
        lock: transaction.LOCK.UPDATE,
        transaction 
      });
      
      if (!entry) {
        throw new Error('Entry not found');
      }

      if (entry.status === 'pending') {
        await entry.update({ status: 'drafting' }, { transaction });
      }

      if (!pickData.rosterSlot) {
        throw new Error('roster_slot is required for draft pick');
      }

      await db.DraftPick.create({
        entry_id: entryId,
        contest_id: entry.contest_id,
        user_id: entry.user_id,
        pick_number: pickData.pickNumber || 0,
        player_data: pickData.player,
        roster_slot: pickData.rosterSlot,
        is_auto_pick: pickData.isAutoPick || false
      }, { transaction });

      const lineup = entry.lineup || [];
      lineup.push({
        player: pickData.player,
        rosterSlot: pickData.rosterSlot
      });

      await entry.update({ lineup }, { transaction });
      await transaction.commit();

      console.log(`✅ Saved pick for entry ${entryId}: ${pickData.player.name} to ${pickData.rosterSlot}`);
      return true;

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error saving draft pick:', error);
      throw error;
    }
  }

  async getContestEntry(entryId) {
    try {
      const entry = await db.ContestEntry.findByPk(entryId, {
        include: [{
          model: db.Contest,
          attributes: ['name', 'type', 'entry_fee', 'prize_pool', 'player_board']
        }]
      });

      if (!entry) return null;

      return {
        id: entry.id,
        userId: entry.user_id,
        contestId: entry.contest_id,
        contest: entry.Contest,
        draftRoomId: entry.draft_room_id,
        status: entry.status,
        roster: entry.roster,
        lineup: entry.lineup,
        totalSpent: entry.total_spent
      };
    } catch (error) {
      console.error('Error getting contest entry:', error);
      return null;
    }
  }

  async getUserContestHistory(userId, limit = 50) {
    try {
      const entries = await db.ContestEntry.findAll({
        where: {
          user_id: userId,
          status: 'completed'
        },
        include: [{
          model: db.Contest,
          attributes: ['name', 'type', 'entry_fee', 'prize_pool', 'status']
        }],
        order: [['completed_at', 'DESC']],
        limit
      });

      return entries.map(entry => ({
        id: entry.id,
        contestName: entry.Contest?.name,
        contestType: entry.Contest?.type,
        contestStatus: entry.Contest?.status,
        entryFee: entry.Contest ? parseFloat(entry.Contest.entry_fee) : 0,
        prizePool: entry.Contest ? parseFloat(entry.Contest.prize_pool) : 0,
        totalPoints: parseFloat(entry.total_points || 0),
        finalRank: entry.final_rank,
        prizeWon: parseFloat(entry.prize_won || 0),
        completedAt: entry.completed_at,
        roster: entry.roster
      }));
    } catch (error) {
      console.error('Error getting user contest history:', error);
      return [];
    }
  }

  async calculateOwnership(contestId, playerName) {
    try {
      const contest = await db.Contest.findByPk(contestId);
      if (!contest || contest.type !== 'market') {
        throw new Error('Ownership queries only available for Market Mover contests');
      }

      const completedEntries = await db.ContestEntry.findAll({
        where: {
          contest_id: contestId,
          status: 'completed'
        },
        attributes: ['lineup']
      });

      if (completedEntries.length === 0) {
        return 0;
      }

      const entriesWithPlayer = completedEntries.filter(entry => 
        entry.lineup && entry.lineup.some(pick => pick.player.name === playerName)
      );

      const ownership = (entriesWithPlayer.length / completedEntries.length) * 100;
      return Math.round(ownership * 10) / 10;
    } catch (error) {
      console.error('Error calculating ownership:', error);
      throw error;
    }
  }

  // Get timer info for a room (used by socket handlers to include timeRemaining)
  async getTimerInfo(roomId) {
    try {
      const turnKey = `turn:${roomId}`;
      const turnData = await this.redis.get(turnKey);
      
      if (!turnData) {
        console.log(`⏱️ No timer info found for room ${roomId}`);
        return null;
      }
      
      const { turnStartedAt, currentTurn, currentUserId, timeLimit } = JSON.parse(turnData);
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
      const timeRemaining = Math.max(0, (timeLimit || 30) - elapsed);
      
      console.log(`⏱️ Timer info for ${roomId}: ${timeRemaining}s remaining (limit: ${timeLimit}s, elapsed: ${elapsed}s)`);
      
      return {
        timeRemaining,
        timeLimit: timeLimit || 30,
        turnStartedAt,
        currentTurn,
        currentUserId
      };
    } catch (error) {
      console.error('Error getting timer info:', error);
      return null;
    }
  }

  // Health check method
  async healthCheck() {
    try {
      const checks = {
        database: false,
        redis: false,
        socketio: false
      };

      try {
        await db.sequelize.query('SELECT 1');
        checks.database = true;
      } catch (error) {
        console.error('Database health check failed:', error);
      }

      try {
        await this.redis.ping();
        checks.redis = true;
      } catch (error) {
        console.error('Redis health check failed:', error);
      }

      checks.socketio = !!this.io;

      return checks;
    } catch (error) {
      console.error('Health check error:', error);
      return { error: error.message };
    }
  }

  // Cleanup method
  async cleanup() {
    try {
      if (this.eventCleanupInterval) {
        clearInterval(this.eventCleanupInterval);
      }
      if (this.stalledDraftInterval) {
        clearInterval(this.stalledDraftInterval);
      }
      // Clear all draft timers
      for (const [key, timerId] of this.draftTimers) {
        clearTimeout(timerId);
      }
      this.draftTimers.clear();
      
      await this.redis.quit();
      console.log('ContestService cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Create and export singleton instance
module.exports = new ContestService();