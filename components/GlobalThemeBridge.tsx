"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  normalizeThemeId,
  themeAppColors,
  type ThemeId,
} from "@/lib/themes";

const STORAGE_KEY = "has-gardaslar-theme";
const themeClasses = [
  "global-theme-obsidyen",
  "global-theme-hitit-zeytini",
  "global-theme-traverten",
  "global-theme-bazalt",
];

function ensureLink(rel: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function applyThemeAppIdentity(themeId: ThemeId) {
  const encodedTheme = encodeURIComponent(themeId);
  const iconHref = `/api/theme-icon?theme=${encodedTheme}&size=192`;

  const faviconLinks = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]'
  );
  if (faviconLinks.length === 0) {
    const favicon = ensureLink("icon");
    favicon.href = iconHref;
    favicon.type = "image/png";
    favicon.sizes = "192x192";
  } else {
    faviconLinks.forEach((favicon) => {
      favicon.href = iconHref;
      favicon.type = "image/png";
      favicon.sizes = "192x192";
    });
  }

  const appleIcon = ensureLink("apple-touch-icon");
  appleIcon.href = `/api/theme-icon?theme=${encodedTheme}&size=180`;
  appleIcon.type = "image/png";
  appleIcon.sizes = "180x180";

  const manifest = ensureLink("manifest");
  manifest.href = `/api/theme-manifest?theme=${encodedTheme}`;
}

function applyTheme(themeId: ThemeId) {
  const colors = themeAppColors[themeId];

  document.body.classList.remove(...themeClasses);
  document.body.classList.add(`global-theme-${themeId}`);
  document.documentElement.dataset.theme = themeId;
  document.documentElement.style.backgroundColor = colors.backgroundColor;
  localStorage.setItem(STORAGE_KEY, themeId);
  applyThemeAppIdentity(themeId);

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = colors.themeColor;
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
