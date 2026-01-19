// backend/src/middleware/admin.js
const db = require('../models');

const adminMiddleware = async (req, res, next) => {
  try {
    // Get user ID from auth middleware (handles both id and userId)
    const userId = req.user?.id || req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    const user = await db.User.findByPk(userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (!user.is_admin && user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }
    
    // Attach full user object for downstream use
    req.adminUser = user;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
};

module.exports = { adminMiddleware };