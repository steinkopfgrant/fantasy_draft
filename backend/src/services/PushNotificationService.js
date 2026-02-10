const webpush = require('web-push');
const db = require('../models');

// Configure web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@bidblitz.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push configured');
} else {
  console.log('⚠️ VAPID keys not configured - push notifications disabled');
}

class PushNotificationService {
  
  /**
   * Save a user's push subscription
   */
  static async subscribe(userId, subscription) {
    try {
      const { endpoint, keys } = subscription;
      
      await db.PushSubscription.upsert({
        user_id: userId,
        endpoint: endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth
      });
      
      console.log(`📱 Push subscription saved for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('Error saving push subscription:', error);
      throw error;
    }
  }

  /**
   * Remove a user's push subscription
   */
  static async unsubscribe(userId, endpoint) {
    try {
      await db.PushSubscription.destroy({
        where: { user_id: userId, endpoint }
      });
      console.log(`📱 Push subscription removed for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('Error removing push subscription:', error);
      throw error;
    }
  }

  /**
   * Send push to a single user
   */
  static async sendToUser(userId, title, body, data = {}) {
    try {
      const subscriptions = await db.PushSubscription.findAll({
        where: { user_id: userId }
      });

      if (subscriptions.length === 0) {
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
          if (error.statusCode === 410 || error.statusCode === 404) {
            await sub.destroy();
            console.log(`🗑️ Removed expired subscription for user ${userId}`);
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
    const results = await Promise.all(
      userIds.map(userId => this.sendToUser(userId, title, body, data))
    );
    return results.reduce((sum, r) => sum + r.sent, 0);
  }

  /**
   * Notify all participants that draft is starting
   */
  static async notifyDraftStarting(roomId, participants) {
    const userIds = participants.map(p => p.userId);
    const sent = await this.sendToUsers(
      userIds,
      '🏈 Draft Starting!',
      'Your draft room is full. Get ready to pick!',
      { type: 'draft_starting', roomId }
    );
    console.log(`📢 Draft starting notification sent to ${sent} devices`);
  }

  /**
   * Notify a user it's their turn to pick
   */
  static async notifyYourTurn(userId, roomId, timeLimit) {
    await this.sendToUser(
      userId,
      '⏰ Your Turn!',
      `It's your turn to pick. You have ${timeLimit} seconds.`,
      { type: 'your_turn', roomId }
    );
  }
}

module.exports = PushNotificationService;