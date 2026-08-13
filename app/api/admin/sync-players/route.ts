import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { syncPlayerRoster } from "@/lib/player-sync";

export const dynamic = "force-dynamic";

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
    const userSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();
    if (!userSnapshot.exists || userSnapshot.data()?.isAdmin !== true) {
      return NextResponse.json(
        { success: false, error: "Yönetici yetkisi gerekiyor." },
        { status: 403 },
      );
    }

    const roster = await syncPlayerRoster("admin");
    return NextResponse.json(roster, {
      status: roster.success ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Oyuncu senkronizasyonu başarısız:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Oyuncu senkronizasyonu başarısız.",
      },
      { status: 502 },
    );
  }
}
