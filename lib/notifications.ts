import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { db, getFirebaseMessaging } from "@/lib/firebase";

const VAPID_KEY =
  "BOBK_nvbYZWErMkPDmD5xnQTJlhZirMwdcpZKkdUcu_xJ8Iu_-yWPzTm7aOXAiNZzOB1ESvauujQkOfE7SLfcF4";

export async function enableNotifications(
  userId: string
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Bildirimler yalnızca tarayıcıda açılabilir.");
  }

  if (!("Notification" in window)) {
    throw new Error("Bu tarayıcı bildirimleri desteklemiyor.");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Bu tarayıcı servis çalışanını desteklemiyor.");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Bildirim izni verilmedi.");
  }

  const messaging = await getFirebaseMessaging();

  if (!messaging) {
    throw new Error("Bu cihaz Firebase bildirimlerini desteklemiyor.");
  }

  const serviceWorkerRegistration =
    await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration,
  });

  if (!token) {
    throw new Error("Cihaz bildirim anahtarı alınamadı.");
  }

  await setDoc(
    doc(db, "notificationTokens", token),
    {
      token,
      userId,
      enabled: true,
      platform: navigator.platform || "unknown",
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return token;
}