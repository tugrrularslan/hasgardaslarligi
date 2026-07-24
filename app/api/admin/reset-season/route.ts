import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { deleteMatchReminderTasks } from "@/lib/cloud-tasks";
import { DEFAULT_BADGE_PROGRESS } from "@/lib/achievements";
import {
  DEFAULT_SEASON_ID,
  DEFAULT_SEASON_NAME,
} from "@/lib/season";
import { getSeasonResetConfirmation } from "@/lib/admin-reset";

type ResetSeasonBody = {
  confirmation?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as ResetSeasonBody;
    const confirmation =
      typeof body.confirmation === "string"
        ? body.confirmation
        : "";

    const seasonSnapshot = await adminDb
      .collection("settings")
      .doc("currentSeason")
      .get();

    const seasonData = seasonSnapshot.data();
    const activeSeasonId =
      typeof seasonData?.seasonId === "string" &&
      seasonData.seasonId.trim()
        ? seasonData.seasonId.trim()
        : DEFAULT_SEASON_ID;
    const activeSeasonName =
      typeof seasonData?.name === "string" &&
      seasonData.name.trim()
        ? seasonData.name.trim()
        : DEFAULT_SEASON_NAME;

    const expectedConfirmation =
      getSeasonResetConfirmation(activeSeasonId);

    if (confirmation !== expectedConfirmation) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Onay metni aktif sezon için gereken metinle eşleşmiyor.",
        },
        { status: 400 }
      );
    }

    const [
      matchesSnapshot,
      predictionsSnapshot,
      championsSnapshot,
      usersSnapshot,
      automaticEventsSnapshot,
      notificationsSnapshot,
    ] = await Promise.all([
      adminDb.collection("matches").get(),
      adminDb.collection("predictions").get(),
      adminDb.collection("weeklyChampions").get(),
      adminDb.collection("users").get(),
      adminDb.collection("automaticNotificationEvents").get(),
      adminDb.collection("notifications").get(),
    ]);

    const seasonMatches = matchesSnapshot.docs.filter(
      (matchDocument) => {
        const matchData = matchDocument.data();

        return (
          matchData.seasonId === activeSeasonId ||
          (!matchData.seasonId &&
            activeSeasonId === DEFAULT_SEASON_ID)
        );
      }
    );

    const matchIds = new Set(
      seasonMatches.map((matchDocument) => matchDocument.id)
    );

    const seasonPredictions = predictionsSnapshot.docs.filter(
      (predictionDocument) =>
        typeof predictionDocument.data().matchId === "string" &&
        matchIds.has(predictionDocument.data().matchId)
    );

    const seasonChampions = championsSnapshot.docs.filter(
      (championDocument) => {
        const championData = championDocument.data();

        return (
          championData.seasonId === activeSeasonId ||
          championDocument.id.startsWith(`${activeSeasonId}_`)
        );
      }
    );

    const seasonAutomaticEvents =
      automaticEventsSnapshot.docs.filter((eventDocument) => {
        const eventData = eventDocument.data();

        return (
          typeof eventData.matchId === "string" &&
          matchIds.has(eventData.matchId)
        );
      });

    const seasonNotifications =
      notificationsSnapshot.docs.filter((notificationDocument) => {
        const notificationData = notificationDocument.data();

        return (
          typeof notificationData.matchId === "string" &&
          matchIds.has(notificationData.matchId)
        );
      });

    const taskCleanupResults = await Promise.allSettled(
      seasonMatches.map((matchDocument) => {
        const matchData = matchDocument.data();

        return deleteMatchReminderTasks({
          oneHourTaskName:
            typeof matchData.oneHourTaskName === "string"
              ? matchData.oneHourTaskName
              : null,
          predictionDeadlineTaskName:
            typeof matchData.predictionDeadlineTaskName === "string"
              ? matchData.predictionDeadlineTaskName
              : null,
        });
      })
    );
    const taskCleanupWarnings = taskCleanupResults.filter(
      (result) => result.status === "rejected"
    ).length;

    taskCleanupResults.forEach((result) => {
      if (result.status === "rejected") {
        console.warn(
          "Bildirim görevi silinemedi; maç silindikten sonra görev güvenli biçimde atlanacak:",
          result.reason
        );
      }
    });

    const writer = adminDb.bulkWriter();

    seasonPredictions.forEach((document) =>
      writer.delete(document.ref)
    );
    seasonChampions.forEach((document) =>
      writer.delete(document.ref)
    );
    seasonAutomaticEvents.forEach((document) =>
      writer.delete(document.ref)
    );
    seasonNotifications.forEach((document) =>
      writer.delete(document.ref)
    );
    seasonMatches.forEach((document) =>
      writer.delete(document.ref)
    );

    usersSnapshot.docs.forEach((userDocument) => {
      const userData = userDocument.data();
      const existingSeasonStats =
        userData.seasonStats &&
        typeof userData.seasonStats === "object"
          ? { ...userData.seasonStats }
          : {};

      delete existingSeasonStats[activeSeasonId];

      writer.update(userDocument.ref, {
        totalPoints: 0,
        correctPredictions: 0,
        weeklyWins: 0,
        seasonStats: existingSeasonStats,
        unlockedBadges: [],
        selectedBadges: [],
        activeTitle: "",
        badgeProgress: DEFAULT_BADGE_PROGRESS,
        badgesUpdatedAt: FieldValue.serverTimestamp(),
        seasonResetAt: FieldValue.serverTimestamp(),
        seasonResetBy: userId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await writer.close();

    return NextResponse.json({
      success: true,
      message: `${activeSeasonName} deneme verileri sıfırlandı.`,
      deleted: {
        matches: seasonMatches.length,
        predictions: seasonPredictions.length,
        weeklyChampions: seasonChampions.length,
        automaticEvents: seasonAutomaticEvents.length,
        notifications: seasonNotifications.length,
      },
      resetUsers: usersSnapshot.size,
      taskCleanupWarnings,
    });
  } catch (error) {
    console.error("Aktif sezon sıfırlama hatası:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Aktif sezon sıfırlanamadı.",
      },
      { status: 500 }
    );
  }
}
