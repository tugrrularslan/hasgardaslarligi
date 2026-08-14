import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86_400;

type SportsDbPlayer = {
  strPlayer?: unknown;
  strTeam?: unknown;
  strCutout?: unknown;
  strThumb?: unknown;
};

type WikidataSearchResult = {
  id?: unknown;
  label?: unknown;
  description?: unknown;
};

type WikidataImageClaim = {
  mainsnak?: {
    datavalue?: {
      value?: unknown;
    };
  };
};

type WikidataEntity = {
  claims?: {
    P18?: WikidataImageClaim[];
  };
};

// A few current Çorum FK players do not have reliable profile pictures in the
// public player databases. Keep the team-specific portraits ahead of those
// fallbacks so a partial name search cannot show a different footballer.
const CORUM_FK_PHOTO_OVERRIDES: Record<string, string> = {
  "jesus ramirez":
    "https://im.haberturk.com/l/2026/08/08/ver1786136480/3904156/jpg/1200x628",
  "j ramirez":
    "https://im.haberturk.com/l/2026/08/08/ver1786136480/3904156/jpg/1200x628",
  fredy:
    "https://assets.sorare.com/playerpicture/e378fdc9-458b-40c5-9fd6-23f92b0122a7/picture/squared-6e243e30eb1ec24288e2f8932a84add4.png",
  "fredy ribeiro":
    "https://assets.sorare.com/playerpicture/e378fdc9-458b-40c5-9fd6-23f92b0122a7/picture/squared-6e243e30eb1ec24288e2f8932a84add4.png",
  "f ribeiro":
    "https://assets.sorare.com/playerpicture/e378fdc9-458b-40c5-9fd6-23f92b0122a7/picture/squared-6e243e30eb1ec24288e2f8932a84add4.png",
  "alexandros kyziridis":
    "https://www.heartsfc.co.uk/cdn/shop/files/Kyzi_2500x2500_317204d5-5a30-4b49-8cd9-9769ba15361b.png?v=1754040951&width=800",
  kyziridis:
    "https://www.heartsfc.co.uk/cdn/shop/files/Kyzi_2500x2500_317204d5-5a30-4b49-8cd9-9769ba15361b.png?v=1754040951&width=800",
  "a kyziridis":
    "https://www.heartsfc.co.uk/cdn/shop/files/Kyzi_2500x2500_317204d5-5a30-4b49-8cd9-9769ba15361b.png?v=1754040951&width=800",
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

function httpsUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;

  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function findTeamSpecificPhoto(name: string, team: string): string | null {
  if (!normalize(team).includes("corum")) return null;

  return httpsUrl(CORUM_FK_PHOTO_OVERRIDES[normalize(name)]);
}

function photoUrl(player: SportsDbPlayer): string | null {
  const photo = text(player.strCutout) ?? text(player.strThumb);
  return httpsUrl(photo);
}

function playerMatchScore(
  player: SportsDbPlayer,
  normalizedName: string,
  normalizedTeam: string,
): number {
  const candidateName = normalize(text(player.strPlayer) ?? "");
  const candidateTeam = normalize(text(player.strTeam) ?? "");
  const isNameRelated =
    Boolean(candidateName) &&
    (candidateName.includes(normalizedName) ||
      normalizedName.includes(candidateName));

  return (
    (candidateName === normalizedName ? 8 : 0) +
    (isNameRelated ? 3 : 0) +
    (normalizedTeam && candidateTeam === normalizedTeam ? 4 : 0)
  );
}

async function findSportsDbPhoto(
  name: string,
  team: string,
): Promise<string | null> {
  const response = await fetch(
    `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`,
    { next: { revalidate } },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { player?: SportsDbPlayer[] | null };
  const normalizedName = normalize(name);
  const normalizedTeam = normalize(team);
  const bestMatch = (data.player ?? [])
    .filter((player) => photoUrl(player))
    .map((player) => ({
      player,
      score: playerMatchScore(player, normalizedName, normalizedTeam),
    }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score)[0]?.player;

  return bestMatch ? photoUrl(bestMatch) : null;
}

async function findWikidataPhoto(name: string): Promise<string | null> {
  const searchParams = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: "en",
    limit: "5",
    search: name,
  });
  const searchResponse = await fetch(
    `https://www.wikidata.org/w/api.php?${searchParams.toString()}`,
    { next: { revalidate } },
  );

  if (!searchResponse.ok) return null;

  const searchData = (await searchResponse.json()) as {
    search?: WikidataSearchResult[];
  };
  const normalizedName = normalize(name);
  const matchingPlayer = (searchData.search ?? []).find(
    (player) =>
      normalize(text(player.label) ?? "") === normalizedName &&
      /football|soccer/i.test(text(player.description) ?? ""),
  );
  const entityId = text(matchingPlayer?.id);
  if (!entityId) return null;

  const entityParams = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: entityId,
    props: "claims",
  });
  const entityResponse = await fetch(
    `https://www.wikidata.org/w/api.php?${entityParams.toString()}`,
    { next: { revalidate } },
  );
  if (!entityResponse.ok) return null;

  const entityData = (await entityResponse.json()) as {
    entities?: Record<string, WikidataEntity>;
  };
  const imageFile = text(entityData.entities?.[entityId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value);
  if (!imageFile) return null;

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}?width=320`;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const team = request.nextUrl.searchParams.get("team")?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ photo: null }, { status: 400 });
  }

  try {
    const photo =
      findTeamSpecificPhoto(name, team) ??
      (await findSportsDbPhoto(name, team)) ??
      (await findWikidataPhoto(name));

    return NextResponse.json(
      { photo },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("Oyuncu fotoğrafı alınamadı:", error);
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
