import {
  DEFAULT_BADGE_PROGRESS,
  type BadgeProgressData,
} from "@/lib/achievements";
import { DEFAULT_SEASON_ID } from "@/lib/season";

type TimestampLike = {
  seconds?: number;
  toMillis?: () => number;
};

type MatchRecord = {
  id: string;
  seasonId?: unknown;
  week?: unknown;
  kickoff?: unknown;
  status?: unknown;
};

type PredictionRecord = {
  matchId?: unknown;
  isCorrect?: unknown;
  awardedPoints?: unknown;
};

type WeeklyChampionRecord = {
  id: string;
  seasonId?: unknown;
  week?: unknown;
  winnerIds?: unknown;
  awarded?: unknown;
};

type CalculateBadgeProgressInput = {
  activeSeasonId: string;
  userId: string;
  matches: MatchRecord[];
  predictions: PredictionRecord[];
  weeklyChampions: WeeklyChampionRecord[];
};

export function calculateBadgeProgressFromRecords({
  activeSeasonId,
  userId,
  matches,
  predictions,
  weeklyChampions,
}: CalculateBadgeProgressInput): BadgeProgressData {
  const seasonMatches = matches
    .filter((match) => belongsToSeason(match.seasonId, activeSeasonId))
    .map((match) => ({
      ...match,
      week: positiveInteger(match.week),
    }));

  if (seasonMatches.length === 0) {
    return DEFAULT_BADGE_PROGRESS;
  }

  const seasonMatchIds = new Set(seasonMatches.map((match) => match.id));
  const predictionByMatchId = new Map<string, PredictionRecord>();

  for (const prediction of predictions) {
    if (
      typeof prediction.matchId === "string" &&
      seasonMatchIds.has(prediction.matchId)
    ) {
      predictionByMatchId.set(prediction.matchId, prediction);
    }
  }

  let totalCorrectPredictions = 0;
  let consecutiveCorrectPredictions = 0;
  let currentCorrectStreak = 0;

  const orderedFinishedMatches = seasonMatches
    .filter((match) => match.status === "finished")
    .sort((firstMatch, secondMatch) => {
      const timeDifference =
        timestampToMillis(firstMatch.kickoff) -
        timestampToMillis(secondMatch.kickoff);

      return timeDifference || firstMatch.id.localeCompare(secondMatch.id);
    });

  for (const match of orderedFinishedMatches) {
    const prediction = predictionByMatchId.get(match.id);
    const isCorrect =
      prediction?.isCorrect === true && prediction.awardedPoints === 1;

    if (isCorrect) {
      totalCorrectPredictions += 1;
      currentCorrectStreak += 1;
      consecutiveCorrectPredictions = Math.max(
        consecutiveCorrectPredictions,
        currentCorrectStreak,
      );
    } else {
      currentCorrectStreak = 0;
    }
  }

  const matchesByWeek = new Map<number, typeof seasonMatches>();

  for (const match of seasonMatches) {
    if (match.week <= 0) continue;

    const weekMatches = matchesByWeek.get(match.week) ?? [];
    weekMatches.push(match);
    matchesByWeek.set(match.week, weekMatches);
  }

  let bestWeekCorrectPredictions = 0;
  let bestWeekTotalMatches = 0;
  let perfectWeeks = 0;

  for (const weekMatches of matchesByWeek.values()) {
    const correctCount = weekMatches.filter((match) => {
      const prediction = predictionByMatchId.get(match.id);
      return (
        prediction?.isCorrect === true && prediction.awardedPoints === 1
      );
    }).length;

    if (correctCount > bestWeekCorrectPredictions) {
      bestWeekCorrectPredictions = correctCount;
      bestWeekTotalMatches = weekMatches.length;
    }

    const isCompletedPerfectWeek =
      weekMatches.length > 0 &&
      weekMatches.every((match) => match.status === "finished") &&
      correctCount === weekMatches.length;

    if (isCompletedPerfectWeek) {
      perfectWeeks += 1;
    }
  }

  const participatedWeeks = new Set(
    seasonMatches
      .filter((match) => predictionByMatchId.has(match.id))
      .map((match) => match.week)
      .filter((week) => week > 0),
  ).size;

  const winningWeeks = Array.from(new Set(weeklyChampions
    .filter(
      (champion) =>
        belongsToSeason(champion.seasonId, activeSeasonId) &&
        champion.awarded !== false &&
        Array.isArray(champion.winnerIds) &&
        champion.winnerIds.includes(userId),
    )
    .map((champion) => positiveInteger(champion.week))
    .filter((week) => week > 0)
    .sort((firstWeek, secondWeek) => firstWeek - secondWeek)));

  let consecutiveWeeklyWins = 0;
  let currentWeeklyWinStreak = 0;
  let previousWinningWeek = -1;

  for (const week of winningWeeks) {
    currentWeeklyWinStreak =
      week === previousWinningWeek + 1 ? currentWeeklyWinStreak + 1 : 1;
    consecutiveWeeklyWins = Math.max(
      consecutiveWeeklyWins,
      currentWeeklyWinStreak,
    );
    previousWinningWeek = week;
  }

  const seasonPredictedMatches = seasonMatches.filter((match) =>
    predictionByMatchId.has(match.id),
  ).length;
  const seasonAllMatchesFinished = seasonMatches.every(
    (match) => match.status === "finished",
  )
    ? 1
    : 0;
  const completedSeasons =
    seasonAllMatchesFinished === 1 &&
    seasonPredictedMatches === seasonMatches.length
      ? 1
      : 0;

  return {
    totalCorrectPredictions,
    currentWeekCorrectPredictions: bestWeekCorrectPredictions,
    currentWeekTotalMatches: bestWeekTotalMatches,
    perfectWeeks,
    consecutiveCorrectPredictions,
    weeklyWins: winningWeeks.length,
    consecutiveWeeklyWins,
    participatedWeeks,
    completedSeasons,
    seasonTotalMatches: seasonMatches.length,
    seasonPredictedMatches,
    seasonAllMatchesFinished,
  };
}

function belongsToSeason(
  seasonId: unknown,
  activeSeasonId: string,
): boolean {
  return (
    seasonId === activeSeasonId ||
    (!seasonId && activeSeasonId === DEFAULT_SEASON_ID)
  );
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function timestampToMillis(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as TimestampLike).toMillis === "function"
  ) {
    return (value as TimestampLike).toMillis?.() ?? 0;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as TimestampLike).seconds === "number"
  ) {
    return ((value as TimestampLike).seconds ?? 0) * 1000;
  }

  return 0;
}
