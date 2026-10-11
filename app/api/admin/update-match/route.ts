import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  createNotificationScheduleVersion,
  deleteMatchReminderTasks,
  scheduleMatchReminderTasks,
} from "@/lib/cloud-tasks";

export const runtime = "nodejs";

type UpdateMatchBody = {
  matchId?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  kickoff?: unknown;
};

type ReminderTaskNames = {
  oneHourTaskName: string | null;
  predictionDeadlineTaskName: string | null;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function getReminderTaskNames(data: FirebaseFirestore.DocumentData) {
  return {
    oneHourTaskName:
      typeof data.oneHourTaskName === "string"
        ? data.oneHourTaskName
        : null,
    predictionDeadlineTaskName:
      typeof data.predictionDeadlineTaskName === "string"
        ? data.predictionDeadlineTaskName
        : null,
  } satisfies ReminderTaskNames;
}

function canEditMatch(data: FirebaseFirestore.DocumentData) {
  return (
    (data.status === "scheduled" || data.status === "finished") &&
    data.scoringStatus !== "processing" &&
    data.scoringStatus !== "failed"
  );
}

function isScheduledMatch(data: FirebaseFirestore.DocumentData) {
  return data.status === "scheduled";
}

function renameGoalEventTeams({
  goalEvents,
  previousHomeTeam,
  previousAwayTeam,
  homeTeam,
  awayTeam,
}: {
  goalEvents: unknown;
  previousHomeTeam: string;
  previousAwayTeam: string;
  homeTeam: string;
  awayTeam: string;
}) {
  if (!Array.isArray(goalEvents)) {
    return goalEvents;
  }

  return goalEvents.map((goalEvent) => {
    if (!goalEvent || typeof goalEvent !== "object") {
      return goalEvent;
    }

    const event = goalEvent as Record<string, unknown>;
    const team =
      event.team === previousHomeTeam
        ? homeTeam
        : event.team === previousAwayTeam
          ? awayTeam
          : event.team;

    return { ...event, team };
  });
}

export async function POST(request: NextRequest) {
  let newlyScheduledTasks: ReminderTaskNames | null = null;

  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Oturum bilgisi bulunamadı." },
        { status: 401 },
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const adminSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!adminSnapshot.exists || adminSnapshot.data()?.isAdmin !== true) {
      return NextResponse.json(
        {
          success: false,
          error: "Bu işlem için yönetici yetkisi gerekiyor.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as UpdateMatchBody;
    const matchId =
      typeof body.matchId === "string" ? body.matchId.trim() : "";
    const homeTeam =
      typeof body.homeTeam === "string" ? body.homeTeam.trim() : "";
    const awayTeam =
      typeof body.awayTeam === "string" ? body.awayTeam.trim() : "";
    const kickoffText =
      typeof body.kickoff === "string" ? body.kickoff : "";
    const kickoffDate = new Date(kickoffText);

    if (!matchId || matchId.length > 200) {
      return NextResponse.json(
        { success: false, error: "Geçerli bir maç seçilmedi." },
        { status: 400 },
      );
    }

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        {
          success: false,
          error: "Ev sahibi ve deplasman takımlarını gir.",
        },
        { status: 400 },
      );
    }

    if (
      homeTeam.toLocaleLowerCase("tr-TR") ===
      awayTeam.toLocaleLowerCase("tr-TR")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Bir takım kendisiyle maç yapamaz.",
        },
        { status: 400 },
      );
    }

    if (Number.isNaN(kickoffDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçerli bir maç tarihi ve saati seç.",
        },
        { status: 400 },
      );
    }

    const matchReference = adminDb.collection("matches").doc(matchId);
    const matchSnapshot = await matchReference.get();

    if (!matchSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Maç bulunamadı." },
        { status: 404 },
      );
    }

    if (!canEditMatch(matchSnapshot.data() ?? {})) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Puan hesaplanırken veya yarım kalmışken maç bilgileri değiştirilemez. Önce sonuç işlemini tamamla.",
        },
        { status: 409 },
      );
    }

    const initialMatchData = matchSnapshot.data() ?? {};
    const reschedulingReminders = isScheduledMatch(initialMatchData);

    if (reschedulingReminders && kickoffDate.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: "Planlanmış maçın tarihi gelecekte olmalı.",
        },
        { status: 400 },
      );
    }

    const notificationScheduleVersion = reschedulingReminders
      ? createNotificationScheduleVersion()
      : null;

    if (notificationScheduleVersion) {
      newlyScheduledTasks = await scheduleMatchReminderTasks({
        matchId,
        kickoff: kickoffDate,
        scheduleVersion: notificationScheduleVersion,
      });
    }

    let previousTasks: ReminderTaskNames | null = null;

    try {
      previousTasks = await adminDb.runTransaction(async (transaction) => {
        const currentMatchSnapshot = await transaction.get(matchReference);

        if (!currentMatchSnapshot.exists) {
          throw new Error("Maç bulunamadı.");
        }

        const currentMatchData = currentMatchSnapshot.data() ?? {};

        if (!canEditMatch(currentMatchData)) {
          throw new Error(
            "Maç puanlanırken düzenleme yapılamaz. Sayfayı yenileyip tekrar dene.",
          );
        }

        const currentlyScheduled = isScheduledMatch(currentMatchData);

        if (currentlyScheduled !== reschedulingReminders) {
          throw new Error(
            "Maç durumu değişti. Sayfayı yenileyip tekrar dene.",
          );
        }

        const previousHomeTeam =
          typeof currentMatchData.homeTeam === "string"
            ? currentMatchData.homeTeam
            : "Ev sahibi";
        const previousAwayTeam =
          typeof currentMatchData.awayTeam === "string"
            ? currentMatchData.awayTeam
            : "Deplasman";
        const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
          homeTeam,
          awayTeam,
          kickoff: Timestamp.fromDate(kickoffDate),
          predictionDeadline: Timestamp.fromDate(
            new Date(kickoffDate.getTime() - 5 * 60 * 1000),
          ),
          updatedBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (Array.isArray(currentMatchData.goalEvents)) {
          updates.goalEvents = renameGoalEventTeams({
            goalEvents: currentMatchData.goalEvents,
            previousHomeTeam,
            previousAwayTeam,
            homeTeam,
            awayTeam,
          });
        }

        if (currentlyScheduled) {
          const existingTasks = getReminderTaskNames(currentMatchData);
          updates.notificationScheduleVersion = notificationScheduleVersion;
          updates.oneHourTaskName = newlyScheduledTasks!.oneHourTaskName;
          updates.predictionDeadlineTaskName =
            newlyScheduledTasks!.predictionDeadlineTaskName;
          updates.oneHourReminderSent = false;
          updates.oneHourReminderProcessing = false;
          updates.predictionDeadlineReminderSent = false;
          updates.predictionDeadlineReminderProcessing = false;
          updates.notificationTasksStatus = "scheduled";
          updates.notificationTasksScheduledAt = FieldValue.serverTimestamp();
          updates.notificationTasksLastError = FieldValue.delete();
          updates.notificationTasksLastErrorAt = FieldValue.delete();
          updates.notificationTasksCleanupWarning = FieldValue.delete();

          transaction.update(matchReference, updates);
          return existingTasks;
        }

        transaction.update(matchReference, updates);

        return null;
      });
    } catch (error) {
      if (newlyScheduledTasks) {
        await deleteMatchReminderTasks(newlyScheduledTasks).catch(
          (cleanupError) => {
            console.warn(
              "Düzenleme kaydedilemeyince yeni bildirim görevleri temizlenemedi:",
              cleanupError,
            );
          },
        );
      }
      newlyScheduledTasks = null;
      throw error;
    }

    const cleanupResults = previousTasks
      ? await Promise.allSettled([deleteMatchReminderTasks(previousTasks)])
      : [];
    const taskCleanupWarning = cleanupResults.some(
      (result) => result.status === "rejected",
    );

    if (taskCleanupWarning) {
      console.warn(
        "Eski maç bildirim görevleri silinemedi; sürüm doğrulaması nedeniyle güvenle atlanacak.",
      );
      await matchReference
        .update({
          notificationTasksCleanupWarning:
            "Eski bildirim görevi silinemedi; güncel zaman bilgisiyle uyuşmadığı için gönderim yapılmayacak.",
          updatedAt: FieldValue.serverTimestamp(),
        })
        .catch((warningUpdateError) => {
          console.warn(
            "Bildirim görevi temizleme uyarısı maç kaydına yazılamadı:",
            warningUpdateError,
          );
        });
    }

    return NextResponse.json({
      success: true,
      message: reschedulingReminders
        ? taskCleanupWarning
          ? "Maç güncellendi. Eski bildirim görevi silinemedi ancak yeni zamanla uyuşmadığı için gönderim yapmayacak."
          : "Maç güncellendi ve bildirim saatleri yeni maç saatine göre yenilendi."
        : "Sonuçlanmış maç güncellendi; skor, tahminler ve hesaplanmış puanlar korundu.",
      predictionDeadline: new Date(
        kickoffDate.getTime() - 5 * 60 * 1000,
      ).toISOString(),
      taskCleanupWarning,
    });
  } catch (error) {
    console.error("Maç güncelleme API hatası:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Maç güncellenemedi.",
      },
      { status: 500 },
    );
  }
}
