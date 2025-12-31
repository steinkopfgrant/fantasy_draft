// backend/src/middleware/admin.js
const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
  try {
    // Use req.user.userId since that's how your auth middleware sets it
    const user = await User.findById(req.user.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
};

module.exports = { adminMiddleware };