"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeThemeId, type ThemeId } from "@/lib/themes";

const STORAGE_KEY = "has-gardaslar-theme";
const themeClasses = [
  "global-theme-obsidyen",
  "global-theme-hitit-zeytini",
  "global-theme-traverten",
  "global-theme-bazalt",
];

const themeColors: Record<ThemeId, string> = {
  obsidyen: "#07080a",
  "hitit-zeytini": "#101506",
  traverten: "#dcc299",
  bazalt: "#0b0c0e",
};

function applyTheme(themeId: ThemeId) {
  document.body.classList.remove(...themeClasses);
  document.body.classList.add(`global-theme-${themeId}`);
  document.documentElement.dataset.theme = themeId;
  document.documentElement.style.backgroundColor = themeColors[themeId];
  localStorage.setItem(STORAGE_KEY, themeId);

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = themeColors[themeId];
}

export default function GlobalThemeBridge() {
  useEffect(() => {
    const storedTheme = normalizeThemeId(localStorage.getItem(STORAGE_KEY));
    applyTheme(storedTheme);

    let unsubscribeProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!user) return;

      unsubscribeProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          const selectedTheme = snapshot.exists() ? snapshot.data().selectedTheme : null;
          applyTheme(normalizeThemeId(typeof selectedTheme === "string" ? selectedTheme : null));
        },
        () => applyTheme(storedTheme)
      );
    });

    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) applyTheme(normalizeThemeId(event.newValue));
    };
    window.addEventListener("storage", syncAcrossTabs);

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
      window.removeEventListener("storage", syncAcrossTabs);
    };
  }, []);

  return null;
}
