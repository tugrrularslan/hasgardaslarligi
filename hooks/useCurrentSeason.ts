"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DEFAULT_SEASON_ID,
  DEFAULT_SEASON_NAME,
  type SeasonSettings,
} from "@/lib/season";

export function useCurrentSeason() {
  const [season, setSeason] = useState<SeasonSettings>({
    seasonId: DEFAULT_SEASON_ID,
    name: DEFAULT_SEASON_NAME,
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "currentSeason"),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setSeason({
          seasonId:
            typeof data.seasonId === "string" && data.seasonId.trim()
              ? data.seasonId.trim()
              : DEFAULT_SEASON_ID,
          name:
            typeof data.name === "string" && data.name.trim()
              ? data.name.trim()
              : DEFAULT_SEASON_NAME,
        });
      },
      (error) => {
        console.error("Sezon bilgisi alınamadı:", error);
      }
    );

    return unsubscribe;
  }, []);

  return season;
}
