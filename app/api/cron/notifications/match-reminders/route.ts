import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Yetkisiz istek.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Maç bildirim cron adresi çalışıyor.",
    checkedAt: new Date().toISOString(),
  });
}