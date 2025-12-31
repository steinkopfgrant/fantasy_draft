// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../models');

const authMiddleware = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    
    console.log('\n=== AUTH MIDDLEWARE ===');
    console.log('URL:', req.method, req.url);
    console.log('IP:', req.ip);
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ No valid Bearer token');
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('Token (first 20):', token.substring(0, 20));
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        console.log('Token decoded:', {
            userId: decoded.userId || decoded.id || decoded.user_id,
            username: decoded.username,
            timestamp: decoded.timestamp
        });
        
        // Handle all possible ID fields
        const userId = decoded.userId || decoded.id || decoded.user_id;
        
        if (!userId) {
            console.log('❌ No user ID in token');
            return res.status(401).json({ error: 'Invalid token format' });
        }
        
        // Verify user exists
        const user = await db.User.findByPk(userId);
        if (!user) {
            console.log('❌ User not found in DB:', userId);
            return res.status(401).json({ error: 'User not found' });
        }
        
        // Set user object with all variants
        req.user = {
            id: userId,
            userId: userId,
            user_id: userId,
            username: user.username,
            email: user.email
        };
        
        console.log('✅ Authenticated:', user.username, '(', userId, ')');
        
        next();
    } catch (error) {
        console.log('❌ Auth failed:', error.message);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        res.status(401).json({ error: 'Authentication failed' });
    }
};

module.exports = authMiddleware;