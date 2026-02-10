const express = require('express');
const router = express.Router();
const PushNotificationService = require('../services/PushNotificationService');
const authMiddleware = require('../middleware/auth');

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
    const userId = req.user.userId || req.user.id;
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await PushNotificationService.subscribe(userId, subscription);
    res.json({ success: true });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user.userId || req.user.id;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint required' });
    }

    await PushNotificationService.unsubscribe(userId, endpoint);
    res.json({ success: true });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});
// Test route - send yourself a notification
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await PushNotificationService.sendToUser(
      userId,
      '🏈 Test Notification',
      'Push notifications are working!',
      { type: 'test' }
    );
    res.json({ success: true, sent: result.sent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;