import { NextRequest, NextResponse } from "next/server";
import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import {
  DocumentReference,
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchData = {
  homeTeam?: string;
  awayTeam?: string;
  kickoff?: Timestamp;
  predictionDeadline?: Timestamp;
  status?: string;
};

type NotificationType =
  | "oneHourBefore"
  | "tenMinutesBeforeClosing";

type AutomaticNotification = {
  eventId: string;
  matchId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  targetUrl: string;
};

function getFirebaseAdminApp() {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin ortam değişkenleri eksik."
    );
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function isInsideNotificationWindow(
  now: number,
  notificationTime: number
) {
  const notificationWindow = 10 * 60 * 1000;

  return (
    now >= notificationTime &&
    now < notificationTime + notificationWindow
  );
}

async function claimNotification(
  notification: AutomaticNotification
) {
  const app = getFirebaseAdminApp();
  const db = getFirestore(app);

  const eventReference = db
    .collection("automaticNotificationEvents")
    .doc(notification.eventId);

  return db.runTransaction(async (transaction) => {
    const existingEvent =
      await transaction.get(eventReference);

    if (existingEvent.exists) {
      return false;
    }

    transaction.create(eventReference, {
      matchId: notification.matchId,
      notificationType:
        notification.notificationType,
      title: notification.title,
      body: notification.body,
      targetUrl: notification.targetUrl,
      status: "processing",
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
}

async function sendNotificationToEveryone(
  notification: AutomaticNotification
) {
  const app = getFirebaseAdminApp();
  const db = getFirestore(app);
  const messaging = getMessaging(app);

  const tokenSnapshot = await db
    .collection("notificationTokens")
    .get();

  const tokenRecords = tokenSnapshot.docs
    .map((tokenDocument) => {
      const tokenData = tokenDocument.data();

      return {
        token:
          typeof tokenData.token === "string"
            ? tokenData.token
            : "",
        reference: tokenDocument.ref,
      };
    })
    .filter((record) => record.token.length > 0);

  if (tokenRecords.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      tokenCount: 0,
    };
  }

  let successCount = 0;
  let failureCount = 0;

  const invalidTokenReferences: DocumentReference[] =
    [];

  for (
    let index = 0;
    index < tokenRecords.length;
    index += 500
  ) {
    const tokenChunk = tokenRecords.slice(
      index,
      index + 500
    );

    const response =
      await messaging.sendEachForMulticast({
        tokens: tokenChunk.map(
          (record) => record.token
        ),

        notification: {
          title: notification.title,
          body: notification.body,
        },

        data: {
          targetUrl: notification.targetUrl,
          matchId: notification.matchId,
          notificationType:
            notification.notificationType,
        },

        webpush: {
          notification: {
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            requireInteraction: false,
          },
        },
      });

    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach(
      (sendResult, responseIndex) => {
        if (sendResult.success) {
          return;
        }

        const errorCode =
          sendResult.error?.code;

        if (
          errorCode ===
            "messaging/registration-token-not-registered" ||
          errorCode ===
            "messaging/invalid-registration-token"
        ) {
          invalidTokenReferences.push(
            tokenChunk[responseIndex].reference
          );
        }
      }
    );
  }

  if (invalidTokenReferences.length > 0) {
    const deleteBatch = db.batch();

    invalidTokenReferences.forEach(
      (tokenReference) => {
        deleteBatch.delete(tokenReference);
      }
    );

    await deleteBatch.commit();
  }

  return {
    successCount,
    failureCount,
    tokenCount: tokenRecords.length,
  };
}

async function processAutomaticNotification(
  notification: AutomaticNotification
) {
  const app = getFirebaseAdminApp();
  const db = getFirestore(app);

  const eventReference = db
    .collection("automaticNotificationEvents")
    .doc(notification.eventId);

  const claimed =
    await claimNotification(notification);

  if (!claimed) {
    return {
      eventId: notification.eventId,
      status: "already-processed",
      successCount: 0,
      failureCount: 0,
    };
  }

  try {
    const sendResult =
      await sendNotificationToEveryone(notification);

    await eventReference.update({
      status: "sent",
      successCount: sendResult.successCount,
      failureCount: sendResult.failureCount,
      tokenCount: sendResult.tokenCount,
      sentAt: FieldValue.serverTimestamp(),
    });

    await db.collection("notificationLogs").add({
      source: "automatic-cron",
      matchId: notification.matchId,
      notificationType:
        notification.notificationType,
      title: notification.title,
      body: notification.body,
      targetUrl: notification.targetUrl,
      successCount: sendResult.successCount,
      failureCount: sendResult.failureCount,
      tokenCount: sendResult.tokenCount,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      eventId: notification.eventId,
      status: "sent",
      successCount: sendResult.successCount,
      failureCount: sendResult.failureCount,
      tokenCount: sendResult.tokenCount,
    };
  } catch (error) {
    console.error(
      "Otomatik bildirim gönderilemedi:",
      notification.eventId,
      error
    );

    await eventReference.delete();

    throw error;
  }
}

export async function GET(
  request: NextRequest
) {
  try {
    const cronSecret =
      process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CRON_SECRET ortam değişkeni eksik.",
        },
        {
          status: 500,
        }
      );
    }

    const authorizationHeader =
      request.headers.get("authorization");

    if (
      authorizationHeader !==
      `Bearer ${cronSecret}`
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Yetkisiz istek.",
        },
        {
          status: 401,
        }
      );
    }

    const app = getFirebaseAdminApp();
    const db = getFirestore(app);

    const currentTime = Date.now();

    const matchesSnapshot = await db
      .collection("matches")
      .where("status", "==", "scheduled")
      .get();

    const dueNotifications:
      AutomaticNotification[] = [];

    matchesSnapshot.forEach(
      (matchDocument) => {
        const match =
          matchDocument.data() as MatchData;

        if (
          !match.homeTeam ||
          !match.awayTeam ||
          !match.kickoff
        ) {
          return;
        }

        const kickoffTime =
          match.kickoff.toMillis();

        const predictionDeadlineTime =
          match.predictionDeadline?.toMillis() ??
          kickoffTime - 5 * 60 * 1000;

        const oneHourBeforeTime =
          kickoffTime - 60 * 60 * 1000;

        const tenMinutesBeforeClosingTime =
          predictionDeadlineTime -
          10 * 60 * 1000;

        if (
          isInsideNotificationWindow(
            currentTime,
            oneHourBeforeTime
          )
        ) {
          dueNotifications.push({
            eventId:
              `${matchDocument.id}_one-hour-before`,
            matchId: matchDocument.id,
            notificationType:
              "oneHourBefore",
            title: "⏰ Maça 1 saat kaldı",
            body:
              `${match.homeTeam} - ${match.awayTeam} ` +
              "maçı 1 saat sonra başlayacak. " +
              "Tahminini yapmayı unutma!",
            targetUrl: "/predictions",
          });
        }

        if (
          isInsideNotificationWindow(
            currentTime,
            tenMinutesBeforeClosingTime
          )
        ) {
          dueNotifications.push({
            eventId:
              `${matchDocument.id}_ten-minutes-before-closing`,
            matchId: matchDocument.id,
            notificationType:
              "tenMinutesBeforeClosing",
            title: "🚨 Tahminler kapanıyor",
            body:
              `${match.homeTeam} - ${match.awayTeam} ` +
              "maçı için tahminlerin kapanmasına " +
              "10 dakika kaldı!",
            targetUrl: "/predictions",
          });
        }
      }
    );

    const results = [];

    for (
      const notification of dueNotifications
    ) {
      try {
        const result =
          await processAutomaticNotification(
            notification
          );

        results.push(result);
      } catch (error) {
        results.push({
          eventId: notification.eventId,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Bilinmeyen hata",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Otomatik bildirim kontrolü tamamlandı.",
      checkedAt: new Date().toISOString(),
      checkedMatchCount:
        matchesSnapshot.size,
      dueNotificationCount:
        dueNotifications.length,
      results,
    });
  } catch (error) {
    console.error(
      "Otomatik bildirim kontrol hatası:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Otomatik bildirimler kontrol edilemedi.",
      },
      {
        status: 500,
      }
    );
  }
}