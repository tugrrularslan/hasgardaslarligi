import { NextResponse } from "next/server";
import {
  getStoredPlayerRoster,
  syncPlayerRoster,
} from "@/lib/player-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storedRoster = await getStoredPlayerRoster();
    const roster = storedRoster ?? (await syncPlayerRoster("bootstrap"));

    return NextResponse.json(roster, {
      status: roster.success ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Ortak futbolcu listesi alınamadı:", error);
    return NextResponse.json(
      {
        success: false,
        players: [],
        teamCount: 0,
        syncedAt: null,
        error: "Oyuncu listesi şu anda alınamadı.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
