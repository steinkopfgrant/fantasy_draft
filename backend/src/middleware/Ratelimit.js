// backend/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

// Store for tracking failed login attempts per IP+username
const failedAttempts = new Map();

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of failedAttempts.entries()) {
    if (now - data.lastAttempt > 60 * 60 * 1000) { // 1 hour
      failedAttempts.delete(key);
    }
  }
}, 60 * 60 * 1000);

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window (login + register combined)
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again in 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// Very strict limiter for login specifically
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 login attempts per 15 minutes
  message: {
    success: false,
    error: 'Too many login attempts, please try again in 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// Registration limiter (prevent mass account creation)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Only 5 registrations per hour per IP
  message: {
    success: false,
    error: 'Too many accounts created, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Password reset limiter
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 password reset requests per hour
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Account lockout middleware (tracks failed attempts per username)
const accountLockout = (lockoutThreshold = 5, lockoutDuration = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const username = req.body.username || req.body.email;
    if (!username) {
      return next();
    }

    const key = `${req.ip}:${username.toLowerCase()}`;
    const attempts = failedAttempts.get(key);

    if (attempts && attempts.count >= lockoutThreshold) {
      const timeRemaining = lockoutDuration - (Date.now() - attempts.lockoutStart);
      
      if (timeRemaining > 0) {
        const minutesRemaining = Math.ceil(timeRemaining / 60000);
        return res.status(429).json({
          success: false,
          error: `Account temporarily locked due to too many failed attempts. Try again in ${minutesRemaining} minutes.`
        });
      } else {
        // Lockout expired, reset
        failedAttempts.delete(key);
      }
    }

    // Store original json method to intercept response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Check if login failed
      if (res.statusCode === 401 || (data && data.success === false && data.error?.includes('Invalid'))) {
        const current = failedAttempts.get(key) || { count: 0, lastAttempt: Date.now() };
        current.count += 1;
        current.lastAttempt = Date.now();
        
        if (current.count >= lockoutThreshold) {
          current.lockoutStart = Date.now();
          console.log(`🔒 Account locked: ${username} from IP ${req.ip} after ${current.count} failed attempts`);
        }
        
        failedAttempts.set(key, current);
      } else if (res.statusCode === 200 && data?.success !== false) {
        // Successful login, clear failed attempts
        failedAttempts.delete(key);
      }
      
      return originalJson(data);
    };

    next();
  };
};

// Get failed attempt count (for debugging/admin)
const getFailedAttempts = (ip, username) => {
  const key = `${ip}:${username?.toLowerCase()}`;
  return failedAttempts.get(key) || null;
};

// Clear failed attempts (for admin use)
const clearFailedAttempts = (ip, username) => {
  const key = `${ip}:${username?.toLowerCase()}`;
  failedAttempts.delete(key);
};

module.exports = {
  apiLimiter,
  authLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  accountLockout,
  getFailedAttempts,
  clearFailedAttempts
};