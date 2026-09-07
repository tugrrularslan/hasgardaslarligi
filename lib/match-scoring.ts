import {
  FieldPath,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getPlayerIdentityKey } from "@/lib/player-identity";
import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";

export type MatchResult = "1" | "X" | "2";

export type GoalEventInput = {
  side: "home" | "away";
  scorer: string;
  assister?: string;
  ownGoal?: boolean;
};

export type SaveMatchResultInput = {
  matchId: string;
  homeScore: unknown;
  awayScore: unknown;
  goalEvents: GoalEventInput[];
  idempotencyKey: string;
};

export class AdminScoringError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AdminScoringError";
  }
}

type ChampionResult = {
  changed: boolean;
  skipped: boolean;
  highestCorrectCount: number;
  winnerIds: string[];
  winnerNames: string[];
  previousWinnerNames: string[];
};

type SeasonContext = {
  seasonId: string;
  seasonName: string;
};

const SCORE_WRITE_CHUNK_SIZE = 200;
const USER_ADJUSTMENT_CHUNK_SIZE = 200;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;

function calculateResult(homeScore: number, awayScore: number): MatchResult {
  if (homeScore > awayScore) return "1";
  if (homeScore < awayScore) return "2";
  return "X";
}

function finiteNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function positiveInteger(value: unknown): number {
  return finiteNonNegativeInteger(value) && value > 0 ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function arraysEqual(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function hasAwardedPoint(data: Record<string, unknown>) {
  return data.isCorrect === true && data.awardedPoints === 1;
}

function timestampMillis(value: unknown) {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function isActiveLease(value: unknown) {
  const startedAt = timestampMillis(value);
  return startedAt > 0 && Date.now() - startedAt < PROCESSING_LEASE_MS;
}

function getUsername(data: Record<string, unknown>) {
  for (const key of ["username", "displayName", "email"]) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "İsimsiz kullanıcı";
}

function belongsToSeason(
  matchData: Record<string, unknown>,
  seasonId: string,
) {
  return (
    matchData.seasonId === seasonId ||
    (!matchData.seasonId && seasonId === DEFAULT_SEASON_ID)
  );
}

function getMatchSeasonId(matchData: Record<string, unknown>) {
  return typeof matchData.seasonId === "string" && matchData.seasonId.trim()
    ? matchData.seasonId.trim()
    : DEFAULT_SEASON_ID;
}

async function getSeasonContext(seasonId?: string): Promise<SeasonContext> {
  const seasonSnapshot = await adminDb
    .collection("settings")
    .doc("currentSeason")
    .get();
  const data = seasonSnapshot.data() ?? {};
  const currentSeasonId =
    typeof data.seasonId === "string" && data.seasonId.trim()
      ? data.seasonId.trim()
      : DEFAULT_SEASON_ID;

  const resolvedSeasonId = seasonId?.trim() || currentSeasonId;
  const currentSeasonName =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : DEFAULT_SEASON_NAME;

  return {
    seasonId: resolvedSeasonId,
    seasonName:
      resolvedSeasonId === currentSeasonId
        ? currentSeasonName
        : DEFAULT_SEASON_NAME,
  };
}

function validateAndNormalizeResultInput(
  input: SaveMatchResultInput,
  matchData: Record<string, unknown>,
) {
  if (!input.matchId || input.matchId.length > 200) {
    throw new AdminScoringError("Geçerli bir maç seçilmedi.");
  }

  const homeScore = input.homeScore;
  const awayScore = input.awayScore;

  if (
    !finiteNonNegativeInteger(homeScore) ||
    !finiteNonNegativeInteger(awayScore) ||
    homeScore > 99 ||
    awayScore > 99
  ) {
    throw new AdminScoringError(
      "Skorlar 0 ile 99 arasında tam sayı olmalı.",
    );
  }

  if (!input.idempotencyKey || input.idempotencyKey.length > 200) {
    throw new AdminScoringError("Sonuç isteği için geçerli bir anahtar gerekli.");
  }

  const expectedGoalCount = homeScore + awayScore;

  if (!Array.isArray(input.goalEvents) || input.goalEvents.length !== expectedGoalCount) {
    throw new AdminScoringError(
      "Skora karşılık gelen her gol için golü atan oyuncuyu gir.",
    );
  }

  const homeTeam =
    typeof matchData.homeTeam === "string" ? matchData.homeTeam : "Ev sahibi";
  const awayTeam =
    typeof matchData.awayTeam === "string" ? matchData.awayTeam : "Deplasman";

  const goalEvents = input.goalEvents.map((event) => {
    if (
      !event ||
      (event.side !== "home" && event.side !== "away") ||
      typeof event.scorer !== "string" ||
      !event.scorer.trim() ||
      event.scorer.trim().length > 120
    ) {
      throw new AdminScoringError(
        "Her gol için geçerli bir takım ve golcü bilgisi gerekli.",
      );
    }

    const assister =
      typeof event.assister === "string" && event.assister.trim()
        ? event.assister.trim()
        : null;

    if (assister && assister.length > 120) {
      throw new AdminScoringError("Asist eden oyuncu adı çok uzun.");
    }

    const scorer = event.scorer.trim();

    return {
      team: event.side === "home" ? homeTeam : awayTeam,
      scorer,
      scorerKey: getPlayerIdentityKey(scorer),
      assister: event.ownGoal === true ? null : assister,
      assisterKey:
        event.ownGoal === true || !assister
          ? null
          : getPlayerIdentityKey(assister),
      ownGoal: event.ownGoal === true,
    };
  });

  return {
    matchId: input.matchId,
    homeScore,
    awayScore,
    idempotencyKey: input.idempotencyKey,
    result: calculateResult(homeScore, awayScore),
    goalEvents,
  };
}

async function writeScoreRevision(
  matchReference: FirebaseFirestore.DocumentReference,
  revision: number,
  result: MatchResult,
) {
  const predictionSnapshot = await adminDb
    .collection("predictions")
    .where("matchId", "==", matchReference.id)
    .get();
  const revisionReference = matchReference
    .collection("scoreRevisions")
    .doc(String(revision));
  const adjustmentsReference = revisionReference.collection("adjustments");

  for (
    let index = 0;
    index < predictionSnapshot.docs.length;
    index += SCORE_WRITE_CHUNK_SIZE
  ) {
    const batch = adminDb.batch();
    const predictionChunk = predictionSnapshot.docs.slice(
      index,
      index + SCORE_WRITE_CHUNK_SIZE,
    );
    let operationCount = 0;

    for (const predictionDocument of predictionChunk) {
      const predictionData = predictionDocument.data();
      const alreadyScoredForRevision =
        predictionData.scoredRevision === revision &&
        predictionData.scoredResult === result;

      if (alreadyScoredForRevision) continue;

      const previousPoints = hasAwardedPoint(predictionData) ? 1 : 0;
      const nextPoints = predictionData.prediction === result ? 1 : 0;
      const delta = nextPoints - previousPoints;

      batch.update(predictionDocument.ref, {
        isCorrect: nextPoints === 1,
        awardedPoints: nextPoints,
        scoredRevision: revision,
        scoredResult: result,
        scoredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      operationCount += 1;

      if (delta !== 0 && typeof predictionData.userId === "string") {
        batch.set(adjustmentsReference.doc(predictionDocument.id), {
          userId: predictionData.userId,
          delta,
          status: "pending",
          predictionId: predictionDocument.id,
          scoreRevision: revision,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        operationCount += 1;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }
  }

  await revisionReference.set(
    {
      revision,
      result,
      predictionCount: predictionSnapshot.size,
      scoringWritesCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return predictionSnapshot.size;
}

async function applyPendingUserAdjustments({
  adjustmentsReference,
  seasonId,
  adjustmentType,
}: {
  adjustmentsReference: FirebaseFirestore.CollectionReference;
  seasonId: string;
  adjustmentType: "score" | "weekly-bonus";
}) {
  let appliedAdjustmentCount = 0;

  while (true) {
    const pendingSnapshot = await adjustmentsReference
      .where("status", "==", "pending")
      .limit(USER_ADJUSTMENT_CHUNK_SIZE)
      .get();

    if (pendingSnapshot.empty) break;

    const appliedInTransaction = await adminDb.runTransaction(
      async (transaction) => {
        const lockedPendingSnapshot = await transaction.get(
          adjustmentsReference
            .where("status", "==", "pending")
            .limit(USER_ADJUSTMENT_CHUNK_SIZE),
        );

        if (lockedPendingSnapshot.empty) return 0;

        const adjustmentsByUser = new Map<
          string,
          FirebaseFirestore.QueryDocumentSnapshot[]
        >();

        for (const adjustmentDocument of lockedPendingSnapshot.docs) {
          const data = adjustmentDocument.data();
          const userId = typeof data.userId === "string" ? data.userId : "";
          const delta = typeof data.delta === "number" ? data.delta : 0;

          if (!userId || !Number.isFinite(delta) || delta === 0) {
            transaction.update(adjustmentDocument.ref, {
              status: "skipped",
              skippedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            continue;
          }

          const current = adjustmentsByUser.get(userId) ?? [];
          current.push(adjustmentDocument);
          adjustmentsByUser.set(userId, current);
        }

        const userReferences = Array.from(adjustmentsByUser.keys()).map(
          (userId) => adminDb.collection("users").doc(userId),
        );
        const userSnapshots = userReferences.length
          ? await transaction.getAll(...userReferences)
          : [];
        const usersById = new Map(
          userSnapshots.map((userSnapshot) => [
            userSnapshot.id,
            userSnapshot,
          ]),
        );
        const correctPredictionsPath = new FieldPath(
          "seasonStats",
          seasonId,
          "correctPredictions",
        );
        const weeklyWinsPath = new FieldPath(
          "seasonStats",
          seasonId,
          "weeklyWins",
        );
        const totalPointsPath = new FieldPath(
          "seasonStats",
          seasonId,
          "totalPoints",
        );
        let appliedCount = 0;

        for (const [userId, adjustmentDocuments] of adjustmentsByUser) {
          const userSnapshot = usersById.get(userId);
          const delta = adjustmentDocuments.reduce(
            (sum, adjustmentDocument) => {
              const value = adjustmentDocument.data().delta;
              return sum + (typeof value === "number" ? value : 0);
            },
            0,
          );

          if (userSnapshot?.exists && delta !== 0) {
            if (adjustmentType === "score") {
              transaction.update(
                userSnapshot.ref,
                "correctPredictions",
                FieldValue.increment(delta),
                "totalPoints",
                FieldValue.increment(delta),
                correctPredictionsPath,
                FieldValue.increment(delta),
                totalPointsPath,
                FieldValue.increment(delta),
                "updatedAt",
                FieldValue.serverTimestamp(),
              );
            } else {
              transaction.update(
                userSnapshot.ref,
                "weeklyWins",
                FieldValue.increment(delta),
                "totalPoints",
                FieldValue.increment(delta),
                weeklyWinsPath,
                FieldValue.increment(delta),
                totalPointsPath,
                FieldValue.increment(delta),
                "updatedAt",
                FieldValue.serverTimestamp(),
              );
            }
          }

          for (const adjustmentDocument of adjustmentDocuments) {
            transaction.update(adjustmentDocument.ref, {
              status: userSnapshot?.exists ? "applied" : "skipped",
              appliedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            appliedCount += 1;
          }
        }

        return appliedCount;
      },
    );

    appliedAdjustmentCount += appliedInTransaction;
  }

  return appliedAdjustmentCount;
}

async function getUsernames(userIds: string[]) {
  const names = new Map<string, string>();

  for (let index = 0; index < userIds.length; index += 300) {
    const references = userIds.slice(index, index + 300).map((userId) =>
      adminDb.collection("users").doc(userId),
    );
    const snapshots = references.length
      ? await adminDb.getAll(...references)
      : [];

    for (const snapshot of snapshots) {
      names.set(snapshot.id, getUsername(snapshot.data() ?? {}));
    }
  }

  return names;
}

async function calculateWeeklyWinners(
  week: number,
  season: SeasonContext,
) {
  const weekMatchesSnapshot = await adminDb
    .collection("matches")
    .where("week", "==", week)
    .get();
  const weekMatches = weekMatchesSnapshot.docs.filter((matchDocument) =>
    belongsToSeason(matchDocument.data(), season.seasonId),
  );

  if (weekMatches.length === 0) {
    throw new AdminScoringError(
      `${season.seasonId} sezonunun ${week}. haftasına ait maç bulunamadı.`,
      404,
    );
  }

  const unfinishedMatchCount = weekMatches.filter((matchDocument) => {
    const data = matchDocument.data();
    return data.status !== "finished" || data.pointsCalculated !== true;
  }).length;

  if (unfinishedMatchCount > 0) {
    throw new AdminScoringError(
      `${week}. haftanın bütün maç sonuçlarını girip puanları hesaplamadan haftalık şampiyon belirlenemez.`,
      409,
    );
  }

  const predictionSnapshots = await Promise.all(
    weekMatches.map((matchDocument) =>
      adminDb
        .collection("predictions")
        .where("matchId", "==", matchDocument.id)
        .get(),
    ),
  );
  const correctCounts = new Map<string, number>();

  for (const predictionSnapshot of predictionSnapshots) {
    for (const predictionDocument of predictionSnapshot.docs) {
      const data = predictionDocument.data();

      if (
        data.isCorrect === true &&
        data.awardedPoints === 1 &&
        typeof data.userId === "string"
      ) {
        correctCounts.set(
          data.userId,
          (correctCounts.get(data.userId) ?? 0) + 1,
        );
      }
    }
  }

  const highestCorrectCount =
    correctCounts.size > 0 ? Math.max(...correctCounts.values()) : 0;
  const winnerIds =
    highestCorrectCount > 0
      ? Array.from(correctCounts.entries())
          .filter(([, correctCount]) => correctCount === highestCorrectCount)
          .map(([userId]) => userId)
          .sort()
      : [];

  return { highestCorrectCount, winnerIds };
}

function makeBonusDeltas(previousWinnerIds: string[], winnerIds: string[]) {
  const deltas = new Map<string, number>();

  for (const userId of previousWinnerIds) {
    deltas.set(userId, (deltas.get(userId) ?? 0) - 1);
  }

  for (const userId of winnerIds) {
    deltas.set(userId, (deltas.get(userId) ?? 0) + 1);
  }

  return Array.from(deltas.entries()).filter(([, delta]) => delta !== 0);
}

async function seedWeeklyBonusAdjustments({
  championReference,
  revision,
  previousWinnerIds,
  winnerIds,
}: {
  championReference: FirebaseFirestore.DocumentReference;
  revision: number;
  previousWinnerIds: string[];
  winnerIds: string[];
}) {
  const adjustmentsReference = championReference
    .collection("bonusRevisions")
    .doc(String(revision))
    .collection("adjustments");
  const existingSnapshot = await adjustmentsReference.get();
  const existingIds = new Set(existingSnapshot.docs.map((document) => document.id));
  const deltas = makeBonusDeltas(previousWinnerIds, winnerIds);

  for (let index = 0; index < deltas.length; index += SCORE_WRITE_CHUNK_SIZE) {
    const batch = adminDb.batch();
    const deltaChunk = deltas.slice(index, index + SCORE_WRITE_CHUNK_SIZE);
    let writeCount = 0;

    for (const [userId, delta] of deltaChunk) {
      if (existingIds.has(userId)) continue;

      batch.set(adjustmentsReference.doc(userId), {
        userId,
        delta,
        status: "pending",
        bonusRevision: revision,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeCount += 1;
    }

    if (writeCount > 0) {
      await batch.commit();
    }
  }

  return adjustmentsReference;
}

export async function recalculateWeeklyChampionBonus({
  week,
  adminId,
  onlyIfPreviouslyAwarded = false,
  preview = false,
  seasonId,
}: {
  week: number;
  adminId: string;
  onlyIfPreviouslyAwarded?: boolean;
  preview?: boolean;
  seasonId?: string;
}): Promise<ChampionResult> {
  if (!Number.isInteger(week) || week < 1) {
    throw new AdminScoringError("Geçerli bir hafta numarası gerekli.");
  }

  const season = await getSeasonContext(seasonId);
  const championReference = adminDb
    .collection("weeklyChampions")
    .doc(`${season.seasonId}_${week}`);
  const championSnapshot = await championReference.get();
  const championData = championSnapshot.data() ?? {};
  const wasPreviouslyAwarded = championData.awarded === true;

  if (onlyIfPreviouslyAwarded && !wasPreviouslyAwarded) {
    return {
      changed: false,
      skipped: true,
      highestCorrectCount: 0,
      winnerIds: [],
      winnerNames: [],
      previousWinnerNames: [],
    };
  }

  const { highestCorrectCount, winnerIds } = await calculateWeeklyWinners(
    week,
    season,
  );
  const previousWinnerIds = wasPreviouslyAwarded
    ? stringArray(championData.winnerIds).sort()
    : [];
  const changed = !arraysEqual(winnerIds, previousWinnerIds);
  const usernameMap = await getUsernames(
    Array.from(new Set([...previousWinnerIds, ...winnerIds])),
  );
  const result = {
    changed,
    skipped: false,
    highestCorrectCount,
    winnerIds,
    winnerNames: winnerIds.map(
      (winnerId) => usernameMap.get(winnerId) ?? "İsimsiz kullanıcı",
    ),
    previousWinnerNames: previousWinnerIds.map(
      (winnerId) => usernameMap.get(winnerId) ?? "İsimsiz kullanıcı",
    ),
  };

  if (preview || result.skipped || !changed) {
    return result;
  }

  const claim = await adminDb.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(championReference);
    const currentData = currentSnapshot.data() ?? {};
    const currentStatus = currentData.bonusStatus;
    const pendingWinnerIds = stringArray(currentData.pendingWinnerIds).sort();
    const pendingPreviousWinnerIds = stringArray(
      currentData.pendingPreviousWinnerIds,
    ).sort();
    const currentRevision = positiveInteger(currentData.bonusRevision);

    if (
      (currentStatus === "processing" || currentStatus === "failed") &&
      currentRevision > 0
    ) {
      if (!arraysEqual(pendingWinnerIds, winnerIds)) {
        throw new AdminScoringError(
          "Önce devam eden haftalık bonus hesabını tamamla; ardından yeni sonucu hesaplayabilirsin.",
          409,
        );
      }

      if (
        currentStatus === "processing" &&
        isActiveLease(currentData.bonusProcessingStartedAt)
      ) {
        throw new AdminScoringError(
          "Haftalık bonus hesabı hâlâ çalışıyor. Birkaç dakika sonra tekrar dene.",
          409,
        );
      }

      transaction.set(
        championReference,
        {
          bonusStatus: "processing",
          bonusProcessingStartedAt: FieldValue.serverTimestamp(),
          bonusRequestedBy: adminId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        revision: currentRevision,
        previousWinnerIds: pendingPreviousWinnerIds,
      };
    }

    const currentWinnerIds = currentData.awarded === true
      ? stringArray(currentData.winnerIds).sort()
      : [];
    const revision = currentRevision + 1;

    transaction.set(
      championReference,
      {
        week,
        seasonId: season.seasonId,
        seasonName: season.seasonName,
        bonusRevision: revision,
        bonusStatus: "processing",
        bonusProcessingStartedAt: FieldValue.serverTimestamp(),
        bonusRequestedBy: adminId,
        pendingWinnerIds: winnerIds,
        pendingPreviousWinnerIds: currentWinnerIds,
        pendingHighestCorrectCount: highestCorrectCount,
        recalculatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { revision, previousWinnerIds: currentWinnerIds };
  });

  try {
    const adjustmentsReference = await seedWeeklyBonusAdjustments({
      championReference,
      revision: claim.revision,
      previousWinnerIds: claim.previousWinnerIds,
      winnerIds,
    });
    await applyPendingUserAdjustments({
      adjustmentsReference,
      seasonId: season.seasonId,
      adjustmentType: "weekly-bonus",
    });

    await championReference.set(
      {
        week,
        seasonId: season.seasonId,
        seasonName: season.seasonName,
        winnerIds,
        winnerNames: result.winnerNames,
        winnerCount: winnerIds.length,
        highestCorrectCount,
        bonusPerWinner: winnerIds.length > 0 ? 1 : 0,
        awarded: winnerIds.length > 0,
        awardedBy: adminId,
        awardedAt: FieldValue.serverTimestamp(),
        bonusStatus: "completed",
        bonusCompletedAt: FieldValue.serverTimestamp(),
        pendingWinnerIds: FieldValue.delete(),
        pendingPreviousWinnerIds: FieldValue.delete(),
        pendingHighestCorrectCount: FieldValue.delete(),
        bonusError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return result;
  } catch (error) {
    await championReference.set(
      {
        bonusStatus: "failed",
        bonusError: error instanceof Error ? error.message : "Bilinmeyen hata",
        bonusFailedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    throw error;
  }
}

export async function saveMatchResult({
  input,
  adminId,
}: {
  input: SaveMatchResultInput;
  adminId: string;
}) {
  const matchReference = adminDb.collection("matches").doc(input.matchId);
  const initialMatchSnapshot = await matchReference.get();

  if (!initialMatchSnapshot.exists) {
    throw new AdminScoringError("Maç bulunamadı.", 404);
  }

  const initialMatchData = initialMatchSnapshot.data() ?? {};
  const normalized = validateAndNormalizeResultInput(input, initialMatchData);
  const sameCompletedResult =
    initialMatchData.pointsCalculated === true &&
    initialMatchData.status === "finished" &&
    initialMatchData.homeScore === normalized.homeScore &&
    initialMatchData.awayScore === normalized.awayScore &&
    initialMatchData.result === normalized.result;

  if (sameCompletedResult) {
    await matchReference.update({
      goalEvents: normalized.goalEvents,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      alreadyCalculated: true,
      checkedPredictionCount: 0,
      weeklyChampion: null,
    };
  }

  const claim = await adminDb.runTransaction(async (transaction) => {
    const matchSnapshot = await transaction.get(matchReference);

    if (!matchSnapshot.exists) {
      throw new AdminScoringError("Maç bulunamadı.", 404);
    }

    const matchData = matchSnapshot.data() ?? {};
    const currentStatus = matchData.scoringStatus;
    const currentResult = matchData.result;
    const currentRevision = positiveInteger(matchData.scoreRevision);
    const canResumeCurrentRevision =
      (currentStatus === "processing" || currentStatus === "failed") &&
      currentResult === normalized.result &&
      matchData.homeScore === normalized.homeScore &&
      matchData.awayScore === normalized.awayScore &&
      currentRevision > 0;

    if (
      currentStatus === "processing" &&
      isActiveLease(matchData.scoringStartedAt)
    ) {
      throw new AdminScoringError(
        "Bu maçın puanları hâlâ hesaplanıyor. Birkaç dakika sonra tekrar dene.",
        409,
      );
    }

    if (
      (currentStatus === "processing" || currentStatus === "failed") &&
      !canResumeCurrentRevision
    ) {
      throw new AdminScoringError(
        "Önce yarım kalan puan hesaplamasını aynı sonuçla tamamla; ardından sonucu güncelleyebilirsin.",
        409,
      );
    }

    const revision = canResumeCurrentRevision
      ? currentRevision
      : currentRevision + 1;

    transaction.update(matchReference, {
      homeScore: normalized.homeScore,
      awayScore: normalized.awayScore,
      result: normalized.result,
      goalEvents: normalized.goalEvents,
      status: "finished",
      pointsCalculated: false,
      scoreRevision: revision,
      scoringStatus: "processing",
      scoringRequestId: normalized.idempotencyKey,
      scoringStartedAt: FieldValue.serverTimestamp(),
      scoringAttemptCount: FieldValue.increment(1),
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { revision, seasonId: getMatchSeasonId(matchData), week: positiveInteger(matchData.week) };
  });

  try {
    const checkedPredictionCount = await writeScoreRevision(
      matchReference,
      claim.revision,
      normalized.result,
    );
    const adjustmentsReference = matchReference
      .collection("scoreRevisions")
      .doc(String(claim.revision))
      .collection("adjustments");
    await applyPendingUserAdjustments({
      adjustmentsReference,
      seasonId: claim.seasonId,
      adjustmentType: "score",
    });

    await matchReference.set(
      {
        pointsCalculated: true,
        pointsCalculatedAt: FieldValue.serverTimestamp(),
        scoringStatus: "completed",
        scoringCompletedAt: FieldValue.serverTimestamp(),
        scoringError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    let weeklyChampion: ChampionResult | null = null;
    let weeklyChampionWarning: string | null = null;

    try {
      weeklyChampion = await recalculateWeeklyChampionBonus({
        week: claim.week,
        adminId,
        onlyIfPreviouslyAwarded: true,
        seasonId: claim.seasonId,
      });
    } catch (error) {
      console.error("Maç sonucu sonrası haftalık bonus güncellenemedi:", {
        matchId: matchReference.id,
        week: claim.week,
        error,
      });
      weeklyChampionWarning =
        "Maç puanları kaydedildi; haftalık bonus otomatik güncellenemedi.";
    }

    return {
      alreadyCalculated: false,
      checkedPredictionCount,
      weeklyChampion,
      weeklyChampionWarning,
    };
  } catch (error) {
    console.error("Maç sonucu puanlama işi başarısız oldu:", {
      matchId: matchReference.id,
      scoreRevision: claim.revision,
      error,
    });

    try {
      await matchReference.set(
        {
          pointsCalculated: false,
          scoringStatus: "failed",
          scoringError: error instanceof Error ? error.message : "Bilinmeyen hata",
          scoringFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (markFailureError) {
      console.error("Puanlama işinin hata durumu kaydedilemedi:", {
        matchId: matchReference.id,
        error: markFailureError,
      });
    }

    throw error;
  }
}
