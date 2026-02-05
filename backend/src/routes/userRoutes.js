// backend/src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const userService = require('../services/userService');
const contestService = require('../services/contestService');
const db = require('../models');

// Import TransactionService
const TransactionService = require('../services/TransactionService');

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

// Add funds and tickets (admin only)
// FIXED: Now properly logs transactions via TransactionService
const { adminMiddleware } = require('../middleware/admin');
router.post('/add-funds', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { amount, tickets, targetUserId, reason } = req.body;
        const adminUserId = req.user.id || req.user.userId;
        
        // Target can be self (for testing) or another user (for admin operations)
        const userId = targetUserId || adminUserId;
        
        const user = await db.User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const results = {
            userId: user.id,
            username: user.username
        };
        
        // Add funds using TransactionService (creates audit trail)
        if (amount && parseFloat(amount) > 0) {
            const transactionService = new TransactionService(db, db.sequelize);
            
            const txResult = await transactionService.addPromoCredit(
                userId,
                parseFloat(amount),
                reason || 'Admin funds addition',
                adminUserId
            );
            
            results.previousBalance = txResult.previousBalance;
            results.newBalance = txResult.newBalance;
            results.transactionId = txResult.transaction.id;
            
            console.log(`💰 Admin ${adminUserId} added $${amount} to user ${user.username} (${userId})`);
        }
        
        // Tickets are separate from balance (not financial, so no transaction needed)
        if (tickets && parseInt(tickets) > 0) {
            const ticketAmount = parseInt(tickets);
            const previousTickets = parseInt(user.tickets || 0);
            user.tickets = previousTickets + ticketAmount;
            await user.save();
            
            results.previousTickets = previousTickets;
            results.newTickets = user.tickets;
            
            // Optionally log to TicketTransaction if you have that table
            if (db.TicketTransaction) {
                await db.TicketTransaction.create({
                    user_id: userId,
                    type: 'admin_grant',
                    amount: ticketAmount,
                    balance_after: user.tickets,
                    reason: reason || `Admin grant by ${adminUserId}`
                }).catch(err => {
                    console.log('TicketTransaction logging failed (table may not exist):', err.message);
                });
            }
            
            console.log(`🎟️ Admin ${adminUserId} added ${tickets} tickets to user ${user.username} (${userId})`);
        }
        
        res.json({
            success: true,
            ...results
        });
        
    } catch (error) {
        console.error('Error adding funds:', error);
        res.status(500).json({ error: error.message || 'Failed to add funds' });
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

// Get user's balance history (transaction history)
router.get('/balance-history', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        
        // Use TransactionService if available, fallback to userService
        try {
            const transactionService = new TransactionService(db, db.sequelize);
            const transactions = await transactionService.getUserTransactions(userId, { limit: 50 });
            
            res.json({
                success: true,
                history: transactions.map(tx => ({
                    id: tx.id,
                    type: tx.type,
                    amount: parseFloat(tx.amount),
                    balanceBefore: parseFloat(tx.balance_before || 0),
                    balanceAfter: parseFloat(tx.balance_after),
                    description: tx.description,
                    referenceType: tx.reference_type,
                    referenceId: tx.reference_id,
                    createdAt: tx.created_at
                }))
            });
        } catch (txError) {
            // Fallback to old method if TransactionService fails
            console.log('TransactionService not available, using fallback:', txError.message);
            const history = await userService.getBalanceHistory(userId);
            res.json({
                success: true,
                history
            });
        }
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

// ==================== ADMIN RECONCILIATION ENDPOINTS ====================

// Reconcile single user's balance against transaction history
router.get('/admin/reconcile/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const transactionService = new TransactionService(db, db.sequelize);
        
        const result = await transactionService.reconcileUser(userId);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Reconciliation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reconcile ALL users - find any balance discrepancies
router.get('/admin/reconcile', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const transactionService = new TransactionService(db, db.sequelize);
        
        const results = await transactionService.reconcileAllUsers();
        
        res.json({
            success: true,
            total: results.total,
            reconciled: results.reconciled,
            discrepancyCount: results.discrepancies.length,
            discrepancies: results.discrepancies
        });
    } catch (error) {
        console.error('Reconciliation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== COSMETICS ENDPOINTS ====================

// Helper: Check if a stamp is unlocked for a user
async function isStampUnlocked(user, stampId) {
    // Default is always unlocked
    if (!stampId) return true;
    
    // If currently equipped, it's unlocked
    if (user.equipped_stamp === stampId) return true;
    
    // Check unlocked_badges array (we store stamp unlocks here)
    if (user.unlocked_badges && user.unlocked_badges.includes(stampId)) return true;
    
    // Additional unlock logic can go here:
    // - beta_tester: check if user registered before beta end date
    // - gold: check if user has most cash game wins or MM tournament win
    
    return false;
}

// Get user's cosmetics (equipped items + unlocked items)
router.get('/cosmetics', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const user = await db.User.findByPk(userId, {
            attributes: ['id', 'equipped_stamp', 'unlocked_avatars', 'unlocked_badges', 'selected_avatar', 'selected_badge', 'is_admin', 'role']
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Build unlocked stamps list
        const unlockedStamps = new Set();
        
        // Admin users get everything unlocked
        if (user.is_admin || user.role === 'admin') {
            unlockedStamps.add('beta_tester');
            unlockedStamps.add('gold');
        }
        
        // If currently equipped, it's unlocked
        if (user.equipped_stamp) {
            unlockedStamps.add(user.equipped_stamp);
        }
        
        // Check unlocked_badges array for stamp grants
        if (user.unlocked_badges && Array.isArray(user.unlocked_badges)) {
            user.unlocked_badges.forEach(badge => {
                if (['beta_tester', 'gold'].includes(badge)) {
                    unlockedStamps.add(badge);
                }
            });
        }
        
        res.json({
            equipped_stamp: user.equipped_stamp || null,
            unlocked_stamps: [...unlockedStamps],
            selected_avatar: user.selected_avatar || null,
            selected_badge: user.selected_badge || null,
        });
    } catch (error) {
        console.error('Error fetching cosmetics:', error);
        res.status(500).json({ error: 'Failed to fetch cosmetics' });
    }
});

// Update user's equipped cosmetics
router.put('/cosmetics', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { equipped_stamp, selected_avatar } = req.body;
        
        const user = await db.User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Validate stamp selection
        const validStamps = [null, 'blitz', 'beta_tester', 'gold'];
        if (equipped_stamp !== undefined) {
            if (!validStamps.includes(equipped_stamp)) {
                return res.status(400).json({ error: 'Invalid stamp selection' });
            }
            
            // Check if user has unlocked this stamp (null = default, always allowed)
            // Admin users can equip any stamp
            if (equipped_stamp !== null && !user.is_admin && user.role !== 'admin') {
                const unlocked = await isStampUnlocked(user, equipped_stamp);
                if (!unlocked) {
                    return res.status(403).json({ error: 'Stamp not unlocked' });
                }
            }
            
            user.equipped_stamp = equipped_stamp;
        }

        if (selected_avatar !== undefined) {
            user.selected_avatar = selected_avatar;
        }

        await user.save();
        
        console.log(`🎨 User ${user.username} equipped stamp: ${equipped_stamp || 'default'}`);
        
        res.json({
            success: true,
            equipped_stamp: user.equipped_stamp || null,
            selected_avatar: user.selected_avatar || null,
        });
    } catch (error) {
        console.error('Error updating cosmetics:', error);
        res.status(500).json({ error: 'Failed to update cosmetics' });
    }
});

// Admin: Grant a stamp to a user
router.post('/admin/grant-stamp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { targetUserId, stampId } = req.body;
        
        if (!targetUserId || !stampId) {
            return res.status(400).json({ error: 'targetUserId and stampId required' });
        }
        
        const validStamps = ['beta_tester', 'gold'];
        if (!validStamps.includes(stampId)) {
            return res.status(400).json({ error: 'Invalid stamp ID' });
        }
        
        const targetUser = await db.User.findByPk(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Add to unlocked_badges if not already there
        const currentBadges = targetUser.unlocked_badges || [];
        if (!currentBadges.includes(stampId)) {
            targetUser.unlocked_badges = [...currentBadges, stampId];
            await targetUser.save();
        }
        
        const adminUserId = req.user.id || req.user.userId;
        console.log(`🎁 Admin ${adminUserId} granted stamp '${stampId}' to user ${targetUser.username}`);
        
        res.json({
            success: true,
            username: targetUser.username,
            stampId,
            unlocked_badges: targetUser.unlocked_badges,
        });
    } catch (error) {
        console.error('Error granting stamp:', error);
        res.status(500).json({ error: 'Failed to grant stamp' });
    }
});

module.exports = router;