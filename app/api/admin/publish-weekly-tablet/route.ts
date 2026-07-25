import { NextRequest, NextResponse } from "next/server";
import {
  DocumentReference,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {
  adminAuth,
  adminDb,
  adminMessaging,
} from "@/lib/firebase-admin";
import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";

type PublishWeeklyTabletBody = {
  week?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let eventReference:
    | FirebaseFirestore.DocumentReference
    | null = null;

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

    if (
      !adminSnapshot.exists ||
      adminSnapshot.data()?.isAdmin !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Bu işlem için yönetici yetkisi gerekiyor.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as PublishWeeklyTabletBody;
    const week = Number(body.week);

    if (!Number.isInteger(week) || week < 1) {
      return NextResponse.json(
        { success: false, error: "Geçerli bir hafta numarası gerekli." },
        { status: 400 },
      );
    }

    const [seasonSnapshot, weekMatchesSnapshot] = await Promise.all([
      adminDb.collection("settings").doc("currentSeason").get(),
      adminDb.collection("matches").where("week", "==", week).get(),
    ]);
    const seasonData = seasonSnapshot.data();
    const activeSeasonId =
      typeof seasonData?.seasonId === "string" &&
      seasonData.seasonId.trim()
        ? seasonData.seasonId.trim()
        : DEFAULT_SEASON_ID;
    const activeSeasonName =
      typeof seasonData?.name === "string" && seasonData.name.trim()
        ? seasonData.name.trim()
        : DEFAULT_SEASON_NAME;
    const weekMatches = weekMatchesSnapshot.docs.filter(
      (matchDocument) => {
        const matchData = matchDocument.data();

        return (
          matchData.seasonId === activeSeasonId ||
          (!matchData.seasonId &&
            activeSeasonId === DEFAULT_SEASON_ID)
        );
      },
    );

    if (weekMatches.length === 0) {
      return NextResponse.json({
        success: true,
        ready: false,
        sent: false,
        message: `${week}. haftaya ait maç bulunamadı.`,
      });
    }

    const unfinishedMatchCount = weekMatches.filter(
      (matchDocument) => {
        const matchData = matchDocument.data();

        return (
          matchData.status !== "finished" ||
          matchData.pointsCalculated !== true
        );
      },
    ).length;

    if (unfinishedMatchCount > 0) {
      return NextResponse.json({
        success: true,
        ready: false,
        sent: false,
        unfinishedMatchCount,
        message: "Haftanın Tableti için diğer maçlar bekleniyor.",
      });
    }

    const eventId = `weekly-tablet_${encodeURIComponent(
      activeSeasonId,
    )}_${week}`;
    eventReference = adminDb
      .collection("automaticNotificationEvents")
      .doc(eventId);

    const claimResult = await adminDb.runTransaction(
      async (transaction) => {
        const eventSnapshot =
          await transaction.get(eventReference!);

        if (eventSnapshot.exists) {
          const eventData = eventSnapshot.data();

          if (eventData?.status === "sent") {
            return "already-sent" as const;
          }

          const processingAt = eventData?.processingAt;
          const processingTime =
            processingAt instanceof Timestamp
              ? processingAt.toMillis()
              : 0;
          const leaseIsActive =
            eventData?.status === "processing" &&
            Date.now() - processingTime < 10 * 60 * 1000;

          if (leaseIsActive) {
            return "already-processing" as const;
          }
        }

        transaction.set(
          eventReference!,
          {
            seasonId: activeSeasonId,
            seasonName: activeSeasonName,
            week,
            notificationType: "weekly-tablet-ready",
            targetUrl: `/games/league-prediction/tablet?week=${week}`,
            status: "processing",
            processingAt: FieldValue.serverTimestamp(),
            attemptCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        return "send" as const;
      },
    );

    if (claimResult === "already-sent") {
      return NextResponse.json({
        success: true,
        ready: true,
        sent: false,
        alreadySent: true,
        message: "Haftanın Tableti bildirimi daha önce gönderilmiş.",
      });
    }

    if (claimResult === "already-processing") {
      return NextResponse.json({
        success: true,
        ready: true,
        sent: false,
        processing: true,
        message: "Haftanın Tableti bildirimi gönderiliyor.",
      });
    }

    const title = `📜 ${week}. Haftanın Tableti hazır`;
    const messageBody =
      "Haftanın şampiyonunu, en zor maçı, yükselen gardaşı ve kişisel sonucunu gör!";
    const targetUrl =
      `/games/league-prediction/tablet?week=${week}`;
    const tokenSnapshot = await adminDb
      .collection("notificationTokens")
      .where("enabled", "==", true)
      .get();
    const tokenRecords = Array.from(
      new Map(
        tokenSnapshot.docs
          .map((tokenDocument) => {
            const token = tokenDocument.data().token;

            return typeof token === "string" && token.trim()
              ? [
                  token.trim(),
                  {
                    token: token.trim(),
                    reference: tokenDocument.ref,
                  },
                ] as const
              : null;
          })
          .filter(
            (
              record,
            ): record is readonly [
              string,
              {
                token: string;
                reference: DocumentReference;
              },
            ] => Boolean(record),
          ),
      ).values(),
    );
    const invalidTokenReferences: DocumentReference[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (
      let index = 0;
      index < tokenRecords.length;
      index += 500
    ) {
      const tokenGroup = tokenRecords.slice(index, index + 500);
      const response = await adminMessaging.sendEachForMulticast({
        tokens: tokenGroup.map((record) => record.token),
        notification: {
          title,
          body: messageBody,
        },
        data: {
          targetUrl,
          seasonId: activeSeasonId,
          week: String(week),
          notificationType: "weekly-tablet-ready",
        },
        webpush: {
          notification: {
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            requireInteraction: false,
          },
          fcmOptions: {
            link: targetUrl,
          },
        },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((sendResult, responseIndex) => {
        if (sendResult.success) return;

        const errorCode = sendResult.error?.code;

        if (
          errorCode ===
            "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          invalidTokenReferences.push(
            tokenGroup[responseIndex].reference,
          );
        }
      });
    }

    if (invalidTokenReferences.length > 0) {
      const deleteBatch = adminDb.batch();

      invalidTokenReferences.forEach((tokenReference) =>
        deleteBatch.delete(tokenReference),
      );

      await deleteBatch.commit();
    }

    await Promise.all([
      eventReference.set(
        {
          status: "sent",
          title,
          body: messageBody,
          targetUrl,
          tokenCount: tokenRecords.length,
          successCount,
          failureCount,
          sentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
      adminDb.collection("notifications").add({
        title,
        body: messageBody,
        targetUrl,
        seasonId: activeSeasonId,
        week,
        notificationType: "weekly-tablet-ready",
        sentBy: decodedToken.uid,
        tokenCount: tokenRecords.length,
        successCount,
        failureCount,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({
      success: true,
      ready: true,
      sent: true,
      tokenCount: tokenRecords.length,
      successCount,
      failureCount,
      message:
        tokenRecords.length > 0
          ? "Haftanın Tableti bildirimi gönderildi."
          : "Haftanın Tableti hazır ancak kayıtlı bildirim cihazı bulunamadı.",
    });
  } catch (error) {
    console.error("Haftanın Tableti bildirimi gönderilemedi:", error);

    if (eventReference) {
      try {
        await eventReference.set(
          {
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Bilinmeyen bildirim hatası.",
            failedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (recordError) {
        console.error(
          "Haftanın Tableti bildirim hatası kaydedilemedi:",
          recordError,
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Haftanın Tableti bildirimi gönderilemedi.",
      },
      { status: 500 },
    );
  }
}
