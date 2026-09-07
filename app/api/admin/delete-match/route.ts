import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type DeleteMatchBody = {
  matchId?: unknown;
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

    const body = (await request.json()) as DeleteMatchBody;
    const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";

    if (!matchId || matchId.length > 200) {
      return NextResponse.json(
        { success: false, error: "Geçerli bir maç seçilmedi." },
        { status: 400 },
      );
    }

    const matchReference = adminDb.collection("matches").doc(matchId);
    const matchSnapshot = await matchReference.get();

    if (!matchSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Maç bulunamadı." },
        { status: 404 },
      );
    }

    const matchData = matchSnapshot.data() ?? {};

    if (
      matchData.status === "finished" ||
      matchData.pointsCalculated === true ||
      matchData.scoringStatus === "processing"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Puanlanmış veya puanlanmakta olan maç silinemez. Puan ve haftalık bonus tutarlılığını korumak için sonucu güncelle.",
        },
        { status: 409 },
      );
    }

    const predictionsSnapshot = await adminDb
      .collection("predictions")
      .where("matchId", "==", matchId)
      .get();
    const writer = adminDb.bulkWriter();

    writer.onWriteError((error) => {
      console.error("Planlanmış maç silinirken Firestore yazma hatası:", {
        path: error.documentRef.path,
        code: error.code,
        attempts: error.failedAttempts,
      });

      return error.failedAttempts < 5;
    });

    for (const predictionDocument of predictionsSnapshot.docs) {
      writer.delete(predictionDocument.ref);
    }

    await writer.close();
    await adminDb.recursiveDelete(matchReference);

    return NextResponse.json({
      success: true,
      deletedPredictionCount: predictionsSnapshot.size,
    });
  } catch (error) {
    console.error("Maç silme API hatası:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Maç silinemedi.",
      },
      { status: 500 },
    );
  }
}
