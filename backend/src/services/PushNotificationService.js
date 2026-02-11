// backend/src/services/PushNotificationService.js
const webpush = require('web-push');
const db = require('../models');

// Initialize VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_EMAIL || 'admin@bidblitz.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('✅ VAPID configured for push notifications');
} else {
  console.warn('⚠️ VAPID keys not configured. Push notifications disabled.');
}

class PushNotificationService {

  /**
   * Subscribe a user's device to push notifications
   */
  static async subscribe(userId, subscription) {
    if (!userId || !subscription?.endpoint || !subscription?.keys) {
      throw new Error('Invalid subscription data');
    }

    // Upsert: update if endpoint exists, create if not
    const [sub, created] = await db.PushSubscription.findOrCreate({
      where: {
        user_id: userId,
        endpoint: subscription.endpoint
      },
      defaults: {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });

    if (!created) {
      await sub.update({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      });
    }

    console.log(`📱 Push subscription ${created ? 'created' : 'updated'} for user ${userId}`);
    return { success: true, created };
  }

  /**
   * Unsubscribe a device
   */
  static async unsubscribe(userId, endpoint) {
    const deleted = await db.PushSubscription.destroy({
      where: { user_id: userId, endpoint }
    });
    console.log(`📱 Removed ${deleted} subscription(s) for user ${userId}`);
    return { success: true, deleted };
  }

  /**
   * Send push notification to a specific user (all their devices)
   */
  static async sendToUser(userId, title, body, data = {}) {
    try {
      // FIX: Guard against undefined/null userId
      if (!userId) {
        console.error('📱 sendToUser called with undefined userId, skipping');
        return { sent: 0 };
      }

      const subscriptions = await db.PushSubscription.findAll({
        where: { user_id: userId }
      });

      if (!subscriptions || subscriptions.length === 0) {
        return { sent: 0 };
      }

      const payload = JSON.stringify({ title, body, data });
      let sent = 0;

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          }, payload);
          sent++;
        } catch (error) {
          // Subscription expired or invalid - remove it
          if (error.statusCode === 410 || error.statusCode === 404 || error.statusCode === 403 || error.statusCode >= 400) {
            await sub.destroy();
            console.log(`🗑️ Removed bad subscription for user ${userId} (status: ${error.statusCode})`);
          } else {
            console.error(`Push failed for ${userId}:`, error.message);
          }
        }
      }

      console.log(`📤 Sent push to ${sent}/${subscriptions.length} devices for user ${userId}`);
      return { sent };
    } catch (error) {
      console.error('Error sending push:', error);
      return { sent: 0 };
    }
  }

  /**
   * Send push to multiple users
   */
  static async sendToUsers(userIds, title, body, data = {}) {
    // Filter out any undefined/null userIds
    const validIds = userIds.filter(id => !!id);
    if (validIds.length === 0) return 0;

    const results = await Promise.all(
      validIds.map(userId => this.sendToUser(userId, title, body, data))
    );
    return results.reduce((sum, r) => sum + r.sent, 0);
  }

  /**
   * Notify all participants that draft is starting
   * Accepts either:
   *   - Array of userId strings: ['abc-123', 'def-456']
   *   - Array of entry objects:  [{ userId: 'abc-123' }, { userId: 'def-456' }]
   */
  static async notifyDraftStarting(roomId, participants) {
    // FIX: Handle both string arrays and object arrays
    const userIds = participants.map(p => {
      if (typeof p === 'string') return p;
      return p.userId || p.user_id || p.id;
    }).filter(id => !!id);

    const sent = await this.sendToUsers(
      userIds,
      '🏈 Draft Starting!',
      'Your draft room is full. Get ready to pick!',
      { type: 'draft_starting', roomId }
    );
    console.log(`📢 Draft starting notification sent to ${sent} devices`);
  }

  /**
   * Notify a user it's their turn to pick.
   * 
   * CRITICAL: Only sends push if the user is NOT currently viewing THIS specific draft room.
   * A user in Draft A should still get notified about Draft B.
   * 
   * @param {string} userId 
   * @param {string} roomId 
   * @param {number} timeLimit 
   * @param {object} io - Socket.IO server instance (optional)
   */
  static async notifyYourTurn(userId, roomId, timeLimit, io) {
    if (!userId) {
      console.error('📱 notifyYourTurn called with undefined userId, skipping');
      return;
    }

    // FIX: Check if user is connected to THIS SPECIFIC room, not just any room
    if (io) {
      try {
        const socketRoomId = `room_${roomId}`;
        const socketsInRoom = await io.in(socketRoomId).fetchSockets();
        const userInThisRoom = socketsInRoom.some(s => s.userId === userId);

        if (userInThisRoom) {
          console.log(`📱 Skipping push for user ${userId} - already connected to ${socketRoomId}`);
          return;
        } else {
          console.log(`📱 User ${userId} NOT in ${socketRoomId} (${socketsInRoom.length} sockets in room) - sending push`);
        }
      } catch (err) {
        // If socket check fails, send the notification anyway
        console.warn('📱 Socket room check failed, sending push anyway:', err.message);
      }
    }

    const result = await this.sendToUser(
      userId,
      '⏰ Your Turn!',
      `It's your turn to pick! You have ${timeLimit} seconds.`,
      { type: 'your_turn', roomId, url: `/draft/${roomId}` }
    );

    if (result.sent > 0) {
      console.log(`📱 Your-turn push sent to ${result.sent} device(s) for user ${userId}`);
    }
  }
}

module.exports = PushNotificationService;