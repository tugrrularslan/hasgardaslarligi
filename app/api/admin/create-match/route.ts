import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { scheduleMatchReminderTasks } from "@/lib/cloud-tasks";

type CreateMatchBody = {
  week?: unknown;
  seasonId?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  kickoff?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let matchReference:
    | FirebaseFirestore.DocumentReference
    | null = null;

  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Oturum bilgisi bulunamadı.",
        },
        { status: 401 }
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const userSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .get();

    if (
      !userSnapshot.exists ||
      userSnapshot.data()?.isAdmin !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Bu işlem için yönetici yetkisi gerekiyor.",
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateMatchBody;

    const week = Number(body.week);

    const seasonId =
      typeof body.seasonId === "string"
        ? body.seasonId.trim()
        : "";

    const homeTeam =
      typeof body.homeTeam === "string"
        ? body.homeTeam.trim()
        : "";

    const awayTeam =
      typeof body.awayTeam === "string"
        ? body.awayTeam.trim()
        : "";

    const kickoffText =
      typeof body.kickoff === "string"
        ? body.kickoff
        : "";

    const kickoffDate = new Date(kickoffText);

    if (!Number.isInteger(week) || week < 1) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçerli bir hafta numarası gir.",
        },
        { status: 400 }
      );
    }

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        {
          success: false,
          error: "Ev sahibi ve deplasman takımlarını gir.",
        },
        { status: 400 }
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
        { status: 400 }
      );
    }

    if (Number.isNaN(kickoffDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçerli bir maç tarihi ve saati seç.",
        },
        { status: 400 }
      );
    }

    if (kickoffDate.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: "Maç tarihi gelecekte olmalı.",
        },
        { status: 400 }
      );
    }

    matchReference = adminDb.collection("matches").doc();

    await matchReference.set({
      week,
      seasonId,
      homeTeam,
      awayTeam,
      kickoff: Timestamp.fromDate(kickoffDate),
      predictionDeadline: Timestamp.fromDate(
        new Date(kickoffDate.getTime() - 5 * 60 * 1000)
      ),
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      result: null,
      pointsCalculated: false,

      oneHourReminderSent: false,
      predictionDeadlineReminderSent: false,

      notificationTasksStatus: "creating",

      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const taskNames = await scheduleMatchReminderTasks({
      matchId: matchReference.id,
      kickoff: kickoffDate,
    });

    await matchReference.update({
      oneHourTaskName: taskNames.oneHourTaskName,
      predictionDeadlineTaskName:
        taskNames.predictionDeadlineTaskName,
      notificationTasksStatus: "scheduled",
      notificationTasksScheduledAt:
        FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Maç ve bildirim görevleri oluşturuldu.",
      matchId: matchReference.id,
      oneHourTaskName: taskNames.oneHourTaskName,
      predictionDeadlineTaskName:
        taskNames.predictionDeadlineTaskName,
    });
  } catch (error) {
    console.error("Maç oluşturma hatası:", error);

    if (matchReference) {
      try {
        await matchReference.update({
          notificationTasksStatus: "failed",
          notificationTasksError:
            error instanceof Error
              ? error.message
              : "Bilinmeyen Cloud Tasks hatası.",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        console.error(
          "Maç görev hata bilgisi kaydedilemedi:",
          updateError
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Maç oluşturulamadı.",
      },
      { status: 500 }
    );
  }
}