// frontend/src/hooks/usePushNotifications.js
import { useState, useEffect, useCallback } from 'react';

export const usePushNotifications = (user) => {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState('default');

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported && Notification.permission) {
      setPermissionState(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (isSupported && user) {
      checkSubscription();
    }
  }, [isSupported, user]);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
      setIsSubscribed(!!sub);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const subscribe = async () => {
    if (!isSupported || !user) return false;

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== 'granted') {
        throw new Error('Permission denied');
      }

      // Get VAPID public key
      const response = await fetch('http://localhost:5000/api/notifications/vapid-public-key');
      const { publicKey } = await response.json();

      if (!publicKey) {
        console.warn('VAPID public key not available - push notifications disabled');
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push notifications
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to backend
      const token = localStorage.getItem('token');
      const saveResponse = await fetch('http://localhost:5000/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subscription: sub })
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save subscription');
      }

      setSubscription(sub);
      setIsSubscribed(true);

      // Show success notification
      new Notification('Notifications Enabled!', {
        body: 'You\'ll now receive updates about your drafts and contests.',
        icon: '/logo192.png',
        badge: '/logo192.png'
      });

      return true;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      return false;
    }
  };

  const unsubscribe = async () => {
    if (!subscription || !user) return false;

    try {
      await subscription.unsubscribe();

      // Remove subscription from backend
      const token = localStorage.getItem('token');
      await fetch('http://localhost:5000/api/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setSubscription(null);
      setIsSubscribed(false);

      return true;
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      return false;
    }
  };

  const testNotification = async () => {
    if (!isSubscribed) return;

    try {
      const token = localStorage.getItem('token');
      await fetch('http://localhost:5000/api/notifications/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  };

  return {
    isSupported,
    isSubscribed,
    permissionState,
    subscribe,
    unsubscribe,
    testNotification
  };
};

// Helper function to convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}