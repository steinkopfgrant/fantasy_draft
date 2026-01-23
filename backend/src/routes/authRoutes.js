// backend/src/routes/authRoutes.js
// SECURITY HARDENED VERSION
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../models');
const authMiddleware = require('../middleware/auth');
const { loginLimiter, registerLimiter, accountLockout } = require('../middleware/rateLimit');

// ============================================
// SECURITY: Validate JWT_SECRET exists at startup
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-secret-key' || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set or is using a default value!');
  console.error('❌ Please set a secure JWT_SECRET in your environment variables.');
  console.error('❌ Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'; // Reduced from 7d for security

// ============================================
// HELPER: Generate secure token
// ============================================
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
      user_id: user.id,
      username: user.username,
      email: user.email,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// ============================================
// POST /register - Create new account
// ============================================
router.post('/register', /* registerLimiter, */ async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    console.log('\n=== REGISTRATION ATTEMPT ===');
    console.log('Username:', username);
    console.log('Email:', email ? email.substring(0, 3) + '***' : 'not provided'); // Mask email in logs
    console.log('Timestamp:', new Date().toISOString());
    console.log('IP Address:', req.ip);
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide all required fields'
      });
    }

    // Username validation
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 20 characters'
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Username can only contain letters, numbers, and underscores'
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address'
      });
    }
    
    // Check if user exists
    const existingUser = await db.User.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { email: email.toLowerCase() }, 
          { username: username.toLowerCase() }
        ]
      }
    });
    
    if (existingUser) {
      console.log('❌ User already exists');
      // Don't reveal which field exists (security)
      return res.status(400).json({
        success: false,
        error: 'An account with that email or username already exists'
      });
    }
    
    // Create user (password will be hashed by the model hook)
    const user = await db.User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password // Model hook will hash this
    });
    
    console.log('✅ User created:', user.id);
    
    // Generate token
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: parseFloat(user.balance || 0),
        tickets: parseInt(user.tickets || 0),
        role: user.role,
        is_admin: user.is_admin || false
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user'
    });
  }
});

// ============================================
// POST /login - Authenticate user
// ============================================
router.post('/login', /* loginLimiter, accountLockout(5, 15 * 60 * 1000), */ async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    // Accept either email or username
    const loginField = email || username;
    
    console.log('\n=== LOGIN ATTEMPT ===');
    console.log('Login field:', loginField ? loginField.substring(0, 3) + '***' : 'not provided');
    console.log('Timestamp:', new Date().toISOString());
    console.log('IP Address:', req.ip);
    
    if (!loginField || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email/username and password'
      });
    }
    
    // Find user by email or username
    const whereClause = email 
      ? { email: email.toLowerCase() }
      : { username: username.toLowerCase() };
    
    const user = await db.User.findOne({
      where: whereClause
    });
    
    if (!user) {
      console.log('❌ User not found');
      // Use same error message to prevent user enumeration
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Check if account is active
    if (user.is_active === false) {
      console.log('❌ Account deactivated');
      return res.status(401).json({
        success: false,
        error: 'This account has been deactivated'
      });
    }
    
    // Check password
    const isValid = await user.validatePassword(password);
    
    if (!isValid) {
      console.log('❌ Invalid password for user:', user.id);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.last_login = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user);
    
    console.log('✅ Login successful for:', user.username);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: parseFloat(user.balance || 0),
        tickets: parseInt(user.tickets || 0),
        role: user.role,
        is_admin: user.is_admin || false
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login'
    });
  }
});

// ============================================
// GET /verify - Verify token is valid
// ============================================
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: parseFloat(user.balance || 0),
        tickets: parseInt(user.tickets || 0),
        role: user.role,
        is_admin: user.is_admin || false
      }
    });
    
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// ============================================
// GET /check - Check auth status (used by frontend on page load)
// ============================================
router.get('/check', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: parseFloat(user.balance || 0),
        tickets: parseInt(user.tickets || 0),
        role: user.role,
        is_admin: user.is_admin || false
      }
    });
    
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// ============================================
// GET /me - Get current user profile
// ============================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: parseFloat(user.balance || 0),
        tickets: parseInt(user.tickets || 0),
        role: user.role,
        is_admin: user.is_admin || false
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get user data'
    });
  }
});

// ============================================
// POST /refresh - Refresh token
// ============================================
router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    
    if (!user || user.is_active === false) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session'
      });
    }
    
    // Generate new token
    const token = generateToken(user);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        balance: parseFloat(user.balance || 0),
        tickets: parseInt(user.tickets || 0),
        role: user.role,
        is_admin: user.is_admin || false
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

// ============================================
// POST /logout - Logout (client-side token removal, but log it)
// ============================================
router.post('/logout', authMiddleware, (req, res) => {
  console.log('👋 User logged out:', req.user.username);
  
  // In a production system with refresh tokens, you'd invalidate the token here
  // For now, just acknowledge the logout
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;