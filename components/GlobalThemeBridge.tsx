"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeThemeId, type ThemeId } from "@/lib/themes";

const themeClasses = [
  "global-theme-obsidyen",
  "global-theme-hitit-zeytini",
  "global-theme-traverten",
  "global-theme-bazalt",
];

function applyTheme(themeId: ThemeId) {
  document.body.classList.remove(...themeClasses);
  document.body.classList.add(`global-theme-${themeId}`);
  document.documentElement.dataset.theme = themeId;
}

export default function GlobalThemeBridge() {
  useEffect(() => {
    applyTheme("obsidyen");
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!user) {
        applyTheme("obsidyen");
        return;
      }

      unsubscribeProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          const selectedTheme = snapshot.exists()
            ? snapshot.data().selectedTheme
            : null;
          applyTheme(
            normalizeThemeId(
              typeof selectedTheme === "string" ? selectedTheme : null
            )
          );
        },
        () => applyTheme("obsidyen")
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  return null;
}
