// v2 - iOS push fix
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

  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'BidBlitz', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: data.data || {},
    tag: data.tag || 'bidblitz-' + Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BidBlitz', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.tag);

  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

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
    url = data.url || '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (let client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
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
  console.log('Syncing drafts...');
}