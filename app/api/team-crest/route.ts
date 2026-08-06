import { NextRequest, NextResponse } from "next/server";
import { getTeamCrestFallbackSearch } from "@/lib/team-crests";

export const revalidate = 86_400;

type SportsDbTeam = {
  strTeam?: unknown;
  strBadge?: unknown;
};

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  const team = request.nextUrl.searchParams.get("team")?.trim();

  if (!team) return NextResponse.json({ crest: null }, { status: 400 });

  try {
    const search = getTeamCrestFallbackSearch(team);
    const response = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(search)}`,
      { next: { revalidate } },
    );

    if (!response.ok) throw new Error(`TakÄ±m armasÄ± kaynaÄŸÄ± ${response.status} dÃ¶ndÃ¼rdÃ¼.`);

    const data = (await response.json()) as { teams?: SportsDbTeam[] | null };
    const normalizedSearch = normalize(search);
    const crest = (data.teams ?? [])
      .sort((first, second) => {
        const firstName = normalize(text(first.strTeam) ?? "");
        const secondName = normalize(text(second.strTeam) ?? "");
        return Number(secondName === normalizedSearch) - Number(firstName === normalizedSearch);
      })
      .map((candidate) => text(candidate.strBadge))
      .find((url) => url?.startsWith("https://"));

    return NextResponse.json(
      { crest: crest ?? null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("Yedek takÄ±m armasÄ± alÄ±namadÄ±:", error);
    return NextResponse.json(
      { crest: null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  }
}
