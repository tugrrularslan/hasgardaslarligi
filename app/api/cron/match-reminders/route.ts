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

    const now = new Date();

    // GitHub Actions 5 dakikada bir çalıştığı için,
    // başlama saatine 55–65 dakika kalan maçları arıyoruz.
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

    const matchesSnapshot = await adminDb
      .collection("matches")
      .where("kickoff", ">=", Timestamp.fromDate(windowStart))
      .where("kickoff", "<=", Timestamp.fromDate(windowEnd))
      .get();

    if (matchesSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: "Bildirim zamanı gelen maç bulunamadı.",
        checkedAt: now.toISOString(),
        matchCount: 0,
      });
    }

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

    let processedMatchCount = 0;
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    const invalidTokens = new Set<string>();

    for (const matchDocument of matchesSnapshot.docs) {
      const matchData = matchDocument.data();

      // Aynı maç için bir saatlik bildirimin tekrar gitmesini engeller.
      if (matchData.oneHourReminderSent === true) {
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

      const title = "Maç başlamak üzere ⚽";

      const messageBody =
        `${homeTeam} - ${awayTeam} maçı yaklaşık 1 saat sonra başlayacak. ` +
        "Tahminini yapmayı unutma!";

      let matchSuccessCount = 0;
      let matchFailureCount = 0;

      for (let index = 0; index < tokens.length; index += 500) {
        const tokenGroup = tokens.slice(index, index + 500);

        const response = await getMessaging(adminApp).sendEachForMulticast({
          tokens: tokenGroup,
          notification: {
            title,
            body: messageBody,
          },
          data: {
            targetUrl: "/predictions",
            matchId: matchDocument.id,
            notificationType: "one-hour-match-reminder",
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
          if (result.success) return;

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

      // En az bir cihaza başarılı gönderim yapıldıysa maçı işaretle.
      if (matchSuccessCount > 0) {
        await matchDocument.ref.update({
          oneHourReminderSent: true,
          oneHourReminderSentAt: FieldValue.serverTimestamp(),
          oneHourReminderSuccessCount: matchSuccessCount,
          oneHourReminderFailureCount: matchFailureCount,
        });
      }

      await adminDb.collection("notifications").add({
        title,
        body: messageBody,
        targetUrl: "/predictions",
        matchId: matchDocument.id,
        notificationType: "one-hour-match-reminder",
        sentBy: "system-cron",
        successCount: matchSuccessCount,
        failureCount: matchFailureCount,
        createdAt: FieldValue.serverTimestamp(),
      });

      processedMatchCount += 1;
      totalSuccessCount += matchSuccessCount;
      totalFailureCount += matchFailureCount;
    }

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
      message: "Maç hatırlatma kontrolü tamamlandı.",
      checkedAt: now.toISOString(),
      foundMatchCount: matchesSnapshot.size,
      processedMatchCount,
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