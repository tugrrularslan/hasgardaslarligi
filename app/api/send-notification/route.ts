import { NextRequest, NextResponse } from "next/server";
import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin ortam değişkenleri eksik."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Oturum bilgisi eksik." },
        { status: 401 }
      );
    }

    const idToken = authorization.replace("Bearer ", "").trim();

    const adminApp = getAdminApp();
    const adminAuth = (await import("firebase-admin/auth")).getAuth(
      adminApp
    );

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    const adminDb = getFirestore(adminApp);

    const adminUserSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (
      !adminUserSnapshot.exists ||
      adminUserSnapshot.data()?.isAdmin !== true
    ) {
      return NextResponse.json(
        { error: "Bu işlem için yönetici yetkisi gerekiyor." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    const messageBody =
      typeof body.body === "string" ? body.body.trim() : "";

    const targetUrl =
      typeof body.targetUrl === "string"
        ? body.targetUrl.trim()
        : "/";

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: "Bildirim başlığı ve mesajı zorunludur." },
        { status: 400 }
      );
    }

    if (!targetUrl.startsWith("/")) {
      return NextResponse.json(
        { error: "Yönlendirme adresi / ile başlamalıdır." },
        { status: 400 }
      );
    }

    const tokenSnapshot = await adminDb
      .collection("notificationTokens")
      .where("enabled", "==", true)
      .get();

    const tokens = tokenSnapshot.docs
      .map((tokenDocument) => {
        const tokenData = tokenDocument.data();

        return typeof tokenData.token === "string"
          ? tokenData.token
          : null;
      })
      .filter((token): token is string => Boolean(token));

    if (tokens.length === 0) {
      return NextResponse.json(
        { error: "Bildirim gönderilecek kayıtlı cihaz bulunamadı." },
        { status: 400 }
      );
    }

    let successCount = 0;
    let failureCount = 0;

    const invalidTokens: string[] = [];

    for (let index = 0; index < tokens.length; index += 500) {
      const tokenGroup = tokens.slice(index, index + 500);

      const response = await getMessaging(adminApp).sendEachForMulticast({
        tokens: tokenGroup,
        notification: {
          title,
          body: messageBody,
        },
        data: {
          targetUrl,
        },
        webpush: {
          fcmOptions: {
            link: targetUrl,
          },
        },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((result, resultIndex) => {
        if (result.success) return;

        const errorCode = result.error?.code;

        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          invalidTokens.push(tokenGroup[resultIndex]);
        }
      });
    }

    if (invalidTokens.length > 0) {
      const deleteBatch = adminDb.batch();

      tokenSnapshot.docs.forEach((tokenDocument) => {
        const token = tokenDocument.data().token;

        if (invalidTokens.includes(token)) {
          deleteBatch.delete(tokenDocument.ref);
        }
      });

      await deleteBatch.commit();
    }

    await adminDb.collection("notifications").add({
      title,
      body: messageBody,
      targetUrl,
      sentBy: decodedToken.uid,
      successCount,
      failureCount,
      createdAt:
        (await import("firebase-admin/firestore")).FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      successCount,
      failureCount,
    });
  } catch (error) {
    console.error("Bildirim gönderme hatası:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bildirim gönderilemedi.",
      },
      { status: 500 }
    );
  }
}