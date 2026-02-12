// backend/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const LOAD_TEST_SECRET = process.env.LOAD_TEST_SECRET;

const skipLoadTest = (req) => {
  return LOAD_TEST_SECRET && req.headers['x-load-test'] === LOAD_TEST_SECRET;
};

// Auth routes - prevent brute force login attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLoadTest
});

// Payment/withdrawal routes - prevent spam
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many payment requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLoadTest
});

// General API - prevent DoS
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Rate limit exceeded, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLoadTest
});

// Draft picks - prevent spam clicking during drafts
const draftLimiter = rateLimit({
  windowMs: 1000,
  max: 5,
  message: { error: 'Too fast! Slow down' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authLimiter, paymentLimiter, apiLimiter, draftLimiter };
```

Then set the env var in Railway:
```
LOAD_TEST_SECRET=bidblitz-load-2026-secret