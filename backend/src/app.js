// backend/src/app.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Load environment variables
dotenv.config();

// Import database and models
const db = require('./models');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contestRoutes = require('./routes/contestRoutes');
const draftRoutes = require('./routes/draftRoutes');
const teamRoutes = require('./routes/teamRoutes');
const debugRoutes = require('./routes/debugRoutes');
const poolsRoutes = require('./routes/pools');

// ===========================================
// PAYMENT ROUTES
// ===========================================
let paymentRoutes;
let webhookRoutes;
try {
  paymentRoutes = require('./routes/paymentRoutes');
  webhookRoutes = require('./routes/webhookRoutes');
  console.log('✅ Payment routes loaded');
} catch (error) {
  console.log('⚠️ Payment routes not found:', error.message);
  paymentRoutes = express.Router();
  webhookRoutes = express.Router();
}

// Import or create marketMoverRoutes
let marketMoverRoutes;
try {
  marketMoverRoutes = require('./routes/marketMoverRoutes');
} catch (error) {
  console.log('⚠️ MarketMover routes not found, creating placeholder');
  marketMoverRoutes = express.Router();
  marketMoverRoutes.get('/status', (req, res) => {
    res.json({ 
      votingActive: false,
      leaderboard: [],
      fireSaleList: [],
      coolDownList: [],
      message: 'MarketMover service initializing...'
    });
  });
}

// Import or create simRoutes
let simRoutes;
try {
  simRoutes = require('./routes/admin/simRoutes');
} catch (error) {
  console.log('⚠️ Sim routes not found, creating placeholder');
  simRoutes = express.Router();
  simRoutes.get('/status', (req, res) => {
    res.json({ success: false, error: 'Sim routes not configured' });
  });
}

// Import or create injuryRoutes
let injuryRoutes;
try {
  injuryRoutes = require('./routes/injuryRoutes');
} catch (error) {
  console.log('⚠️ Injury routes not found, creating placeholder');
  injuryRoutes = express.Router();
  injuryRoutes.get('/injuries', (req, res) => {
    res.json({ success: false, error: 'Injury routes not configured' });
  });
}

// Import services
const contestService = require('./services/contestService');
const SocketHandler = require('./socketHandlers');

// Import injury swap service
let injurySwapService;
try {
  injurySwapService = require('./services/injurySwapService');
} catch (error) {
  console.log('⚠️ Injury swap service not found');
  injurySwapService = null;
}

// Import middleware for admin route protection
const authMiddleware = require('./middleware/auth');
const { adminMiddleware } = require('./middleware/admin');

// ============================================
// SETTLEMENT SERVICES
// ============================================
const ScoringService = require('./services/ScoringService');
const SettlementService = require('./services/settlement/SettlementService');
const PayoutService = require('./services/PayoutService');

// Create Express app
const app = express();

// Security headers
const helmet = require('helmet');
app.use(helmet());

// Trust first proxy (Railway runs behind a proxy)
app.set('trust proxy', 1);

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO instance
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Store io instance on app for route access
app.set('io', io);

// Initialize services with Socket.IO
contestService.setSocketIO(io);

// Add missing methods to contestService if they don't exist
if (!contestService.cleanupLocks) {
  contestService.cleanupLocks = async function() {
    try {
      // Clean up any stale Redis locks
      const keys = await this.redis.keys('lock:*');
      for (const key of keys) {
        const lockData = await this.redis.get(key);
        if (lockData) {
          const lock = JSON.parse(lockData);
          // Remove locks older than 5 minutes
          if (Date.now() - lock.timestamp > 5 * 60 * 1000) {
            await this.redis.del(key);
          }
        }
      }
      console.log(`🧹 Cleaned up ${keys.length} stale locks`);
    } catch (error) {
      console.error('Error cleaning up locks:', error);
    }
  };
}

if (!contestService.ensureCashGameAvailable) {
  contestService.ensureCashGameAvailable = async function() {
    try {
      // Check if there's an open cash game
      const openCashGames = await db.Contest.findAll({
        where: {
          type: 'cash',
          status: 'open'
        }
      });

      if (openCashGames.length === 0) {
        console.log('📝 Creating new cash game...');
        // Create a new cash game
        const { generatePlayerBoard } = require('./utils/playerBoard');
        await db.Contest.create({
          id: require('uuid').v4(),
          name: 'Cash Game $5',
          type: 'cash',
          status: 'open',
          sport: 'NFL',
          entry_fee: 5,
          prize_pool: 24,
          max_entries: 100,
          current_entries: 0,
          scoring_type: 'standard',
          player_board: generatePlayerBoard ? generatePlayerBoard() : {},
          created_at: new Date(),
          updated_at: new Date()
        });
        console.log('✅ New cash game created');
      }
    } catch (error) {
      console.error('Error ensuring cash game:', error);
      throw error;
    }
  };
}

// Initialize Socket Handler
const socketHandler = new SocketHandler(io);
socketHandler.initialize();

// ============================================
// MIDDLEWARE ORDER IS CRITICAL!
// ============================================

// CORS - must be first
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      process.env.CLIENT_URL
    ].filter(Boolean);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// ===========================================
// STRIPE WEBHOOK - MUST BE BEFORE express.json()!
// Stripe needs raw body for signature verification
// ===========================================
app.use('/api/webhooks', webhookRoutes);

// Now add JSON parsing for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    socketConnections: socketHandler.getOnlineUsersCount()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await db.sequelize.authenticate();
    const dbStatus = true;
    
    let redisStatus = false;
    try {
      await contestService.redis.ping();
      redisStatus = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        socketio: !!io,
        socketConnections: socketHandler.getOnlineUsersCount(),
        settlement: !!app.get('settlementService'),
        injurySwap: !!injurySwapService,
        payments: !!process.env.STRIPE_SECRET_KEY
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ============================================
// RESOURCE MONITORING (for load testing)
// ============================================

app.get('/api/debug/resources', (req, res) => {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const rssMB = Math.round(used.rss / 1024 / 1024);
  const memoryLimitMB = 512;
  
  let socketCount = 0;
  let draftRooms = [];
  try {
    socketCount = io.engine?.clientsCount || 0;
    const rooms = io.sockets?.adapter?.rooms;
    if (rooms) {
      rooms.forEach((sockets, roomName) => {
        if (roomName.startsWith('draft_')) {
          draftRooms.push({ room: roomName, clients: sockets.size });
        }
      });
    }
  } catch (e) { /* ignore */ }
  
  let activeDrafts = 0;
  let activeTimers = 0;
  try {
    if (socketHandler.draftHandler?.draftStates) {
      activeDrafts = socketHandler.draftHandler.draftStates.size;
    }
    if (socketHandler.draftHandler?.pickTimers) {
      activeTimers = socketHandler.draftHandler.pickTimers.size;
    }
  } catch (e) { /* ignore */ }
  
  res.json({
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: heapUsedMB + ' MB',
      heapTotal: Math.round(used.heapTotal / 1024 / 1024) + ' MB',
      rss: rssMB + ' MB',
      percent: Math.round((rssMB / memoryLimitMB) * 100) + '%',
      warning: rssMB > memoryLimitMB * 0.8 ? '⚠️ HIGH' : 'OK'
    },
    uptime: Math.round(process.uptime()) + 's',
    sockets: {
      connected: socketCount,
      draftRooms: draftRooms.length,
      rooms: draftRooms
    },
    drafts: {
      active: activeDrafts,
      timers: activeTimers
    }
  });
});

app.get('/api/debug/live', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    t: Date.now(),
    heap: Math.round(used.heapUsed / 1024 / 1024),
    rss: Math.round(used.rss / 1024 / 1024),
    sockets: io.engine?.clientsCount || 0,
    drafts: socketHandler.draftHandler?.draftStates?.size || 0
  });
});

// ============================================
// API ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/drafts', draftRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/market-mover', marketMoverRoutes);
app.use('/api/debug', authMiddleware, adminMiddleware, debugRoutes);

// ===========================================
// PAYMENT ROUTES (requires auth)
// ===========================================
app.use('/api/payments', authMiddleware, paymentRoutes);

// PROTECTED ADMIN ROUTES
app.use('/api/admin/sim', authMiddleware, adminMiddleware, simRoutes);
app.use('/api/admin', authMiddleware, adminMiddleware, injuryRoutes);

app.use('/api/pools', poolsRoutes);

// Placeholder routes
app.use('/api/tickets', (req, res) => {
  res.json({ 
    message: 'Ticket routes not implemented yet',
    status: 'placeholder' 
  });
});

app.use('/api/transactions', (req, res) => {
  res.json({ 
    message: 'Transaction routes not implemented yet',
    status: 'placeholder' 
  });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API documentation route
app.get('/api', (req, res) => {
  res.json({
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        refresh: 'POST /api/auth/refresh'
      },
      users: {
        profile: 'GET /api/users/profile',
        update: 'PUT /api/users/profile'
      },
      contests: {
        list: 'GET /api/contests',
        enter: 'POST /api/contests/:id/enter',
        withdraw: 'DELETE /api/contests/entries/:id'
      },
      drafts: {
        initialize: 'GET /api/drafts/initialize/:roomId',
        status: 'GET /api/drafts/:draftId/status',
        active: 'GET /api/drafts/active',
        pick: 'POST /api/drafts/:draftId/pick',
        autoPick: 'POST /api/drafts/:draftId/auto-pick',
        picks: 'GET /api/drafts/:draftId/picks',
        lineup: 'GET /api/drafts/:draftId/lineup/:userId',
        complete: 'POST /api/drafts/:draftId/complete',
        timer: 'GET /api/drafts/:draftId/timer'
      },
      teams: {
        myTeams: 'GET /api/teams/my-teams',
        lineup: 'GET /api/teams/lineup/:lineupId'
      },
      pools: {
        list: 'GET /api/pools'
      },
      payments: {
        depositOptions: 'GET /api/payments/deposit-options',
        cardDeposit: 'POST /api/payments/card/create-intent',
        achDeposit: 'POST /api/payments/ach/create-intent',
        solanaInfo: 'GET /api/payments/solana/deposit-info',
        solanaVerify: 'POST /api/payments/solana/verify',
        balance: 'GET /api/payments/balance',
        transactions: 'GET /api/payments/transactions',
        withdrawRequest: 'POST /api/payments/withdraw/request',
        withdrawStatus: 'GET /api/payments/withdraw/status'
      },
      marketMover: {
        status: 'GET /api/market-mover/status',
        vote: 'POST /api/market-mover/vote',
        ownership: 'POST /api/market-mover/ownership',
        leaderboard: 'GET /api/market-mover/leaderboard'
      },
      adminSettlement: {
        status: 'GET /api/admin/settlement/status/:contestId',
        preview: 'GET /api/admin/settlement/preview/:contestId',
        settle: 'POST /api/admin/settlement/settle/:contestId',
        settleAll: 'POST /api/admin/settlement/settle-all',
        summary: 'GET /api/admin/settlement/summary/:contestId',
        calculateScores: 'POST /api/admin/settlement/calculate-scores/:contestId',
        leaderboard: 'GET /api/admin/settlement/leaderboard/:contestId',
        setPlayerScore: 'POST /api/admin/settlement/set-player-score',
        finalizeWeek: 'POST /api/admin/settlement/finalize-week'
      },
      adminSim: {
        status: 'GET /api/admin/sim/status',
        cashGame: 'POST /api/admin/sim/cash-game',
        marketMover: 'POST /api/admin/sim/market-mover',
        closeMM: 'POST /api/admin/sim/close-mm',
        addBalance: 'POST /api/admin/sim/add-balance'
      },
      adminInjury: {
        getInjuries: 'GET /api/admin/injuries',
        markOut: 'POST /api/admin/injuries/out',
        markActive: 'POST /api/admin/injuries/active',
        bulkOut: 'POST /api/admin/injuries/bulk-out',
        clearInjuries: 'DELETE /api/admin/injuries',
        runSwap: 'POST /api/admin/injuries/run-swap/:contestId',
        swapHistory: 'GET /api/admin/injuries/history/:entryId',
        scheduledSwaps: 'GET /api/admin/injuries/scheduled'
      },
      debug: {
        createTestUsers: 'POST /api/debug/create-test-users',
        fillLobby: 'POST /api/debug/fill-lobby/:contestId',
        autoDraft: 'POST /api/debug/auto-draft/:roomId',
        reset: 'POST /api/debug/reset'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS policy violation',
      message: 'Origin not allowed'
    });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired'
    });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// SETTLEMENT ADMIN ROUTES
// ============================================
const { router: settlementRouter, initializeRouter: initSettlementRouter } = require('./routes/admin/settlement');
app.use('/api/admin/settlement', authMiddleware, adminMiddleware, settlementRouter);

// 404 handler - MUST BE LAST
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await db.sequelize.authenticate();
    console.log("🔄 Syncing database tables...");
    await db.sequelize.sync({ alter: true });
    console.log("✅ Database tables synced!");
    console.log('✅ Database connection established successfully');

    // Sync database models
    if (process.env.NODE_ENV !== 'production') {
      await db.sequelize.sync({ alter: true });
      console.log('✅ Database models synchronized');
    }

    // ============================================
    // INITIALIZE SETTLEMENT SERVICES
    // ============================================
    try {
      const scoringService = new ScoringService(db);
      const payoutService = new PayoutService(db, db.sequelize);
      const settlementService = new SettlementService(db, db.sequelize);
      
      app.set('scoringService', scoringService);
      app.set('payoutService', payoutService);
      app.set('settlementService', settlementService);
      
      initSettlementRouter({ 
        settlementService, 
        scoringService 
      });
      
      console.log('✅ Settlement services initialized');
    } catch (error) {
      console.log('⚠️ Settlement services not available:', error.message);
    }

    // ============================================
    // INITIALIZE INJURY SWAP SERVICE
    // ============================================
    try {
      if (injurySwapService && contestService.redis) {
        injurySwapService.setRedis(contestService.redis);
        await injurySwapService.rescheduleAllSwaps();
        
        app.set('injurySwapService', injurySwapService);
        
        console.log('✅ Injury swap service initialized');
      }
    } catch (error) {
      console.log('⚠️ Injury swap service not available:', error.message);
    }

    // Ensure initial data exists
    try {
      const { ensureInitialData } = require('./utils/dataInitializer');
      await ensureInitialData();
      console.log('✅ Initial data verified');
    } catch (error) {
      console.log('⚠️  Data initialization skipped:', error.message);
    }

    // Ensure at least one cash game is available
    try {
      await contestService.ensureCashGameAvailable();
      console.log('✅ Cash game availability verified');
    } catch (error) {
      console.log('⚠️  Could not ensure cash game availability:', error.message);
    }

    // Initialize MarketMover service if available
    try {
      const marketMoverService = require('./services/marketMoverService');
      if (marketMoverService.initializeVotingPeriod) {
        await marketMoverService.initializeVotingPeriod();
        console.log('✅ MarketMover service initialized');
      }
    } catch (error) {
      console.log('⚠️  MarketMover service not available:', error.message);
    }

    // ============================================
    // LOG PAYMENT CONFIG STATUS
    // ============================================
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_REPLACE_ME') {
      console.log('✅ Stripe payments configured');
    } else {
      console.log('⚠️ Stripe not configured - add STRIPE_SECRET_KEY to .env');
    }
    
    if (process.env.SOLANA_DEPOSIT_WALLET && process.env.SOLANA_DEPOSIT_WALLET !== 'REPLACE_WITH_YOUR_SOLANA_ADDRESS') {
      console.log('✅ Solana deposits configured');
    } else {
      console.log('⚠️ Solana not configured - add SOLANA_DEPOSIT_WALLET to .env');
    }

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: ${process.env.DB_NAME || 'fantasy_draft_db'}`);
      console.log(`🌐 CORS Origin: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      console.log('✅ Active Services:');
      console.log('   - Express Server: Running');
      console.log('   - Socket.IO: Listening');
      console.log('   - Database: Connected');
      console.log('   - Redis: Connected');
      console.log('   - Contest Service: Initialized');
      console.log('   - Settlement Service: Initialized');
      console.log('   - Payment Routes: Loaded');
      console.log('   - Injury Swap Service: ' + (injurySwapService ? 'Initialized' : 'Not Available'));
      console.log('📡 API Documentation: GET /api');
    });

    // Periodic cleanup tasks
    const cleanupInterval = setInterval(async () => {
      try {
        if (contestService.cleanupRoomBoards) {
          await contestService.cleanupRoomBoards();
        }
        if (contestService.cleanupLocks) {
          await contestService.cleanupLocks();
        }
      } catch (error) {
        console.error('Cleanup task error:', error);
      }
    }, 3600000);

    app.set('cleanupInterval', cleanupInterval);

    // Graceful shutdown handling
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown function
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    const cleanupInterval = app.get('cleanupInterval');
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }

    server.close(() => {
      console.log('✅ HTTP server closed');
    });

    io.close(() => {
      console.log('✅ Socket.IO connections closed');
    });

    if (contestService.cleanup) {
      await contestService.cleanup();
      console.log('✅ Contest service cleaned up');
    }

    await db.sequelize.close();
    console.log('✅ Database connection closed');

    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  if (error.message?.includes('EADDRINUSE') || error.message?.includes('ECONNREFUSED')) {
    gracefulShutdown('uncaughtException');
  } else {
    console.error('Continuing after uncaught exception...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();

// Export for testing
module.exports = { app, server, io };