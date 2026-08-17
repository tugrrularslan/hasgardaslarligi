import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  addManualLeaguePlayer,
  getStoredPlayerRoster,
  migrateLegacyKahinPlayers,
} from "@/lib/player-sync";

export const dynamic = "force-dynamic";

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

async function verifyAdmin(request: NextRequest) {
  const idToken = getBearerToken(request);
  if (!idToken) {
    throw new ApiError("Oturum bilgisi bulunamadı.", 401);
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const userSnapshot = await adminDb
    .collection("users")
    .doc(decodedToken.uid)
    .get();
  if (!userSnapshot.exists || userSnapshot.data()?.isAdmin !== true) {
    throw new ApiError("Yönetici yetkisi gerekiyor.", 403);
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const body = (await request.json()) as {
      action?: unknown;
      name?: unknown;
      team?: unknown;
    };

    if (body.action === "migrate-kahin") {
      const migration = await migrateLegacyKahinPlayers();
      const roster = await getStoredPlayerRoster();
      return NextResponse.json({
        success: true,
        ...migration,
        players: roster?.players ?? [],
      });
    }

    if (typeof body.name !== "string" || typeof body.team !== "string") {
      return NextResponse.json(
        { success: false, error: "Futbolcu adı ve takımı gerekli." },
        { status: 400 },
      );
    }

    const result = await addManualLeaguePlayer({
      name: body.name,
      team: body.team,
    });
    const roster = await getStoredPlayerRoster();

    return NextResponse.json({
      success: true,
      ...result,
      players: roster?.players ?? [],
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }

    console.error("Oyuncu listesi güncellenemedi:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Oyuncu listesi güncellenemedi.",
      },
      { status: 500 },
    );
  }
}
