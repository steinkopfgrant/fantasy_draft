// backend/src/middleware/auth.js
// SECURITY HARDENED VERSION
const jwt = require('jsonwebtoken');
const db = require('../models');

// ============================================
// SECURITY: Validate JWT_SECRET exists
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-secret-key' || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
  console.error('❌ FATAL: JWT_SECRET is not properly configured!');
  process.exit(1);
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  // Only log in development or if DEBUG_AUTH is set
  const debugAuth = process.env.DEBUG_AUTH === 'true' || process.env.NODE_ENV === 'development';
  
  if (debugAuth) {
    console.log('\n=== AUTH MIDDLEWARE ===');
    console.log('URL:', req.method, req.url);
    console.log('Auth header present:', !!authHeader);
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (debugAuth) console.log('❌ No valid Bearer token');
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Handle all possible ID fields from different token versions
    const userId = decoded.userId || decoded.id || decoded.user_id;
    
    if (!userId) {
      if (debugAuth) console.log('❌ No user ID in token');
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token format' 
      });
    }
    
    // Verify user exists and is active
    const user = await db.User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'is_active', 'role', 'is_admin']
    });
    
    if (!user) {
      if (debugAuth) console.log('❌ User not found in DB:', userId);
      return res.status(401).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    if (user.is_active === false) {
      if (debugAuth) console.log('❌ User account deactivated:', userId);
      return res.status(401).json({ 
        success: false,
        error: 'Account deactivated' 
      });
    }
    
    // Set user object with all variants for compatibility
    req.user = {
      id: userId,
      userId: userId,
      user_id: userId,
      username: user.username,
      email: user.email,
      role: user.role,
      is_admin: user.is_admin
    };
    
    if (debugAuth) {
      console.log('✅ Authenticated:', user.username, '(', userId, ')');
    }
    
    next();
  } catch (error) {
    if (debugAuth) console.log('❌ Auth failed:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired' 
      });
    }
    
    res.status(401).json({ 
      success: false,
      error: 'Authentication failed' 
    });
  }
};

// Optional: Middleware that doesn't fail if no token (for routes that work both ways)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded.id || decoded.user_id;
    
    if (userId) {
      const user = await db.User.findByPk(userId, {
        attributes: ['id', 'username', 'email', 'is_active', 'role', 'is_admin']
      });
      
      if (user && user.is_active !== false) {
        req.user = {
          id: userId,
          userId: userId,
          user_id: userId,
          username: user.username,
          email: user.email,
          role: user.role,
          is_admin: user.is_admin
        };
      }
    }
  } catch (error) {
    // Token invalid, but that's okay for optional auth
    req.user = null;
  }
  
  next();
};

// Admin-only middleware
const adminMiddleware = async (req, res, next) => {
  // Must be used after authMiddleware
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  if (req.user.role !== 'admin' && req.user.is_admin !== true) {
    console.log('⚠️ Admin access denied for:', req.user.username);
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  
  next();
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;
module.exports.adminMiddleware = adminMiddleware;