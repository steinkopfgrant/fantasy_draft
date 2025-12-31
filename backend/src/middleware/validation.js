// backend/src/middleware/validation.js
const { body, param, query } = require('express-validator');

// Auth validation
const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must contain only letters, numbers, and underscores'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const validateLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Contest validation
const validateContestEntry = [
  param('contestId')
    .isUUID()
    .withMessage('Invalid contest ID')
];

const validateWithdrawal = [
  param('entryId')
    .isUUID()
    .withMessage('Invalid entry ID')
];

// Ticket validation
const validateTicketPurchase = [
  body('quantity')
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantity must be between 1 and 100')
];

// Market Mover validation
const validateVote = [
  body('playerId')
    .notEmpty()
    .withMessage('Player ID is required')
];

const validateOwnershipQuery = [
  body('contestId')
    .isUUID()
    .withMessage('Invalid contest ID'),
  body('playerName')
    .trim()
    .notEmpty()
    .withMessage('Player name is required')
];

module.exports = {
  validateRegister,
  validateLogin,
  validateContestEntry,
  validateWithdrawal,
  validateTicketPurchase,
  validateVote,
  validateOwnershipQuery
};