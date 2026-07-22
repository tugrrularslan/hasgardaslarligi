"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { enableNotifications } from "@/lib/notifications";

export default function NotificationInitializer() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        const alreadyAsked = localStorage.getItem(
          "notificationPermissionAsked"
        );

        if (alreadyAsked === "true") {
          return;
        }

        await enableNotifications(user.uid);

        localStorage.setItem(
          "notificationPermissionAsked",
          "true"
        );

        console.log("Bildirimler başarıyla etkinleştirildi.");
      } catch (error) {
        console.error("Bildirim izni alınamadı:", error);
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
}