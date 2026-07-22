import { NextRequest, NextResponse } from "next/server";
import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";

function getFirebaseAdminApp() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin ortam değişkenleri eksik."
    );
  }

  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export async function GET(request: NextRequest) {
  try {
    const app = getFirebaseAdminApp();
    const db = getFirestore(app);

    const matchesSnapshot = await db
      .collection("matches")
      .limit(1)
      .get();

    return NextResponse.json({
      success: true,
      message: "Firebase Admin bağlantısı çalışıyor.",
      matchCount: matchesSnapshot.size,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Bilinmeyen hata",
      },
      {
        status: 500,
      }
    );
  }
}