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

// Purchase tickets
router.post('/purchase', ticketController.purchaseTickets);

// Get transaction history
router.get('/history', ticketController.getTransactionHistory);

module.exports = router;