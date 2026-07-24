import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";

export const KAHIN_GAME_ID = "kahin";

export const KAHIN_TEAMS = [
  "Alanyaspor",
  "Amed SK",
  "Beşiktaş",
  "Başakşehir",
  "Çaykur Rizespor",
  "Çorum FK",
  "Erzurumspor FK",
  "Eyüpspor",
  "Fenerbahçe",
  "Galatasaray",
  "Gaziantep FK",
  "Gençlerbirliği",
  "Göztepe",
  "Kasımpaşa",
  "Kocaelispor",
  "Konyaspor",
  "Samsunspor",
  "Trabzonspor",
] as const;

export type KahinPrediction = {
  leagueOrder: string[];
  topScorer: string;
  topAssist: string;
  cleanSheetKeeper: string;
  topScoringTeam: string;
  bestDefenseTeam: string;
};

export type KahinResults = {
  leagueOrder: string[];
  topScorers: string[];
  topAssisters: string[];
  cleanSheetKeepers: string[];
  topScoringTeams: string[];
  bestDefenseTeams: string[];
};

export type KahinScoreBreakdown = {
  exactPositions: number;
  nearPositions: number;
  tablePoints: number;
  championBonus: number;
  topScorerPoints: number;
  topAssistPoints: number;
  cleanSheetPoints: number;
  topScoringTeamPoints: number;
  bestDefenseTeamPoints: number;
  correctSpecials: number;
  total: number;
};

export type KahinSettings = {
  seasonId: string;
  seasonName: string;
  deadline: Date | null;
  scorerOptions: string[];
  assistOptions: string[];
  goalkeeperOptions: string[];
  resultsPublished: boolean;
};

export const DEFAULT_KAHIN_SETTINGS: KahinSettings = {
  seasonId: DEFAULT_SEASON_ID,
  seasonName: DEFAULT_SEASON_NAME,
  deadline: null,
  scorerOptions: [],
  assistOptions: [],
  goalkeeperOptions: [],
  resultsPublished: false,
};

export const EMPTY_KAHIN_PREDICTION: KahinPrediction = {
  leagueOrder: [...KAHIN_TEAMS],
  topScorer: "",
  topAssist: "",
  cleanSheetKeeper: "",
  topScoringTeam: "",
  bestDefenseTeam: "",
};

export function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function sanitizeLeagueOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [...KAHIN_TEAMS];

  const validTeams = value.filter(
    (team): team is string =>
      typeof team === "string" &&
      KAHIN_TEAMS.includes(team as (typeof KAHIN_TEAMS)[number]),
  );

  const uniqueTeams = Array.from(new Set(validTeams));
  const missingTeams = KAHIN_TEAMS.filter((team) => !uniqueTeams.includes(team));

  return [...uniqueTeams, ...missingTeams];
}

export function sanitizeKahinPrediction(value: unknown): KahinPrediction {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    leagueOrder: sanitizeLeagueOrder(data.leagueOrder),
    topScorer: typeof data.topScorer === "string" ? data.topScorer : "",
    topAssist: typeof data.topAssist === "string" ? data.topAssist : "",
    cleanSheetKeeper:
      typeof data.cleanSheetKeeper === "string"
        ? data.cleanSheetKeeper
        : "",
    topScoringTeam:
      typeof data.topScoringTeam === "string" ? data.topScoringTeam : "",
    bestDefenseTeam:
      typeof data.bestDefenseTeam === "string" ? data.bestDefenseTeam : "",
  };
}

export function isKahinPredictionComplete(
  prediction: KahinPrediction,
): boolean {
  return (
    prediction.leagueOrder.length === KAHIN_TEAMS.length &&
    new Set(prediction.leagueOrder).size === KAHIN_TEAMS.length &&
    Boolean(prediction.topScorer.trim()) &&
    Boolean(prediction.topAssist.trim()) &&
    Boolean(prediction.cleanSheetKeeper.trim()) &&
    Boolean(prediction.topScoringTeam.trim()) &&
    Boolean(prediction.bestDefenseTeam.trim())
  );
}

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesAny(answer: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(answer);
  return accepted.some((item) => normalizeAnswer(item) === normalized);
}

export function calculateKahinScore(
  prediction: KahinPrediction,
  results: KahinResults,
): KahinScoreBreakdown {
  let exactPositions = 0;
  let nearPositions = 0;

  prediction.leagueOrder.forEach((team, predictedIndex) => {
    const actualIndex = results.leagueOrder.indexOf(team);
    if (actualIndex === predictedIndex) exactPositions += 1;
    else if (Math.abs(actualIndex - predictedIndex) === 1) nearPositions += 1;
  });

  const tablePoints = exactPositions * 3 + nearPositions;
  const championBonus =
    prediction.leagueOrder[0] === results.leagueOrder[0] ? 6 : 0;
  const topScorerPoints = matchesAny(
    prediction.topScorer,
    results.topScorers,
  )
    ? 12
    : 0;
  const topAssistPoints = matchesAny(
    prediction.topAssist,
    results.topAssisters,
  )
    ? 12
    : 0;
  const cleanSheetPoints = matchesAny(
    prediction.cleanSheetKeeper,
    results.cleanSheetKeepers,
  )
    ? 12
    : 0;
  const topScoringTeamPoints = matchesAny(
    prediction.topScoringTeam,
    results.topScoringTeams,
  )
    ? 8
    : 0;
  const bestDefenseTeamPoints = matchesAny(
    prediction.bestDefenseTeam,
    results.bestDefenseTeams,
  )
    ? 8
    : 0;
  const specialScores = [
    topScorerPoints,
    topAssistPoints,
    cleanSheetPoints,
    topScoringTeamPoints,
    bestDefenseTeamPoints,
  ];
  const correctSpecials = specialScores.filter((score) => score > 0).length;
  const total =
    tablePoints +
    championBonus +
    topScorerPoints +
    topAssistPoints +
    cleanSheetPoints +
    topScoringTeamPoints +
    bestDefenseTeamPoints;

  return {
    exactPositions,
    nearPositions,
    tablePoints,
    championBonus,
    topScorerPoints,
    topAssistPoints,
    cleanSheetPoints,
    topScoringTeamPoints,
    bestDefenseTeamPoints,
    correctSpecials,
    total,
  };
}
