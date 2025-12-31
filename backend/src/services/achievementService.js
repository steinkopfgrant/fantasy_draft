// backend/src/services/achievementService.js
const db = require('../models');
const { Op } = require('sequelize');
const notificationService = require('./notificationService');

class AchievementService {
  constructor() {
    this.achievements = {
      // Draft achievements
      FIRST_DRAFT: {
        id: 'first_draft',
        name: 'First Timer',
        description: 'Complete your first draft',
        category: 'draft',
        points: 10,
        requirement_type: 'count',
        requirement_value: 1,
        reward_type: 'badge',
        reward_data: { 
          icon: '🎯', 
          color: '#44ff44',
          badge_id: 'first_timer'
        }
      },
      PERFECT_DRAFT: {
        id: 'perfect_draft',
        name: 'Perfect Draft',
        description: 'Complete a draft filling all 5 positions',
        category: 'draft',
        points: 20,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'badge',
        reward_data: { 
          icon: '⭐', 
          color: '#ffaa44',
          badge_id: 'perfect_drafter'
        }
      },
      SPEED_DEMON: {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete a draft in under 2 minutes',
        category: 'draft',
        points: 30,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'emote',
        reward_data: { 
          emote: '⚡',
          emote_id: 'lightning'
        }
      },
      BIG_SPENDER: {
        id: 'big_spender',
        name: 'Big Spender',
        description: 'Draft 5 players each worth $3 or more',
        category: 'draft',
        points: 25,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'title',
        reward_data: { 
          title: 'High Roller',
          color: '#44ff44'
        }
      },
      BUDGET_MASTER: {
        id: 'budget_master',
        name: 'Budget Master',
        description: 'Complete a draft spending exactly $15',
        category: 'draft',
        points: 40,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'avatar',
        reward_data: { 
          avatar_id: 'calculator',
          image: '/avatars/calculator.png'
        }
      },

      // Participation achievements
      DRAFT_5: {
        id: 'draft_5',
        name: 'Regular',
        description: 'Complete 5 drafts',
        category: 'participation',
        points: 20,
        requirement_type: 'count',
        requirement_value: 5,
        reward_type: 'badge',
        reward_data: { 
          icon: '🔄', 
          color: '#4444ff',
          badge_id: 'regular'
        }
      },
      DRAFT_25: {
        id: 'draft_25',
        name: 'Veteran',
        description: 'Complete 25 drafts',
        category: 'participation',
        points: 50,
        requirement_type: 'count',
        requirement_value: 25,
        reward_type: 'clothing',
        reward_data: { 
          item: 'veteran_jersey',
          image: '/clothing/veteran_jersey.png'
        }
      },
      DRAFT_100: {
        id: 'draft_100',
        name: 'Draft Legend',
        description: 'Complete 100 drafts',
        category: 'participation',
        points: 100,
        requirement_type: 'count',
        requirement_value: 100,
        reward_type: 'avatar',
        reward_data: { 
          avatar_id: 'legend',
          image: '/avatars/legend.png',
          animated: true
        }
      },

      // Win achievements
      FIRST_WIN: {
        id: 'first_win',
        name: 'Winner Winner',
        description: 'Win your first contest',
        category: 'win',
        points: 30,
        requirement_type: 'count',
        requirement_value: 1,
        reward_type: 'badge',
        reward_data: { 
          icon: '🏆', 
          color: '#ffff44',
          badge_id: 'winner'
        }
      },
      WIN_STREAK_3: {
        id: 'win_streak_3',
        name: 'Hot Streak',
        description: 'Win 3 contests in a row',
        category: 'win',
        points: 50,
        requirement_type: 'streak',
        requirement_value: 3,
        reward_type: 'emote',
        reward_data: { 
          emote: '🔥',
          emote_id: 'fire'
        }
      },
      WIN_EACH_TYPE: {
        id: 'win_each_type',
        name: 'Versatile Victor',
        description: 'Win at least one of each contest type',
        category: 'win',
        points: 75,
        requirement_type: 'unique',
        requirement_value: 4,
        reward_type: 'title',
        reward_data: { 
          title: 'Master Drafter',
          color: '#00d4ff',
          animated: true
        }
      },

      // Special achievements
      EARLY_BIRD: {
        id: 'early_bird',
        name: 'Early Bird',
        description: 'Complete a draft between 5 AM and 7 AM',
        category: 'special',
        points: 15,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'badge',
        reward_data: { 
          icon: '🌅', 
          color: '#ffaa44',
          badge_id: 'early_bird'
        }
      },
      NIGHT_OWL: {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Complete a draft between 12 AM and 3 AM',
        category: 'special',
        points: 15,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'badge',
        reward_data: { 
          icon: '🦉', 
          color: '#9944ff',
          badge_id: 'night_owl'
        }
      },
      COMEBACK_KID: {
        id: 'comeback_kid',
        name: 'Comeback Kid',
        description: 'Win a contest after being in last place at halftime',
        category: 'special',
        points: 60,
        requirement_type: 'unique',
        requirement_value: 1,
        reward_type: 'emote',
        reward_data: { 
          emote: '💪',
          emote_id: 'strong',
          animated: true
        }
      }
    };
  }

  // Initialize achievements in database
  async initializeAchievements() {
    try {
      for (const [key, achievement] of Object.entries(this.achievements)) {
        await db.Achievement.findOrCreate({
          where: { id: achievement.id },
          defaults: achievement
        });
      }
      console.log('✅ Achievements initialized');
    } catch (error) {
      console.error('Error initializing achievements:', error);
    }
  }

  // Check and award achievements after draft completion
  async checkDraftAchievements(userId, entryId) {
    try {
      const entry = await db.ContestEntry.findByPk(entryId, {
        include: [db.Contest]
      });
      
      if (!entry || entry.status !== 'completed') return;

      const user = await db.User.findByPk(userId);
      const userAchievements = await this.getUserAchievements(userId);

      // Check First Draft
      await this.checkCountAchievement(
        userId, 
        'FIRST_DRAFT', 
        await db.ContestEntry.count({ 
          where: { user_id: userId, status: 'completed' } 
        })
      );

      // Check Perfect Draft (all 5 positions filled)
      const roster = entry.roster || {};
      const filledPositions = Object.keys(roster).filter(pos => roster[pos]).length;
      if (filledPositions === 5) {
        await this.awardAchievement(userId, 'PERFECT_DRAFT');
      }

      // Check Speed Demon (under 2 minutes)
      const draftDuration = new Date(entry.completed_at) - new Date(entry.entered_at);
      if (draftDuration < 120000) { // 2 minutes in milliseconds
        await this.awardAchievement(userId, 'SPEED_DEMON');
      }

      // Check Big Spender (all players $3+)
      const allExpensive = Object.values(roster).every(player => 
        player && player.price >= 3
      );
      if (allExpensive && filledPositions === 5) {
        await this.awardAchievement(userId, 'BIG_SPENDER');
      }

      // Check Budget Master (exactly $15 spent)
      const totalSpent = entry.total_spent || 0;
      if (totalSpent === 15) {
        await this.awardAchievement(userId, 'BUDGET_MASTER');
      }

      // Check time-based achievements
      const completedHour = new Date(entry.completed_at).getHours();
      if (completedHour >= 5 && completedHour < 7) {
        await this.awardAchievement(userId, 'EARLY_BIRD');
      } else if (completedHour >= 0 && completedHour < 3) {
        await this.awardAchievement(userId, 'NIGHT_OWL');
      }

      // Check milestone achievements
      const totalDrafts = await db.ContestEntry.count({ 
        where: { user_id: userId, status: 'completed' } 
      });
      
      if (totalDrafts >= 5) await this.checkCountAchievement(userId, 'DRAFT_5', totalDrafts);
      if (totalDrafts >= 25) await this.checkCountAchievement(userId, 'DRAFT_25', totalDrafts);
      if (totalDrafts >= 100) await this.checkCountAchievement(userId, 'DRAFT_100', totalDrafts);

    } catch (error) {
      console.error('Error checking draft achievements:', error);
    }
  }

  // Check win achievements
  async checkWinAchievements(userId, contestId, position) {
    try {
      if (position !== 1) return; // Only check for winners

      // Check First Win
      const totalWins = await db.ContestEntry.count({ 
        where: { user_id: userId, final_rank: 1 } 
      });
      
      if (totalWins === 1) {
        await this.awardAchievement(userId, 'FIRST_WIN');
      }

      // Check Win Streak
      const recentEntries = await db.ContestEntry.findAll({
        where: { 
          user_id: userId,
          status: 'completed',
          final_rank: { [Op.ne]: null }
        },
        order: [['completed_at', 'DESC']],
        limit: 3
      });

      if (recentEntries.length === 3 && recentEntries.every(e => e.final_rank === 1)) {
        await this.awardAchievement(userId, 'WIN_STREAK_3');
      }

      // Check Win Each Type
      const winsByType = await db.ContestEntry.findAll({
        where: { 
          user_id: userId, 
          final_rank: 1 
        },
        include: [{
          model: db.Contest,
          attributes: ['type']
        }],
        group: ['Contest.type'],
        attributes: ['Contest.type']
      });

      if (winsByType.length >= 4) {
        await this.awardAchievement(userId, 'WIN_EACH_TYPE');
      }

    } catch (error) {
      console.error('Error checking win achievements:', error);
    }
  }

  // Award achievement to user
  async awardAchievement(userId, achievementKey) {
    try {
      const achievement = this.achievements[achievementKey];
      if (!achievement) return;

      const [userAchievement, created] = await db.UserAchievement.findOrCreate({
        where: {
          user_id: userId,
          achievement_id: achievement.id
        },
        defaults: {
          progress: 1,
          completed: true,
          completed_at: new Date()
        }
      });

      if (created) {
        // New achievement unlocked!
        console.log(`🏆 User ${userId} unlocked achievement: ${achievement.name}`);
        
        // Update user points
        await db.User.increment('achievement_points', {
          by: achievement.points,
          where: { id: userId }
        });

        // Update user's unlocked rewards
        const user = await db.User.findByPk(userId);
        if (user) {
          switch (achievement.reward_type) {
            case 'badge':
              const badges = user.unlocked_badges || [];
              badges.push(achievement.reward_data.badge_id);
              await user.update({ unlocked_badges: badges });
              break;
            case 'emote':
              const emotes = user.unlocked_emotes || [];
              emotes.push(achievement.reward_data.emote_id);
              await user.update({ unlocked_emotes: emotes });
              break;
            case 'avatar':
              const avatars = user.unlocked_avatars || [];
              avatars.push(achievement.reward_data.avatar_id);
              await user.update({ unlocked_avatars: avatars });
              break;
          }
        }

        // Send notification
        await notificationService.sendAchievementNotification(
          userId,
          achievement.name,
          achievement.reward_data
        );

        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error awarding achievement:', error);
      return false;
    }
  }

  // Check count-based achievements
  async checkCountAchievement(userId, achievementKey, currentCount) {
    const achievement = this.achievements[achievementKey];
    if (!achievement || currentCount < achievement.requirement_value) return;

    await this.awardAchievement(userId, achievementKey);
  }

  // Get user's achievements
  async getUserAchievements(userId) {
    try {
      const achievements = await db.UserAchievement.findAll({
        where: { user_id: userId },
        include: [{
          model: db.Achievement,
          attributes: ['id', 'name', 'description', 'category', 'points', 'reward_type', 'reward_data']
        }]
      });

      return achievements;
    } catch (error) {
      console.error('Error getting user achievements:', error);
      return [];
    }
  }

  // Get achievement progress for user
  async getUserAchievementProgress(userId) {
    try {
      const allAchievements = await db.Achievement.findAll();
      const userAchievements = await this.getUserAchievements(userId);
      const completedIds = new Set(userAchievements.map(ua => ua.achievement_id));

      const progress = {
        total: allAchievements.length,
        completed: userAchievements.length,
        points: userAchievements.reduce((sum, ua) => sum + (ua.Achievement?.points || 0), 0),
        byCategory: {},
        achievements: []
      };

      for (const achievement of allAchievements) {
        const userAch = userAchievements.find(ua => ua.achievement_id === achievement.id);
        
        if (!progress.byCategory[achievement.category]) {
          progress.byCategory[achievement.category] = {
            total: 0,
            completed: 0
          };
        }
        
        progress.byCategory[achievement.category].total++;
        if (completedIds.has(achievement.id)) {
          progress.byCategory[achievement.category].completed++;
        }

        progress.achievements.push({
          ...achievement.toJSON(),
          completed: completedIds.has(achievement.id),
          completedAt: userAch?.completed_at,
          progress: userAch?.progress || 0
        });
      }

      return progress;
    } catch (error) {
      console.error('Error getting achievement progress:', error);
      return null;
    }
  }

  // Get recently unlocked achievements for a user
  async getRecentlyUnlocked(userId, limit = 5) {
    try {
      const recentAchievements = await db.UserAchievement.findAll({
        where: {
          user_id: userId,
          completed: true
        },
        include: [{
          model: db.Achievement,
          attributes: ['id', 'name', 'description', 'points', 'reward_type', 'reward_data']
        }],
        order: [['completed_at', 'DESC']],
        limit
      });

      return recentAchievements.map(ua => ({
        id: ua.Achievement.id,
        name: ua.Achievement.name,
        description: ua.Achievement.description,
        points: ua.Achievement.points,
        reward: ua.Achievement.reward_data,
        unlockedAt: ua.completed_at
      }));
    } catch (error) {
      console.error('Error getting recently unlocked:', error);
      return [];
    }
  }

  // Update progress for count-based achievements
  async updateAchievementProgress(userId, achievementKey, progress) {
    try {
      const achievement = this.achievements[achievementKey];
      if (!achievement || achievement.requirement_type !== 'count') return;

      const [userAchievement, created] = await db.UserAchievement.findOrCreate({
        where: {
          user_id: userId,
          achievement_id: achievement.id
        },
        defaults: {
          progress: 0,
          completed: false
        }
      });

      if (!userAchievement.completed) {
        userAchievement.progress = progress;
        
        if (progress >= achievement.requirement_value) {
          userAchievement.completed = true;
          userAchievement.completed_at = new Date();
          
          // Update user points
          await db.User.increment('achievement_points', {
            by: achievement.points,
            where: { id: userId }
          });

          // Send notification
          await notificationService.sendAchievementNotification(
            userId,
            achievement.name,
            achievement.reward_data
          );
        }
        
        await userAchievement.save();
      }
    } catch (error) {
      console.error('Error updating achievement progress:', error);
    }
  }

  // Check specific achievement conditions
  async checkSpecialAchievements(userId, type, data) {
    try {
      switch (type) {
        case 'comeback':
          // Check if user was in last place at halftime and won
          if (data.halftimePosition === data.totalPlayers && data.finalPosition === 1) {
            await this.awardAchievement(userId, 'COMEBACK_KID');
          }
          break;
          
        case 'perfect_budget':
          // Check if user spent exactly their budget
          if (data.budgetSpent === data.totalBudget) {
            await this.awardAchievement(userId, 'BUDGET_MASTER');
          }
          break;
          
        default:
          break;
      }
    } catch (error) {
      console.error('Error checking special achievements:', error);
    }
  }
}

module.exports = new AchievementService();