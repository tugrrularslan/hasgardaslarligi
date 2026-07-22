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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};

  self.registration.showNotification(notification.title || "Has Gardaşlar Ligi", {
    body: notification.body || "",
    icon: "/icon-192.png",
    data: payload.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.targetUrl || "/";

  event.waitUntil(
    clients.openWindow(url)
  );
});