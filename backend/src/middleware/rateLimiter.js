// backend/src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Auth routes - prevent brute force login attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 min
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Payment/withdrawal routes - prevent spam
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 requests per hour
  message: { error: 'Too many payment requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// General API - prevent DoS
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { error: 'Rate limit exceeded, please slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

// Draft picks - prevent spam clicking during drafts
const draftLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 5, // 5 picks per second (generous, but prevents spam)
  message: { error: 'Too fast! Slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authLimiter, paymentLimiter, apiLimiter, draftLimiter };