// backend/src/routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authMiddleware = require('../middleware/auth');

// All ticket routes require authentication
router.use(authMiddleware);

// Get ticket balance
router.get('/balance', ticketController.getTicketBalance);

// Check if can claim weekly bonus
router.get('/can-claim-weekly', ticketController.canClaimWeekly);

// Claim weekly bonus
router.post('/claim-weekly', ticketController.claimWeeklyBonus);

// ============================================================================
// PURCHASE ENDPOINT DISABLED — closed-loop ticket economy
// ============================================================================
// Tickets are utility currency, NEVER purchased with cash. They are earned
// only through:
//   - Signup bonus
//   - Draft completion (1 per completed draft)
//   - Winning beta/promo contests
//
// And spent only on:
//   - Free ticket contests entry
//   - Market Mover voting (geo-allowed users only)
//   - Player ownership lookups
//   - Cosmetics
//
// Allowing cash-for-tickets would create regulatory exposure (could be
// construed as gambling tokens / unregistered securities depending on
// jurisdiction) and break the legal separation between USD contests
// (DFS, geo-restricted) and ticket contests (free-to-play, global).
// ============================================================================
router.post('/purchase', (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Ticket purchases are no longer supported. Tickets are earned by completing drafts and winning contests.',
    code: 'TICKET_PURCHASE_DISABLED'
  });
});

// Get transaction history
router.get('/history', ticketController.getTransactionHistory);

module.exports = router;