import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";
import {
  LEAGUE_TEAM_DATA,
  normalizeLeagueTeamName,
  resolveLeagueTeamName,
} from "@/lib/league-data";
import { MANUAL_LEAGUE_PLAYERS } from "@/lib/manual-players";

export const KAHIN_GAME_ID = "kahin";

export const KAHIN_TEAMS = LEAGUE_TEAM_DATA.map((team) => team.name);

export function normalizeKahinTeamName(team: string): string {
  return normalizeLeagueTeamName(team);
}

/** Maps provider and manually entered team names to the game's canonical names. */
export function resolveKahinTeamName(team: string): string {
  return resolveLeagueTeamName(team);
}

// Kahin özel tahminlerinde herkesin aynı isimleri seçmesi için sabit aday havuzu.
// Yeni sezon başında bu listeler kod üzerinden birlikte güncellenir.
export const KAHIN_SCORER_PLAYERS = [
  "Ahmed Kutucu",
  "Ali Sowe",
  "Anderson Talisca",
  "Barış Alper Yılmaz",
  "Carlo Holse",
  "David Okereke",
  "Denis Drăguș",
  "Edin Višća",
  "Emre Kılınç",
  "Ernest Muçi",
  "Felipe Augusto",
  "Gabriel Sara",
  "İrfan Can Kahveci",
  "Jhon Durán",
  "Juan",
  "Kerem Aktürkoğlu",
  "Kubilay Kanatsızkuş",
  "Leroy Sané",
  "Marius Mouandilmadji",
  "Mauro Icardi",
  "Milot Rashica",
  "Oleksandr Zubkov",
  "Oğuz Aydın",
  "Paul Onuachu",
  "Rafa Silva",
  "Rômulo",
  "Sebastian Szymański",
  "Tammy Abraham",
  "Victor Osimhen",
  "Youssef En-Nesyri",
  "Yunus Akgün",
] as const;

export const KAHIN_ASSIST_PLAYERS = [
  "Anderson Talisca",
  "Barış Alper Yılmaz",
  "Carlo Holse",
  "Edin Višća",
  "Emre Kılınç",
  "Ernest Muçi",
  "Gabriel Sara",
  "İrfan Can Kahveci",
  "Jhon Durán",
  "Kerem Aktürkoğlu",
  "Leroy Sané",
  "Milot Rashica",
  "Oleksandr Zubkov",
  "Oğuz Aydın",
  "Rafa Silva",
  "Sebastian Szymański",
  "Yunus Akgün",
] as const;

export const KAHIN_GOALKEEPERS = [
  "Berke Özer",
  "Dominik Livaković",
  "Ertuğrul Taşkıran",
  "Gökhan Akkan",
  "İrfan Can Eğribayat",
  "Mateusz Lis",
  "Mert Günok",
  "Muhammed Şengezer",
  "Okan Kocuk",
  "Uğurcan Çakır",
] as const;

export type KahinPlayer = {
  name: string;
  team: string;
};

// Harici kadro kaynağı transferleri gecikmeli işlediğinde listeyi tamamlar.
export const KAHIN_MANUAL_PLAYERS: KahinPlayer[] = [
  ...MANUAL_LEAGUE_PLAYERS,
];

// Harici kadro servisi geçici olarak ulaşılamazsa seçim ekranı boş kalmasın.
export const KAHIN_FALLBACK_PLAYERS: KahinPlayer[] = [
  ...Array.from(
    new Set([
      ...KAHIN_SCORER_PLAYERS,
      ...KAHIN_ASSIST_PLAYERS,
      ...KAHIN_GOALKEEPERS,
    ]),
  ).map((name): KahinPlayer => ({ name, team: "" })),
  ...KAHIN_MANUAL_PLAYERS,
];

export function normalizeKahinSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i");
}

export type KahinPrediction = {
  leagueOrder: string[];
  topScorer: string;
  topAssist: string;
  cleanSheetKeeper: string;
  topScoringTeam: string;
  bestDefenseTeam: string;
};

/** Player-based seasonal predictions that can be reopened after a league exit. */
export const KAHIN_PLAYER_PREDICTION_CATEGORIES = [
  { key: "topScorer", label: "Gol Kralı" },
  { key: "topAssist", label: "Asist Kralı" },
  { key: "cleanSheetKeeper", label: "Clean Sheet Lideri" },
] as const;

export type KahinPlayerPredictionKey =
  (typeof KAHIN_PLAYER_PREDICTION_CATEGORIES)[number]["key"];

export type KahinTransferReopen = {
  operationId: string;
  gameId: string;
  seasonId: string;
  category: KahinPlayerPredictionKey;
  categoryLabel: string;
  originalSelection: string;
  replacementSelection: string;
  transferReopenedAt: Date | null;
  transferReopenedBy: string;
  replacementDeadline: Date | null;
  leagueExitConfirmed: boolean;
  notificationEventId: string;
  replacementSelectedAt: Date | null;
};

export type KahinTransferReopens = Partial<
  Record<KahinPlayerPredictionKey, KahinTransferReopen>
>;

export function isKahinPlayerPredictionKey(
  value: unknown,
): value is KahinPlayerPredictionKey {
  return KAHIN_PLAYER_PREDICTION_CATEGORIES.some(
    (category) => category.key === value,
  );
}

export function getKahinPlayerPredictionLabel(
  key: KahinPlayerPredictionKey,
): string {
  return (
    KAHIN_PLAYER_PREDICTION_CATEGORIES.find(
      (category) => category.key === key,
    )?.label ?? key
  );
}

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
  resultsPublished: boolean;
};

export const DEFAULT_KAHIN_SETTINGS: KahinSettings = {
  seasonId: DEFAULT_SEASON_ID,
  seasonName: DEFAULT_SEASON_NAME,
  deadline: new Date("2026-08-14T21:00:00+03:00"),
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

export function sanitizeKahinPlayers(value: unknown): KahinPlayer[] {
  if (!Array.isArray(value)) return [];

  const players = value
    .map((item): KahinPlayer | null => {
      if (typeof item === "string" && item.trim()) {
        return { name: item.trim(), team: "" };
      }

      if (!item || typeof item !== "object") return null;

      const data = item as Record<string, unknown>;
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const team = typeof data.team === "string" ? data.team.trim() : "";

      return name ? { name, team } : null;
    })
    .filter((player): player is KahinPlayer => player !== null);

  return mergeKahinPlayers(players);
}

export function mergeKahinPlayers(
  ...groups: KahinPlayer[][]
): KahinPlayer[] {
  const uniquePlayers = new Map<string, KahinPlayer>();

  for (const player of groups.flat()) {
    const name = player.name.trim();
    const team = player.team.trim();
    if (!name) continue;

    const key = `${name.toLocaleLowerCase("tr-TR")}::${team.toLocaleLowerCase("tr-TR")}`;
    if (!uniquePlayers.has(key)) {
      uniquePlayers.set(key, { name, team });
    }
  }

  return [...uniquePlayers.values()].sort((first, second) =>
    first.name.localeCompare(second.name, "tr-TR"),
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

function sanitizeKahinDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  return null;
}

/**
 * Reads only the immutable audit fields and the one permitted replacement value
 * from a user's transfer exception map. Unknown or malformed entries are ignored.
 */
export function sanitizeKahinTransferReopens(
  value: unknown,
): KahinTransferReopens {
  if (!value || typeof value !== "object") return {};

  const data = value as Record<string, unknown>;
  const reopens: KahinTransferReopens = {};

  for (const { key, label } of KAHIN_PLAYER_PREDICTION_CATEGORIES) {
    const candidate = data[key];
    if (!candidate || typeof candidate !== "object") continue;

    const entry = candidate as Record<string, unknown>;
    const operationId =
      typeof entry.operationId === "string" ? entry.operationId.trim() : "";
    const seasonId =
      typeof entry.seasonId === "string" ? entry.seasonId.trim() : "";
    const originalSelection =
      typeof entry.originalSelection === "string"
        ? entry.originalSelection.trim()
        : "";
    const replacementDeadline = sanitizeKahinDate(entry.replacementDeadline);

    if (!operationId || !seasonId || !originalSelection || !replacementDeadline) {
      continue;
    }

    reopens[key] = {
      operationId,
      gameId: typeof entry.gameId === "string" ? entry.gameId : KAHIN_GAME_ID,
      seasonId,
      category: key,
      categoryLabel:
        typeof entry.categoryLabel === "string" && entry.categoryLabel.trim()
          ? entry.categoryLabel
          : label,
      originalSelection,
      replacementSelection:
        typeof entry.replacementSelection === "string"
          ? entry.replacementSelection.trim()
          : "",
      transferReopenedAt: sanitizeKahinDate(entry.transferReopenedAt),
      transferReopenedBy:
        typeof entry.transferReopenedBy === "string"
          ? entry.transferReopenedBy
          : "",
      replacementDeadline,
      leagueExitConfirmed: entry.leagueExitConfirmed === true,
      notificationEventId:
        typeof entry.notificationEventId === "string"
          ? entry.notificationEventId
          : "",
      replacementSelectedAt: sanitizeKahinDate(entry.replacementSelectedAt),
    };
  }

  return reopens;
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
