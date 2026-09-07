import { NextRequest, NextResponse } from "next/server";
import {
  AdminScoringError,
  recalculateWeeklyChampionBonus,
} from "@/lib/match-scoring";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type WeeklyChampionBody = {
  week?: unknown;
  preview?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as WeeklyChampionBody;
    const result = await recalculateWeeklyChampionBonus({
      week: Number(body.week),
      adminId: decodedToken.uid,
      preview: body.preview === true,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = error instanceof AdminScoringError ? error.status : 500;

    console.error("Haftalık şampiyon API hatası:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Haftalık şampiyon belirlenemedi.",
      },
      { status },
    );
  }
}
