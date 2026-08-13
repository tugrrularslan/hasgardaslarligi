import { NextRequest, NextResponse } from "next/server";
import { syncPlayerRoster } from "@/lib/player-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET ortam değişkeni eksik." },
      { status: 503 },
    );
  }

  if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: "Yetkisiz istek." },
      { status: 401 },
    );
  }

  try {
    const roster = await syncPlayerRoster("cron");
    return NextResponse.json(roster, {
      status: roster.success ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Günlük oyuncu senkronizasyonu başarısız:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Günlük oyuncu senkronizasyonu başarısız.",
      },
      { status: 502 },
    );
  }
}
