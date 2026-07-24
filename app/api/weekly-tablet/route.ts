import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";
import { calculateBadgeProgressFromRecords } from "@/lib/badge-progress";
import {
  BADGES,
  calculateUnlockedBadgeIds,
  type BadgeDefinition,
} from "@/lib/achievements";

type MatchRecord = {
  id: string;
  seasonId?: unknown;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff?: unknown;
  status?: unknown;
  pointsCalculated?: unknown;
  result?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
};

type PredictionRecord = {
  userId?: unknown;
  matchId?: unknown;
  isCorrect?: unknown;
  awardedPoints?: unknown;
};

type ChampionRecord = {
  id: string;
  seasonId?: unknown;
  week?: unknown;
  winnerIds?: unknown;
  awarded?: unknown;
};

type UserRecord = {
  id: string;
  username: string;
  avatar: string;
  selectedTheme: string;
  createdAt: number;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function GET(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Oturum bilgisi bulunamadı." },
        { status: 401 },
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const currentUserId = decodedToken.uid;

    const [
      seasonSnapshot,
      matchesSnapshot,
      predictionsSnapshot,
      championsSnapshot,
      usersSnapshot,
    ] = await Promise.all([
      adminDb.collection("settings").doc("currentSeason").get(),
      adminDb.collection("matches").get(),
      adminDb.collection("predictions").get(),
      adminDb.collection("weeklyChampions").get(),
      adminDb.collection("users").get(),
    ]);

    const seasonData = seasonSnapshot.data();
    const activeSeasonId =
      typeof seasonData?.seasonId === "string" &&
      seasonData.seasonId.trim()
        ? seasonData.seasonId.trim()
        : DEFAULT_SEASON_ID;
    const activeSeasonName =
      typeof seasonData?.name === "string" && seasonData.name.trim()
        ? seasonData.name.trim()
        : DEFAULT_SEASON_NAME;

    const matches: MatchRecord[] = matchesSnapshot.docs
      .map((matchDocument) => {
        const data = matchDocument.data();

        return {
          id: matchDocument.id,
          ...data,
          week: positiveInteger(data.week),
          homeTeam:
            typeof data.homeTeam === "string"
              ? data.homeTeam
              : "Ev sahibi",
          awayTeam:
            typeof data.awayTeam === "string"
              ? data.awayTeam
              : "Deplasman",
        } as MatchRecord;
      })
      .filter(
        (match) =>
          match.seasonId === activeSeasonId ||
          (!match.seasonId && activeSeasonId === DEFAULT_SEASON_ID),
      );

    const matchById = new Map(
      matches.map((match) => [match.id, match]),
    );
    const predictions: PredictionRecord[] =
      predictionsSnapshot.docs
        .map((predictionDocument) => predictionDocument.data())
        .filter(
          (prediction) =>
            typeof prediction.matchId === "string" &&
            matchById.has(prediction.matchId),
        );
    const champions: ChampionRecord[] = championsSnapshot.docs
      .map(
        (championDocument) =>
          ({
            id: championDocument.id,
            ...championDocument.data(),
          }) as ChampionRecord,
      )
      .filter(
        (champion) =>
          champion.seasonId === activeSeasonId ||
          champion.id.startsWith(`${activeSeasonId}_`),
      );
    const users: UserRecord[] = usersSnapshot.docs.map(
      (userDocument) => {
        const data = userDocument.data();

        return {
          id: userDocument.id,
          username: getUsername(data),
          avatar:
            typeof data.avatar === "string" ? data.avatar : "",
          selectedTheme:
            typeof data.selectedTheme === "string"
              ? data.selectedTheme
              : "obsidyen",
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : Number.MAX_SAFE_INTEGER,
        };
      },
    );
    const usersById = new Map(users.map((user) => [user.id, user]));

    const matchesByWeek = new Map<number, MatchRecord[]>();

    for (const match of matches) {
      if (match.week <= 0) continue;
      const weekMatches = matchesByWeek.get(match.week) ?? [];
      weekMatches.push(match);
      matchesByWeek.set(match.week, weekMatches);
    }

    const completedWeeks = Array.from(matchesByWeek.entries())
      .filter(
        ([, weekMatches]) =>
          weekMatches.length > 0 &&
          weekMatches.every(
            (match) =>
              match.status === "finished" &&
              match.pointsCalculated === true,
          ),
      )
      .map(([week]) => week)
      .sort((firstWeek, secondWeek) => secondWeek - firstWeek);

    if (completedWeeks.length === 0) {
      const currentProfile = usersById.get(currentUserId);

      return NextResponse.json({
        success: true,
        activeSeasonId,
        activeSeasonName,
        selectedTheme: currentProfile?.selectedTheme ?? "obsidyen",
        completedWeeks: [],
        tablet: null,
      });
    }

    const requestedWeek = positiveInteger(
      Number(request.nextUrl.searchParams.get("week")),
    );
    const selectedWeek = completedWeeks.includes(requestedWeek)
      ? requestedWeek
      : completedWeeks[0];
    const weekMatches = matchesByWeek.get(selectedWeek) ?? [];
    const weekMatchIds = new Set(
      weekMatches.map((match) => match.id),
    );
    const weekPredictions = predictions.filter(
      (prediction) =>
        typeof prediction.matchId === "string" &&
        weekMatchIds.has(prediction.matchId),
    );

    const userWeekStats = new Map<
      string,
      { predictionCount: number; correctCount: number }
    >();

    for (const prediction of weekPredictions) {
      if (typeof prediction.userId !== "string") continue;

      const current = userWeekStats.get(prediction.userId) ?? {
        predictionCount: 0,
        correctCount: 0,
      };

      current.predictionCount += 1;

      if (
        prediction.isCorrect === true &&
        prediction.awardedPoints === 1
      ) {
        current.correctCount += 1;
      }

      userWeekStats.set(prediction.userId, current);
    }

    const highestCorrectCount =
      userWeekStats.size > 0
        ? Math.max(
            ...Array.from(userWeekStats.values()).map(
              (stats) => stats.correctCount,
            ),
          )
        : 0;
    const leaderIds =
      highestCorrectCount > 0
        ? Array.from(userWeekStats.entries())
            .filter(
              ([, stats]) =>
                stats.correctCount === highestCorrectCount,
            )
            .map(([userId]) => userId)
        : [];
    const leaders = leaderIds.map((userId) =>
      publicUser(usersById.get(userId), userId),
    );

    const weeklyRanking = Array.from(userWeekStats.entries())
      .map(([userId, stats]) => ({
        ...publicUser(usersById.get(userId), userId),
        ...stats,
      }))
      .sort((firstUser, secondUser) => {
        if (secondUser.correctCount !== firstUser.correctCount) {
          return secondUser.correctCount - firstUser.correctCount;
        }

        return firstUser.username.localeCompare(
          secondUser.username,
          "tr",
        );
      });
    const personalWeekStats = userWeekStats.get(currentUserId) ?? {
      predictionCount: 0,
      correctCount: 0,
    };
    const personalWeekRank =
      weeklyRanking.findIndex((user) => user.id === currentUserId) + 1;
    const personalIsChampion = leaderIds.includes(currentUserId);

    const rankingBefore = createSeasonRanking({
      users,
      matches,
      predictions,
      champions,
      cutoffWeek: selectedWeek - 1,
    });
    const rankingAfter = createSeasonRanking({
      users,
      matches,
      predictions,
      champions,
      cutoffWeek: selectedWeek,
    });
    const rankBeforeById = new Map(
      rankingBefore.map((user, index) => [user.id, index + 1]),
    );
    const rankAfterById = new Map(
      rankingAfter.map((user, index) => [user.id, index + 1]),
    );

    const biggestRiser =
      Array.from(userWeekStats.keys())
        .map((userId) => {
          const before = rankBeforeById.get(userId) ?? users.length;
          const after = rankAfterById.get(userId) ?? users.length;

          return {
            ...publicUser(usersById.get(userId), userId),
            rankBefore: before,
            rankAfter: after,
            rise: before - after,
          };
        })
        .filter((user) => user.rise > 0)
        .sort(
          (firstUser, secondUser) =>
            secondUser.rise - firstUser.rise ||
            firstUser.rankAfter - secondUser.rankAfter,
        )[0] ?? null;

    const hardestMatch = weekMatches
      .map((match) => {
        const matchPredictions = weekPredictions.filter(
          (prediction) => prediction.matchId === match.id,
        );
        const correctCount = matchPredictions.filter(
          (prediction) =>
            prediction.isCorrect === true &&
            prediction.awardedPoints === 1,
        ).length;

        return {
          id: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: safeScore(match.homeScore),
          awayScore: safeScore(match.awayScore),
          predictionCount: matchPredictions.length,
          correctCount,
          successRate:
            matchPredictions.length > 0
              ? Math.round(
                  (correctCount / matchPredictions.length) * 100,
                )
              : null,
        };
      })
      .filter(
        (
          match,
        ): match is typeof match & { successRate: number } =>
          match.successRate !== null,
      )
      .sort(
        (firstMatch, secondMatch) =>
          firstMatch.successRate - secondMatch.successRate ||
          secondMatch.predictionCount - firstMatch.predictionCount,
      )[0] ?? null;

    const currentProgress = calculateProgressAtWeek({
      activeSeasonId,
      userId: currentUserId,
      cutoffWeek: selectedWeek,
      matches,
      predictions,
      champions,
    });
    const previousProgress = calculateProgressAtWeek({
      activeSeasonId,
      userId: currentUserId,
      cutoffWeek: selectedWeek - 1,
      matches,
      predictions,
      champions,
    });
    const currentBadgeIds =
      calculateUnlockedBadgeIds(currentProgress);
    const previousBadgeIds =
      calculateUnlockedBadgeIds(previousProgress);
    const newlyEarnedBadges = currentBadgeIds
      .filter((badgeId) => !previousBadgeIds.includes(badgeId))
      .map((badgeId) => BADGES.find((badge) => badge.id === badgeId))
      .filter(
        (badge): badge is BadgeDefinition => Boolean(badge),
      )
      .map((badge) => ({
        id: badge.id,
        name: badge.name,
        image: badge.image,
        rarity: badge.rarity,
        shortDescription: badge.shortDescription,
      }));

    return NextResponse.json({
      success: true,
      activeSeasonId,
      activeSeasonName,
      selectedTheme:
        usersById.get(currentUserId)?.selectedTheme ?? "obsidyen",
      completedWeeks,
      tablet: {
        week: selectedWeek,
        matchCount: weekMatches.length,
        highestCorrectCount,
        leaders,
        biggestRiser,
        hardestMatch,
        personal: {
          ...publicUser(
            usersById.get(currentUserId),
            currentUserId,
          ),
          ...personalWeekStats,
          rank: personalWeekRank || null,
          participantCount: weeklyRanking.length,
          points:
            personalWeekStats.correctCount +
            (personalIsChampion ? 1 : 0),
          championBonus: personalIsChampion ? 1 : 0,
          correctStreak: calculateCurrentCorrectStreak(
            currentUserId,
            selectedWeek,
            matches,
            predictions,
          ),
          championStreak: calculateCurrentChampionStreak(
            currentUserId,
            selectedWeek,
            champions,
          ),
          newlyEarnedBadges,
        },
      },
    });
  } catch (error) {
    console.error("Haftanın Tableti hazırlanamadı:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Haftanın Tableti hazırlanamadı.",
      },
      { status: 500 },
    );
  }
}

function getUsername(data: FirebaseFirestore.DocumentData) {
  if (typeof data.username === "string" && data.username.trim()) {
    return data.username.trim();
  }

  if (
    typeof data.displayName === "string" &&
    data.displayName.trim()
  ) {
    return data.displayName.trim();
  }

  return "İsimsiz Gardaş";
}

function publicUser(user: UserRecord | undefined, userId: string) {
  return {
    id: userId,
    username: user?.username ?? "İsimsiz Gardaş",
    avatar: user?.avatar ?? "",
  };
}

function createSeasonRanking({
  users,
  matches,
  predictions,
  champions,
  cutoffWeek,
}: {
  users: UserRecord[];
  matches: MatchRecord[];
  predictions: PredictionRecord[];
  champions: ChampionRecord[];
  cutoffWeek: number;
}) {
  const includedMatchIds = new Set(
    matches
      .filter(
        (match) =>
          match.week <= cutoffWeek && match.status === "finished",
      )
      .map((match) => match.id),
  );
  const correctByUser = new Map<string, number>();

  for (const prediction of predictions) {
    if (
      typeof prediction.userId === "string" &&
      typeof prediction.matchId === "string" &&
      includedMatchIds.has(prediction.matchId) &&
      prediction.isCorrect === true &&
      prediction.awardedPoints === 1
    ) {
      correctByUser.set(
        prediction.userId,
        (correctByUser.get(prediction.userId) ?? 0) + 1,
      );
    }
  }

  const winsByUser = new Map<string, number>();

  for (const champion of champions) {
    const championWeek = positiveInteger(champion.week);

    if (
      champion.awarded !== false &&
      championWeek <= cutoffWeek &&
      Array.isArray(champion.winnerIds)
    ) {
      for (const winnerId of champion.winnerIds) {
        if (typeof winnerId !== "string") continue;

        winsByUser.set(
          winnerId,
          (winsByUser.get(winnerId) ?? 0) + 1,
        );
      }
    }
  }

  return users
    .map((user) => {
      const correctPredictions = correctByUser.get(user.id) ?? 0;
      const weeklyWins = winsByUser.get(user.id) ?? 0;

      return {
        ...user,
        correctPredictions,
        weeklyWins,
        totalPoints: correctPredictions + weeklyWins,
      };
    })
    .sort((firstUser, secondUser) => {
      if (secondUser.totalPoints !== firstUser.totalPoints) {
        return secondUser.totalPoints - firstUser.totalPoints;
      }

      if (
        secondUser.correctPredictions !==
        firstUser.correctPredictions
      ) {
        return (
          secondUser.correctPredictions -
          firstUser.correctPredictions
        );
      }

      if (secondUser.weeklyWins !== firstUser.weeklyWins) {
        return secondUser.weeklyWins - firstUser.weeklyWins;
      }

      return firstUser.createdAt - secondUser.createdAt;
    });
}

function calculateProgressAtWeek({
  activeSeasonId,
  userId,
  cutoffWeek,
  matches,
  predictions,
  champions,
}: {
  activeSeasonId: string;
  userId: string;
  cutoffWeek: number;
  matches: MatchRecord[];
  predictions: PredictionRecord[];
  champions: ChampionRecord[];
}) {
  const includedMatchIds = new Set(
    matches
      .filter((match) => match.week <= cutoffWeek)
      .map((match) => match.id),
  );

  return calculateBadgeProgressFromRecords({
    activeSeasonId,
    userId,
    matches: matches.map((match) =>
      match.week <= cutoffWeek
        ? match
        : { ...match, status: "scheduled" },
    ),
    predictions: predictions.filter(
      (prediction) =>
        prediction.userId === userId &&
        typeof prediction.matchId === "string" &&
        includedMatchIds.has(prediction.matchId),
    ),
    weeklyChampions: champions.filter(
      (champion) =>
        positiveInteger(champion.week) <= cutoffWeek,
    ),
  });
}

function calculateCurrentCorrectStreak(
  userId: string,
  cutoffWeek: number,
  matches: MatchRecord[],
  predictions: PredictionRecord[],
) {
  const predictionByMatchId = new Map(
    predictions
      .filter(
        (prediction) =>
          prediction.userId === userId &&
          typeof prediction.matchId === "string",
      )
      .map((prediction) => [
        prediction.matchId as string,
        prediction,
      ]),
  );
  const orderedMatches = matches
    .filter(
      (match) =>
        match.week <= cutoffWeek && match.status === "finished",
    )
    .sort(
      (firstMatch, secondMatch) =>
        timestampToMillis(firstMatch.kickoff) -
          timestampToMillis(secondMatch.kickoff) ||
        firstMatch.id.localeCompare(secondMatch.id),
    );
  let streak = 0;

  for (const match of orderedMatches) {
    const prediction = predictionByMatchId.get(match.id);

    streak =
      prediction?.isCorrect === true &&
      prediction.awardedPoints === 1
        ? streak + 1
        : 0;
  }

  return streak;
}

function calculateCurrentChampionStreak(
  userId: string,
  selectedWeek: number,
  champions: ChampionRecord[],
) {
  const winningWeeks = new Set(
    champions
      .filter(
        (champion) =>
          champion.awarded !== false &&
          Array.isArray(champion.winnerIds) &&
          champion.winnerIds.includes(userId),
      )
      .map((champion) => positiveInteger(champion.week)),
  );
  let streak = 0;

  for (
    let week = selectedWeek;
    week > 0 && winningWeeks.has(week);
    week -= 1
  ) {
    streak += 1;
  }

  return streak;
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function safeScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function timestampToMillis(value: unknown) {
  return value instanceof Timestamp ? value.toMillis() : 0;
}
