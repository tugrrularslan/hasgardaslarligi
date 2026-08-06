import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86_400;

type SportsDbPlayer = {
  strPlayer?: unknown;
  strTeam?: unknown;
  strCutout?: unknown;
  strThumb?: unknown;
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

function photoUrl(player: SportsDbPlayer): string | null {
  const photo = text(player.strCutout) ?? text(player.strThumb);

  return photo?.startsWith("https://") ? photo : null;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const team = request.nextUrl.searchParams.get("team")?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ photo: null }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`,
      { next: { revalidate } },
    );

    if (!response.ok) throw new Error(`Oyuncu fotoÄŸrafÄ± kaynaÄŸÄ± ${response.status} dÃ¶ndÃ¼rdÃ¼.`);

    const data = (await response.json()) as { player?: SportsDbPlayer[] | null };
    const normalizedName = normalize(name);
    const normalizedTeam = normalize(team);

    const bestMatch = (data.player ?? [])
      .filter((player) => photoUrl(player))
      .sort((first, second) => {
        const firstName = normalize(text(first.strPlayer) ?? "");
        const secondName = normalize(text(second.strPlayer) ?? "");
        const firstTeam = normalize(text(first.strTeam) ?? "");
        const secondTeam = normalize(text(second.strTeam) ?? "");

        const score = (candidateName: string, candidateTeam: string) =>
          (candidateName === normalizedName ? 4 : 0) +
          (candidateName.includes(normalizedName) || normalizedName.includes(candidateName)
            ? 2
            : 0) +
          (normalizedTeam && candidateTeam === normalizedTeam ? 3 : 0);

        return score(secondName, secondTeam) - score(firstName, firstTeam);
      })[0];

    return NextResponse.json(
      { photo: bestMatch ? photoUrl(bestMatch) : null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("Oyuncu fotoÄŸrafÄ± alÄ±namadÄ±:", error);
    return NextResponse.json(
      { photo: null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  }
}
