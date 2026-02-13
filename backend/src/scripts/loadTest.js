#!/usr/bin/env node
/**
 * BidBlitz Load Test - 100 Simultaneous Drafts
 * 
 * Simulates real user behavior:
 * - Registers/logs in test users
 * - Connects via Socket.IO (real WebSocket connections)
 * - Enters cash game contests (server fills with bots)
 * - Makes picks when it's their turn
 * - Tracks latency, errors, missed events, memory
 * 
 * Usage:
 *   node loadTest.js [options]
 * 
 * Options:
 *   --url=<url>           Server URL (default: http://localhost:5000)
 *   --users=<n>           Number of simultaneous users (default: 100)
 *   --ramp=<seconds>      Ramp-up time in seconds (default: 30)
 *   --sport=<nba|nfl>     Sport to test (default: nba)
 *   --verbose             Show per-user logs
 *   --skip-register       Skip user registration (reuse existing)
 */

const { io } = require('socket.io-client');
const axios = require('axios');

// ==================== CONFIGURATION ====================
const CONFIG = {
  BASE_URL: 'http://localhost:5000',
  NUM_USERS: 100,
  RAMP_UP_SECONDS: 30,
  SPORT: 'nba',
  VERBOSE: false,
  SKIP_REGISTER: false,
  USER_PREFIX: 'loadtest',
  PASSWORD: 'LoadTest123!',
  PICK_DELAY_MS: 500,
  RECONNECT_TEST: false,
  MULTI_DRAFT_USERS: 0,
};

// Parse CLI args
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--url=')) CONFIG.BASE_URL = arg.split('=')[1];
  if (arg.startsWith('--users=')) CONFIG.NUM_USERS = parseInt(arg.split('=')[1]);
  if (arg.startsWith('--ramp=')) CONFIG.RAMP_UP_SECONDS = parseInt(arg.split('=')[1]);
  if (arg.startsWith('--sport=')) CONFIG.SPORT = arg.split('=')[1];
  if (arg === '--verbose') CONFIG.VERBOSE = true;
  if (arg === '--skip-register') CONFIG.SKIP_REGISTER = true;
  if (arg.startsWith('--multi=')) CONFIG.MULTI_DRAFT_USERS = parseInt(arg.split('=')[1]);
});

// ==================== METRICS ====================
const metrics = {
  startTime: null,
  registrations: { success: 0, failed: 0, skipped: 0 },
  logins: { success: 0, failed: 0 },
  socketConnections: { success: 0, failed: 0, avgTimeMs: 0, times: [] },
  contestEntries: { success: 0, failed: 0 },
  draftsStarted: 0,
  draftsCompleted: 0,
  draftStartLatencies: [],
  picksAttempted: 0,
  picksSucceeded: 0,
  picksFailed: 0,
  picksAutoPicked: 0,
  pickLatencies: [],
  eventsReceived: {},
  errors: [],
  disconnections: 0,
  reconnections: 0,
  pushSent: 0,
  peakMemoryMB: 0,
  memorySnapshots: [],
};

// ==================== HELPERS ====================
const log = (msg) => console.log(`[${elapsed()}] ${msg}`);
const verbose = (msg) => CONFIG.VERBOSE && console.log(`[${elapsed()}] ${msg}`);
const elapsed = () => {
  if (!metrics.startTime) return '0.0s';
  return ((Date.now() - metrics.startTime) / 1000).toFixed(1) + 's';
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const api = axios.create({
  baseURL: CONFIG.BASE_URL + '/api',
  timeout: 15000,
  validateStatus: () => true,
  headers: {
    'x-load-test': process.env.LOAD_TEST_SECRET || 'bidblitz-load-2026-secret'
  }
});

function trackMemory() {
  const used = process.memoryUsage();
  const heapMB = Math.round(used.heapUsed / 1024 / 1024);
  if (heapMB > metrics.peakMemoryMB) metrics.peakMemoryMB = heapMB;
  metrics.memorySnapshots.push({ time: elapsed(), heapMB, rss: Math.round(used.rss / 1024 / 1024) });
}

function trackEvent(name) {
  metrics.eventsReceived[name] = (metrics.eventsReceived[name] || 0) + 1;
}

// ==================== USER CLIENT ====================
class TestUser {
  constructor(index) {
    this.index = index;
    this.username = `${CONFIG.USER_PREFIX}${String(index).padStart(3, '0')}`;
    this.email = `${this.username}@loadtest.com`;
    this.token = null;
    this.userId = null;
    this.socket = null;
    this.roomId = null;
    this.entryId = null;
    this.contestId = null;
    this.draftState = null;
    this.isMyTurn = false;
    this.inCountdown = false;
    this.countdownCounted = false;
    this.myTeam = null;
    this.playerBoard = null;
    this.teams = null;
    this.currentTurn = 0;
    this.sport = CONFIG.SPORT;
    this.picksMade = 0;
    this.turnStartTime = null;
    this.entryTime = null;
    this.draftStartTime = null;
    this.connected = false;
    this.draftComplete = false;
    this.handlersSetup = false;
    this.draftPollInterval = null;
    this.lastScheduledPick = -1;
    this.errors = [];
  }

  // ----- Registration/Login -----
  async register() {
    if (CONFIG.SKIP_REGISTER) {
      metrics.registrations.skipped++;
      return true;
    }
    try {
      const res = await api.post('/auth/register', {
        username: this.username,
        email: this.email,
        password: CONFIG.PASSWORD,
      });
      if (res.status === 201 || res.status === 200) {
        metrics.registrations.success++;
        verbose(`✅ Registered ${this.username}`);
        return true;
      } else if (res.status === 409 || res.data?.error?.includes('already')) {
        metrics.registrations.skipped++;
        verbose(`⏭️ ${this.username} already exists`);
        return true;
      } else {
        if (res.data?.error?.includes('already') || res.data?.message?.includes('already')) {
          metrics.registrations.skipped++;
          return true;
        }
        metrics.registrations.failed++;
        this.errors.push(`Register failed: ${res.status} ${JSON.stringify(res.data)}`);
        return false;
      }
    } catch (err) {
      metrics.registrations.failed++;
      this.errors.push(`Register error: ${err.message}`);
      return false;
    }
  }

  async login() {
    try {
      const res = await api.post('/auth/login', {
        email: this.email,
        password: CONFIG.PASSWORD,
      });
      if (res.status === 200 && res.data?.token) {
        this.token = res.data.token;
        this.userId = res.data.user?.id || res.data.userId;
        metrics.logins.success++;
        verbose(`✅ Logged in ${this.username} (id: ${this.userId})`);
        return true;
      } else {
        metrics.logins.failed++;
        this.errors.push(`Login failed: ${res.status} ${JSON.stringify(res.data)}`);
        return false;
      }
    } catch (err) {
      metrics.logins.failed++;
      this.errors.push(`Login error: ${err.message}`);
      return false;
    }
  }

  // ----- Socket Connection -----
  async connectSocket() {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;

      const done = (success) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(connectTimeout);
        resolve(success);
      };

      this.socket = io(CONFIG.BASE_URL, {
        auth: { token: this.token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      const connectTimeout = setTimeout(() => {
        metrics.socketConnections.failed++;
        this.errors.push('Socket connection timeout (10s)');
        done(false);
      }, 10000);

      this.socket.on('connect', () => {
        const connectTime = Date.now() - startTime;
        metrics.socketConnections.success++;
        metrics.socketConnections.times.push(connectTime);
        this.connected = true;
        verbose(`🔌 ${this.username} connected (${connectTime}ms)`);

        // Two-step auth: emit authenticate after connect
        this.socket.emit('authenticate', { token: this.token });

        this.setupEventHandlers();
        done(true);
      });

      this.socket.on('connect_error', (err) => {
        metrics.socketConnections.failed++;
        this.errors.push(`Socket connect error: ${err.message}`);
        done(false);
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        metrics.disconnections++;
        verbose(`📴 ${this.username} disconnected: ${reason}`);
      });

      this.socket.on('reconnect', () => {
        this.connected = true;
        metrics.reconnections++;
        verbose(`🔄 ${this.username} reconnected`);
        // Re-authenticate on reconnect
        this.socket.emit('authenticate', { token: this.token });
      });
    });
  }

  // ----- Event Handlers -----
  setupEventHandlers() {
    if (this.handlersSetup) return;
    this.handlersSetup = true;

    // Debug: log ALL incoming events
    if (CONFIG.VERBOSE) {
      this.socket.onAny((event, ...args) => {
        trackEvent(event);
        if (!['timer-update', 'timer-sync'].includes(event)) {
          const preview = args[0] ? JSON.stringify(args[0]).substring(0, 120) : '';
          console.log(`📨 ${this.username} ← "${event}" ${preview}`);
        }
      });
    } else {
      this.socket.onAny((event) => {
        trackEvent(event);
      });
    }

    // ---- authenticated: capture userId ----
    this.socket.on('authenticated', (data) => {
      this.userId = data?.user?.id || data?.userId || this.userId;
      verbose(`🔐 ${this.username} authenticated`);
    });

    // ---- active-draft: ignore old drafts (we'll enter a fresh one) ----
    this.socket.on('active-draft', (data) => {
      verbose(`📋 ${this.username} has active draft: ${data.draftRoomId} (ignoring, will enter fresh)`);
    });

    // ---- draft-state: update board/teams, check completion ----
    this.socket.on('draft-state', (data) => {
      // Accept both roomId and contestId matching (server sends both formats)
      if (data.roomId && data.roomId !== this.roomId && data.contestId !== this.roomId) return;
      if (!data.roomId && data.contestId && data.contestId !== this.roomId) return;

      this.draftState = data;
      this.playerBoard = data.playerBoard || this.playerBoard;
      this.teams = data.teams || data.entries || this.teams;

      // Check status
      if (data.status === 'completed' || data.status === 'complete') {
        if (!this.draftComplete) {
          this.draftComplete = true;
          metrics.draftsCompleted++;
          verbose(`🏁 ${this.username} draft complete (from draft-state)`);
        }
        return;
      }

      // Don't try to detect turns from draft-state — use draft-turn instead
    });

    // ---- player-picked: update local board state ----
    this.socket.on('player-picked', (data) => {
      if (data.roomId !== this.roomId) return;

      // Update local board state
      if (this.playerBoard && data.row !== undefined && data.col !== undefined) {
        if (this.playerBoard[data.row]?.[data.col]) {
          this.playerBoard[data.row][data.col].drafted = true;
        }
      }

      // Update teams if provided
      if (data.teams) this.teams = data.teams;
      if (data.entries) this.teams = data.entries;
    });

    // ---- draft-turn: PRIMARY turn detection ----
    this.socket.on('draft-turn', (data) => {
      if (data.roomId !== this.roomId) return;

      this.inCountdown = false;
      this.currentTurn = data.currentTurn || data.currentPick || 0;

      if (data.currentPlayer) {
        const drafterId = data.currentPlayer.userId || data.currentPlayer.user_id || data.currentPlayer.id;
        this.isMyTurn = (drafterId === this.userId);

        // Use pick number to prevent duplicate triggers (not wasMyTurn, which breaks consecutive turns in snake draft)
        const pickNum = data.currentPick || 0;
        if (this.isMyTurn && pickNum !== this.lastScheduledPick) {
          this.lastScheduledPick = pickNum;
          this.turnStartTime = Date.now();
          verbose(`⏰ ${this.username} - IT'S MY TURN (pick ${data.currentPick}/${data.totalPicks}, drafter: ${drafterId})`);
          setTimeout(() => this.makePick(), CONFIG.PICK_DELAY_MS);
        }
      }
    });

    // ---- pick-success ----
    this.socket.on('pick-success', (data) => {
      metrics.picksSucceeded++;
      if (this.turnStartTime) {
        metrics.pickLatencies.push(Date.now() - this.turnStartTime);
        this.turnStartTime = null;
      }
      this.isMyTurn = false;
    });

    // ---- pick-error ----
    this.socket.on('pick-error', (data) => {
      metrics.picksFailed++;
      this.errors.push(`Pick error: ${data?.error || data?.message || JSON.stringify(data)}`);
      this.isMyTurn = false;
    });

    // ---- draft-starting: suppress picks during startup ----
    this.socket.on('draft-starting', (data) => {
      if (data.roomId && data.roomId !== this.roomId) return;
      this.isMyTurn = false;
      this.inCountdown = true;
    });

    // ---- draft-countdown: suppress picks during countdown ----
    this.socket.on('draft-countdown', (data) => {
      if (data.roomId && data.roomId !== this.roomId) return;
      this.isMyTurn = false;
      this.inCountdown = true;

      // Only count draft start once per user
      if (!this.countdownCounted) {
        this.countdownCounted = true;
        metrics.draftsStarted++;
        if (this.entryTime) {
          metrics.draftStartLatencies.push(Date.now() - this.entryTime);
          this.entryTime = null;
        }
      }
      verbose(`⏳ ${this.username} draft countdown ${data.seconds || ''}s`);
    });

    // ---- draft-complete ----
    this.socket.on('draft-complete', (data) => {
      if (data.roomId && data.roomId !== this.roomId) return;
      if (!this.draftComplete) {
        this.draftComplete = true;
        metrics.draftsCompleted++;
        verbose(`🏁 ${this.username} draft complete`);
      }
    });

    // ---- turn-skipped ----
    this.socket.on('turn-skipped', (data) => {
      if (data.roomId !== this.roomId) return;
      this.currentTurn = data.currentTurn ?? this.currentTurn;
      // Don't try to detect turn here — wait for draft-turn event
    });

    // ---- joined-room confirmation ----
    this.socket.on('joined-room', (data) => {
      verbose(`🚪 ${this.username} joined room confirmed: ${data.roomId}`);
    });

    // ---- room-player-joined ----
    this.socket.on('room-player-joined', (data) => {
      if (data.roomId !== this.roomId && data.contestId !== this.roomId) return;
      verbose(`👥 ${this.username} room player count: ${data.currentPlayers}/${data.maxPlayers || '?'}`);
    });
  }

  // ----- Contest Entry -----
  async enterContest() {
    try {
      const contestsRes = await api.get('/contests', {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (contestsRes.status !== 200 || !contestsRes.data?.length) {
        this.errors.push('No contests available');
        metrics.contestEntries.failed++;
        return false;
      }

      // Find an open cash game for the right sport
      const contest = contestsRes.data.find(c =>
        (c.type === 'cash' || c.contest_type === 'cash') &&
        c.sport === CONFIG.SPORT &&
        c.status === 'open'
      );

      if (!contest) {
        this.errors.push(`No open ${CONFIG.SPORT} cash game found`);
        metrics.contestEntries.failed++;
        return false;
      }

      this.contestId = contest.id;
      this.roomId = contest.room_id || contest.id;
      this.entryTime = Date.now();

      const entryRes = await api.post(`/contests/enter/${contest.id}`, {}, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (entryRes.status === 200 || entryRes.status === 201) {
        this.entryId = entryRes.data?.entryId || entryRes.data?.entry?.id;
        this.roomId = entryRes.data?.roomId || this.roomId;
        metrics.contestEntries.success++;
        verbose(`🎟️ ${this.username} entered contest (room: ${this.roomId})`);

        // Join socket room (server broadcasts to room_${roomId})
        this.socket.emit('join-room', { roomId: this.roomId });

        this.socket.emit('viewing-draft', { roomId: this.roomId });

        // Request initial state
        setTimeout(() => {
          this.socket.emit('get-draft-state', { roomId: this.roomId });
        }, 500);

        // Poll for draft state until populated
        this.draftPollInterval = setInterval(() => {
          if (this.draftComplete || (this.teams?.length > 0 && this.playerBoard?.length > 0)) {
            clearInterval(this.draftPollInterval);
            this.draftPollInterval = null;
            return;
          }
          this.socket.emit('get-draft-state', { roomId: this.roomId });
        }, 2000);

        return true;
      } else {
        metrics.contestEntries.failed++;
        console.log(`❌ Entry error for ${this.username}: ${entryRes.status} ${JSON.stringify(entryRes.data)}`);
        this.errors.push(`Entry failed: ${entryRes.status} ${JSON.stringify(entryRes.data)}`);
        return false;
      }
    } catch (err) {
      metrics.contestEntries.failed++;
      this.errors.push(`Entry error: ${err.message}`);
      return false;
    }
  }

  // ----- Making Picks -----
  makePick() {
    if (!this.isMyTurn || !this.playerBoard || this.draftComplete || this.inCountdown) return;

    const myTeam = this.findMyTeam();
    if (!myTeam) {
      verbose(`⚠️ ${this.username} can't find my team in ${this.teams?.length || 0} teams`);
      return;
    }

    const pick = this.findBestPick(myTeam);
    if (!pick) {
      verbose(`⚠️ ${this.username} no valid pick found`);
      return;
    }

    metrics.picksAttempted++;
    this.picksMade++;

    const playerId = pick.player._id || pick.player.id || pick.player.playerId ||
      pick.player.name?.replace(/\s+/g, '-').toLowerCase();

    this.socket.emit('make-pick', {
      roomId: this.roomId,
      entryId: this.entryId,
      contestId: this.contestId,
      playerId,
      playerData: pick.player,
      position: pick.slot,
      row: pick.row,
      col: pick.col,
      slot: pick.slot,
      roster_slot: pick.slot,
    });

    verbose(`🎯 ${this.username} picked ${pick.player.name} ($${pick.player.price}) → ${pick.slot}`);
  }

  findMyTeam() {
    if (!this.teams || !Array.isArray(this.teams)) return null;
    return this.teams.find(t => {
      const id = t.userId || t.user_id || t.id;
      return id === this.userId;
    });
  }

  findBestPick(team) {
    const POSITIONS = CONFIG.SPORT === 'nba'
      ? ['PG', 'SG', 'SF', 'PF', 'C']
      : ['QB', 'RB', 'WR', 'TE', 'FLEX'];

    const roster = team.roster || {};
    const budget = Math.max(0, team.budget ?? team.remainingBudget ?? 15);
    const emptySlots = POSITIONS.filter(pos => !roster[pos]?.name);

    if (emptySlots.length === 0) return null;

    // Board columns map to positions: col 0=PG/QB, col 1=SG/RB, col 2=SF/WR, col 3=PF/TE, col 4=C/FLEX
    for (const targetSlot of emptySlots) {
      const targetCol = POSITIONS.indexOf(targetSlot);
      let bestPlayer = null, bestRow = -1, highestPrice = -1;

      for (let row = 0; row < this.playerBoard.length; row++) {
        // Primary: pick from the correct column for this position
        const player = this.playerBoard[row]?.[targetCol];
        if (!player?.name || player.drafted || player.price > budget) continue;

        if (player.price > highestPrice) {
          bestPlayer = player;
          bestRow = row;
          highestPrice = player.price;
        }
      }

      if (bestPlayer) {
        return { row: bestRow, col: targetCol, player: bestPlayer, slot: targetSlot };
      }
    }

    // Fallback: scan all columns but verify position matches the slot
    for (const targetSlot of emptySlots) {
      for (let row = 0; row < this.playerBoard.length; row++) {
        for (let col = 0; col < this.playerBoard[row].length; col++) {
          const player = this.playerBoard[row][col];
          if (!player?.name || player.drafted || player.price > budget) continue;

          const pos = (player.position || player.originalPosition || '').toUpperCase();
          if (pos === targetSlot) {
            return { row, col, player, slot: targetSlot };
          }
        }
      }
    }

    return null;
  }

  // ----- Cleanup -----
  disconnect() {
    if (this.draftPollInterval) {
      clearInterval(this.draftPollInterval);
      this.draftPollInterval = null;
    }
    if (this.socket) {
      this.socket.emit('leaving-draft');
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// ==================== LOAD TEST RUNNER ====================
async function runLoadTest() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        BidBlitz Load Test v1.0               ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Server:    ${CONFIG.BASE_URL.padEnd(33)}║`);
  console.log(`║  Users:     ${String(CONFIG.NUM_USERS).padEnd(33)}║`);
  console.log(`║  Ramp-up:   ${(CONFIG.RAMP_UP_SECONDS + 's').padEnd(33)}║`);
  console.log(`║  Sport:     ${CONFIG.SPORT.padEnd(33)}║`);
  console.log(`║  Expected:  ~${String(CONFIG.NUM_USERS) + ' simultaneous drafts'} ${''.padEnd(14)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  metrics.startTime = Date.now();
  const users = [];

  // ----- Phase 1: Register Users -----
  log('📝 PHASE 1: Registering users...');
  const registerBatch = 10;
  for (let i = 0; i < CONFIG.NUM_USERS; i += registerBatch) {
    const batch = [];
    for (let j = i; j < Math.min(i + registerBatch, CONFIG.NUM_USERS); j++) {
      const user = new TestUser(j);
      users.push(user);
      batch.push(user.register());
    }
    await Promise.all(batch);
  }
  log(`✅ Registration: ${metrics.registrations.success} new, ${metrics.registrations.skipped} existing, ${metrics.registrations.failed} failed`);

  // ----- Phase 2: Login Users -----
  log('🔐 PHASE 2: Logging in users...');
  const loginBatch = 20;
  for (let i = 0; i < users.length; i += loginBatch) {
    const batch = users.slice(i, i + loginBatch).map(u => u.login());
    await Promise.all(batch);
  }
  log(`✅ Logins: ${metrics.logins.success} success, ${metrics.logins.failed} failed`);

  const activeUsers = users.filter(u => u.token);
  if (activeUsers.length === 0) {
    log('❌ No users logged in. Aborting.');
    return;
  }

  // ----- Phase 3: Connect Sockets (ramped) -----
  log(`🔌 PHASE 3: Connecting ${activeUsers.length} sockets (${CONFIG.RAMP_UP_SECONDS}s ramp)...`);
  const rampDelay = (CONFIG.RAMP_UP_SECONDS * 1000) / activeUsers.length;

  const connectPromises = activeUsers.map((user, i) =>
    sleep(i * rampDelay).then(() => user.connectSocket())
  );
  await Promise.all(connectPromises);

  const avgConnect = metrics.socketConnections.times.length > 0
    ? Math.round(metrics.socketConnections.times.reduce((a, b) => a + b, 0) / metrics.socketConnections.times.length)
    : 0;
  log(`✅ Sockets: ${metrics.socketConnections.success} connected, ${metrics.socketConnections.failed} failed (avg: ${avgConnect}ms)`);
  trackMemory();

  const connectedUsers = activeUsers.filter(u => u.connected);
  if (connectedUsers.length === 0) {
    log('❌ No sockets connected. Aborting.');
    cleanup(users);
    return;
  }

  // ----- Phase 4: Enter Contests (ramped) -----
  log(`🎟️ PHASE 4: Entering contests (${connectedUsers.length} users)...`);
  const entryDelay = Math.max(200, (CONFIG.RAMP_UP_SECONDS * 500) / connectedUsers.length);

  for (let i = 0; i < connectedUsers.length; i++) {
    connectedUsers[i].enterContest();
    if (i % 10 === 0 && i > 0) {
      log(`   ...${i}/${connectedUsers.length} entries submitted`);
      trackMemory();
    }
    await sleep(entryDelay);
  }

  // Wait for all entries to complete
  await sleep(3000);
  log(`✅ Entries: ${metrics.contestEntries.success} success, ${metrics.contestEntries.failed} failed`);
  trackMemory();

  // ----- Phase 5: Wait for Drafts -----
  log('⏳ PHASE 5: Waiting for drafts to complete...');
  const maxWaitMs = 10 * 60 * 1000;
  const checkInterval = 5000;
  const startWait = Date.now();
  let lastReport = 0;

  while (Date.now() - startWait < maxWaitMs) {
    const completed = connectedUsers.filter(u => u.draftComplete).length;
    const inProgress = connectedUsers.filter(u => u.roomId && !u.draftComplete).length;
    const totalPicks = metrics.picksAttempted;

    if (Date.now() - lastReport > 15000) {
      lastReport = Date.now();
      trackMemory();
      const memSnap = metrics.memorySnapshots[metrics.memorySnapshots.length - 1];
      log(`   📊 Drafts: ${completed} complete, ${inProgress} in progress | Picks: ${totalPicks} attempted, ${metrics.picksSucceeded} success, ${metrics.picksFailed} failed | Memory: ${memSnap.heapMB}MB heap, ${memSnap.rss}MB RSS`);

      // Show top events
      const topEvents = Object.entries(metrics.eventsReceived)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      if (topEvents) log(`   📡 Events: ${topEvents}`);
    }

    if (completed >= connectedUsers.length * 0.9) {
      log(`   ✅ ${completed}/${connectedUsers.length} drafts complete (90%+ threshold)`);
      break;
    }

    await sleep(checkInterval);
  }

  await sleep(5000);

  // ----- Phase 6: Results -----
  printResults(connectedUsers);
  cleanup(users);
}

// ==================== RESULTS ====================
function printResults(users) {
  trackMemory();
  const totalTime = ((Date.now() - metrics.startTime) / 1000).toFixed(1);

  const avgPickLatency = metrics.pickLatencies.length > 0
    ? Math.round(metrics.pickLatencies.reduce((a, b) => a + b, 0) / metrics.pickLatencies.length)
    : 0;
  const p95PickLatency = metrics.pickLatencies.length > 0
    ? Math.round(metrics.pickLatencies.sort((a, b) => a - b)[Math.floor(metrics.pickLatencies.length * 0.95)])
    : 0;
  const p99PickLatency = metrics.pickLatencies.length > 0
    ? Math.round(metrics.pickLatencies.sort((a, b) => a - b)[Math.floor(metrics.pickLatencies.length * 0.99)])
    : 0;

  const avgDraftStart = metrics.draftStartLatencies.length > 0
    ? Math.round(metrics.draftStartLatencies.reduce((a, b) => a + b, 0) / metrics.draftStartLatencies.length)
    : 0;

  const avgConnect = metrics.socketConnections.times.length > 0
    ? Math.round(metrics.socketConnections.times.reduce((a, b) => a + b, 0) / metrics.socketConnections.times.length)
    : 0;

  const usersWithErrors = users.filter(u => u.errors.length > 0);
  const completedDrafts = users.filter(u => u.draftComplete).length;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    LOAD TEST RESULTS                     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Total Time:           ${(totalTime + 's').padEnd(35)}║`);
  console.log(`║  Users Connected:      ${String(metrics.socketConnections.success).padEnd(35)}║`);
  console.log(`║  Drafts Completed:     ${(completedDrafts + '/' + users.length).padEnd(35)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  CONNECTION METRICS                                      ║');
  console.log(`║    Socket Connect Avg: ${(avgConnect + 'ms').padEnd(35)}║`);
  console.log(`║    Disconnections:     ${String(metrics.disconnections).padEnd(35)}║`);
  console.log(`║    Reconnections:      ${String(metrics.reconnections).padEnd(35)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  DRAFT METRICS                                           ║');
  console.log(`║    Drafts Started:     ${String(metrics.draftsStarted).padEnd(35)}║`);
  console.log(`║    Drafts Completed:   ${String(metrics.draftsCompleted).padEnd(35)}║`);
  console.log(`║    Avg Start Latency:  ${(avgDraftStart + 'ms').padEnd(35)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  PICK METRICS                                            ║');
  console.log(`║    Picks Attempted:    ${String(metrics.picksAttempted).padEnd(35)}║`);
  console.log(`║    Picks Succeeded:    ${String(metrics.picksSucceeded).padEnd(35)}║`);
  console.log(`║    Picks Failed:       ${String(metrics.picksFailed).padEnd(35)}║`);
  console.log(`║    Avg Latency:        ${(avgPickLatency + 'ms').padEnd(35)}║`);
  console.log(`║    P95 Latency:        ${(p95PickLatency + 'ms').padEnd(35)}║`);
  console.log(`║    P99 Latency:        ${(p99PickLatency + 'ms').padEnd(35)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  SOCKET EVENTS RECEIVED                                  ║');
  Object.entries(metrics.eventsReceived)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([event, count]) => {
      console.log(`║    ${event.padEnd(22)} ${String(count).padEnd(33)}║`);
    });
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  RESOURCE USAGE                                          ║');
  console.log(`║    Peak Heap:          ${(metrics.peakMemoryMB + 'MB').padEnd(35)}║`);
  if (metrics.memorySnapshots.length > 0) {
    const last = metrics.memorySnapshots[metrics.memorySnapshots.length - 1];
    console.log(`║    Final RSS:          ${(last.rss + 'MB').padEnd(35)}║`);
  }
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  ERRORS                                                   ║');
  console.log(`║    Users with errors:  ${(usersWithErrors.length + '/' + users.length).padEnd(35)}║`);

  const errorCounts = {};
  usersWithErrors.forEach(u => {
    u.errors.forEach(e => {
      const key = e.substring(0, 80);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });
  });
  const topErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topErrors.length > 0) {
    console.log('║  Top Errors:                                             ║');
    topErrors.forEach(([err, count]) => {
      console.log(`║    (${count}x) ${err.substring(0, 50).padEnd(50)}║`);
    });
  }
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('');
  const passed =
    completedDrafts >= users.length * 0.8 &&
    metrics.picksFailed < metrics.picksAttempted * 0.05 &&
    (p95PickLatency < 5000 || metrics.pickLatencies.length === 0);

  if (passed) {
    console.log('✅ LOAD TEST PASSED');
    console.log(`   ${completedDrafts} drafts completed, P95 pick latency ${p95PickLatency}ms`);
  } else {
    console.log('❌ LOAD TEST FAILED');
    if (completedDrafts < users.length * 0.8) console.log(`   Only ${completedDrafts}/${users.length} drafts completed (need 80%)`);
    if (metrics.picksFailed >= metrics.picksAttempted * 0.05) console.log(`   ${metrics.picksFailed} pick failures (>${5}% of attempts)`);
    if (p95PickLatency >= 5000) console.log(`   P95 pick latency ${p95PickLatency}ms (>5000ms threshold)`);
  }
  console.log('');
}

// ==================== CLEANUP ====================
function cleanup(users) {
  log('🧹 Cleaning up connections...');
  users.forEach(u => u.disconnect());

  setTimeout(() => {
    log('👋 Done.');
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', () => {
  console.log('\n⚠️ Interrupted. Printing partial results...');
  printResults([]);
  process.exit(1);
});

runLoadTest().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});