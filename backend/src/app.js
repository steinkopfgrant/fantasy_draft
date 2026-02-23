// backend/src/app.js

// ⚡ SENTRY - Must be first import!
require("./instrument.js");
const Sentry = require("@sentry/node");

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const helmet = require('helmet');

// Load environment variables
dotenv.config();

// Import database and models
const db = require('./models');

// Import middleware
const authMiddleware = require('./middleware/auth');
const { adminMiddleware } = require('./middleware/admin');
const { authLimiter, paymentLimiter, apiLimiter, draftLimiter } = require('./middleware/rateLimit');

// ============================================
// IMPORT ROUTES
// ============================================
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contestRoutes = require('./routes/contestRoutes');
const draftRoutes = require('./routes/draftRoutes');
const teamRoutes = require('./routes/teamRoutes');
const debugRoutes = require('./routes/debugRoutes');
const poolsRoutes = require('./routes/pools');
const draftLogsRoutes = require('./routes/draftLogs');

// Payment routes (with graceful fallback)
let paymentRoutes, webhookRoutes, withdrawalRoutes;
try {
  paymentRoutes = require('./routes/paymentRoutes');
  webhookRoutes = require('./routes/webhookRoutes');
  console.log('✅ Payment routes loaded');
} catch (error) {
  console.log('⚠️ Payment routes not found:', error.message);
  paymentRoutes = express.Router();
  webhookRoutes = express.Router();
}

// Withdrawal routes
try {
  withdrawalRoutes = require('./routes/withdrawalRoutes');
  console.log('✅ Withdrawal routes loaded');
} catch (error) {
  console.log('⚠️ Withdrawal routes not found:', error.message);
  withdrawalRoutes = express.Router();
}

// MarketMover routes
let marketMoverRoutes;
try {
  marketMoverRoutes = require('./routes/marketMoverRoutes');
} catch (error) {
  console.log('⚠️ MarketMover routes not found, creating placeholder');
  marketMoverRoutes = express.Router();
  marketMoverRoutes.get('/status', (req, res) => {
    res.json({ votingActive: false, leaderboard: [], fireSaleList: [], coolDownList: [], message: 'MarketMover service initializing...' });
  });
}

// Sim routes
let simRoutes;
try {
  simRoutes = require('./routes/admin/simRoutes');
} catch (error) {
  console.log('⚠️ Sim routes not found, creating placeholder');
  simRoutes = express.Router();
  simRoutes.get('/status', (req, res) => res.json({ success: false, error: 'Sim routes not configured' }));
}

// Notification routes
const notificationRoutes = require('./routes/notificationRoutes');
// Injury routes
let injuryRoutes;
try {
  injuryRoutes = require('./routes/injuryRoutes');
} catch (error) {
  console.log('⚠️ Injury routes not found, creating placeholder');
  injuryRoutes = express.Router();
  injuryRoutes.get('/injuries', (req, res) => res.json({ success: false, error: 'Injury routes not configured' }));
}

// Slate routes (injury swaps + slate management)
let slateRoutes;
try {
  slateRoutes = require('./routes/slateRoutes');
  console.log('✅ Slate routes loaded');
} catch (error) {
  console.log('⚠️ Slate routes not found, creating placeholder');
  slateRoutes = express.Router();
}

// Payment admin routes
let paymentAdminRoutes;
try {
  paymentAdminRoutes = require('./routes/paymentAdminRoutes');
} catch (error) {
  console.log('⚠️ Payment admin routes not found');
  paymentAdminRoutes = express.Router();
}

// ============================================
// IMPORT SERVICES
// ============================================
const contestService = require('./services/contestService');
const SocketHandler = require('./socketHandlers');
const ScoringService = require('./services/ScoringService');
const SettlementService = require('./services/settlement/SettlementService');
const PayoutService = require('./services/PayoutService');

let injurySwapService;
try {
  injurySwapService = require('./services/injurySwapService');
} catch (error) {
  console.log('⚠️ Injury swap service not found');
  injurySwapService = null;
}

// ============================================
// CREATE APP & SERVER
// ============================================
const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet());
app.set('trust proxy', 1);

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

// Store io instance on app
app.set('io', io);

// Initialize services with Socket.IO
contestService.setSocketIO(io);

// Add helper methods to contestService if missing
if (!contestService.cleanupLocks) {
  contestService.cleanupLocks = async function() {
    try {
      const keys = await this.redis.keys('lock:*');
      for (const key of keys) {
        const lockData = await this.redis.get(key);
        if (lockData) {
          const lock = JSON.parse(lockData);
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
      // Check each sport that has an active slate
      const activeSlates = await db.Slate.findAll({ where: { status: 'active' } });
      
      for (const slate of activeSlates) {
        const sport = slate.sport || 'nfl';
        const openGame = await db.Contest.findOne({ 
          where: { type: 'cash', status: 'open', sport: sport } 
        });
        
        if (!openGame) {
          console.log(`📝 Creating cash game for ${sport.toUpperCase()} (slate: ${slate.name})...`);
          const { generatePlayerBoard } = require('./utils/gameLogic');
          const namePrefix = sport === 'nfl' ? 'Cash Game' : `${sport.toUpperCase()} Cash Game`;
          
          await db.Contest.create({
            id: require('uuid').v4(),
            name: `${namePrefix} #1`,
            type: 'cash',
            status: 'open',
            sport: sport,
            slate_id: slate.id,
            entry_fee: 5,
            prize_pool: 24,
            max_entries: 5,
            current_entries: 0,
            max_entries_per_user: 1,
            scoring_type: 'standard',
            player_board: generatePlayerBoard(null, [], [], sport),
            created_at: new Date(),
            updated_at: new Date()
          });
          console.log(`✅ Cash game created for ${sport.toUpperCase()} → slate ${slate.name}`);
        }
      }
    } catch (error) {
      console.error('Error ensuring cash game:', error);
    }
  };
}

// Initialize Socket Handler
const socketHandler = new SocketHandler(io);
socketHandler.initialize();

// ============================================
// MIDDLEWARE (ORDER IS CRITICAL!)
// ============================================

// 1. CORS - must be first
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://bidblitz.io',
      'http://bidblitz.io',
      'http://www.bidblitz.io',
      'https://www.bidblitz.io',
      process.env.CLIENT_URL
    ].filter(Boolean);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`🚫 CORS rejected origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// 2. STRIPE WEBHOOK - MUST BE BEFORE express.json()!
//    Stripe needs raw body for signature verification
app.use('/api/webhooks', webhookRoutes);

// 3. JSON parsing for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// HEALTH CHECK ROUTES
// ============================================
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
    let redisStatus = false;
    try {
      await contestService.redis.ping();
      redisStatus = true;
    } catch (e) { /* redis not available */ }

    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: true,
        redis: redisStatus,
        socketio: !!io,
        socketConnections: socketHandler.getOnlineUsersCount(),
        settlement: !!app.get('settlementService'),
        injurySwap: !!injurySwapService,
        payments: !!process.env.STRIPE_SECRET_KEY,
        sentry: true
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// ============================================
// DEBUG/MONITORING ROUTES
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
    sockets: { connected: socketCount, draftRooms: draftRooms.length, rooms: draftRooms },
    drafts: {
      active: socketHandler.draftHandler?.draftStates?.size || 0,
      timers: socketHandler.draftHandler?.pickTimers?.size || 0
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

// Sentry test route (remove after verifying)
app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("Sentry test error - BidBlitz backend is connected!");
});

// ============================================
// API ROUTES (with rate limiting)
// ============================================

// Public routes (with auth rate limiting)
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes (with general API rate limiting)
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/contests', apiLimiter, contestRoutes);
app.use('/api/drafts', draftLimiter, draftRoutes);
app.use('/api/teams', apiLimiter, teamRoutes);
app.use('/api/market-mover', apiLimiter, marketMoverRoutes);
app.use('/api/pools', apiLimiter, poolsRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);

// Payment routes (requires auth + payment rate limiting)
app.use('/api/payments', paymentLimiter, authMiddleware, paymentRoutes);

// Withdrawal routes (requires auth + payment rate limiting)
app.use('/api/withdrawals', paymentLimiter, authMiddleware, withdrawalRoutes);

// Admin routes (requires auth + admin)
app.use('/api/debug', authMiddleware, adminMiddleware, debugRoutes);
app.use('/api/admin/sim', authMiddleware, adminMiddleware, simRoutes);
app.use('/api/admin/payments', authMiddleware, adminMiddleware, paymentAdminRoutes);
app.use('/api/admin', authMiddleware, adminMiddleware, injuryRoutes);
app.use('/api/admin/draft-logs', authMiddleware, adminMiddleware, draftLogsRoutes);
app.use('/api/slates', apiLimiter, slateRoutes);

// Settlement admin routes
try {
  const { router: settlementRouter, initializeRouter: initSettlementRouter } = require('./routes/admin/settlement');
  app.use('/api/admin/settlement', authMiddleware, adminMiddleware, settlementRouter);
  app.set('initSettlementRouter', initSettlementRouter);
} catch (error) {
  console.log('⚠️ Settlement routes not found:', error.message);
}

// Placeholder routes
app.use('/api/tickets', (req, res) => res.json({ message: 'Ticket routes not implemented yet', status: 'placeholder' }));
app.use('/api/transactions', (req, res) => res.json({ message: 'Transaction routes not implemented yet', status: 'placeholder' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API documentation
app.get('/api', (req, res) => {
  res.json({
    version: '1.0.0',
    endpoints: {
      auth: { register: 'POST /api/auth/register', login: 'POST /api/auth/login', logout: 'POST /api/auth/logout' },
      users: { profile: 'GET /api/users/profile', update: 'PUT /api/users/profile' },
      contests: { list: 'GET /api/contests', enter: 'POST /api/contests/:id/enter' },
      drafts: { initialize: 'GET /api/drafts/initialize/:roomId', pick: 'POST /api/drafts/:draftId/pick' },
      teams: { myTeams: 'GET /api/teams/my-teams' },
      payments: {
        depositOptions: 'GET /api/payments/deposit-options',
        cardDeposit: 'POST /api/payments/card/create-intent',
        achDeposit: 'POST /api/payments/ach/create-intent',
        solanaInfo: 'GET /api/payments/solana/deposit-info',
        solanaVerify: 'POST /api/payments/solana/verify',
        balance: 'GET /api/payments/balance',
        transactions: 'GET /api/payments/transactions'
      },
      withdrawals: {
        info: 'GET /api/withdrawals/info',
        request: 'POST /api/withdrawals/request',
        history: 'GET /api/withdrawals/history',
        cancel: 'POST /api/withdrawals/:id/cancel',
        w9: 'POST /api/withdrawals/w9'
      },
      marketMover: { status: 'GET /api/market-mover/status', vote: 'POST /api/market-mover/vote' },
      slates: {
        list: 'GET /api/slates',
        details: 'GET /api/slates/:slateId',
        lock: 'POST /api/slates/:slateId/lock',
        settle: 'POST /api/slates/:slateId/settle',
        injuries: 'GET/POST /api/slates/:slateId/injuries',
        swapHistory: 'GET /api/slates/:slateId/swap-history',
        runSwaps: 'POST /api/slates/:slateId/run-swaps'
      }
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// Sentry error handler - MUST be before custom error handlers
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation', message: 'Origin not allowed' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation Error', details: err.errors });
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler - MUST BE LAST
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
});

// ============================================
// SERVER STARTUP
// ============================================
async function startServer() {
  try {
    // Database connection
    await db.sequelize.authenticate();
    console.log('✅ Database connection established');
    
    console.log('🔄 Syncing database tables...');
    await db.sequelize.sync({ alter: true });
    console.log('✅ Database tables synced!');

    // Initialize settlement services
    try {
      const scoringService = new ScoringService(db);
      const payoutService = new PayoutService(db, db.sequelize);
      const settlementService = new SettlementService(db, db.sequelize);
      
      app.set('scoringService', scoringService);
      app.set('payoutService', payoutService);
      app.set('settlementService', settlementService);
      
      const initSettlementRouter = app.get('initSettlementRouter');
      if (initSettlementRouter) {
        initSettlementRouter({ settlementService, scoringService });
      }
      console.log('✅ Settlement services initialized');
    } catch (error) {
      console.log('⚠️ Settlement services not available:', error.message);
    }

    // Initialize injury swap service with Redis
    try {
      if (injurySwapService && contestService.redis) {
        injurySwapService.setRedis(contestService.redis);
        app.set('injurySwapService', injurySwapService);
        console.log('✅ Injury swap service initialized (slate-based, no scheduled timers)');
      }
    } catch (error) {
      console.log('⚠️ Injury swap service not available:', error.message);
    }

    // Initial data
    try {
      const { ensureInitialData } = require('./utils/dataInitializer');
      await ensureInitialData();
      console.log('✅ Initial data verified');
    } catch (error) {
      console.log('⚠️ Data initialization skipped:', error.message);
    }

    // Ensure cash game available
    try {
      await contestService.ensureCashGameAvailable();
      console.log('✅ Cash game availability verified');
    } catch (error) {
      console.log('⚠️ Could not ensure cash game availability:', error.message);
    }

    // Initialize MarketMover
    try {
      const marketMoverService = require('./services/marketMoverService');
      if (marketMoverService.initializeVotingPeriod) {
        await marketMoverService.initializeVotingPeriod();
        console.log('✅ MarketMover service initialized');
      }
    } catch (error) {
      console.log('⚠️ MarketMover service not available:', error.message);
    }

    // Log payment config status
    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('REPLACE')) {
      console.log('✅ Stripe payments configured');
    } else {
      console.log('⚠️ Stripe not configured - add STRIPE_SECRET_KEY to .env');
    }
    
    if (process.env.SOLANA_DEPOSIT_WALLET && !process.env.SOLANA_DEPOSIT_WALLET.includes('REPLACE')) {
      console.log('✅ Solana deposits configured');
    } else {
      console.log('⚠️ Solana not configured - add SOLANA_DEPOSIT_WALLET to .env');
    }

    console.log('✅ Rate limiting enabled');
    console.log('✅ Sentry error monitoring active');

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: ${process.env.DB_NAME || 'fantasy_draft_db'}`);
      console.log(`🌐 CORS Origin: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      console.log('📡 API Documentation: GET /api\n');
    });

    // Periodic cleanup
    const cleanupInterval = setInterval(async () => {
      try {
        if (contestService.cleanupRoomBoards) await contestService.cleanupRoomBoards();
        if (contestService.cleanupLocks) await contestService.cleanupLocks();
      } catch (error) {
        console.error('Cleanup task error:', error);
      }
    }, 3600000);

    app.set('cleanupInterval', cleanupInterval);

    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    Sentry.captureException(error);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    const cleanupInterval = app.get('cleanupInterval');
    if (cleanupInterval) clearInterval(cleanupInterval);

    server.close(() => console.log('✅ HTTP server closed'));
    io.close(() => console.log('✅ Socket.IO connections closed'));
    
    if (contestService.cleanup) {
      await contestService.cleanup();
      console.log('✅ Contest service cleaned up');
    }

    await db.sequelize.close();
    console.log('✅ Database connection closed');

    // Flush Sentry events before exit
    await Sentry.close(2000);

    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  Sentry.captureException(error);
  if (error.message?.includes('EADDRINUSE') || error.message?.includes('ECONNREFUSED')) {
    gracefulShutdown('uncaughtException');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  Sentry.captureException(reason);
});

// Start the server
startServer();

module.exports = { app, server, io };