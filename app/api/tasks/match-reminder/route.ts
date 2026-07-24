import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  adminDb,
  adminMessaging,
} from "@/lib/firebase-admin";

type ReminderType =
  | "one-hour-match-reminder"
  | "prediction-deadline-reminder";

type TaskBody = {
  matchId?: unknown;
  reminderType?: unknown;
};

type ReminderConfig = {
  sentField:
    | "oneHourReminderSent"
    | "predictionDeadlineReminderSent";
  sentAtField:
    | "oneHourReminderSentAt"
    | "predictionDeadlineReminderSentAt";
  successCountField:
    | "oneHourReminderSuccessCount"
    | "predictionDeadlineReminderSuccessCount";
  failureCountField:
    | "oneHourReminderFailureCount"
    | "predictionDeadlineReminderFailureCount";
  processingField:
    | "oneHourReminderProcessing"
    | "predictionDeadlineReminderProcessing";
  processingAtField:
    | "oneHourReminderProcessingAt"
    | "predictionDeadlineReminderProcessingAt";
  title: string;
  buildBody: (homeTeam: string, awayTeam: string) => string;
};

function getReminderConfig(
  reminderType: ReminderType
): ReminderConfig {
  if (reminderType === "one-hour-match-reminder") {
    return {
      sentField: "oneHourReminderSent",
      sentAtField: "oneHourReminderSentAt",
      successCountField: "oneHourReminderSuccessCount",
      failureCountField: "oneHourReminderFailureCount",
      processingField: "oneHourReminderProcessing",
      processingAtField: "oneHourReminderProcessingAt",
      title: "Maçın başlamasına 1 saat kaldı ⚽",
      buildBody: (homeTeam, awayTeam) =>
        `${homeTeam} - ${awayTeam} maçı 1 saat sonra başlayacak. ` +
        "Tahminini yapmayı unutma!",
    };
  }

  return {
    sentField: "predictionDeadlineReminderSent",
    sentAtField: "predictionDeadlineReminderSentAt",
    successCountField:
      "predictionDeadlineReminderSuccessCount",
    failureCountField:
      "predictionDeadlineReminderFailureCount",
    processingField: "predictionDeadlineReminderProcessing",
    processingAtField:
      "predictionDeadlineReminderProcessingAt",
    title: "Tahminlerin kapanmasına 10 dakika kaldı! ⏳",
    buildBody: (homeTeam, awayTeam) =>
      `${homeTeam} - ${awayTeam} maçı için tahminini hemen yap.`,
  };
}

function isReminderType(
  value: unknown
): value is ReminderType {
  return (
    value === "one-hour-match-reminder" ||
    value === "prediction-deadline-reminder"
  );
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (
    !process.env.CLOUD_TASKS_HANDLER_SECRET ||
    authorization !==
      `Bearer ${process.env.CLOUD_TASKS_HANDLER_SECRET}`
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Yetkisiz istek.",
      },
      { status: 401 }
    );
  }

  let matchReference:
    | FirebaseFirestore.DocumentReference
    | null = null;

  let config: ReminderConfig | null = null;
  let eventReference:
    | FirebaseFirestore.DocumentReference
    | null = null;

  try {
    const body = (await request.json()) as TaskBody;

    const matchId =
      typeof body.matchId === "string"
        ? body.matchId.trim()
        : "";

    const reminderType = body.reminderType;

    if (!matchId) {
      return NextResponse.json(
        {
          success: false,
          error: "Maç kimliği bulunamadı.",
        },
        { status: 400 }
      );
    }

    if (!isReminderType(reminderType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz bildirim türü.",
        },
        { status: 400 }
      );
    }

    config = getReminderConfig(reminderType);
    matchReference = adminDb.collection("matches").doc(matchId);

    const eventId = `${matchId}_${reminderType}`;
    eventReference = adminDb
      .collection("automaticNotificationEvents")
      .doc(eventId);

    const transactionResult = await adminDb.runTransaction(
      async (transaction) => {
        const [matchSnapshot, eventSnapshot] = await Promise.all([
          transaction.get(matchReference!),
          transaction.get(eventReference!),
        ]);

        if (!matchSnapshot.exists) {
          return {
            action: "missing" as const,
            matchData: null,
          };
        }

        const matchData = matchSnapshot.data()!;

        if (matchData.status !== "scheduled") {
          return {
            action: "skip" as const,
            matchData,
          };
        }

        if (matchData[config!.sentField] === true) {
          return {
            action: "already-sent" as const,
            matchData,
          };
        }

        if (eventSnapshot.exists) {
          const eventData = eventSnapshot.data();

          if (eventData?.status === "sent") {
            return {
              action: "already-sent" as const,
              matchData,
            };
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
            return {
              action: "already-processing" as const,
              matchData,
            };
          }
        }

        transaction.set(
          eventReference!,
          {
            matchId,
            notificationType: reminderType,
            status: "processing",
            processingAt: FieldValue.serverTimestamp(),
            attemptCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.update(matchReference!, {
          [config!.processingField]: true,
          [config!.processingAtField]:
            FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          action: "send" as const,
          matchData,
        };
      }
    );

    if (transactionResult.action === "missing") {
      return NextResponse.json({
        success: true,
        message: "Maç bulunamadığı için görev atlandı.",
      });
    }

    if (transactionResult.action === "skip") {
      return NextResponse.json({
        success: true,
        message:
          "Maç planlanmış durumda olmadığı için görev atlandı.",
      });
    }

    if (transactionResult.action === "already-sent") {
      return NextResponse.json({
        success: true,
        message: "Bildirim daha önce gönderilmiş.",
      });
    }

    if (transactionResult.action === "already-processing") {
      return NextResponse.json({
        success: true,
        message: "Bildirim başka bir görev tarafından işleniyor.",
      });
    }

    const matchData = transactionResult.matchData;

    const homeTeam =
      typeof matchData.homeTeam === "string" &&
      matchData.homeTeam.trim()
        ? matchData.homeTeam.trim()
        : "Ev sahibi";

    const awayTeam =
      typeof matchData.awayTeam === "string" &&
      matchData.awayTeam.trim()
        ? matchData.awayTeam.trim()
        : "Deplasman";

    const messageBody = config.buildBody(
      homeTeam,
      awayTeam
    );

    const tokenSnapshot = await adminDb
      .collection("notificationTokens")
      .where("enabled", "==", true)
      .get();

    const tokens = Array.from(
      new Set(
        tokenSnapshot.docs
          .map((tokenDocument) => {
            const token = tokenDocument.data().token;

            return typeof token === "string" && token.trim()
              ? token.trim()
              : null;
          })
          .filter((token): token is string => Boolean(token))
      )
    );

    if (tokens.length === 0) {
      await Promise.all([
        matchReference.update({
          [config.sentField]: true,
          [config.sentAtField]: FieldValue.serverTimestamp(),
          [config.processingField]: false,
          [config.successCountField]: 0,
          [config.failureCountField]: 0,
          notificationTasksLastMessage:
            "Bildirim gönderilecek kayıtlı cihaz bulunamadı.",
          updatedAt: FieldValue.serverTimestamp(),
        }),
        eventReference!.set(
          {
            status: "sent",
            successCount: 0,
            failureCount: 0,
            tokenCount: 0,
            sentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      return NextResponse.json({
        success: true,
        message:
          "Bildirim gönderilecek kayıtlı cihaz bulunamadı.",
        successCount: 0,
        failureCount: 0,
      });
    }

    const invalidTokens = new Set<string>();

    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    for (let index = 0; index < tokens.length; index += 500) {
      const tokenGroup = tokens.slice(index, index + 500);

      const response =
        await adminMessaging.sendEachForMulticast({
          tokens: tokenGroup,
          notification: {
            title: config.title,
            body: messageBody,
          },
          data: {
            targetUrl: "/predictions",
            matchId,
            notificationType: reminderType,
          },
          webpush: {
            fcmOptions: {
              link: "/predictions",
            },
          },
        });

      totalSuccessCount += response.successCount;
      totalFailureCount += response.failureCount;

      response.responses.forEach((result, resultIndex) => {
        if (result.success) {
          return;
        }

        const errorCode = result.error?.code;

        if (
          errorCode ===
            "messaging/registration-token-not-registered" ||
          errorCode ===
            "messaging/invalid-registration-token"
        ) {
          invalidTokens.add(tokenGroup[resultIndex]);
        }
      });
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

    await Promise.all([
      matchReference.update({
        [config.sentField]: true,
        [config.sentAtField]: FieldValue.serverTimestamp(),
        [config.successCountField]: totalSuccessCount,
        [config.failureCountField]: totalFailureCount,
        [config.processingField]: false,
        updatedAt: FieldValue.serverTimestamp(),
      }),
      eventReference!.set(
        {
          status: "sent",
          successCount: totalSuccessCount,
          failureCount: totalFailureCount,
          tokenCount: tokens.length,
          sentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
    ]);

    await adminDb.collection("notifications").add({
      title: config.title,
      body: messageBody,
      targetUrl: "/predictions",
      matchId,
      notificationType: reminderType,
      sentBy: "cloud-tasks",
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Otomatik maç bildirimi gönderildi.",
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
    });
  } catch (error) {
    console.error("Cloud Tasks bildirim hatası:", error);

    if (matchReference && config) {
      try {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Bilinmeyen bildirim hatası.";

        await Promise.all([
          matchReference.update({
            [config.processingField]: false,
            notificationTasksLastError: errorMessage,
            notificationTasksLastErrorAt:
              FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }),
          eventReference
            ? eventReference.set(
                {
                  status: "failed",
                  error: errorMessage,
                  failedAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              )
            : Promise.resolve(),
        ]);
      } catch (updateError) {
        console.error(
          "Bildirim hata kaydı yazılamadı:",
          updateError
        );
      }
    }

    /*
      500 dönersek Cloud Tasks görevi otomatik olarak
      yeniden deneyecektir.
    */
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Otomatik bildirim gönderilemedi.",
      },
      { status: 500 }
    );
  }
}