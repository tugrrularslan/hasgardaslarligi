import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings";

type LeagueStanding = {
  position: number;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  note: string | null;
};

type EspnStandingEntry = {
  team?: {
    displayName?: unknown;
    shortDisplayName?: unknown;
  };
  note?: {
    description?: unknown;
  };
  stats?: Array<{
    name?: unknown;
    value?: unknown;
  }>;
};

function numberStat(
  stats: EspnStandingEntry["stats"],
  name: string,
): number {
  const value = stats?.find((stat) => stat.name === name)?.value;

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  try {
    const response = await fetch(ESPN_STANDINGS_URL, {
      headers: { "User-Agent": "Has-Gardaslar-Ligi" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Puan durumu kaynağı ${response.status} ile yanıt verdi.`);
    }

    const data = (await response.json()) as {
      children?: Array<{
        name?: unknown;
        standings?: {
          seasonDisplayName?: unknown;
          entries?: EspnStandingEntry[];
        };
      }>;
    };
    const league = data.children?.[0];
    const entries = league?.standings?.entries ?? [];

    const standings: LeagueStanding[] = entries
      .map((entry, index) => {
        const team =
          stringValue(entry.team?.displayName) ??
          stringValue(entry.team?.shortDisplayName);

        if (!team) return null;

        return {
          position: numberStat(entry.stats, "rank") || index + 1,
          team,
          played: numberStat(entry.stats, "gamesPlayed"),
          wins: numberStat(entry.stats, "wins"),
          draws: numberStat(entry.stats, "ties"),
          losses: numberStat(entry.stats, "losses"),
          goalsFor: numberStat(entry.stats, "pointsFor"),
          goalsAgainst: numberStat(entry.stats, "pointsAgainst"),
          goalDifference: numberStat(entry.stats, "pointDifferential"),
          points: numberStat(entry.stats, "points"),
          note: stringValue(entry.note?.description),
        };
      })
      .filter((standing): standing is LeagueStanding => standing !== null)
      .sort((first, second) => first.position - second.position);

    if (standings.length === 0) {
      throw new Error("Puan durumu kaynağı boş döndü.");
    }

    return NextResponse.json(
      {
        success: true,
        competition: "Trendyol Süper Lig",
        season:
          stringValue(league?.standings?.seasonDisplayName) ?? "Güncel sezon",
        updatedAt: new Date().toISOString(),
        standings,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("Canlı puan durumu alınamadı:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Canlı puan durumu şu anda güncellenemedi.",
      },
      { status: 502 },
    );
  }
}
