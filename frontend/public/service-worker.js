// frontend/public/service-worker.js
/* eslint-disable no-restricted-globals */

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated.');
  event.waitUntil(clients.claim());
});

// Push event
self.addEventListener('push', (event) => {
  console.log('Push notification received');
  
  if (!event.data) {
    console.log('No data in push notification');
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/logo192.png',
    badge: data.badge || '/logo192.png',
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data,
    actions: data.actions || [],
    tag: data.tag,
    renotify: data.renotify || false,
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    timestamp: data.timestamp || Date.now()
  };

  if (data.image) {
    options.image = data.image;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.tag);
  
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Handle action clicks
  if (event.action) {
    switch (event.action) {
      case 'draft':
      case 'join':
        url = data.url || `/draft/${data.roomId}`;
        break;
      default:
        url = data.url || '/';
    }
  } else {
    // Default click behavior
    url = data.url || '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if needed
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Background sync for offline functionality
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-drafts') {
    event.waitUntil(syncDrafts());
  }
});

async function syncDrafts() {
  // Implement background sync logic here
  console.log('Syncing drafts...');
}