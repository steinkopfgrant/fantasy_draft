// Service Worker for Push Notifications

self.addEventListener('push', function(event) {
  if (!event.data) return;

  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: [
      { action: 'open', title: 'Open App' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const roomId = event.notification.data?.roomId;
  const urlToOpen = roomId ? `/draft/${roomId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Check if already on the correct draft page
            const clientPath = new URL(client.url).pathname;
            if (clientPath === urlToOpen) {
              // Already on correct page - just focus, don't reload
              console.log('Already on draft page, just focusing');
              return client.focus();
            }
            
            // On a different page - use postMessage for soft navigation
            // This tells the React app to navigate without full reload
            client.postMessage({
              type: 'NAVIGATE',
              url: urlToOpen
            });
            return client.focus();
          }
        }
        // No existing window - open new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});