"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { DEFAULT_SEASON_ID } from "@/lib/season";

const RECENT_REMINDER_WINDOW_MS = 5 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 6 * 60 * 60 * 1000;

type LocalReminder = {
  id: string;
  kickoff: number;
  homeTeam: string;
  awayTeam: string;
};

type ReminderKind = "one-hour" | "deadline";

function reminderKey(reminder: LocalReminder, kind: ReminderKind) {
  return `local-match-reminder:${reminder.id}:${kind}:${reminder.kickoff}`;
}

function hasAlreadyShown(reminder: LocalReminder, kind: ReminderKind) {
  try {
    return localStorage.getItem(reminderKey(reminder, kind)) === "shown";
  } catch {
    return false;
  }
}

function markAsShown(reminder: LocalReminder, kind: ReminderKind) {
  try {
    localStorage.setItem(reminderKey(reminder, kind), "shown");
  } catch {
    // Tarayıcı depolaması kapalıysa aynı bildirim bir sonraki açılışta tekrar
    // gösterilebilir; uygulamanın asıl işlevini etkilemez.
  }
}

function notificationPermissionGranted() {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

function showReminder(reminder: LocalReminder, kind: ReminderKind) {
  if (hasAlreadyShown(reminder, kind) || !notificationPermissionGranted()) {
    return;
  }

  const title =
    kind === "one-hour"
      ? "⏰ Maça 1 saat kaldı"
      : "🚨 Tahminler kapanıyor";
  const body =
    kind === "one-hour"
      ? `${reminder.homeTeam} - ${reminder.awayTeam} maçı 1 saat sonra başlayacak.`
      : `${reminder.homeTeam} - ${reminder.awayTeam} maçı için tahminlerin kapanmasına 10 dakika kaldı.`;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag: reminderKey(reminder, kind),
    });

    notification.onclick = () => {
      window.focus();
      window.location.assign("/predictions");
      notification.close();
    };
    markAsShown(reminder, kind);
  } catch (error) {
    console.warn("Yerel maç hatırlatıcısı gösterilemedi:", error);
  }
}

function scheduleReminder(
  reminder: LocalReminder,
  kind: ReminderKind,
  notificationTime: number,
  addTimer: (timer: number) => void,
) {
  const check = () => {
    const now = Date.now();

    if (now >= notificationTime) {
      if (now - notificationTime <= RECENT_REMINDER_WINDOW_MS) {
        showReminder(reminder, kind);
      }
      return;
    }

    addTimer(
      window.setTimeout(
        check,
        Math.min(notificationTime - now, MAX_TIMER_DELAY_MS),
      ),
    );
  };

  check();
}

/**
 * Ücretsiz plan için en iyi çaba hatırlatıcısıdır: yalnızca uygulama sekmesi
 * açıkken çalışır. Zamanlanmış bir sunucu işi veya Cloud Tasks oluşturmaz.
 */
export default function LocalMatchReminder() {
  useEffect(() => {
    let stopSession = () => {};
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      stopSession();
      stopSession = () => {};
      if (!user) return;

      let stopPublications = () => {};
      const weekSubscriptions = new Map<number, () => void>();
      const clearWeeks = () => {
        weekSubscriptions.forEach((stop) => stop());
        weekSubscriptions.clear();
      };
      const stopSeason = onSnapshot(doc(db, "settings", "currentSeason"), (seasonSnapshot) => {
        stopPublications();
        clearWeeks();
        const value = seasonSnapshot.data()?.seasonId;
        const seasonId = typeof value === "string" && value.trim()
          ? value.trim() : DEFAULT_SEASON_ID;

        stopPublications = onSnapshot(
          query(collection(db, "publishedWeeks"), where("seasonId", "==", seasonId)),
          (publicationSnapshot) => {
            const publishedWeeks = new Set<number>();
            publicationSnapshot.docs.forEach((publication) => {
              const data = publication.data();
              if (data.published === true && Number.isInteger(data.week) && data.week > 0) {
                publishedWeeks.add(data.week);
              }
            });
            weekSubscriptions.forEach((stop, week) => {
              if (!publishedWeeks.has(week)) {
                stop();
                weekSubscriptions.delete(week);
              }
            });
            publishedWeeks.forEach((week) => {
              if (weekSubscriptions.has(week)) return;
              let timers: number[] = [];
              const clearTimers = () => {
                timers.forEach((timer) => window.clearTimeout(timer));
                timers = [];
              };
              const stopMatches = onSnapshot(
                query(collection(db, "matches"), where("week", "==", week)),
                (matchesSnapshot) => {
                  clearTimers();
                  matchesSnapshot.docs.forEach((matchDocument) => {
                    const data = matchDocument.data();
                    const matchSeasonId = data.seasonId || DEFAULT_SEASON_ID;
                    if (matchSeasonId !== seasonId || data.status !== "scheduled" ||
                        !(data.kickoff instanceof Timestamp)) return;
                    const reminder: LocalReminder = {
                      id: matchDocument.id,
                      kickoff: data.kickoff.toMillis(),
                      homeTeam: typeof data.homeTeam === "string" ? data.homeTeam : "Ev sahibi",
                      awayTeam: typeof data.awayTeam === "string" ? data.awayTeam : "Deplasman",
                    };
                    const addTimer = (timer: number) => timers.push(timer);
                    scheduleReminder(reminder, "one-hour", reminder.kickoff - 60 * 60 * 1000, addTimer);
                    scheduleReminder(reminder, "deadline", reminder.kickoff - 15 * 60 * 1000, addTimer);
                  });
                },
                (error) => {
                  clearTimers();
                  console.warn("Maç hatırlatıcıları güncellenemedi:", error);
                },
              );
              weekSubscriptions.set(week, () => { stopMatches(); clearTimers(); });
            });
          },
          (error) => {
            clearWeeks();
            console.warn("Yayınlanmış haftalar alınamadı:", error);
          },
        );
      }, (error) => {
        stopPublications();
        clearWeeks();
        console.warn("Aktif sezon alınamadı:", error);
      });
      stopSession = () => { stopSeason(); stopPublications(); clearWeeks(); };
    });

    return () => { unsubscribe(); stopSession(); };
  }, []);

  return null;
}
