const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export async function initPushNotifications(token) {
  // Check if push is supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return { supported: false };
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered');

    // Get VAPID public key from backend
    const response = await fetch(`${API_URL}/api/notifications/vapid-public-key`);
    const { publicKey } = await response.json();
    
    if (!publicKey) {
      console.log('VAPID key not configured');
      return { supported: true, subscribed: false };
    }

    // Check current permission
    const permission = Notification.permission;
    
    if (permission === 'denied') {
      console.log('Notifications blocked by user');
      return { supported: true, subscribed: false, blocked: true };
    }

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      console.log('Already subscribed to push');
      return { supported: true, subscribed: true, subscription };
    }

    return { supported: true, subscribed: false, registration, publicKey };
  } catch (error) {
    console.error('Push init error:', error);
    return { supported: false, error };
  }
}

export async function subscribeToPush(token) {
  try {
    const init = await initPushNotifications(token);
    
    if (!init.supported || init.subscribed) {
      return init;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return { supported: true, subscribed: false, blocked: true };
    }

    // Subscribe to push
    const subscription = await init.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(init.publicKey)
    });

    // Send subscription to backend
    await fetch(`${API_URL}/api/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });

    console.log('Push subscription successful');
    return { supported: true, subscribed: true, subscription };
  } catch (error) {
    console.error('Push subscribe error:', error);
    return { supported: true, subscribed: false, error };
  }
}

export async function unsubscribeFromPush(token) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      
      await fetch(`${API_URL}/api/notifications/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return { success: false, error };
  }
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}