// backend/src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Basic admin routes - we'll add admin middleware later
router.get('/stats', authMiddleware, async (req, res) => {
  res.json({
    success: true,
    message: 'Admin stats endpoint',
    userId: req.user.userId
  });
});

module.exports = router;