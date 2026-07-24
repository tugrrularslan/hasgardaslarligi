importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAtx-ToJxR-e_AfnjBlrydMJsXBXaCF5U0",
  authDomain: "has-gardaslar-ligi.firebaseapp.com",
  projectId: "has-gardaslar-ligi",
  storageBucket: "has-gardaslar-ligi.firebasestorage.app",
  messagingSenderId: "833768082962",
  appId: "1:833768082962:web:139f75589ebf468f3252cb",
});

firebase.messaging();

/*
  Sunucu FCM mesajlarını `notification` alanıyla gönderiyor. Firebase,
  uygulama arka plandayken bu bildirimi otomatik olarak gösterir.
  Burada ayrıca showNotification çağırmak aynı bildirimin iki kez
  görünmesine neden olur; bu yüzden manuel arka plan gösterimi yoktur.
*/

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.targetUrl || "/";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (windowClients) => {
        for (const client of windowClients) {
          if (client.url === absoluteUrl && "focus" in client) {
            return client.focus();
          }
        }

        return clients.openWindow(absoluteUrl);
      }
    )
  );
});
