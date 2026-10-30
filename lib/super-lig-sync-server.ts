import "server-only";

import { parseEspnMatchDetails, type MatchDetailContext } from "@/lib/match-details";
import { LEAGUE_TEAM_DATA } from "@/lib/league-data";
import {
  ESPN_SUPER_LIG_SCOREBOARD_URL,
  TFF_SUPER_LIG_FIXTURE_URL,
  mergeSuperLigSources,
  parseEspnFixtureEvents,
  parseSeasonYears,
  parseTffFixtures,
} from "@/lib/super-lig-sync";

async function fetchSource(url: string, timeout = 15_000) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Has-Gardaslar-Ligi fixture synchronizer",
      Accept: "text/html, application/json;q=0.9, */*;q=0.1",
    },
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`Veri kaynağı ${response.status} ile yanıt verdi.`);
  }

  return response;
}

function decodeTffHtml(bytes: ArrayBuffer) {
  // TFF currently serves this legacy page as Windows-1254 without a reliable
  // charset header. Response.text() assumes UTF-8 and corrupts Turkish names.
  return new TextDecoder("windows-1254").decode(bytes);
}

export async function loadSuperLigSources(seasonId: string) {
  const years = parseSeasonYears(seasonId);

  if (!years) {
    throw new Error(
      "Süper Lig eşitlemesi için sezon kimliği 2026-2027 biçiminde olmalı.",
    );
  }

  const [tffResponse, firstYearResponse, secondYearResponse] = await Promise.all([
    fetchSource(TFF_SUPER_LIG_FIXTURE_URL),
    fetchSource(`${ESPN_SUPER_LIG_SCOREBOARD_URL}?dates=${years.startYear}&limit=500`),
    fetchSource(`${ESPN_SUPER_LIG_SCOREBOARD_URL}?dates=${years.endYear}&limit=500`),
  ]);
  const [tffHtml, firstYearScoreboard, secondYearScoreboard] = await Promise.all([
    tffResponse.arrayBuffer().then(decodeTffHtml),
    firstYearResponse.json(),
    secondYearResponse.json(),
  ]);
  const tffFixtures = parseTffFixtures(tffHtml, seasonId);
  const expectedMatchCount =
    LEAGUE_TEAM_DATA.length * (LEAGUE_TEAM_DATA.length - 1);
  const expectedWeekCount = LEAGUE_TEAM_DATA.length * 2 - 2;
  const weekCount = new Set(tffFixtures.map((fixture) => fixture.week)).size;

  if (
    tffFixtures.length !== expectedMatchCount ||
    weekCount !== expectedWeekCount
  ) {
    throw new Error(
      `TFF fikstürü eksik görünüyor (${tffFixtures.length}/${expectedMatchCount} maç, ${weekCount}/${expectedWeekCount} hafta). Hiçbir veri değiştirilmedi.`,
    );
  }

  const espnEvents = [
    ...parseEspnFixtureEvents(firstYearScoreboard, years.startYear),
    ...parseEspnFixtureEvents(secondYearScoreboard, years.startYear),
  ];
  const merged = mergeSuperLigSources(tffFixtures, espnEvents);

  if (
    merged.unmatchedTffFixtureIds.length > 0 ||
    merged.duplicateEspnMatchKeys.length > 0 ||
    merged.matches.length !== expectedMatchCount
  ) {
    throw new Error(
      "TFF ile saat/sonuç kaynağı tam eşleşmedi. Güvenlik nedeniyle hiçbir maç eklenmedi veya güncellenmedi.",
    );
  }

  return {
    ...merged,
    sourceStats: {
      tffFixtureCount: tffFixtures.length,
      espnEventCount: espnEvents.length,
      matchedFixtureCount: merged.matches.length,
    },
  };
}

export async function loadEspnMatchDetails(context: MatchDetailContext) {
  if (!/^\d+$/.test(context.sourceEventId)) throw new Error("Geçersiz kaynak maç kimliği.");
  const response = await fetchSource(`https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/summary?event=${context.sourceEventId}`, 8000);
  const details = parseEspnMatchDetails(await response.json(), context);
  if (!details) throw new Error("Gol ayrıntıları doğrulanmış skor veya takımlarla eşleşmedi.");
  return details;
}
