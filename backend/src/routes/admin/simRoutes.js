// backend/src/routes/admin/simRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// Players organized by position and salary
const PLAYERS = {
  QB: {
    5: [{ id: 'qb-1', name: 'Patrick Mahomes', team: 'KC' }, { id: 'qb-2', name: 'Josh Allen', team: 'BUF' }],
    4: [{ id: 'qb-3', name: 'Lamar Jackson', team: 'BAL' }, { id: 'qb-4', name: 'Jalen Hurts', team: 'PHI' }],
    3: [{ id: 'qb-5', name: 'Dak Prescott', team: 'DAL' }, { id: 'qb-6', name: 'Justin Herbert', team: 'LAC' }],
    2: [{ id: 'qb-7', name: 'Trevor Lawrence', team: 'JAX' }, { id: 'qb-8', name: 'Kirk Cousins', team: 'ATL' }],
    1: [{ id: 'qb-9', name: 'Geno Smith', team: 'SEA' }, { id: 'qb-10', name: 'Sam Darnold', team: 'MIN' }],
  },
  RB: {
    5: [{ id: 'rb-1', name: 'Christian McCaffrey', team: 'SF' }, { id: 'rb-2', name: 'Derrick Henry', team: 'BAL' }],
    4: [{ id: 'rb-3', name: 'Saquon Barkley', team: 'PHI' }, { id: 'rb-4', name: 'Bijan Robinson', team: 'ATL' }],
    3: [{ id: 'rb-5', name: 'Jonathan Taylor', team: 'IND' }, { id: 'rb-6', name: 'Kyren Williams', team: 'LAR' }],
    2: [{ id: 'rb-7', name: 'Josh Jacobs', team: 'GB' }, { id: 'rb-8', name: 'Alvin Kamara', team: 'NO' }],
    1: [{ id: 'rb-9', name: 'Raheem Mostert', team: 'MIA' }, { id: 'rb-10', name: 'Chuba Hubbard', team: 'CAR' }],
  },
  WR: {
    5: [{ id: 'wr-1', name: 'Tyreek Hill', team: 'MIA' }, { id: 'wr-2', name: 'CeeDee Lamb', team: 'DAL' }, { id: 'wr-3', name: 'Ja\'Marr Chase', team: 'CIN' }],
    4: [{ id: 'wr-4', name: 'Amon-Ra St. Brown', team: 'DET' }, { id: 'wr-5', name: 'Davante Adams', team: 'NYJ' }],
    3: [{ id: 'wr-6', name: 'Garrett Wilson', team: 'NYJ' }, { id: 'wr-7', name: 'DK Metcalf', team: 'SEA' }],
    2: [{ id: 'wr-8', name: 'Terry McLaurin', team: 'WAS' }, { id: 'wr-9', name: 'DeVonta Smith', team: 'PHI' }],
    1: [{ id: 'wr-10', name: 'Christian Kirk', team: 'JAX' }, { id: 'wr-11', name: 'Rashid Shaheed', team: 'NO' }],
  },
  TE: {
    5: [{ id: 'te-1', name: 'Travis Kelce', team: 'KC' }],
    4: [{ id: 'te-2', name: 'TJ Hockenson', team: 'MIN' }, { id: 'te-3', name: 'Sam LaPorta', team: 'DET' }],
    3: [{ id: 'te-4', name: 'George Kittle', team: 'SF' }, { id: 'te-5', name: 'Mark Andrews', team: 'BAL' }],
    2: [{ id: 'te-6', name: 'Dallas Goedert', team: 'PHI' }, { id: 'te-7', name: 'Evan Engram', team: 'JAX' }],
    1: [{ id: 'te-8', name: 'Jake Ferguson', team: 'DAL' }, { id: 'te-9', name: 'Cole Kmet', team: 'CHI' }],
  },
};

// Pre-defined valid $15 lineup templates (QB, RB, WR, TE, FLEX costs)
// Each template sums to exactly $15
const LINEUP_TEMPLATES = [
  { QB: 5, RB: 3, WR: 3, TE: 2, FLEX: 2 }, // 5+3+3+2+2 = 15
  { QB: 4, RB: 4, WR: 3, TE: 2, FLEX: 2 }, // 4+4+3+2+2 = 15
  { QB: 3, RB: 5, WR: 3, TE: 2, FLEX: 2 }, // 3+5+3+2+2 = 15
  { QB: 3, RB: 4, WR: 4, TE: 2, FLEX: 2 }, // 3+4+4+2+2 = 15
  { QB: 3, RB: 3, WR: 5, TE: 2, FLEX: 2 }, // 3+3+5+2+2 = 15
  { QB: 3, RB: 3, WR: 4, TE: 3, FLEX: 2 }, // 3+3+4+3+2 = 15
  { QB: 2, RB: 5, WR: 4, TE: 2, FLEX: 2 }, // 2+5+4+2+2 = 15
  { QB: 2, RB: 4, WR: 5, TE: 2, FLEX: 2 }, // 2+4+5+2+2 = 15
  { QB: 2, RB: 4, WR: 4, TE: 3, FLEX: 2 }, // 2+4+4+3+2 = 15
  { QB: 2, RB: 3, WR: 5, TE: 3, FLEX: 2 }, // 2+3+5+3+2 = 15
  { QB: 1, RB: 5, WR: 5, TE: 2, FLEX: 2 }, // 1+5+5+2+2 = 15
  { QB: 1, RB: 5, WR: 4, TE: 3, FLEX: 2 }, // 1+5+4+3+2 = 15
  { QB: 1, RB: 4, WR: 5, TE: 3, FLEX: 2 }, // 1+4+5+3+2 = 15
  { QB: 4, RB: 3, WR: 3, TE: 3, FLEX: 2 }, // 4+3+3+3+2 = 15
  { QB: 5, RB: 2, WR: 4, TE: 2, FLEX: 2 }, // 5+2+4+2+2 = 15
  { QB: 4, RB: 2, WR: 5, TE: 2, FLEX: 2 }, // 4+2+5+2+2 = 15
  { QB: 3, RB: 2, WR: 5, TE: 3, FLEX: 2 }, // 3+2+5+3+2 = 15
  { QB: 2, RB: 2, WR: 5, TE: 4, FLEX: 2 }, // 2+2+5+4+2 = 15
  { QB: 5, RB: 4, WR: 2, TE: 2, FLEX: 2 }, // 5+4+2+2+2 = 15
  { QB: 4, RB: 5, WR: 2, TE: 2, FLEX: 2 }, // 4+5+2+2+2 = 15
  // Higher FLEX values
  { QB: 3, RB: 3, WR: 3, TE: 3, FLEX: 3 }, // 3+3+3+3+3 = 15
  { QB: 2, RB: 3, WR: 4, TE: 3, FLEX: 3 }, // 2+3+4+3+3 = 15
  { QB: 3, RB: 2, WR: 4, TE: 3, FLEX: 3 }, // 3+2+4+3+3 = 15
  { QB: 2, RB: 4, WR: 3, TE: 3, FLEX: 3 }, // 2+4+3+3+3 = 15
  { QB: 4, RB: 2, WR: 3, TE: 3, FLEX: 3 }, // 4+2+3+3+3 = 15
  { QB: 1, RB: 4, WR: 4, TE: 3, FLEX: 3 }, // 1+4+4+3+3 = 15
  { QB: 1, RB: 3, WR: 5, TE: 3, FLEX: 3 }, // 1+3+5+3+3 = 15
  { QB: 2, RB: 2, WR: 4, TE: 4, FLEX: 3 }, // 2+2+4+4+3 = 15
  { QB: 1, RB: 3, WR: 4, TE: 4, FLEX: 3 }, // 1+3+4+4+3 = 15
  { QB: 2, RB: 3, WR: 3, TE: 4, FLEX: 3 }, // 2+3+3+4+3 = 15
];

// Generate a guaranteed $15 lineup
const generateValidLineup = () => {
  const usedIds = new Set();
  
  // Pick a random template
  const template = LINEUP_TEMPLATES[Math.floor(Math.random() * LINEUP_TEMPLATES.length)];
  
  const roster = {};
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
  
  for (const slot of slots) {
    const salary = template[slot];
    
    // FLEX can be RB, WR, or TE
    let position;
    if (slot === 'FLEX') {
      const flexPositions = ['RB', 'WR', 'TE'];
      position = flexPositions[Math.floor(Math.random() * flexPositions.length)];
    } else {
      position = slot;
    }
    
    // Get players at this position and salary
    const playersAtSalary = PLAYERS[position][salary] || [];
    const available = playersAtSalary.filter(p => !usedIds.has(p.id));
    
    if (available.length === 0) {
      // Fallback: find any player at this position not used
      for (let s = 5; s >= 1; s--) {
        const fallback = (PLAYERS[position][s] || []).filter(p => !usedIds.has(p.id));
        if (fallback.length > 0) {
          const player = fallback[Math.floor(Math.random() * fallback.length)];
          roster[slot] = {
            playerId: player.id,
            name: player.name,
            position: position,
            team: player.team,
            price: s
          };
          usedIds.add(player.id);
          break;
        }
      }
    } else {
      const player = available[Math.floor(Math.random() * available.length)];
      roster[slot] = {
        playerId: player.id,
        name: player.name,
        position: position,
        team: player.team,
        price: salary
      };
      usedIds.add(player.id);
    }
  }
  
  return roster;
};

// Helper to create a new cash game
const createNewCashGame = async () => {
  try {
    const existingCount = await db.Contest.count({ where: { type: 'cash' } });
    const now = new Date();
    
    const newContest = await db.Contest.create({
      id: uuidv4(),
      name: `Cash Game #${existingCount + 1}`,
      type: 'cash',
      status: 'open',
      sport: 'NFL',
      entry_fee: 5,
      prize_pool: 24,
      max_entries: 100,
      current_entries: 0,
      scoring_type: 'standard',
      player_board: {},
      start_time: now,  // Required field
      created_at: now,
      updated_at: now
    });
    console.log(`✅ Created new cash game: ${newContest.name}`);
    return newContest;
  } catch (error) {
    console.error('❌ Failed to create cash game:', error.message);
    return null;
  }
};

// GET /api/admin/sim/status
router.get('/status', async (req, res) => {
  try {
    const users = await db.User.findAll({
      where: { username: { [Op.notLike]: 'test_user_%' } },
      attributes: ['id', 'username', 'balance']
    });
    
    const cashGameUsers = users.filter(u => parseFloat(u.balance) >= 5);
    const mmUsers = users.filter(u => parseFloat(u.balance) >= 25);
    
    const cashGame = await db.Contest.findOne({
      where: { type: 'cash', status: 'open' }
    });
    
    const marketMover = await db.Contest.findOne({
      where: { type: 'market', status: 'open' }
    });
    
    const closedContests = await db.Contest.findAll({
      where: { status: 'closed' },
      attributes: ['id', 'name', 'type', 'current_entries']
    });
    
    res.json({
      success: true,
      users: {
        total: users.length,
        cashGameEligible: cashGameUsers.length,
        mmEligible: mmUsers.length,
        maxMMEntries: mmUsers.length * 150,
        userList: users.map(u => ({ 
          username: u.username, 
          balance: parseFloat(u.balance) 
        }))
      },
      contests: {
        cashGame: cashGame ? {
          id: cashGame.id,
          name: cashGame.name,
          entryFee: parseFloat(cashGame.entry_fee),
          currentEntries: cashGame.current_entries,
          maxEntries: cashGame.max_entries
        } : null,
        marketMover: marketMover ? {
          id: marketMover.id,
          name: marketMover.name,
          entryFee: parseFloat(marketMover.entry_fee),
          currentEntries: marketMover.current_entries,
          maxEntries: marketMover.max_entries
        } : null
      },
      readyToSettle: closedContests.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        entries: c.current_entries
      }))
    });
  } catch (error) {
    console.error('Sim status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/sim/cash-game
router.post('/cash-game', async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    console.log('\n========================================');
    console.log('💰 CASH GAME SIMULATION');
    console.log('========================================\n');
    
    const contest = await db.Contest.findOne({
      where: { type: 'cash', status: 'open' },
      transaction
    });
    
    if (!contest) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'No open cash game found' });
    }
    
    const entryFee = parseFloat(contest.entry_fee);
    console.log(`📋 Contest: ${contest.name}`);
    
    const users = await db.User.findAll({
      where: {
        username: { [Op.notLike]: 'test_user_%' },
        balance: { [Op.gte]: entryFee }
      },
      order: db.sequelize.random(),
      limit: 5,
      transaction
    });
    
    if (users.length < 5) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        error: `Need 5 users with $${entryFee}+ balance, found ${users.length}` 
      });
    }
    
    console.log(`👥 Users: ${users.map(u => u.username).join(', ')}`);
    
    const draftRoomId = uuidv4();
    const lineupResults = [];
    
    for (const user of users) {
      // Deduct balance
      await db.User.update(
        { balance: db.sequelize.literal(`balance - ${entryFee}`) },
        { where: { id: user.id }, transaction }
      );
      
      // Create entry
      const entry = await db.ContestEntry.create({
        id: uuidv4(),
        user_id: user.id,
        contest_id: contest.id,
        draft_room_id: draftRoomId,
        entry_number: 1,
        status: 'completed',
        completed_at: new Date()
      }, { transaction });
      
      // Generate valid $15 lineup
      const roster = generateValidLineup();
      const totalCost = Object.values(roster).reduce((sum, p) => sum + p.price, 0);
      
      await db.Lineup.create({
        id: uuidv4(),
        user_id: user.id,
        contest_entry_id: entry.id,
        contest_id: contest.id,
        contest_type: 'cash',
        roster: roster,
        status: 'completed'
      }, { transaction });
      
      lineupResults.push({ username: user.username, totalCost });
      console.log(`  ✅ ${user.username}: $${totalCost} lineup`);
    }
    
    // Close contest
    await db.Contest.update(
      { current_entries: 5, status: 'closed' },
      { where: { id: contest.id }, transaction }
    );
    
    await transaction.commit();
    
    // Create new cash game AFTER transaction commits
    console.log('\n📝 Creating new cash game...');
    await createNewCashGame();
    
    console.log('\n✅ Cash game simulation complete!\n');
    
    res.json({
      success: true,
      message: `Cash game completed with 5 entries`,
      entries: lineupResults,
      contest: { id: contest.id, name: contest.name, status: 'closed' }
    });
    
  } catch (error) {
    try { await transaction.rollback(); } catch (e) { /* already committed */ }
    console.error('Cash game sim error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/sim/market-mover
router.post('/market-mover', async (req, res) => {
  const { count = 100 } = req.body;
  const targetCount = Math.min(count, 5000);
  const MAX_ENTRIES_PER_USER = 150;
  
  try {
    console.log('\n========================================');
    console.log(`🚀 MARKET MOVER SIMULATION: ${targetCount} ENTRIES`);
    console.log('========================================\n');
    
    const contest = await db.Contest.findOne({
      where: { type: 'market', status: 'open' }
    });
    
    if (!contest) {
      return res.status(400).json({ success: false, error: 'No open Market Mover found' });
    }
    
    const entryFee = parseFloat(contest.entry_fee);
    console.log(`📋 Contest: ${contest.name}`);
    console.log(`💵 Entry fee: $${entryFee}`);
    console.log(`🔒 Max entries per user: ${MAX_ENTRIES_PER_USER}`);
    
    const users = await db.User.findAll({
      where: {
        username: { [Op.notLike]: 'test_user_%' },
        balance: { [Op.gte]: entryFee }
      }
    });
    
    if (users.length === 0) {
      return res.status(400).json({ success: false, error: 'No users with sufficient balance' });
    }
    
    console.log(`👥 Users: ${users.length}`);
    
    // Get existing entry counts for ALL users in this contest FIRST
    const existingEntryCounts = await db.ContestEntry.findAll({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['user_id', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      group: ['user_id'],
      raw: true
    });
    
    const entryCountMap = {};
    existingEntryCounts.forEach(e => {
      entryCountMap[e.user_id] = parseInt(e.count);
    });
    
    console.log('\n📊 Current entry counts:');
    Object.entries(entryCountMap).forEach(([userId, count]) => {
      const user = users.find(u => u.id === userId);
      if (user) console.log(`  ${user.username}: ${count}/${MAX_ENTRIES_PER_USER}`);
    });
    
    let totalCreated = 0;
    const userStats = [];
    
    console.log('\n📝 Creating entries and lineups...');
    
    for (const user of users) {
      if (totalCreated >= targetCount) break;
      
      // Get current entry count for this user (including just-created ones)
      const existingEntries = entryCountMap[user.id] || 0;
      const remainingAllowed = MAX_ENTRIES_PER_USER - existingEntries;
      
      if (remainingAllowed <= 0) {
        console.log(`  ⏭️ ${user.username}: already at ${MAX_ENTRIES_PER_USER} entry limit (has ${existingEntries})`);
        userStats.push({ username: user.username, created: 0, total: existingEntries, reason: 'at limit' });
        continue;
      }
      
      // Refresh balance in case it changed
      const freshUser = await db.User.findByPk(user.id);
      const currentBalance = parseFloat(freshUser.balance);
      const maxAffordable = Math.floor(currentBalance / entryFee);
      
      // Distribute entries evenly but respect all limits
      const baseEntriesPerUser = Math.ceil(targetCount / users.length);
      const entriesToCreate = Math.min(
        baseEntriesPerUser,
        maxAffordable,
        targetCount - totalCreated,
        remainingAllowed  // STRICT enforcement of 150 limit
      );
      
      if (entriesToCreate <= 0) {
        console.log(`  ⏭️ ${user.username}: can't create more (balance: $${currentBalance.toFixed(2)}, allowed: ${remainingAllowed})`);
        userStats.push({ username: user.username, created: 0, total: existingEntries, reason: 'insufficient funds' });
        continue;
      }
      
      const userTxn = await db.sequelize.transaction();
      
      try {
        const totalDeduction = entryFee * entriesToCreate;
        await db.User.update(
          { balance: db.sequelize.literal(`balance - ${totalDeduction}`) },
          { where: { id: user.id }, transaction: userTxn }
        );
        
        for (let i = 0; i < entriesToCreate; i++) {
          const draftRoomId = uuidv4();
          
          const entry = await db.ContestEntry.create({
            id: uuidv4(),
            user_id: user.id,
            contest_id: contest.id,
            draft_room_id: draftRoomId,
            entry_number: existingEntries + i + 1,  // Continue from existing count
            status: 'completed',
            completed_at: new Date()
          }, { transaction: userTxn });
          
          const roster = generateValidLineup();
          
          await db.Lineup.create({
            id: uuidv4(),
            user_id: user.id,
            contest_entry_id: entry.id,
            contest_id: contest.id,
            contest_type: 'market',
            roster: roster,
            status: 'completed'
          }, { transaction: userTxn });
        }
        
        await userTxn.commit();
        totalCreated += entriesToCreate;
        entryCountMap[user.id] = existingEntries + entriesToCreate;  // Update local count
        
        console.log(`  ✅ ${user.username}: +${entriesToCreate} lineups (now ${existingEntries + entriesToCreate}/${MAX_ENTRIES_PER_USER})`);
        userStats.push({ username: user.username, created: entriesToCreate, total: existingEntries + entriesToCreate });
        
      } catch (err) {
        await userTxn.rollback();
        console.error(`  ❌ ${user.username}: ${err.message}`);
        userStats.push({ username: user.username, created: 0, error: err.message });
      }
    }
    
    // Update contest entry count
    const actualTotalEntries = await db.ContestEntry.count({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } }
    });
    
    await db.Contest.update(
      { current_entries: actualTotalEntries },
      { where: { id: contest.id } }
    );
    
    console.log(`\n✅ Created ${totalCreated} new entries!`);
    console.log(`📊 Total entries in contest: ${actualTotalEntries}`);
    console.log('👉 Contest still OPEN - use /close-mm when ready to settle\n');
    
    res.json({
      success: true,
      message: `Market Mover simulation complete`,
      stats: { 
        requestedEntries: targetCount, 
        newEntries: totalCreated,
        totalEntries: actualTotalEntries,
        maxPerUser: MAX_ENTRIES_PER_USER
      },
      userStats: userStats,
      contest: { id: contest.id, name: contest.name, status: 'open' }
    });
    
  } catch (error) {
    console.error('MM sim error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/sim/close-mm
router.post('/close-mm', async (req, res) => {
  try {
    const contest = await db.Contest.findOne({ where: { type: 'market' } });
    
    if (!contest) {
      return res.status(404).json({ success: false, error: 'Market Mover not found' });
    }
    
    // Get accurate entry count
    const actualEntries = await db.ContestEntry.count({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } }
    });
    
    // Get user entry breakdown
    const userEntries = await db.ContestEntry.findAll({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['user_id', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      group: ['user_id'],
      raw: true
    });
    
    // Get usernames
    const userIds = userEntries.map(e => e.user_id);
    const users = await db.User.findAll({
      where: { id: userIds },
      attributes: ['id', 'username']
    });
    const userMap = {};
    users.forEach(u => userMap[u.id] = u.username);
    
    const breakdown = userEntries.map(e => ({
      username: userMap[e.user_id] || 'unknown',
      entries: parseInt(e.count)
    })).sort((a, b) => b.entries - a.entries);
    
    // Check for users over 150
    const overLimit = breakdown.filter(b => b.entries > 150);
    if (overLimit.length > 0) {
      console.log('⚠️ WARNING: Users over 150 entry limit:');
      overLimit.forEach(u => console.log(`  ${u.username}: ${u.entries} entries`));
    }
    
    await db.Contest.update(
      { status: 'closed', current_entries: actualEntries },
      { where: { id: contest.id } }
    );
    
    console.log(`\n✅ Market Mover CLOSED for settlement`);
    console.log(`📊 Total entries: ${actualEntries}`);
    console.log(`👥 Users: ${breakdown.length}`);
    
    res.json({
      success: true,
      message: 'Market Mover closed for settlement',
      contest: { 
        id: contest.id, 
        name: contest.name, 
        status: 'closed',
        totalEntries: actualEntries,
        uniqueUsers: breakdown.length
      },
      userBreakdown: breakdown,
      warnings: overLimit.length > 0 ? `${overLimit.length} users exceeded 150 entry limit` : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/sim/check-entries - Check entry counts per user
router.get('/check-entries', async (req, res) => {
  try {
    const contest = await db.Contest.findOne({ where: { type: 'market' } });
    
    if (!contest) {
      return res.status(404).json({ success: false, error: 'Market Mover not found' });
    }
    
    const userEntries = await db.ContestEntry.findAll({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['user_id', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      group: ['user_id'],
      raw: true
    });
    
    const userIds = userEntries.map(e => e.user_id);
    const users = await db.User.findAll({
      where: { id: userIds },
      attributes: ['id', 'username', 'balance']
    });
    const userMap = {};
    users.forEach(u => userMap[u.id] = u);
    
    const breakdown = userEntries.map(e => {
      const user = userMap[e.user_id];
      const count = parseInt(e.count);
      return {
        username: user ? user.username : 'unknown',
        entries: count,
        balance: user ? parseFloat(user.balance) : 0,
        overLimit: count > 150
      };
    }).sort((a, b) => b.entries - a.entries);
    
    const totalEntries = breakdown.reduce((sum, b) => sum + b.entries, 0);
    const overLimitUsers = breakdown.filter(b => b.overLimit);
    
    res.json({
      success: true,
      contest: { 
        id: contest.id, 
        name: contest.name, 
        status: contest.status,
        dbCurrentEntries: contest.current_entries,
        actualEntries: totalEntries
      },
      summary: {
        totalEntries,
        uniqueUsers: breakdown.length,
        usersOverLimit: overLimitUsers.length,
        maxEntries: Math.max(...breakdown.map(b => b.entries)),
        minEntries: Math.min(...breakdown.map(b => b.entries)),
        avgEntries: (totalEntries / breakdown.length).toFixed(1)
      },
      userBreakdown: breakdown
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/sim/add-balance
router.post('/add-balance', async (req, res) => {
  const { amount = 1000 } = req.body;
  
  try {
    const result = await db.User.update(
      { balance: db.sequelize.literal(`balance + ${amount}`) },
      { where: { username: { [Op.notLike]: 'test_user_%' } } }
    );
    
    res.json({
      success: true,
      message: `Added $${amount} to ${result[0]} users`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/sim/fix-entries - Remove excess entries over 150 limit
router.post('/fix-entries', async (req, res) => {
  try {
    const contest = await db.Contest.findOne({ where: { type: 'market' } });
    
    if (!contest) {
      return res.status(404).json({ success: false, error: 'Market Mover not found' });
    }
    
    // Find users with more than 150 entries
    const userEntries = await db.ContestEntry.findAll({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } },
      attributes: ['user_id', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      group: ['user_id'],
      having: db.sequelize.literal('COUNT(id) > 150'),
      raw: true
    });
    
    if (userEntries.length === 0) {
      return res.json({ success: true, message: 'No users over 150 entry limit', fixed: [] });
    }
    
    console.log(`\n🔧 Fixing ${userEntries.length} users over 150 entry limit...\n`);
    
    const fixed = [];
    
    for (const ue of userEntries) {
      const userId = ue.user_id;
      const currentCount = parseInt(ue.count);
      const excess = currentCount - 150;
      
      // Get the user's username
      const user = await db.User.findByPk(userId, { attributes: ['username'] });
      const username = user ? user.username : 'unknown';
      
      // Get excess entries (oldest ones to remove)
      const excessEntries = await db.ContestEntry.findAll({
        where: { user_id: userId, contest_id: contest.id, status: { [Op.ne]: 'cancelled' } },
        order: [['created_at', 'DESC']],  // Keep oldest, remove newest excess
        limit: excess
      });
      
      const entryIds = excessEntries.map(e => e.id);
      
      // Delete associated lineups first
      await db.Lineup.destroy({
        where: { contest_entry_id: entryIds }
      });
      
      // Then delete the entries
      await db.ContestEntry.destroy({
        where: { id: entryIds }
      });
      
      console.log(`  ✅ ${username}: removed ${excess} excess entries (was ${currentCount}, now 150)`);
      fixed.push({ username, removed: excess, was: currentCount, now: 150 });
    }
    
    // Update contest entry count
    const newTotal = await db.ContestEntry.count({
      where: { contest_id: contest.id, status: { [Op.ne]: 'cancelled' } }
    });
    
    await db.Contest.update(
      { current_entries: newTotal },
      { where: { id: contest.id } }
    );
    
    console.log(`\n✅ Fixed ${fixed.length} users, new total entries: ${newTotal}\n`);
    
    res.json({
      success: true,
      message: `Fixed ${fixed.length} users exceeding 150 entry limit`,
      newTotalEntries: newTotal,
      fixed: fixed
    });
  } catch (error) {
    console.error('Fix entries error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;