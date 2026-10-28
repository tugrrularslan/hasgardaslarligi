import {
  LEAGUE_TEAM_DATA,
  normalizeLeagueTeamName,
  resolveLeagueTeamName,
} from "./league-data.ts";

export const TFF_SUPER_LIG_FIXTURE_URL = "https://www.tff.org/?pageID=198";
export const ESPN_SUPER_LIG_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard";

export type Score = {
  homeScore: number;
  awayScore: number;
};

export type TffFixture = {
  sourceTffMatchId: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  officialScore: Score | null;
};

export type EspnFixtureEvent = {
  sourceEventId: string;
  seasonYear: number;
  kickoff: Date;
  homeTeam: string;
  awayTeam: string;
  completed: boolean;
  score: Score | null;
};

export type SuperLigSourceMatch = {
  sourceTffMatchId: string;
  sourceEventId: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  completedScore: Score | null;
};

export type MergeResult = {
  matches: SuperLigSourceMatch[];
  unmatchedTffFixtureIds: string[];
  duplicateEspnMatchKeys: string[];
  scoreConflicts: string[];
};

const KNOWN_TEAM_NAMES = new Set<string>(
  LEAGUE_TEAM_DATA.map((team) => team.name),
);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integerValue(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&scedil;/gi, "ş")
    .replace(/&Scedil;/g, "Ş")
    .replace(/&imath;/gi, "ı")
    .replace(/&Iuml;/g, "İ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFromText(value: string): Score | null {
  const match = value.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);

  return match
    ? { homeScore: Number(match[1]), awayScore: Number(match[2]) }
    : null;
}

export function parseSeasonYears(seasonId: string) {
  const match = seasonId.trim().match(/^(\d{4})\s*[-/]\s*(\d{4})$/);

  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;

  return { startYear: Number(match[1]), endYear: Number(match[2]) };
}

export function canonicalTeamName(value: string): string | null {
  const teamName = resolveLeagueTeamName(decodeHtml(value));

  return KNOWN_TEAM_NAMES.has(teamName) ? teamName : null;
}

export function sourceMatchKey(homeTeam: string, awayTeam: string) {
  return `${normalizeLeagueTeamName(homeTeam)}__${normalizeLeagueTeamName(
    awayTeam,
  )}`;
}

export function parseEspnFixtureEvents(
  payload: unknown,
  seasonStartYear: number,
): EspnFixtureEvent[] {
  const data = asRecord(payload);
  const sourceEvents = Array.isArray(data?.events) ? data.events : [];

  return sourceEvents.flatMap((value): EspnFixtureEvent[] => {
    const event = asRecord(value);
    const eventId = stringValue(event?.id);
    const season = asRecord(event?.season);
    const seasonYear = integerValue(season?.year);
    const competitions = Array.isArray(event?.competitions)
      ? event.competitions
      : [];
    const competition = asRecord(competitions[0]);
    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];
    const home = competitors
      .map(asRecord)
      .find((competitor) => competitor?.homeAway === "home");
    const away = competitors
      .map(asRecord)
      .find((competitor) => competitor?.homeAway === "away");
    const homeTeam = stringValue(asRecord(home?.team)?.displayName);
    const awayTeam = stringValue(asRecord(away?.team)?.displayName);
    const dateText = stringValue(event?.date) || stringValue(competition?.date);
    const kickoff = new Date(dateText);
    const completed =
      asRecord(asRecord(competition?.status)?.type)?.completed === true;
    const homeScore = integerValue(home?.score);
    const awayScore = integerValue(away?.score);

    if (
      !eventId ||
      seasonYear !== seasonStartYear ||
      !homeTeam ||
      !awayTeam ||
      Number.isNaN(kickoff.getTime())
    ) {
      return [];
    }

    return [
      {
        sourceEventId: eventId,
        seasonYear,
        kickoff,
        homeTeam,
        awayTeam,
        completed,
        score:
          homeScore !== null && awayScore !== null
            ? { homeScore, awayScore }
            : null,
      },
    ];
  });
}

/**
 * TFF does not expose a documented fixture API. Its official public fixture
 * table contains each round, the stable match id and the home/away pair; this
 * parser deliberately accepts only the table's explicit three-link rows.
 */
export function parseTffFixtures(
  html: string,
  seasonId: string,
): TffFixture[] {
  const expectedSeason = `Sezon ${seasonId}`;
  const fixtureListIndex = html.indexOf("Fikstür Listesi");
  const fixtureHtml = fixtureListIndex >= 0 ? html.slice(fixtureListIndex) : html;

  if (!fixtureHtml.includes(expectedSeason)) {
    throw new Error(
      `TFF fikstür sayfası aktif sezon olarak ${seasonId} göstermiyor. Güvenlik nedeniyle eşitleme durduruldu.`,
    );
  }

  const headers = Array.from(
    fixtureHtml.matchAll(
      /<td\b(?=[^>]*\bclass=["'][^"']*\bbelirginYazi\b[^"']*["'])[^>]*>\s*(\d+)\.Hafta\s*<\/td>/gi,
    ),
  ).map((header) => ({
    index: header.index ?? 0,
    week: Number(header[1]),
  }));
  const matchRows = Array.from(
    fixtureHtml.matchAll(
      /<tr\b[^>]*>\s*<td\b[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td\b[^>]*>\s*<a\b[^>]*[?&]macId=(\d+)[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td\b[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<\/tr>/gi,
    ),
  ).map((row) => ({
    index: row.index ?? 0,
    sourceTffMatchId: row[2],
    homeTeam: row[1],
    score: row[3],
    awayTeam: row[4],
  }));
  const timeline = [
    ...headers.map((header) => ({ type: "week" as const, ...header })),
    ...matchRows.map((row) => ({ type: "match" as const, ...row })),
  ].sort((first, second) => first.index - second.index);
  const fixtures: TffFixture[] = [];
  const seenMatchIds = new Set<string>();
  let currentWeek: number | null = null;

  for (const item of timeline) {
    if (item.type === "week") {
      currentWeek = item.week;
      continue;
    }

    if (!currentWeek || seenMatchIds.has(item.sourceTffMatchId)) continue;

    const homeTeam = canonicalTeamName(item.homeTeam);
    const awayTeam = canonicalTeamName(item.awayTeam);

    if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

    seenMatchIds.add(item.sourceTffMatchId);
    fixtures.push({
      sourceTffMatchId: item.sourceTffMatchId,
      week: currentWeek,
      homeTeam,
      awayTeam,
      officialScore: scoreFromText(decodeHtml(item.score)),
    });
  }

  return fixtures.sort(
    (first, second) =>
      first.week - second.week ||
      Number(first.sourceTffMatchId) - Number(second.sourceTffMatchId),
  );
}

function scoresEqual(first: Score | null, second: Score | null) {
  return Boolean(
    first &&
      second &&
      first.homeScore === second.homeScore &&
      first.awayScore === second.awayScore,
  );
}

/**
 * TFF determines the official round and pairing. ESPN contributes exact
 * kickoff times and a second confirmation of a completed result. A score is
 * applied only when both sources agree, preventing a transient provider error
 * from changing predictions or points.
 */
export function mergeSuperLigSources(
  tffFixtures: TffFixture[],
  espnEvents: EspnFixtureEvent[],
): MergeResult {
  const eventsByKey = new Map<string, EspnFixtureEvent>();
  const duplicateEspnMatchKeys: string[] = [];

  for (const event of espnEvents) {
    const homeTeam = canonicalTeamName(event.homeTeam);
    const awayTeam = canonicalTeamName(event.awayTeam);
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;

    const key = sourceMatchKey(homeTeam, awayTeam);
    if (eventsByKey.has(key)) {
      duplicateEspnMatchKeys.push(key);
      continue;
    }

    eventsByKey.set(key, { ...event, homeTeam, awayTeam });
  }

  const duplicateKeys = new Set(duplicateEspnMatchKeys);
  const matches: SuperLigSourceMatch[] = [];
  const unmatchedTffFixtureIds: string[] = [];
  const scoreConflicts: string[] = [];

  for (const fixture of tffFixtures) {
    const key = sourceMatchKey(fixture.homeTeam, fixture.awayTeam);
    const event = eventsByKey.get(key);

    if (!event || duplicateKeys.has(key)) {
      unmatchedTffFixtureIds.push(fixture.sourceTffMatchId);
      continue;
    }

    const hasOfficialScore = fixture.officialScore !== null;
    const hasCompletedScore = event.completed && event.score !== null;
    const scoreConflict =
      hasOfficialScore && hasCompletedScore &&
      !scoresEqual(fixture.officialScore, event.score);

    if (scoreConflict) {
      scoreConflicts.push(fixture.sourceTffMatchId);
    }

    matches.push({
      sourceTffMatchId: fixture.sourceTffMatchId,
      sourceEventId: event.sourceEventId,
      week: fixture.week,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      kickoff: event.kickoff,
      completedScore:
        hasOfficialScore && hasCompletedScore && !scoreConflict
          ? event.score
          : null,
    });
  }

  return {
    matches,
    unmatchedTffFixtureIds,
    duplicateEspnMatchKeys: [...duplicateKeys],
    scoreConflicts,
  };
}
