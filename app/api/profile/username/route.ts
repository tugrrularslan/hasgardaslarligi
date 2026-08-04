import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type UsernameBody = {
  username?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Oturum bilgisi bulunamadı." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as UsernameBody;
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const usernameLower = username.toLocaleLowerCase("tr-TR");

    if (username.length < 3 || username.length > 20) {
      return NextResponse.json(
        {
          success: false,
          error: "Kullanıcı adı 3 ile 20 karakter arasında olmalı.",
        },
        { status: 400 }
      );
    }

    if (!/^[a-zA-ZçÇğĞıİöÖşŞüÜ0-9 _.-]+$/.test(username)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Yalnızca harf, rakam, boşluk, nokta, tire ve alt çizgi kullanabilirsin.",
        },
        { status: 400 }
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userReference = adminDb.collection("users").doc(decodedToken.uid);

    const result = await adminDb.runTransaction(async (transaction) => {
      const profileSnapshot = await transaction.get(userReference);

      if (!profileSnapshot.exists) {
        return { status: "missing-profile" as const };
      }

      const profile = profileSnapshot.data() ?? {};
      const currentUsername =
        typeof profile.username === "string" ? profile.username.trim() : "";
      const isAdmin = profile.isAdmin === true;

      if (
        usernameLower === currentUsername.toLocaleLowerCase("tr-TR")
      ) {
        return { status: "unchanged" as const };
      }

      if (!isAdmin && profile.usernameChanged === true) {
        return { status: "already-changed" as const };
      }

      const sameUsernameSnapshot = await transaction.get(
        adminDb
          .collection("users")
          .where("usernameLower", "==", usernameLower)
          .limit(1)
      );

      if (
        !sameUsernameSnapshot.empty &&
        sameUsernameSnapshot.docs.some((document) => document.id !== decodedToken.uid)
      ) {
        return { status: "taken" as const };
      }

      transaction.update(userReference, {
        username,
        usernameLower,
        usernameChanged: true,
        usernameChangedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { status: "updated" as const, isAdmin };
    });

    if (result.status === "updated") {
      return NextResponse.json({
        success: true,
        username,
        isAdmin: result.isAdmin,
      });
    }

    const responses = {
      "missing-profile": [404, "Profil bilgisi bulunamadı."],
      unchanged: [400, "Yeni kullanıcı adı mevcut kullanıcı adından farklı olmalı."],
      "already-changed": [403, "Kullanıcı adı değiştirme hakkını daha önce kullandın."],
      taken: [409, "Bu kullanıcı adı başka biri tarafından kullanılıyor."],
    } as const;
    const [status, error] = responses[result.status];

    return NextResponse.json({ success: false, error }, { status });
  } catch (error) {
    console.error("Kullanıcı adı güncellenemedi:", error);
    return NextResponse.json(
      { success: false, error: "Kullanıcı adı şu anda değiştirilemedi. Lütfen tekrar dene." },
      { status: 500 }
    );
  }
}
