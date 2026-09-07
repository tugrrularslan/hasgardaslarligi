import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  isKahinPlayerPredictionKey,
  KAHIN_GAME_ID,
  normalizeKahinSearch,
} from "@/lib/kahin";

export const runtime = "nodejs";

type TransferReplacementBody = {
  field?: unknown;
  replacementSelection?: unknown;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function isSamePlayer(first: string, second: string) {
  return normalizeKahinSearch(first) === normalizeKahinSearch(second);
}

export async function POST(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);
    if (!idToken) {
      throw new ApiError("Yeni tahmini kaydetmek için giriş yapmalısın.", 401);
    }

    const body = (await request.json()) as TransferReplacementBody;
    const field = body.field;
    const replacementSelection = getTrimmedString(body.replacementSelection);

    if (!isKahinPlayerPredictionKey(field)) {
      throw new ApiError("Geçerli bir Kahin kategorisi seç.", 400);
    }

    if (!replacementSelection || replacementSelection.length > 120) {
      throw new ApiError("Geçerli bir yeni futbolcu seç.", 400);
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userReference = adminDb.collection("users").doc(decodedToken.uid);
    const settingsReference = adminDb.collection("settings").doc("kahin");

    await adminDb.runTransaction(async (transaction) => {
      const [profileSnapshot, settingsSnapshot] = await Promise.all([
        transaction.get(userReference),
        transaction.get(settingsReference),
      ]);

      if (!profileSnapshot.exists) {
        throw new ApiError("Kullanıcı profilin bulunamadı.", 404);
      }

      if (!settingsSnapshot.exists) {
        throw new ApiError("Kahin ayarları bulunamadı.", 409);
      }

      const profile = profileSnapshot.data() ?? {};
      const settings = settingsSnapshot.data() ?? {};
      const seasonId = getTrimmedString(settings.seasonId);
      const deadline = asTimestamp(settings.deadline);
      const now = Timestamp.now();

      if (
        !seasonId ||
        settings.resultsPublished === true ||
        !deadline ||
        now.toMillis() < deadline.toMillis()
      ) {
        throw new ApiError("Kahin tahminleri henüz transfer değişikliğine açık değil.", 409);
      }

      if (getTrimmedString(profile.kahinSeasonId) !== seasonId) {
        throw new ApiError("Bu transfer hakkı aktif Kahin sezonuna ait değil.", 409);
      }

      const prediction = asRecord(profile.kahinPrediction);
      const reopens = asRecord(profile.kahinTransferReopens);
      const reopen = reopens ? asRecord(reopens[field]) : null;
      const currentSelection = getTrimmedString(prediction?.[field]);
      const originalSelection = getTrimmedString(reopen?.originalSelection);
      const replacementDeadline = asTimestamp(reopen?.replacementDeadline);

      if (
        !prediction ||
        !reopens ||
        !reopen ||
        getTrimmedString(reopen.gameId) !== KAHIN_GAME_ID ||
        getTrimmedString(reopen.seasonId) !== seasonId ||
        getTrimmedString(reopen.category) !== field ||
        !currentSelection ||
        !originalSelection ||
        !isSamePlayer(currentSelection, originalSelection) ||
        getTrimmedString(reopen.replacementSelection) ||
        !replacementDeadline ||
        now.toMillis() >= replacementDeadline.toMillis()
      ) {
        throw new ApiError("Bu kategori için kullanılabilir bir transfer hakkın yok.", 409);
      }

      if (isSamePlayer(replacementSelection, originalSelection)) {
        throw new ApiError("Transfer olan futbolcunun yerine farklı bir futbolcu seçmelisin.", 400);
      }

      transaction.update(userReference, {
        [`kahinPrediction.${field}`]: replacementSelection,
        [`kahinTransferReopens.${field}.replacementSelection`]:
          replacementSelection,
        [`kahinTransferReopens.${field}.replacementSelectedAt`]: now,
        kahinUpdatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Yeni tahmin şu anda kaydedilemedi. Lütfen tekrar dene.";

    if (!(error instanceof ApiError)) {
      console.error("Kahin transfer tahmini kaydedilemedi:", error);
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
