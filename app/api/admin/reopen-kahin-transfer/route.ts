import { NextRequest, NextResponse } from "next/server";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
} from "firebase-admin/firestore";
import {
  adminAuth,
  adminDb,
  adminMessaging,
} from "@/lib/firebase-admin";
import {
  getKahinPlayerPredictionLabel,
  isKahinPlayerPredictionKey,
  KAHIN_GAME_ID,
  normalizeKahinSearch,
  sanitizeKahinPrediction,
} from "@/lib/kahin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPERATION_LEASE_MS = 10 * 60 * 1000;
const WRITE_BATCH_SIZE = 200;

type ReopenTransferBody = {
  operationId?: unknown;
  seasonId?: unknown;
  category?: unknown;
  playerName?: unknown;
  durationHours?: unknown;
  leagueExitConfirmed?: unknown;
};

type OperationSummary = {
  affectedUserCount: number;
  notifiedUserCount: number;
  notificationTokenCount: number;
  notificationFailureCount: number;
  withoutPushTokenCount: number;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getOperationSummary(data: Record<string, unknown>): OperationSummary {
  return {
    affectedUserCount: getNumber(data.affectedUserCount),
    notifiedUserCount: getNumber(data.notifiedUserCount),
    notificationTokenCount: getNumber(data.notificationTokenCount),
    notificationFailureCount: getNumber(data.notificationFailureCount),
    withoutPushTokenCount: getNumber(data.withoutPushTokenCount),
  };
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function isValidOperationId(value: string) {
  return /^[A-Za-z0-9_-]{8,120}$/.test(value);
}

function isSamePlayer(first: string, second: string) {
  return normalizeKahinSearch(first) === normalizeKahinSearch(second);
}

function notificationMessage(
  playerName: string,
  categoryLabel: string,
  durationHours: number,
) {
  return `${playerName} Süper Lig'den ayrıldığı için ${categoryLabel} tahminini ${durationHours} saat içinde yeniden seçmelisin.`;
}

function recipientReference(
  operationReference: DocumentReference,
  userId: string,
) {
  return operationReference.collection("recipients").doc(userId);
}

async function claimRecipientNotification(
  reference: DocumentReference,
) {
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (
      !snapshot.exists ||
      snapshot.data()?.notificationStatus !== "pending"
    ) {
      return false;
    }

    transaction.update(reference, {
      notificationStatus: "processing",
      notificationProcessingAt: FieldValue.serverTimestamp(),
      notificationAttemptCount: FieldValue.increment(1),
    });

    return true;
  });
}

export async function POST(request: NextRequest) {
  let operationReference: DocumentReference | null = null;

  try {
    const idToken = getBearerToken(request);
    if (!idToken) {
      throw new ApiError("Oturum bilgisi bulunamadı.", 401);
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const adminSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!adminSnapshot.exists || adminSnapshot.data()?.isAdmin !== true) {
      throw new ApiError("Bu işlem için yönetici yetkisi gerekiyor.", 403);
    }

    const body = (await request.json()) as ReopenTransferBody;
    const operationId = getTrimmedString(body.operationId);
    const seasonId = getTrimmedString(body.seasonId);
    const playerName = getTrimmedString(body.playerName);
    const category = body.category;
    const durationHours = Number(body.durationHours);

    if (!isValidOperationId(operationId)) {
      throw new ApiError("Geçerli bir işlem kimliği gerekli.", 400);
    }

    if (!seasonId || seasonId.length > 80) {
      throw new ApiError("Geçerli bir sezon gerekli.", 400);
    }

    if (!isKahinPlayerPredictionKey(category)) {
      throw new ApiError("Geçerli bir Kahin kategorisi seç.", 400);
    }

    if (!playerName || playerName.length > 120) {
      throw new ApiError("Transfer olan futbolcunun adını gir.", 400);
    }

    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 168) {
      throw new ApiError("Yeniden seçim süresi 1 ile 168 saat arasında olmalı.", 400);
    }

    if (body.leagueExitConfirmed !== true) {
      throw new ApiError(
        "Bu araç yalnızca Süper Lig'den ayrılan futbolcular için kullanılabilir.",
        400,
      );
    }

    const kahinSettingsSnapshot = await adminDb
      .collection("settings")
      .doc("kahin")
      .get();
    const kahinSettings = kahinSettingsSnapshot.data();
    const deadline = asTimestamp(kahinSettings?.deadline);

    if (!kahinSettingsSnapshot.exists || kahinSettings?.seasonId !== seasonId) {
      throw new ApiError("Kahin için aktif sezon değişmiş. Sayfayı yenile.", 409);
    }

    if (kahinSettings?.resultsPublished === true) {
      throw new ApiError("Resmî sonuçlar yayınlandıktan sonra tahmin açılamaz.", 409);
    }

    if (!deadline || Date.now() < deadline.toMillis()) {
      throw new ApiError(
        "Transfer istisnası yalnızca genel Kahin kilidi kapandıktan sonra açılabilir.",
        409,
      );
    }

    operationReference = adminDb
      .collection("kahinTransferOperations")
      .doc(operationId);

    const categoryLabel = getKahinPlayerPredictionLabel(category);
    const targetUrl = "/games/kahin/predictions";
    const createdDeadline = Timestamp.fromDate(
      new Date(Date.now() + durationHours * 60 * 60 * 1000),
    );
    const createdMessage = notificationMessage(
      playerName,
      categoryLabel,
      durationHours,
    );

    const claim = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(operationReference!);

      if (existing.exists) {
        const existingData = existing.data();

        if (
          existingData?.seasonId !== seasonId ||
          existingData?.category !== category ||
          !isSamePlayer(getTrimmedString(existingData?.playerName), playerName)
        ) {
          throw new ApiError(
            "Bu işlem kimliği farklı bir transfer işlemi için kullanılmış.",
            409,
          );
        }

        if (existingData?.status === "completed") {
          return { state: "completed" as const, data: existingData };
        }

        const processingAt = asTimestamp(existingData?.processingAt);
        const isActivelyProcessing =
          existingData?.status === "processing" &&
          processingAt !== null &&
          Date.now() - processingAt.toMillis() < OPERATION_LEASE_MS;

        if (isActivelyProcessing) {
          return { state: "processing" as const, data: existingData };
        }

        transaction.set(
          operationReference!,
          {
            status: "processing",
            processingAt: FieldValue.serverTimestamp(),
            attemptCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        return { state: "process" as const, data: existingData };
      }

      const operation = {
        gameId: KAHIN_GAME_ID,
        seasonId,
        category,
        categoryLabel,
        playerName,
        durationHours,
        replacementDeadline: createdDeadline,
        leagueExitConfirmed: true,
        targetUrl,
        notificationTitle: "Kahin tahminini yenile",
        notificationBody: createdMessage,
        openedBy: decodedToken.uid,
        status: "processing",
        processingAt: FieldValue.serverTimestamp(),
        attemptCount: 1,
        affectedUserCount: 0,
        notifiedUserCount: 0,
        notificationTokenCount: 0,
        notificationFailureCount: 0,
        withoutPushTokenCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.create(operationReference!, operation);
      return { state: "process" as const, data: operation };
    });

    if (claim.state === "completed") {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        operationId,
        ...getOperationSummary(claim.data),
      });
    }

    if (claim.state === "processing") {
      return NextResponse.json(
        {
          success: true,
          processing: true,
          operationId,
          ...getOperationSummary(claim.data),
          message: "Transfer istisnası zaten işleniyor.",
        },
        { status: 202 },
      );
    }

    const operationData = claim.data;
    const operationDeadline =
      asTimestamp(operationData.replacementDeadline) ?? createdDeadline;
    const operationPlayerName =
      getTrimmedString(operationData.playerName) || playerName;
    const operationCategoryLabel =
      getTrimmedString(operationData.categoryLabel) || categoryLabel;
    const operationDurationHours =
      getNumber(operationData.durationHours) || durationHours;
    const operationTitle =
      getTrimmedString(operationData.notificationTitle) ||
      "Kahin tahminini yenile";
    const operationBody =
      getTrimmedString(operationData.notificationBody) ||
      notificationMessage(
        operationPlayerName,
        operationCategoryLabel,
        operationDurationHours,
      );

    let recipientsSnapshot = await operationReference
      .collection("recipients")
      .get();
    const recipientIds = new Set(recipientsSnapshot.docs.map((document) => document.id));

    const usersSnapshot = await adminDb
      .collection("users")
      .where("kahinSeasonId", "==", seasonId)
      .get();

    const eligibleUsers = usersSnapshot.docs.filter((userDocument) => {
      if (recipientIds.has(userDocument.id)) return false;

      const userData = userDocument.data();
      const prediction = sanitizeKahinPrediction(userData.kahinPrediction);
      const originalSelection = prediction[category].trim();
      if (!originalSelection || !isSamePlayer(originalSelection, operationPlayerName)) {
        return false;
      }

      const currentReopens = userData.kahinTransferReopens;
      if (!currentReopens || typeof currentReopens !== "object") return true;

      const existingReopen = currentReopens[category];
      if (!existingReopen || typeof existingReopen !== "object") return true;

      // An open right is never overwritten. A consumed right is archived below
      // so a replacement player who later leaves the league can receive a new one.
      return Boolean(
        getTrimmedString(
          (existingReopen as Record<string, unknown>).replacementSelection,
        ),
      );
    });

    for (let index = 0; index < eligibleUsers.length; index += WRITE_BATCH_SIZE) {
      const batch = adminDb.batch();
      const group = eligibleUsers.slice(index, index + WRITE_BATCH_SIZE);

      group.forEach((userDocument) => {
        const userData = userDocument.data();
        const originalSelection = sanitizeKahinPrediction(
          userData.kahinPrediction,
        )[category].trim();
        const recipient = recipientReference(operationReference!, userDocument.id);
        const update: Record<string, unknown> = {
          [`kahinTransferReopens.${category}`]: {
            operationId,
            gameId: KAHIN_GAME_ID,
            seasonId,
            category,
            categoryLabel: operationCategoryLabel,
            originalSelection,
            replacementSelection: "",
            transferReopenedAt: FieldValue.serverTimestamp(),
            transferReopenedBy: decodedToken.uid,
            replacementDeadline: operationDeadline,
            leagueExitConfirmed: true,
            notificationEventId: operationId,
          },
          updatedAt: FieldValue.serverTimestamp(),
        };
        const existingReopens = userData.kahinTransferReopens;
        const previousReopen =
          existingReopens && typeof existingReopens === "object"
            ? existingReopens[category]
            : null;

        if (
          previousReopen &&
          typeof previousReopen === "object" &&
          isValidOperationId(
            getTrimmedString(
              (previousReopen as Record<string, unknown>).operationId,
            ),
          )
        ) {
          const previousOperationId = getTrimmedString(
            (previousReopen as Record<string, unknown>).operationId,
          );
          update[`kahinTransferHistory.${previousOperationId}`] = previousReopen;
        }

        batch.update(userDocument.ref, update);

        batch.create(recipient, {
          userId: userDocument.id,
          gameId: KAHIN_GAME_ID,
          seasonId,
          category,
          playerName: operationPlayerName,
          originalSelection,
          notificationStatus: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
    }

    recipientsSnapshot = await operationReference.collection("recipients").get();
    const recipients = recipientsSnapshot.docs.map((document) => ({
      userId: document.id,
      reference: document.ref,
      notificationStatus: document.data().notificationStatus,
    }));

    const claimedRecipients: Array<{
      userId: string;
      reference: DocumentReference;
    }> = [];

    for (const recipient of recipients) {
      if (recipient.notificationStatus !== "pending") continue;

      if (await claimRecipientNotification(recipient.reference)) {
        claimedRecipients.push({
          userId: recipient.userId,
          reference: recipient.reference,
        });
      }
    }

    const claimedUserIds = new Set(
      claimedRecipients.map((recipient) => recipient.userId),
    );
    const tokenSnapshot = claimedUserIds.size
      ? await adminDb
          .collection("notificationTokens")
          .where("enabled", "==", true)
          .get()
      : null;
    const tokenByUserId = new Map<
      string,
      { token: string; reference: DocumentReference; updatedAt: number }
    >();

    tokenSnapshot?.docs.forEach((tokenDocument) => {
      const tokenData = tokenDocument.data();
      const userId = getTrimmedString(tokenData.userId);
      const token = getTrimmedString(tokenData.token);
      if (!claimedUserIds.has(userId) || !token) return;

      const updatedAt = asTimestamp(tokenData.updatedAt)?.toMillis() ?? 0;
      const existing = tokenByUserId.get(userId);
      if (!existing || existing.updatedAt < updatedAt) {
        tokenByUserId.set(userId, {
          token,
          reference: tokenDocument.ref,
          updatedAt,
        });
      }
    });

    const recipientByUserId = new Map(
      claimedRecipients.map((recipient) => [recipient.userId, recipient.reference]),
    );
    const withoutToken = claimedRecipients.filter(
      (recipient) => !tokenByUserId.has(recipient.userId),
    );
    const deliveryWriter = adminDb.bulkWriter();

    withoutToken.forEach((recipient) => {
      deliveryWriter.update(recipient.reference, {
        notificationStatus: "no-token",
        notificationFinishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const tokenRecords = [...tokenByUserId.entries()].map(
      ([userId, tokenRecord]) => ({
        userId,
        ...tokenRecord,
      }),
    );
    const invalidTokenReferences: DocumentReference[] = [];

    for (let index = 0; index < tokenRecords.length; index += 500) {
      const tokenGroup = tokenRecords.slice(index, index + 500);
      const response = await adminMessaging.sendEachForMulticast({
        tokens: tokenGroup.map((record) => record.token),
        notification: {
          title: operationTitle,
          body: operationBody,
        },
        data: {
          targetUrl,
          gameId: KAHIN_GAME_ID,
          seasonId,
          category,
          operationId,
          notificationType: "kahin-transfer-reopen",
        },
        webpush: {
          notification: {
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            requireInteraction: true,
          },
          fcmOptions: {
            link: targetUrl,
          },
        },
      });

      response.responses.forEach((result, responseIndex) => {
        const tokenRecord = tokenGroup[responseIndex];
        const recipient = recipientByUserId.get(tokenRecord.userId);
        if (!recipient) return;

        if (result.success) {
          deliveryWriter.update(recipient, {
            notificationStatus: "sent",
            notificationSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        const errorCode = result.error?.code ?? "messaging/unknown-error";
        deliveryWriter.update(recipient, {
          notificationStatus: "failed",
          notificationError: errorCode,
          notificationFinishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          invalidTokenReferences.push(tokenRecord.reference);
        }
      });
    }

    invalidTokenReferences.forEach((reference) => deliveryWriter.delete(reference));
    await deliveryWriter.close();

    const deliveredRecipients = await operationReference
      .collection("recipients")
      .get();
    const deliverySummary = deliveredRecipients.docs.reduce(
      (summary, recipient) => {
        const status = recipient.data().notificationStatus;
        if (status === "sent") summary.notifiedUserCount += 1;
        if (status === "failed" || status === "processing") {
          summary.notificationFailureCount += 1;
        }
        if (status === "no-token") summary.withoutPushTokenCount += 1;
        return summary;
      },
      {
        affectedUserCount: deliveredRecipients.size,
        notifiedUserCount: 0,
        notificationTokenCount: tokenRecords.length,
        notificationFailureCount: 0,
        withoutPushTokenCount: 0,
      } satisfies OperationSummary,
    );

    await Promise.all([
      operationReference.set(
        {
          status: "completed",
          ...deliverySummary,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
      adminDb.collection("notifications").doc(`kahin-transfer_${operationId}`).set(
        {
          operationId,
          title: operationTitle,
          body: operationBody,
          targetUrl,
          gameId: KAHIN_GAME_ID,
          seasonId,
          category,
          playerName: operationPlayerName,
          notificationType: "kahin-transfer-reopen",
          sentBy: decodedToken.uid,
          ...deliverySummary,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ]);

    return NextResponse.json({
      success: true,
      operationId,
      ...deliverySummary,
      message: `${deliverySummary.affectedUserCount} kullanıcının tahmini açıldı. ${deliverySummary.notifiedUserCount} kullanıcıya bildirim gönderildi.`,
    });
  } catch (error) {
    if (operationReference && !(error instanceof ApiError)) {
      try {
        await operationReference.set(
          {
            status: "failed",
            error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Bilinmeyen hata.",
            failedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (recordError) {
        console.error("Transfer istisnası hata kaydı yazılamadı:", recordError);
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Transfer istisnası uygulanamadı.";
    console.error("Kahin transfer istisnası hatası:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
