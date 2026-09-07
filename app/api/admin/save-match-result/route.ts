import { NextRequest, NextResponse } from "next/server";
import {
  AdminScoringError,
  saveMatchResult,
  type GoalEventInput,
} from "@/lib/match-scoring";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type SaveMatchResultBody = {
  matchId?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  goalEvents?: unknown;
  idempotencyKey?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function asGoalEventInputs(value: unknown): GoalEventInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((event) => {
    const data = event && typeof event === "object" ? event : {};

    return {
      side: (data as { side?: unknown }).side as "home" | "away",
      scorer: (data as { scorer?: unknown }).scorer as string,
      assister: (data as { assister?: unknown }).assister as string,
      ownGoal: (data as { ownGoal?: unknown }).ownGoal === true,
    };
  });
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

    const body = (await request.json()) as SaveMatchResultBody;
    const result = await saveMatchResult({
      adminId: decodedToken.uid,
      input: {
        matchId: typeof body.matchId === "string" ? body.matchId.trim() : "",
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        goalEvents: asGoalEventInputs(body.goalEvents),
        idempotencyKey:
          typeof body.idempotencyKey === "string"
            ? body.idempotencyKey.trim()
            : "",
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = error instanceof AdminScoringError ? error.status : 500;

    console.error("Maç sonucu API hatası:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Maç sonucu kaydedilemedi.",
      },
      { status },
    );
  }
}
