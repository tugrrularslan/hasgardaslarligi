"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

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

function showReminder(reminder: LocalReminder, kind: ReminderKind) {
  if (hasAlreadyShown(reminder, kind) || Notification.permission !== "granted") {
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
    const timers: number[] = [];
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || Notification.permission !== "granted") {
        return;
      }

      try {
        const matchesSnapshot = await getDocs(
          query(collection(db, "matches"), where("status", "==", "scheduled")),
        );

        if (cancelled) return;

        const reminders = matchesSnapshot.docs.flatMap((matchDocument) => {
          const data = matchDocument.data();
          const kickoff = data.kickoff;

          if (!(kickoff instanceof Timestamp)) {
            return [];
          }

          return [
            {
              id: matchDocument.id,
              kickoff: kickoff.toMillis(),
              homeTeam:
                typeof data.homeTeam === "string" ? data.homeTeam : "Ev sahibi",
              awayTeam:
                typeof data.awayTeam === "string" ? data.awayTeam : "Deplasman",
            } satisfies LocalReminder,
          ];
        });

        const addTimer = (timer: number) => timers.push(timer);

        reminders.forEach((reminder) => {
          scheduleReminder(
            reminder,
            "one-hour",
            reminder.kickoff - 60 * 60 * 1000,
            addTimer,
          );
          scheduleReminder(
            reminder,
            "deadline",
            reminder.kickoff - 15 * 60 * 1000,
            addTimer,
          );
        });
      } catch (error) {
        console.warn("Yerel maç hatırlatıcıları yüklenemedi:", error);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
}
