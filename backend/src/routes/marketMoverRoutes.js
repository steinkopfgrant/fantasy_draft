// backend/src/routes/marketMoverRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const marketMoverController = require('../controllers/marketMoverController');

// Optional auth middleware - populates req.user if token present, but doesn't require it
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No token, continue without user
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = {
      id: decoded.userId || decoded.id,
      userId: decoded.userId || decoded.id,
      username: decoded.username
    };
  } catch (error) {
    // Invalid token, continue without user
    console.log('Optional auth: invalid token, continuing without user');
  }
  
  next();
};

// Validation middleware
const validateVote = [
  body('playerName')
    .notEmpty()
    .withMessage('Player name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Player name must be between 2 and 100 characters'),
  body('playerId')
    .optional()
    .isString()
    .withMessage('Player ID must be a string')
];

const validateOwnership = [
  body('contestId')
    .notEmpty()
    .withMessage('Contest ID is required')
    .isUUID()
    .withMessage('Contest ID must be a valid UUID'),
  body('playerName')
    .notEmpty()
    .withMessage('Player name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Player name must be between 2 and 100 characters')
];

const validateBidUpAdmin = [
  body('playerName')
    .notEmpty()
    .withMessage('Player name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Player name must be between 2 and 100 characters'),
  body('boostPercentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Boost percentage must be between 0 and 100'),
  body('durationHours')
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage('Duration must be between 1 and 24 hours')
];

// Public routes - use optionalAuth to get user tickets if logged in
router.get('/status', optionalAuth, marketMoverController.getStatus);
router.get('/leaderboard', marketMoverController.getVoteLeaders);
router.get('/bid-up-player', marketMoverController.getBidUpPlayer);
router.get('/available-players', marketMoverController.getAvailablePlayers);

// Protected routes (auth required)
router.post('/vote', auth, validateVote, marketMoverController.voteForPlayer);
router.post('/ownership', auth, validateOwnership, marketMoverController.checkOwnership);
router.get('/voting-eligibility', auth, marketMoverController.checkVotingEligibility);
router.get('/voting-history', auth, marketMoverController.getVotingHistory);
router.get('/active-contests', auth, marketMoverController.getActiveContests);

// Admin routes
router.post('/admin/set-bid-up', auth, validateBidUpAdmin, marketMoverController.setBidUpPlayer);

module.exports = router;

// NOTE: The frontend needs these text updates for correct mechanics:
// FIRE SALE: "100% one appears, 50% each additional" (not just "100% Appearance")
// COOL DOWN: "1/10 probability modifier" (not "10% Appearance")