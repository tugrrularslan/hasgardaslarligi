import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const MAX_MESSAGE_LENGTH = 240;
const MESSAGE_LIMIT = 40;
const SEND_COOLDOWN_MS = 8_000;

type ChatBody = {
  matchId?: unknown;
  messageId?: unknown;
  text?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

async function getAuthenticatedUser(request: NextRequest) {
  const idToken = getBearerToken(request);

  if (!idToken) {
    throw new Error("UNAUTHENTICATED");
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const profileSnapshot = await adminDb
    .collection("users")
    .doc(decodedToken.uid)
    .get();

  if (!profileSnapshot.exists) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  return {
    id: decodedToken.uid,
    isAdmin: profileSnapshot.data()?.isAdmin === true,
    profile: profileSnapshot.data() ?? {},
  };
}

function authErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "UNAUTHENTICATED") {
    return NextResponse.json(
      { success: false, error: "Sohbet için giriş yapmalısın." },
      { status: 401 },
    );
  }

  if (message === "PROFILE_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Kullanıcı profili bulunamadı." },
      { status: 404 },
    );
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const matchId = request.nextUrl.searchParams.get("matchId")?.trim();

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: "Maç bilgisi eksik." },
        { status: 400 },
      );
    }

    const matchSnapshot = await adminDb
      .collection("matches")
      .doc(matchId)
      .get();

    if (!matchSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Maç bulunamadı." },
        { status: 404 },
      );
    }

    const messagesSnapshot = await adminDb
      .collection("matchMessages")
      .where("matchId", "==", matchId)
      .get();

    const messages = messagesSnapshot.docs
      .map((messageDocument) => {
        const data = messageDocument.data();
        const createdAt =
          data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : 0;

        return {
          id: messageDocument.id,
          userId:
            typeof data.userId === "string" ? data.userId : "",
          username:
            typeof data.username === "string" && data.username.trim()
              ? data.username.trim()
              : "İsimsiz Gardaş",
          avatar:
            typeof data.avatar === "string" ? data.avatar : "",
          text: typeof data.text === "string" ? data.text : "",
          createdAt,
          canDelete:
            authenticatedUser.isAdmin ||
            data.userId === authenticatedUser.id,
        };
      })
      .sort(
        (firstMessage, secondMessage) =>
          firstMessage.createdAt - secondMessage.createdAt,
      )
      .slice(-MESSAGE_LIMIT);

    return NextResponse.json({ success: true, messages });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Maç sohbeti alınamadı:", error);

    return NextResponse.json(
      { success: false, error: "Maç sohbeti şu anda alınamadı." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const body = (await request.json()) as ChatBody;
    const matchId =
      typeof body.matchId === "string" ? body.matchId.trim() : "";
    const text =
      typeof body.text === "string"
        ? body.text.replace(/\s+/g, " ").trim()
        : "";

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: "Maç bilgisi eksik." },
        { status: 400 },
      );
    }

    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Mesaj 1-${MAX_MESSAGE_LENGTH} karakter arasında olmalı.`,
        },
        { status: 400 },
      );
    }

    const matchSnapshot = await adminDb
      .collection("matches")
      .doc(matchId)
      .get();

    if (!matchSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Maç bulunamadı." },
        { status: 404 },
      );
    }

    const rateLimitReference = adminDb
      .collection("matchChatRateLimits")
      .doc(`${authenticatedUser.id}_${matchId}`);
    const messageReference = adminDb.collection("matchMessages").doc();
    const now = Timestamp.now();

    await adminDb.runTransaction(async (transaction) => {
      const rateLimitSnapshot =
        await transaction.get(rateLimitReference);
      const lastSentAt = rateLimitSnapshot.data()
        ?.lastSentAt as Timestamp | undefined;

      if (
        lastSentAt instanceof Timestamp &&
        now.toMillis() - lastSentAt.toMillis() < SEND_COOLDOWN_MS
      ) {
        throw new Error("RATE_LIMITED");
      }

      const profile = authenticatedUser.profile;
      const username =
        typeof profile.username === "string" && profile.username.trim()
          ? profile.username.trim()
          : typeof profile.displayName === "string" &&
              profile.displayName.trim()
            ? profile.displayName.trim()
            : "İsimsiz Gardaş";
      const avatar =
        typeof profile.avatar === "string" ? profile.avatar : "";

      transaction.set(messageReference, {
        matchId,
        seasonId:
          typeof matchSnapshot.data()?.seasonId === "string"
            ? matchSnapshot.data()?.seasonId
            : "",
        userId: authenticatedUser.id,
        username,
        avatar,
        text,
        createdAt: now,
        updatedAt: now,
      });

      transaction.set(
        rateLimitReference,
        {
          userId: authenticatedUser.id,
          matchId,
          lastSentAt: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    return NextResponse.json({
      success: true,
      messageId: messageReference.id,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json(
        {
          success: false,
          error: "Yeni mesaj göndermek için birkaç saniye bekle.",
        },
        { status: 429 },
      );
    }

    console.error("Maç sohbeti mesajı gönderilemedi:", error);

    return NextResponse.json(
      { success: false, error: "Mesaj gönderilemedi." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser(request);
    const body = (await request.json()) as ChatBody;
    const messageId =
      typeof body.messageId === "string"
        ? body.messageId.trim()
        : "";

    if (!messageId) {
      return NextResponse.json(
        { success: false, error: "Mesaj bilgisi eksik." },
        { status: 400 },
      );
    }

    const messageReference = adminDb
      .collection("matchMessages")
      .doc(messageId);
    const messageSnapshot = await messageReference.get();

    if (!messageSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Mesaj bulunamadı." },
        { status: 404 },
      );
    }

    if (
      !authenticatedUser.isAdmin &&
      messageSnapshot.data()?.userId !== authenticatedUser.id
    ) {
      return NextResponse.json(
        { success: false, error: "Bu mesajı silemezsin." },
        { status: 403 },
      );
    }

    await messageReference.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Maç sohbeti mesajı silinemedi:", error);

    return NextResponse.json(
      { success: false, error: "Mesaj silinemedi." },
      { status: 500 },
    );
  }
}
