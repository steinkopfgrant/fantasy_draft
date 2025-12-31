// backend/src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const userService = require('../services/userService');
const contestService = require('../services/contestService');
const db = require('../models');

// Get user profile - FIXED to wrap response properly and include is_admin
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const user = await userService.getUserById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // FIXED: Wrap in { user: {...} } format that frontend expects
        res.json({ 
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                balance: parseFloat(user.balance || 0),
                tickets: parseInt(user.tickets || 0),
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                role: user.role,
                is_admin: user.is_admin || false
            }
        });
    } catch (error) {
        console.error('Error getting user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const updates = req.body;
        
        const updatedUser = await userService.updateUser(userId, updates);
        
        // FIXED: Also wrap update response and include is_admin
        res.json({
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                balance: parseFloat(updatedUser.balance || 0),
                tickets: parseInt(updatedUser.tickets || 0),
                createdAt: updatedUser.created_at,
                updatedAt: updatedUser.updated_at,
                role: updatedUser.role,
                is_admin: updatedUser.is_admin || false
            }
        });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Failed to update user profile' });
    }
});

// Get user's balance - FIXED to include tickets
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const user = await userService.getUserById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // FIXED: Return both balance and tickets
        res.json({ 
            balance: parseFloat(user.balance || 0),
            tickets: parseInt(user.tickets || 0)
        });
    } catch (error) {
        console.error('Error getting balance:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

// Add funds and tickets (for testing)
router.post('/add-funds', authMiddleware, async (req, res) => {
    try {
        const { amount, tickets } = req.body;
        const userId = req.user.id || req.user.userId;
        
        const user = await db.User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Add funds and tickets
        if (amount) {
            user.balance = parseFloat(user.balance || 0) + parseFloat(amount);
        }
        
        if (tickets) {
            user.tickets = parseInt(user.tickets || 0) + parseInt(tickets);
        }
        
        await user.save();
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                balance: parseFloat(user.balance),
                tickets: parseInt(user.tickets)
            }
        });
        
    } catch (error) {
        console.error('Error adding funds:', error);
        res.status(500).json({ error: 'Failed to add funds' });
    }
});

// Get user's contest history
router.get('/contests', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        
        // Check if contestService method exists
        if (typeof contestService.getUserContestHistory === 'function') {
            const contests = await contestService.getUserContestHistory(userId);
            res.json({
                success: true,
                contests
            });
        } else {
            // Fallback: query directly
            const contests = await db.ContestEntry.findAll({
                where: { user_id: userId },
                include: [{
                    model: db.Contest,
                    attributes: ['name', 'type', 'entry_fee', 'prize_pool']
                }],
                order: [['created_at', 'DESC']],
                limit: 20
            });
            
            res.json({
                success: true,
                contests: contests.map(entry => ({
                    id: entry.id,
                    contestId: entry.contest_id,
                    contestName: entry.Contest?.name,
                    contestType: entry.Contest?.type,
                    status: entry.status,
                    createdAt: entry.created_at
                }))
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user's balance history
router.get('/balance-history', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const history = await userService.getBalanceHistory(userId);
        
        res.json({
            success: true,
            history
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user stats
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const stats = await userService.getUserStats(userId);
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error getting user stats:', error);
        res.status(500).json({ error: 'Failed to fetch user stats' });
    }
});

// Claim weekly bonus
router.post('/claim-weekly-bonus', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const result = await userService.claimWeeklyBonus(userId);
        res.json({
            success: true,
            newTicketBalance: result.newBalance,
            message: 'Weekly bonus claimed! +1 ticket'
        });
    } catch (error) {
        console.error('Error claiming weekly bonus:', error);
        res.status(400).json({ error: error.message });
    }
});

// Check if can claim weekly bonus
router.get('/can-claim-bonus', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const canClaim = await userService.canClaimWeeklyBonus(userId);
        
        res.json({
            success: true,
            canClaim
        });
    } catch (error) {
        console.error('Error checking bonus eligibility:', error);
        res.status(500).json({ error: 'Failed to check bonus eligibility' });
    }
});

// Get ticket transactions
router.get('/ticket-history', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        
        const transactions = await db.TicketTransaction.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit: 20
        });
        
        res.json({
            success: true,
            transactions: transactions.map(t => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                balanceAfter: t.balance_after,
                reason: t.reason || t.description,
                createdAt: t.created_at
            }))
        });
    } catch (error) {
        console.error('Error getting ticket history:', error);
        res.status(500).json({ error: 'Failed to fetch ticket history' });
    }
});

// Search users (for admin or friend features)
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ users: [] });
        }
        
        const users = await userService.searchUsers(q, 10);
        
        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to search users' 
        });
    }
});

module.exports = router;