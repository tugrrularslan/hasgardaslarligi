import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type DeleteUserBody = {
  userId?: unknown;
  confirmation?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

async function getAdminId(request: NextRequest) {
  const idToken = getBearerToken(request);

  if (!idToken) {
    return { error: "Oturum bilgisi bulunamadı.", status: 401 } as const;
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const adminSnapshot = await adminDb
    .collection("users")
    .doc(decodedToken.uid)
    .get();

  if (!adminSnapshot.exists || adminSnapshot.data()?.isAdmin !== true) {
    return {
      error: "Bu işlem için yönetici yetkisi gerekiyor.",
      status: 403,
    } as const;
  }

  return { adminId: decodedToken.uid } as const;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminId(request);

    if ("error" in admin) {
      return NextResponse.json(
        { success: false, error: admin.error },
        { status: admin.status }
      );
    }

    const usersSnapshot = await adminDb.collection("users").get();
    const users = usersSnapshot.docs
      .map((userDocument) => {
        const data = userDocument.data();

        return {
          uid: userDocument.id,
          username:
            typeof data.username === "string" && data.username.trim()
              ? data.username.trim()
              : "İsimsiz Gardaş",
          isAdmin: data.isAdmin === true,
        };
      })
      .filter((profile) => !profile.isAdmin)
      .sort((first, second) =>
        first.username.localeCompare(second.username, "tr-TR")
      );

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("Silinebilecek kullanıcılar alınamadı:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Kullanıcı listesi şu anda alınamadı.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminId(request);

    if ("error" in admin) {
      return NextResponse.json(
        { success: false, error: admin.error },
        { status: admin.status }
      );
    }

    const body = (await request.json()) as DeleteUserBody;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation : "";

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Silinecek kullanıcı seçilmedi." },
        { status: 400 }
      );
    }

    if (userId === admin.adminId) {
      return NextResponse.json(
        {
          success: false,
          error: "Kendi yönetici hesabını bu ekrandan silemezsin.",
        },
        { status: 400 }
      );
    }

    const userReference = adminDb.collection("users").doc(userId);
    const userSnapshot = await userReference.get();

    if (!userSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Kullanıcı bulunamadı." },
        { status: 404 }
      );
    }

    const userData = userSnapshot.data() ?? {};

    if (userData.isAdmin === true) {
      return NextResponse.json(
        {
          success: false,
          error: "Başka bir yönetici hesabı bu ekrandan silinemez.",
        },
        { status: 403 }
      );
    }

    const username =
      typeof userData.username === "string" && userData.username.trim()
        ? userData.username.trim()
        : "İsimsiz Gardaş";
    const expectedConfirmation = `HESABI SİL: ${username}`;

    if (confirmation !== expectedConfirmation) {
      return NextResponse.json(
        { success: false, error: "Onay metni kullanıcı adıyla eşleşmiyor." },
        { status: 400 }
      );
    }

    await adminAuth.getUser(userId);

    const [
      predictionsSnapshot,
      notificationTokensSnapshot,
      matchMessagesSnapshot,
      matchChatRateLimitsSnapshot,
    ] = await Promise.all([
      adminDb.collection("predictions").where("userId", "==", userId).get(),
      adminDb
        .collection("notificationTokens")
        .where("userId", "==", userId)
        .get(),
      adminDb
        .collection("matchMessages")
        .where("userId", "==", userId)
        .get(),
      adminDb
        .collection("matchChatRateLimits")
        .where("userId", "==", userId)
        .get(),
    ]);

    const writer = adminDb.bulkWriter();

    for (const userDocument of [
      ...predictionsSnapshot.docs,
      ...notificationTokensSnapshot.docs,
      ...matchMessagesSnapshot.docs,
      ...matchChatRateLimitsSnapshot.docs,
    ]) {
      writer.delete(userDocument.ref);
    }

    writer.delete(userReference);
    await writer.close();
    await adminAuth.deleteUser(userId);

    return NextResponse.json({
      success: true,
      username,
      deleted: {
        predictions: predictionsSnapshot.size,
        notificationTokens: notificationTokensSnapshot.size,
        matchMessages: matchMessagesSnapshot.size,
        matchChatRateLimits: matchChatRateLimitsSnapshot.size,
      },
    });
  } catch (error) {
    console.error("Kullanıcı silinemedi:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Kullanıcı silinemedi. Lütfen tekrar dene.",
      },
      { status: 500 }
    );
  }
}
