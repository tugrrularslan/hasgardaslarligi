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
    data.status === "scheduled" &&
    data.pointsCalculated !== true &&
    data.scoringStatus !== "processing"
  );
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

    if (kickoffDate.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: "Maç tarihi gelecekte olmalı.",
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
            "Sonuçlanmış veya puanlanmakta olan maçın tarihini ya da takımlarını değiştiremezsin.",
        },
        { status: 409 },
      );
    }

    const notificationScheduleVersion =
      createNotificationScheduleVersion();

    newlyScheduledTasks = await scheduleMatchReminderTasks({
      matchId,
      kickoff: kickoffDate,
      scheduleVersion: notificationScheduleVersion,
    });

    let previousTasks: ReminderTaskNames;

    try {
      previousTasks = await adminDb.runTransaction(async (transaction) => {
        const currentMatchSnapshot = await transaction.get(matchReference);

        if (!currentMatchSnapshot.exists) {
          throw new Error("Maç bulunamadı.");
        }

        const currentMatchData = currentMatchSnapshot.data() ?? {};

        if (!canEditMatch(currentMatchData)) {
          throw new Error(
            "Maç sonuçlanırken düzenleme yapılamaz. Sayfayı yenileyip tekrar dene.",
          );
        }

        const existingTasks = getReminderTaskNames(currentMatchData);

        transaction.update(matchReference, {
          homeTeam,
          awayTeam,
          kickoff: Timestamp.fromDate(kickoffDate),
          predictionDeadline: Timestamp.fromDate(
            new Date(kickoffDate.getTime() - 5 * 60 * 1000),
          ),
          notificationScheduleVersion,
          oneHourTaskName: newlyScheduledTasks!.oneHourTaskName,
          predictionDeadlineTaskName:
            newlyScheduledTasks!.predictionDeadlineTaskName,
          oneHourReminderSent: false,
          oneHourReminderProcessing: false,
          predictionDeadlineReminderSent: false,
          predictionDeadlineReminderProcessing: false,
          notificationTasksStatus: "scheduled",
          notificationTasksScheduledAt: FieldValue.serverTimestamp(),
          notificationTasksLastError: FieldValue.delete(),
          notificationTasksLastErrorAt: FieldValue.delete(),
          notificationTasksCleanupWarning: FieldValue.delete(),
          updatedBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return existingTasks;
      });
    } catch (error) {
      await deleteMatchReminderTasks(newlyScheduledTasks).catch(
        (cleanupError) => {
          console.warn(
            "Düzenleme kaydedilemeyince yeni bildirim görevleri temizlenemedi:",
            cleanupError,
          );
        },
      );
      newlyScheduledTasks = null;
      throw error;
    }

    const cleanupResults = await Promise.allSettled([
      deleteMatchReminderTasks(previousTasks),
    ]);
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
      message: taskCleanupWarning
        ? "Maç güncellendi. Eski bildirim görevi silinemedi ancak yeni zamanla uyuşmadığı için gönderim yapmayacak."
        : "Maç güncellendi ve bildirim saatleri yeni maç saatine göre yenilendi.",
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
