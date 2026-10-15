import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

type MatchResult = "1" | "X" | "2";

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resultValue(value: unknown): MatchResult | null {
  return value === "1" || value === "X" || value === "2" ? value : null;
}

/**
 * İstatistik ekranı normal kullanıcılara yalnızca kendi tahminlerini verir.
 * Yönetici ise lig genelini görebilir. Böylece Firestore'da diğer oyuncuların
 * tahminlerini okuma yetkisi vermek gerekmez.
 */
export async function GET(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json({ error: "Oturum bilgisi bulunamadı." }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const profileSnapshot = await adminDb.collection("users").doc(decodedToken.uid).get();

    if (!profileSnapshot.exists) {
      return NextResponse.json({ error: "Kullanıcı profili bulunamadı." }, { status: 404 });
    }

    const isAdmin = profileSnapshot.data()?.isAdmin === true;
    const [usersSnapshot, matchesSnapshot, predictionsSnapshot] = await Promise.all([
      isAdmin
        ? adminDb.collection("users").get()
        : Promise.resolve({ docs: [profileSnapshot] }),
      adminDb.collection("matches").get(),
      isAdmin
        ? adminDb.collection("predictions").get()
        : adminDb.collection("predictions").where("userId", "==", decodedToken.uid).get(),
    ]);

    const users = usersSnapshot.docs.map((document) => {
      const data = document.data() ?? {};
      const username =
        typeof data.username === "string" && data.username.trim()
          ? data.username.trim()
          : typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName.trim()
            : "İsimsiz kullanıcı";

      return {
        id: document.id,
        username,
        photoURL:
          typeof data.photoURL === "string" && data.photoURL.trim()
            ? data.photoURL.trim()
            : typeof data.profilePhotoURL === "string" && data.profilePhotoURL.trim()
              ? data.profilePhotoURL.trim()
              : null,
        correctPredictions: numberValue(data.correctPredictions),
        weeklyWins: numberValue(data.weeklyWins),
        totalPoints: numberValue(data.totalPoints),
      };
    });

    const matches = matchesSnapshot.docs.map((document) => {
      const data = document.data() ?? {};
      const kickoff = data.kickoff;

      return {
        id: document.id,
        week: numberValue(data.week),
        kickoff: kickoff instanceof Timestamp ? kickoff.toMillis() : null,
        result: resultValue(data.result),
        status: data.status === "finished" ? "finished" : "scheduled",
      };
    });

    const predictions = predictionsSnapshot.docs.map((document) => {
      const data = document.data() ?? {};

      return {
        id: document.id,
        userId: typeof data.userId === "string" ? data.userId : "",
        matchId: typeof data.matchId === "string" ? data.matchId : "",
        prediction: resultValue(data.prediction),
        isCorrect: data.isCorrect === true,
        awardedPoints: numberValue(data.awardedPoints),
      };
    });

    return NextResponse.json({ isAdmin, users, matches, predictions });
  } catch (error) {
    console.error("İstatistikler hazırlanamadı:", error);
    return NextResponse.json(
      { error: "İstatistikler şu anda hazırlanamadı." },
      { status: 500 },
    );
  }
}
