import { NextRequest, NextResponse } from "next/server";
import { KAHIN_MANUAL_PLAYERS, resolveKahinTeamName } from "@/lib/kahin";

export const revalidate = 3_600;
export const dynamic = "force-dynamic";

type EspnTeam = {
  id?: string;
  displayName?: string;
};

type EspnAthlete = {
  displayName?: string;
};

function decodeName(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|apos|quot|nbsp);/g, (_, entity) => {
      const entities: Record<string, string> = {
        amp: "&",
        apos: "'",
        quot: '"',
        nbsp: " ",
      };

      return entities[entity];
    })
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    const headers = { "User-Agent": "Has-Gardaslar-Ligi" };
    const forceRefresh = request.nextUrl.searchParams.has("refresh");
    const fetchOptions = forceRefresh
      ? { headers, cache: "no-store" as const }
      : { headers, next: { revalidate } };
    const teamsResponse = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams",
      fetchOptions,
    );

    if (!teamsResponse.ok) {
      throw new Error("Takım listesi alınamadı.");
    }

    const teamsData = (await teamsResponse.json()) as {
      sports?: Array<{ leagues?: Array<{ teams?: Array<{ team?: EspnTeam }> }> }>;
    };
    const teams =
      teamsData.sports?.[0]?.leagues?.[0]?.teams
        ?.map((item) => item.team)
        .filter((team): team is Required<EspnTeam> => Boolean(team?.id && team.displayName)) ?? [];

    const rosters = await Promise.all(
      teams.map(async (team) => {
        try {
          const rosterResponse = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams/${team.id}/roster`,
            fetchOptions,
          );

          if (!rosterResponse.ok) return [];

          const rosterData = (await rosterResponse.json()) as {
            athletes?: EspnAthlete[];
          };

          return (rosterData.athletes ?? [])
            .map((athlete) => decodeName(athlete.displayName ?? ""))
            .filter(Boolean)
            .map((name) => ({
              name,
              team: resolveKahinTeamName(team.displayName),
            }));
        } catch (error) {
          console.error(`${team.displayName} kadrosu alınamadı:`, error);
          return [];
        }
      }),
    );

    const uniquePlayers = new Map<string, { name: string; team: string }>();
    for (const player of [...rosters.flat(), ...KAHIN_MANUAL_PLAYERS]) {
      const key = `${player.name.toLocaleLowerCase("tr-TR")}::${player.team.toLocaleLowerCase("tr-TR")}`;
      uniquePlayers.set(key, player);
    }

    const players = [...uniquePlayers.values()].sort((first, second) =>
      first.name.localeCompare(second.name, "tr-TR"),
    );

    return NextResponse.json({ success: true, players, teamCount: teams.length });
  } catch (error) {
    console.error("Kahin oyuncu listesi alınamadı:", error);
    return NextResponse.json(
      { success: false, error: "Oyuncu listesi şu anda güncellenemedi." },
      { status: 502 },
    );
  }
}
