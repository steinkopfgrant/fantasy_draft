// backend/src/routes/achievementRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const achievementService = require('../services/achievementService');

// Get all achievements with user progress
router.get('/progress', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const progress = await achievementService.getUserAchievementProgress(userId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Could not fetch achievement progress' });
    }
    
    res.json(progress);
  } catch (error) {
    console.error('Error fetching achievement progress:', error);
    res.status(500).json({ error: 'Failed to fetch achievement progress' });
  }
});

// Get user's unlocked achievements
router.get('/user', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const achievements = await achievementService.getUserAchievements(userId);
    
    res.json({
      achievements,
      count: achievements.length,
      totalPoints: achievements.reduce((sum, ach) => sum + (ach.Achievement?.points || 0), 0)
    });
  } catch (error) {
    console.error('Error fetching user achievements:', error);
    res.status(500).json({ error: 'Failed to fetch user achievements' });
  }
});

// Get all available achievements
router.get('/all', async (req, res) => {
  try {
    const db = require('../models');
    const achievements = await db.Achievement.findAll({
      where: { is_active: true },
      order: [['category', 'ASC'], ['points', 'ASC']]
    });
    
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching all achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Get achievement by ID
router.get('/:achievementId', authMiddleware, async (req, res) => {
  try {
    const { achievementId } = req.params;
    const userId = req.user.userId || req.user.id;
    
    const db = require('../models');
    const achievement = await db.Achievement.findByPk(achievementId);
    
    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    
    // Check if user has this achievement
    const userAchievement = await db.UserAchievement.findOne({
      where: {
        user_id: userId,
        achievement_id: achievementId
      }
    });
    
    res.json({
      ...achievement.toJSON(),
      unlocked: !!userAchievement,
      unlockedAt: userAchievement?.completed_at,
      progress: userAchievement?.progress || 0
    });
  } catch (error) {
    console.error('Error fetching achievement:', error);
    res.status(500).json({ error: 'Failed to fetch achievement' });
  }
});

// Get achievement leaderboard
router.get('/leaderboard/:category?', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 10 } = req.query;
    
    const db = require('../models');
    
    let whereClause = {};
    if (category && category !== 'all') {
      whereClause = { category };
    }
    
    // Get top users by achievement points
    const topUsers = await db.User.findAll({
      attributes: [
        'id',
        'username',
        'achievement_points',
        [db.sequelize.fn('COUNT', db.sequelize.col('UserAchievements.id')), 'achievement_count']
      ],
      include: [{
        model: db.UserAchievement,
        attributes: [],
        required: false,
        where: { completed: true }
      }],
      group: ['User.id'],
      order: [[db.sequelize.literal('achievement_points'), 'DESC']],
      limit: parseInt(limit)
    });
    
    res.json({
      category: category || 'all',
      leaderboard: topUsers.map((user, index) => ({
        rank: index + 1,
        userId: user.id,
        username: user.username,
        points: user.achievement_points || 0,
        achievementCount: parseInt(user.dataValues.achievement_count) || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching achievement leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Check and update achievements (called after significant events)
router.post('/check', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { type, data } = req.body;
    
    let newAchievements = [];
    
    switch (type) {
      case 'draft_completed':
        await achievementService.checkDraftAchievements(userId, data.entryId);
        break;
        
      case 'contest_won':
        await achievementService.checkWinAchievements(userId, data.contestId, data.position);
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid achievement check type' });
    }
    
    // Get any new achievements that were unlocked
    const recentAchievements = await achievementService.getRecentlyUnlocked(userId, 5);
    
    res.json({
      success: true,
      newAchievements: recentAchievements
    });
  } catch (error) {
    console.error('Error checking achievements:', error);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

// Admin: Award achievement manually (dev/admin only)
router.post('/award', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (you'll need to implement this check)
    const isAdmin = req.user.role === 'admin' || process.env.NODE_ENV === 'development';
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { userId, achievementKey } = req.body;
    
    if (!userId || !achievementKey) {
      return res.status(400).json({ error: 'userId and achievementKey required' });
    }
    
    const awarded = await achievementService.awardAchievement(userId, achievementKey);
    
    res.json({
      success: awarded,
      message: awarded ? 'Achievement awarded successfully' : 'Achievement already unlocked or invalid'
    });
  } catch (error) {
    console.error('Error awarding achievement:', error);
    res.status(500).json({ error: 'Failed to award achievement' });
  }
});

// Get achievement statistics
router.get('/stats/global', async (req, res) => {
  try {
    const db = require('../models');
    
    const [
      totalAchievements,
      totalUnlocked,
      mostUnlockedAchievement,
      rarestAchievement
    ] = await Promise.all([
      db.Achievement.count({ where: { is_active: true } }),
      db.UserAchievement.count({ where: { completed: true } }),
      db.UserAchievement.findOne({
        attributes: [
          'achievement_id',
          [db.sequelize.fn('COUNT', 'achievement_id'), 'unlock_count']
        ],
        where: { completed: true },
        group: ['achievement_id'],
        order: [[db.sequelize.literal('unlock_count'), 'DESC']],
        include: [{
          model: db.Achievement,
          attributes: ['name', 'description']
        }]
      }),
      db.Achievement.findOne({
        attributes: [
          'id',
          'name',
          'description',
          [
            db.sequelize.literal(
              '(SELECT COUNT(*) FROM user_achievements WHERE achievement_id = "Achievement"."id" AND completed = true)'
            ),
            'unlock_count'
          ]
        ],
        where: { is_active: true },
        order: [[db.sequelize.literal('unlock_count'), 'ASC']],
        limit: 1
      })
    ]);
    
    res.json({
      totalAchievements,
      totalUnlocked,
      averageUnlocksPerAchievement: totalAchievements > 0 ? (totalUnlocked / totalAchievements).toFixed(2) : 0,
      mostUnlocked: mostUnlockedAchievement ? {
        name: mostUnlockedAchievement.Achievement.name,
        unlockCount: parseInt(mostUnlockedAchievement.dataValues.unlock_count)
      } : null,
      rarest: rarestAchievement ? {
        name: rarestAchievement.name,
        unlockCount: parseInt(rarestAchievement.dataValues.unlock_count)
      } : null
    });
  } catch (error) {
    console.error('Error fetching achievement stats:', error);
    res.status(500).json({ error: 'Failed to fetch achievement statistics' });
  }
});

module.exports = router;