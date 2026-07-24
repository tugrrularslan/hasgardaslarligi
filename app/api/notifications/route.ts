import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json(
    {
      success: false,
      disabled: true,
      error:
        "Eski otomatik bildirim rotası devre dışı. Otomatik bildirimler yalnızca Google Cloud Tasks üzerinden gönderilir.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return disabledResponse();
}

export async function POST() {
  return disabledResponse();
}
