// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models');
const authMiddleware = require('../middleware/auth');

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    console.log('\n=== REGISTRATION ATTEMPT ===');
    console.log('Username:', username);
    console.log('Email:', email);
    console.log('Timestamp:', new Date().toISOString());
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide all required fields'
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
      return res.status(400).json({
        success: false,
        error: 'User already exists with that email or username'
      });
    }
    
    // Create user (password will be hashed by the model hook)
    const user = await db.User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password
    });
    
    console.log('✅ User created:', user.id);
    
    // Generate UNIQUE token
    const tokenPayload = {
      id: user.id,
      userId: user.id,
      user_id: user.id,
      username: user.username,
      email: user.email,
      timestamp: Date.now(),
      random: Math.random().toString(36).substring(2)
    };
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('Token generated (first 20):', token.substring(0, 20));
    
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

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    // Accept either email or username
    const loginField = email || username;
    
    console.log('\n=== LOGIN ATTEMPT ===');
    console.log('Login field:', loginField);
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
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    console.log('Found user:', user.id, user.username, 'is_admin:', user.is_admin);
    
    // Check password
    const isValid = await user.validatePassword(password);
    
    if (!isValid) {
      console.log('❌ Invalid password');
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.last_login = new Date();
    await user.save();
    
    // Generate UNIQUE token with timestamp and random component
    const tokenPayload = {
      id: user.id,
      userId: user.id,
      user_id: user.id,
      username: user.username,
      email: user.email,
      timestamp: Date.now(),
      random: Math.random().toString(36).substring(2)
    };
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login successful');
    console.log('User ID:', user.id);
    console.log('Username:', user.username);
    console.log('is_admin:', user.is_admin);
    console.log('Token generated (first 20):', token.substring(0, 20));
    
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

// Verify token endpoint
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    console.log('=== TOKEN VERIFY ===');
    console.log('User from token:', req.user.username);
    
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

// Check auth - used by frontend on page load
router.get('/check', authMiddleware, async (req, res) => {
  try {
    console.log('=== AUTH CHECK ===');
    console.log('User ID from token:', req.user.id);
    
    const user = await db.User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    console.log('Auth check for:', user.username, 'is_admin:', user.is_admin);
    
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

// Debug endpoint to check current auth
router.get('/whoami', authMiddleware, (req, res) => {
  console.log('=== WHO AM I ===');
  console.log('Request user:', req.user);
  
  res.json({
    authenticated: true,
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Get current user
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

module.exports = router;