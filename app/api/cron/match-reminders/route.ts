import { NextRequest, NextResponse } from "next/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin ortam değişkenleri eksik.");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

type ReminderConfig = {
  notificationType:
    | "one-hour-match-reminder"
    | "fifteen-minute-match-reminder";
  sentField:
    | "oneHourReminderSent"
    | "fifteenMinuteReminderSent";
  sentAtField:
    | "oneHourReminderSentAt"
    | "fifteenMinuteReminderSentAt";
  successCountField:
    | "oneHourReminderSuccessCount"
    | "fifteenMinuteReminderSuccessCount";
  failureCountField:
    | "oneHourReminderFailureCount"
    | "fifteenMinuteReminderFailureCount";
  title: string;
  buildBody: (homeTeam: string, awayTeam: string) => string;
};

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authorization !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Yetkisiz istek.",
        },
        { status: 401 }
      );
    }

    const adminApp = getAdminApp();
    const adminDb = getFirestore(adminApp);
    const messaging = getMessaging(adminApp);

    const now = new Date();

    const tokenSnapshot = await adminDb
      .collection("notificationTokens")
      .where("enabled", "==", true)
      .get();

    const tokens = tokenSnapshot.docs
      .map((tokenDocument) => {
        const tokenData = tokenDocument.data();

        return typeof tokenData.token === "string"
          ? tokenData.token
          : null;
      })
      .filter((token): token is string => Boolean(token));

    if (tokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Bildirim gönderilecek kayıtlı cihaz bulunamadı.",
        },
        { status: 400 }
      );
    }

    const invalidTokens = new Set<string>();

    let totalFoundMatchCount = 0;
    let totalProcessedMatchCount = 0;
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    async function processReminderWindow(
      windowStart: Date,
      windowEnd: Date,
      config: ReminderConfig
    ) {
      const matchesSnapshot = await adminDb
        .collection("matches")
        .where("kickoff", ">=", Timestamp.fromDate(windowStart))
        .where("kickoff", "<=", Timestamp.fromDate(windowEnd))
        .get();

      totalFoundMatchCount += matchesSnapshot.size;

      for (const matchDocument of matchesSnapshot.docs) {
        const matchData = matchDocument.data();

        if (matchData[config.sentField] === true) {
          continue;
        }

        const homeTeam =
          typeof matchData.homeTeam === "string"
            ? matchData.homeTeam
            : "Ev sahibi";

        const awayTeam =
          typeof matchData.awayTeam === "string"
            ? matchData.awayTeam
            : "Deplasman";

        const messageBody = config.buildBody(homeTeam, awayTeam);

        let matchSuccessCount = 0;
        let matchFailureCount = 0;

        for (let index = 0; index < tokens.length; index += 500) {
          const tokenGroup = tokens.slice(index, index + 500);

          const response = await messaging.sendEachForMulticast({
            tokens: tokenGroup,
            notification: {
              title: config.title,
              body: messageBody,
            },
            data: {
              targetUrl: "/predictions",
              matchId: matchDocument.id,
              notificationType: config.notificationType,
            },
            webpush: {
              fcmOptions: {
                link: "/predictions",
              },
            },
          });

          matchSuccessCount += response.successCount;
          matchFailureCount += response.failureCount;

          response.responses.forEach((result, resultIndex) => {
            if (result.success) {
              return;
            }

            const errorCode = result.error?.code;

            if (
              errorCode ===
                "messaging/registration-token-not-registered" ||
              errorCode === "messaging/invalid-registration-token"
            ) {
              invalidTokens.add(tokenGroup[resultIndex]);
            }
          });
        }

        if (matchSuccessCount > 0) {
          await matchDocument.ref.update({
            [config.sentField]: true,
            [config.sentAtField]: FieldValue.serverTimestamp(),
            [config.successCountField]: matchSuccessCount,
            [config.failureCountField]: matchFailureCount,
          });
        }

        await adminDb.collection("notifications").add({
          title: config.title,
          body: messageBody,
          targetUrl: "/predictions",
          matchId: matchDocument.id,
          notificationType: config.notificationType,
          sentBy: "system-cron",
          successCount: matchSuccessCount,
          failureCount: matchFailureCount,
          createdAt: FieldValue.serverTimestamp(),
        });

        totalProcessedMatchCount += 1;
        totalSuccessCount += matchSuccessCount;
        totalFailureCount += matchFailureCount;
      }
    }

    // GitHub Actions 5 dakikada bir çalışıyor.
    // Maça yaklaşık 1 saat kalan karşılaşmaları yakalar.
    await processReminderWindow(
      new Date(now.getTime() + 55 * 60 * 1000),
      new Date(now.getTime() + 65 * 60 * 1000),
      {
        notificationType: "one-hour-match-reminder",
        sentField: "oneHourReminderSent",
        sentAtField: "oneHourReminderSentAt",
        successCountField: "oneHourReminderSuccessCount",
        failureCountField: "oneHourReminderFailureCount",
        title: "Maç başlamak üzere ⚽",
        buildBody: (homeTeam, awayTeam) =>
          `${homeTeam} - ${awayTeam} maçı yaklaşık 1 saat sonra başlayacak. ` +
          "Tahminini yapmayı unutma!",
      }
    );

    // Tahminler maçtan 5 dakika önce kapanıyor.
    // Maça yaklaşık 15 dakika kala gönderildiğinde,
    // tahminlerin kapanmasına yaklaşık 10 dakika kalmış olur.
    await processReminderWindow(
      new Date(now.getTime() + 10 * 60 * 1000),
      new Date(now.getTime() + 20 * 60 * 1000),
      {
        notificationType: "fifteen-minute-match-reminder",
        sentField: "fifteenMinuteReminderSent",
        sentAtField: "fifteenMinuteReminderSentAt",
        successCountField: "fifteenMinuteReminderSuccessCount",
        failureCountField: "fifteenMinuteReminderFailureCount",
        title: "Tahminlerin kapanmasına 10 dakika kaldı! ⏳",
        buildBody: (homeTeam, awayTeam) =>
          `${homeTeam} - ${awayTeam} maçı için tahminini hemen yap.`,
      }
    );

    if (invalidTokens.size > 0) {
      const deleteBatch = adminDb.batch();

      tokenSnapshot.docs.forEach((tokenDocument) => {
        const token = tokenDocument.data().token;

        if (
          typeof token === "string" &&
          invalidTokens.has(token)
        ) {
          deleteBatch.delete(tokenDocument.ref);
        }
      });

      await deleteBatch.commit();
    }

    return NextResponse.json({
      success: true,
      message:
        totalProcessedMatchCount > 0
          ? "Maç hatırlatma kontrolü tamamlandı."
          : "Bildirim zamanı gelen maç bulunamadı.",
      checkedAt: now.toISOString(),
      foundMatchCount: totalFoundMatchCount,
      processedMatchCount: totalProcessedMatchCount,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
    });
  } catch (error) {
    console.error("Otomatik maç bildirimi hatası:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Otomatik bildirim kontrolü başarısız oldu.",
      },
      { status: 500 }
    );
  }
}