// backend/src/services/notificationService.js
const webpush = require('web-push');
const db = require('../models');
const { Op } = require('sequelize');

class NotificationService {
  constructor() {
    // Initialize web-push with VAPID keys
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:' + (process.env.VAPID_EMAIL || 'admin@fantasydraft.com'),
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } else {
      console.warn('⚠️  VAPID keys not configured. Push notifications disabled.');
    }
  }

  // Send notification when it's user's turn to draft
  async sendDraftTurnNotification(userId, contestName, roomId, timeRemaining = 30) {
    try {
      const user = await db.User.findByPk(userId);
      if (!user?.push_subscription) return;

      const notification = {
        title: "🎯 Your Turn to Draft!",
        body: `It's your turn in ${contestName}. You have ${timeRemaining} seconds!`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        actions: [
          {
            action: 'draft',
            title: 'Go to Draft',
            icon: '/icons/draft-icon.png'
          }
        ],
        data: {
          type: 'draft_turn',
          contestName,
          roomId,
          timestamp: Date.now(),
          url: `/draft/${roomId}`
        },
        tag: `draft-turn-${roomId}`,
        renotify: true
      };

      await this.sendNotification(user.push_subscription, notification);
      console.log(`✅ Draft turn notification sent to ${user.username}`);
    } catch (error) {
      console.error('Error sending draft turn notification:', error);
    }
  }

  // Send notification when draft room is filling up
  async sendRoomFillingNotification(userIds, contestName, roomId, currentPlayers, maxPlayers) {
    try {
      const users = await db.User.findAll({
        where: {
          id: userIds,
          push_subscription: { [Op.ne]: null }
        }
      });

      const notification = {
        title: "🔥 Draft Room Filling Up!",
        body: `${contestName} has ${currentPlayers}/${maxPlayers} players. Draft starts when full!`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: {
          type: 'room_filling',
          contestName,
          roomId,
          currentPlayers,
          maxPlayers,
          timestamp: Date.now(),
          url: `/draft/${roomId}`
        },
        tag: `room-filling-${roomId}`,
        renotify: false
      };

      const promises = users.map(user => 
        this.sendNotification(user.push_subscription, notification)
      );

      await Promise.all(promises);
      console.log(`✅ Room filling notifications sent to ${users.length} users`);
    } catch (error) {
      console.error('Error sending room filling notifications:', error);
    }
  }

  // Send notification when draft is starting
  async sendDraftStartingNotification(userIds, contestName, roomId, countdown = 10) {
    try {
      const users = await db.User.findAll({
        where: {
          id: userIds,
          push_subscription: { [Op.ne]: null }
        }
      });

      const notification = {
        title: "🚀 Draft Starting!",
        body: `${contestName} draft begins in ${countdown} seconds!`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [500, 200, 500],
        requireInteraction: true,
        urgency: 'high',
        actions: [
          {
            action: 'join',
            title: 'Join Draft',
            icon: '/icons/join-icon.png'
          }
        ],
        data: {
          type: 'draft_starting',
          contestName,
          roomId,
          countdown,
          timestamp: Date.now(),
          url: `/draft/${roomId}`
        },
        tag: `draft-starting-${roomId}`,
        renotify: true
      };

      const promises = users.map(user => 
        this.sendNotification(user.push_subscription, notification)
      );

      await Promise.all(promises);
      console.log(`✅ Draft starting notifications sent to ${users.length} users`);
    } catch (error) {
      console.error('Error sending draft starting notifications:', error);
    }
  }

  // Send notification when draft is completed
  async sendDraftCompletedNotification(userId, contestName, contestId, position) {
    try {
      const user = await db.User.findByPk(userId);
      if (!user?.push_subscription) return;

      const notification = {
        title: "✅ Draft Complete!",
        body: `You finished ${position ? `#${position}` : ''} in ${contestName}. Good luck!`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: {
          type: 'draft_completed',
          contestName,
          contestId,
          position,
          timestamp: Date.now(),
          url: `/my-contests`
        },
        tag: `draft-completed-${contestId}`
      };

      await this.sendNotification(user.push_subscription, notification);
      console.log(`✅ Draft completed notification sent to ${user.username}`);
    } catch (error) {
      console.error('Error sending draft completed notification:', error);
    }
  }

  // Send achievement unlocked notification
  async sendAchievementNotification(userId, achievementName, reward) {
    try {
      const user = await db.User.findByPk(userId);
      if (!user?.push_subscription) return;

      const notification = {
        title: "🏆 Achievement Unlocked!",
        body: `You earned: ${achievementName}`,
        icon: '/icons/achievement-icon.png',
        badge: '/icons/badge-72x72.png',
        image: reward?.image || '/icons/achievement-default.png',
        vibrate: [200, 100, 200, 100, 200],
        data: {
          type: 'achievement_unlocked',
          achievementName,
          reward,
          timestamp: Date.now(),
          url: `/profile/achievements`
        },
        tag: `achievement-${Date.now()}`
      };

      await this.sendNotification(user.push_subscription, notification);
      console.log(`✅ Achievement notification sent to ${user.username}`);
    } catch (error) {
      console.error('Error sending achievement notification:', error);
    }
  }

  // Core notification sender
  async sendNotification(subscription, payload) {
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload)
      );
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        // Subscription has expired or is invalid
        console.log('Removing invalid subscription');
        await this.removeInvalidSubscription(subscription);
      } else {
        throw error;
      }
    }
  }

  // Remove invalid subscriptions
  async removeInvalidSubscription(subscription) {
    try {
      await db.User.update(
        { push_subscription: null },
        { where: { push_subscription: subscription } }
      );
    } catch (error) {
      console.error('Error removing invalid subscription:', error);
    }
  }

  // Subscribe user to push notifications
  async subscribeUser(userId, subscription) {
    try {
      await db.User.update(
        { push_subscription: subscription },
        { where: { id: userId } }
      );
      
      // Send welcome notification
      const notification = {
        title: "🎮 Notifications Enabled!",
        body: "You'll now receive updates about your drafts and contests.",
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: {
          type: 'subscription_confirmed',
          timestamp: Date.now()
        }
      };
      
      await this.sendNotification(subscription, notification);
      
      return { success: true };
    } catch (error) {
      console.error('Error subscribing user:', error);
      throw error;
    }
  }

  // Unsubscribe user from push notifications
  async unsubscribeUser(userId) {
    try {
      await db.User.update(
        { push_subscription: null },
        { where: { id: userId } }
      );
      
      return { success: true };
    } catch (error) {
      console.error('Error unsubscribing user:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();

// backend/src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// Get VAPID public key for client
router.get('/vapid-public-key', (req, res) => {
  res.json({ 
    publicKey: process.env.VAPID_PUBLIC_KEY || null 
  });
});

// Subscribe to push notifications
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.userId;
    
    await notificationService.subscribeUser(userId, subscription);
    
    res.json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    await notificationService.unsubscribeUser(userId);
    
    res.json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Test notification (dev only)
router.post('/test', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Test notifications only available in development' });
  }
  
  try {
    const userId = req.user.userId;
    await notificationService.sendDraftTurnNotification(
      userId, 
      'Test Contest', 
      'test-room-123'
    );
    
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;