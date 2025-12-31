// backend/src/routes/index.js
const express = require('express');
const router = express.Router();

// Don't import getUsers or createUser - they don't exist
// Instead, import your actual routes
const authRoutes = require('./authRoutes');
const contestRoutes = require('./contestRoutes');
const draftRoutes = require('./draftRoutes');
const userRoutes = require('./userRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/contests', contestRoutes);
router.use('/drafts', draftRoutes);
router.use('/users', userRoutes);

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Fantasy Draft API is running' });
});

module.exports = router;