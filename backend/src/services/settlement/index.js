// backend/src/services/settlement/index.js
//
// SETTLEMENT SYSTEM - How to use
//
// This file exports the settlement services and shows how to initialize them.

const SettlementService = require('./SettlementService');
const ScoringService = require('../ScoringService');
const PayoutService = require('../PayoutService');

// Strategy exports (if you need them individually)
const CashGameSettlement = require('./strategies/CashGameSettlement');
const MarketMoverSettlement = require('./strategies/MarketMoverSettlement');

/**
 * Initialize all settlement services
 * Call this in your app.js after models are loaded
 * 
 * Example usage in app.js:
 * 
 * const { initializeSettlementServices } = require('./services/settlement');
 * const { settlementService, scoringService, payoutService } = initializeSettlementServices(db, sequelize);
 * 
 * // Then mount the admin routes:
 * const { initializeRouter } = require('./routes/admin/settlement');
 * app.use('/api/admin/settlement', initializeRouter({ settlementService, scoringService }));
 */
function initializeSettlementServices(models, sequelize) {
  const scoringService = new ScoringService(models);
  const payoutService = new PayoutService(models, sequelize);
  const settlementService = new SettlementService(models, sequelize);
  
  console.log('✅ Settlement services initialized');
  
  return {
    settlementService,
    scoringService,
    payoutService
  };
}

module.exports = {
  initializeSettlementServices,
  SettlementService,
  ScoringService,
  PayoutService,
  // Strategies
  CashGameSettlement,
  MarketMoverSettlement
};


/*
================================================================================
FILE STRUCTURE - Where to put these files:
================================================================================

backend/src/
├── services/
│   ├── ScoringService.js           <- Player score management, entry calculations
│   ├── PayoutService.js            <- Credit users, audit trail
│   └── settlement/
│       ├── index.js                <- This file (exports + initialization)
│       ├── SettlementService.js    <- Main orchestrator
│       └── strategies/
│           ├── BaseSettlement.js   <- Shared logic for all strategies
│           ├── CashGameSettlement.js  <- $5 winner-take-all
│           └── MarketMoverSettlement.js <- $120K tournament
│
└── routes/
    └── admin/
        └── settlement.js           <- Admin API endpoints


================================================================================
ADDING TO YOUR APP.JS:
================================================================================

// Add after your models are loaded:

const { initializeSettlementServices } = require('./services/settlement');
const { settlementService, scoringService, payoutService } = initializeSettlementServices(db, sequelize);

// Make services available globally or pass to routes
global.settlementService = settlementService;
global.scoringService = scoringService;

// Add admin settlement routes
const { initializeRouter } = require('./routes/admin/settlement');
app.use('/api/admin/settlement', initializeRouter({ settlementService, scoringService }));


================================================================================
API ENDPOINTS (Admin only):
================================================================================

GET  /api/admin/settlement/status/:contestId     - Check if contest is ready to settle
GET  /api/admin/settlement/preview/:contestId    - Preview results without committing
POST /api/admin/settlement/settle/:contestId     - Settle a specific contest
POST /api/admin/settlement/settle-all            - Settle all ready contests
GET  /api/admin/settlement/summary/:contestId    - Get settlement summary
POST /api/admin/settlement/calculate-scores/:id  - Recalculate entry scores
GET  /api/admin/settlement/leaderboard/:id       - Get current leaderboard
POST /api/admin/settlement/set-player-score      - Manually set player score
POST /api/admin/settlement/finalize-week         - Mark week's scores as final


================================================================================
TYPICAL WORKFLOW:
================================================================================

1. NFL games finish for the week
2. Import player scores (manually or via API):
   POST /api/admin/settlement/set-player-score
   { "playerName": "Josh Allen", "playerTeam": "BUF", "week": 1, "season": 2024, "score": 28.5 }

3. Mark all scores as final:
   POST /api/admin/settlement/finalize-week
   { "week": 1, "season": 2024 }

4. Calculate all entry scores:
   POST /api/admin/settlement/calculate-scores/:contestId
   { "week": 1, "season": 2024 }

5. Preview settlement:
   GET /api/admin/settlement/preview/:contestId

6. Execute settlement:
   POST /api/admin/settlement/settle/:contestId

7. Verify results:
   GET /api/admin/settlement/summary/:contestId


================================================================================
ADDING NEW CONTEST TYPES:
================================================================================

1. Create new strategy file:
   backend/src/services/settlement/strategies/MyNewSettlement.js

2. Extend BaseSettlement:
   const BaseSettlement = require('./BaseSettlement');
   
   class MyNewSettlement extends BaseSettlement {
     getType() { return 'mynew'; }
     
     async settle(contest, transaction) {
       // Your settlement logic
     }
   }

3. Register in SettlementService constructor:
   this.strategies = {
     'cash': new CashGameSettlement(...),
     'market': new MarketMoverSettlement(...),
     'mynew': new MyNewSettlement(...),  // Add here
   };

*/