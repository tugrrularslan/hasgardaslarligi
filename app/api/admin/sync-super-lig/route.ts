import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getMatchAssistTotals } from "@/lib/match-details";
import { syncMatchDetails } from "@/lib/match-details-sync";
import { verifyGithubSyncToken } from "@/lib/github-sync-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { AdminScoringError, saveMatchResult } from "@/lib/match-scoring";
import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";
import {
  canonicalTeamName,
  sourceMatchKey,
  type Score,
  type SuperLigSourceMatch,
} from "@/lib/super-lig-sync";
import { loadSuperLigSources } from "@/lib/super-lig-sync-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StoredMatch = {
  id: string;
  data: FirebaseFirestore.DocumentData;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

function belongsToSeason(
  data: FirebaseFirestore.DocumentData,
  seasonId: string,
) {
  return (
    data.seasonId === seasonId ||
    (!data.seasonId && seasonId === DEFAULT_SEASON_ID)
  );
}

function resultForScore({ homeScore, awayScore }: Score) {
  if (homeScore > awayScore) return "1" as const;
  if (homeScore < awayScore) return "2" as const;
  return "X" as const;
}

function matchKeyFromStoredMatch(data: FirebaseFirestore.DocumentData) {
  const week = data.week;
  const homeTeam =
    typeof data.homeTeam === "string" ? canonicalTeamName(data.homeTeam) : null;
  const awayTeam =
    typeof data.awayTeam === "string" ? canonicalTeamName(data.awayTeam) : null;

  if (!Number.isInteger(week) || week < 1 || !homeTeam || !awayTeam) {
    return null;
  }

  return `${week}_${sourceMatchKey(homeTeam, awayTeam)}`;
}

function sourceDocumentId(seasonId: string, sourceTffMatchId: string) {
  return `superlig_${encodeURIComponent(seasonId)}_${sourceTffMatchId}`;
}

function sourceMetadata(sourceMatch: SuperLigSourceMatch) {
  return {
    sourceProvider: "tff-espn",
    sourceTffMatchId: sourceMatch.sourceTffMatchId,
    sourceEventId: sourceMatch.sourceEventId,
    sourceSynchronizedAt: FieldValue.serverTimestamp(),
  };
}

function timestampMatches(value: unknown, date: Date) {
  return value instanceof Timestamp && value.toMillis() === date.getTime();
}

function needsSourceMetadataUpdate(
  data: FirebaseFirestore.DocumentData,
  sourceMatch: SuperLigSourceMatch,
) {
  return (
    data.sourceProvider !== "tff-espn" ||
    data.sourceTffMatchId !== sourceMatch.sourceTffMatchId ||
    data.sourceEventId !== sourceMatch.sourceEventId
  );
}

function needsScheduledMatchUpdate(
  data: FirebaseFirestore.DocumentData,
  sourceMatch: SuperLigSourceMatch,
) {
  const expectedDeadline = sourceMatch.kickoff.getTime() - 5 * 60 * 1000;

  return (
    data.week !== sourceMatch.week ||
    data.homeTeam !== sourceMatch.homeTeam ||
    data.awayTeam !== sourceMatch.awayTeam ||
    !timestampMatches(data.kickoff, sourceMatch.kickoff) ||
    !(data.predictionDeadline instanceof Timestamp) ||
    data.predictionDeadline.toMillis() !== expectedDeadline ||
    data.notificationMode !== "local-open-tab"
  );
}

function scheduledMatchData({
  sourceMatch,
  seasonId,
  seasonName,
  adminId,
}: {
  sourceMatch: SuperLigSourceMatch;
  seasonId: string;
  seasonName: string;
  adminId: string;
}) {
  const kickoff = sourceMatch.kickoff;

  return {
    week: sourceMatch.week,
    seasonId,
    seasonName,
    homeTeam: sourceMatch.homeTeam,
    awayTeam: sourceMatch.awayTeam,
    kickoff: Timestamp.fromDate(kickoff),
    predictionDeadline: Timestamp.fromDate(
      new Date(kickoff.getTime() - 5 * 60 * 1000),
    ),
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    result: null,
    pointsCalculated: false,
    oneHourReminderSent: false,
    predictionDeadlineReminderSent: false,
    notificationMode: "local-open-tab",
    createdBy: adminId,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: adminId,
    updatedAt: FieldValue.serverTimestamp(),
    ...sourceMetadata(sourceMatch),
  };
}

function completedImportedMatchData({
  sourceMatch,
  seasonId,
  seasonName,
  adminId,
}: {
  sourceMatch: SuperLigSourceMatch;
  seasonId: string;
  seasonName: string;
  adminId: string;
}) {
  const score = sourceMatch.completedScore;

  if (!score) {
    throw new Error("Tamamlanmış maç için skor bulunamadı.");
  }

  return {
    ...scheduledMatchData({ sourceMatch, seasonId, seasonName, adminId }),
    status: "finished",
    homeScore: score.homeScore,
    awayScore: score.awayScore,
    result: resultForScore(score),
    goalEvents: [],
    goalDetailsStatus: "unavailable",
    pointsCalculated: true,
    pointsCalculatedAt: FieldValue.serverTimestamp(),
    scoreRevision: 1,
    scoringStatus: "completed",
    scoringCompletedAt: FieldValue.serverTimestamp(),
    finishedAt: FieldValue.serverTimestamp(),
    resultSource: "tff-espn",
  };
}

function shouldScoreExistingMatch(
  data: FirebaseFirestore.DocumentData,
  score: Score,
) {
  if (data.scoringStatus === "processing" || data.scoringStatus === "failed") {
    // saveMatchResult resumes the revision and enforces its processing lease.
    return data.homeScore === score.homeScore && data.awayScore === score.awayScore;
  }

  return (
    data.status !== "finished" ||
    data.pointsCalculated !== true ||
    data.homeScore !== score.homeScore ||
    data.awayScore !== score.awayScore
  );
}

export async function POST(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Oturum bilgisi bulunamadı." },
        { status: 401 },
      );
    }

    const automated = request.headers.get("x-super-lig-auth") === "github-actions";
    let actorId = "system:super-lig-sync";

    if (automated) {
      try {
        await verifyGithubSyncToken(idToken);
      } catch (error) {
        // Report only a fixed failure category, never a token or credential value.
        const failure = error as { code?: string; claim?: string; message?: string };
        const reason = failure.message?.startsWith("github-policy:")
          ? failure.message
          : failure.code?.startsWith("ERR_") ? failure.code
          : error instanceof ReferenceError ? "AUTH_RUNTIME_ERROR" : "AUTH_VERIFICATION_ERROR";
        const claim = ["iss", "aud", "exp", "iat", "nbf"].includes(failure.claim ?? "") ? failure.claim : undefined;
        return NextResponse.json({ success: false, error: "GitHub görev kimliği doğrulanamadı.", reason, claim }, { status: 401 });
      }
    }

    if (!automated) {
      let uid: string;
      try {
        uid = (await adminAuth.verifyIdToken(idToken)).uid;
      } catch {
        return NextResponse.json({ success: false, error: "Geçersiz oturum." }, { status: 401 });
      }
      const adminSnapshot = await adminDb.collection("users").doc(uid).get();
      if (!adminSnapshot.exists || adminSnapshot.data()?.isAdmin !== true) {
        return NextResponse.json({ success: false, error: "Yönetici yetkisi gerekiyor." }, { status: 403 });
      }
      actorId = uid;
    }

    const seasonSnapshot = await adminDb
      .collection("settings")
      .doc("currentSeason")
      .get();
    const seasonData = seasonSnapshot.data() ?? {};
    const seasonId =
      typeof seasonData.seasonId === "string" && seasonData.seasonId.trim()
        ? seasonData.seasonId.trim()
        : DEFAULT_SEASON_ID;
    const seasonName =
      typeof seasonData.name === "string" && seasonData.name.trim()
        ? seasonData.name.trim()
        : DEFAULT_SEASON_NAME;

    const syncStateReference = adminDb
      .collection("superLigSyncStates")
      .doc(seasonId);
    const [source, syncStateSnapshot] = await Promise.all([
      loadSuperLigSources(seasonId),
      syncStateReference.get(),
    ]);
    const needsLegacyReconciliation =
      syncStateSnapshot.data()?.legacyReconciliationCompleted !== true;
    const storedMatchSnapshot = needsLegacyReconciliation
      ? await adminDb.collection("matches").get()
      : await adminDb
          .collection("matches")
          .where("seasonId", "==", seasonId)
          .get();
    const storedMatches = storedMatchSnapshot.docs
      .map((document) => ({ id: document.id, data: document.data() }))
      .filter((match) => belongsToSeason(match.data, seasonId));
    const existingByTffId = new Map<string, StoredMatch>();
    const existingByWeekAndTeams = new Map<string, StoredMatch | null>();

    for (const match of storedMatches) {
      const sourceTffMatchId =
        typeof match.data.sourceTffMatchId === "string"
          ? match.data.sourceTffMatchId
          : "";

      if (sourceTffMatchId) {
        existingByTffId.set(sourceTffMatchId, match);
      }

      const key = matchKeyFromStoredMatch(match.data);
      if (!key) continue;

      existingByWeekAndTeams.set(
        key,
        existingByWeekAndTeams.has(key) ? null : match,
      );
    }

    const batches: FirebaseFirestore.WriteBatch[] = [];
    let batch = adminDb.batch();
    let writesInBatch = 0;
    const addWrite = (write: () => void) => {
      write();
      writesInBatch += 1;

      if (writesInBatch === 400) {
        batches.push(batch);
        batch = adminDb.batch();
        writesInBatch = 0;
      }
    };
    const detailCandidates: Array<{ id: string; data: FirebaseFirestore.DocumentData; source: SuperLigSourceMatch }> = [];
    const matchesToScore: Array<{ id: string; score: Score; eventId: string }> = [];
    let createdCount = 0;
    let updatedCount = 0;
    let newlyImportedFinishedCount = 0;
    let ambiguousLegacyMatchCount = 0;

    for (const sourceMatch of source.matches) {
      const legacyKey = `${sourceMatch.week}_${sourceMatchKey(
        sourceMatch.homeTeam,
        sourceMatch.awayTeam,
      )}`;
      const hasAmbiguousLegacyMatch =
        !existingByTffId.has(sourceMatch.sourceTffMatchId) &&
        existingByWeekAndTeams.has(legacyKey) &&
        existingByWeekAndTeams.get(legacyKey) === null;

      if (hasAmbiguousLegacyMatch) {
        ambiguousLegacyMatchCount += 1;
        continue;
      }

      const existing =
        existingByTffId.get(sourceMatch.sourceTffMatchId) ??
        existingByWeekAndTeams.get(legacyKey) ??
        null;
      const sourceScore = sourceMatch.completedScore;

      if (!existing) {
        const reference = adminDb
          .collection("matches")
          .doc(sourceDocumentId(seasonId, sourceMatch.sourceTffMatchId));
        const matchData = sourceScore
          ? completedImportedMatchData({
              sourceMatch,
              seasonId,
              seasonName,
              adminId: actorId,
            })
          : scheduledMatchData({
              sourceMatch,
              seasonId,
              seasonName,
              adminId: actorId,
            });

        detailCandidates.push({ id: reference.id, data: matchData, source: sourceMatch });
        addWrite(() => batch.set(reference, matchData, { merge: false }));
        createdCount += 1;
        if (sourceScore) newlyImportedFinishedCount += 1;
        continue;
      }

      const scheduledMatchChanged =
        existing.data.status === "scheduled" &&
        needsScheduledMatchUpdate(existing.data, sourceMatch);
      const sourceMetadataChanged = needsSourceMetadataUpdate(
        existing.data,
        sourceMatch,
      );

      if (scheduledMatchChanged || sourceMetadataChanged) {
        const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
          updatedBy: actorId,
          updatedAt: FieldValue.serverTimestamp(),
          ...sourceMetadata(sourceMatch),
        };

        if (existing.data.status === "scheduled") {
          updates.week = sourceMatch.week;
          updates.homeTeam = sourceMatch.homeTeam;
          updates.awayTeam = sourceMatch.awayTeam;
          updates.kickoff = Timestamp.fromDate(sourceMatch.kickoff);
          updates.predictionDeadline = Timestamp.fromDate(
            new Date(sourceMatch.kickoff.getTime() - 5 * 60 * 1000),
          );
          updates.notificationMode = "local-open-tab";
        }

        if (!existing.data.seasonId) {
          updates.seasonId = seasonId;
          updates.seasonName = seasonName;
        }

        addWrite(() =>
          batch.set(adminDb.collection("matches").doc(existing.id), updates, {
            merge: true,
          }),
        );
        updatedCount += 1;
      }

      if (sourceScore) detailCandidates.push({ id: existing.id, data: existing.data, source: sourceMatch });
      if (sourceScore && shouldScoreExistingMatch(existing.data, sourceScore)) {
        matchesToScore.push({
          id: existing.id,
          score: sourceScore,
          eventId: sourceMatch.sourceEventId,
        });
      }
    }

    if (writesInBatch > 0) batches.push(batch);
    await Promise.all(batches.map((pendingBatch) => pendingBatch.commit()));

    if (needsLegacyReconciliation && ambiguousLegacyMatchCount === 0) {
      await syncStateReference.set({
        seasonId,
        legacyReconciliationCompleted: true,
        legacyReconciliationCompletedAt: FieldValue.serverTimestamp(),
      });
    }

    let scoredCount = 0;
    const scoringErrors: string[] = [];

    for (const match of matchesToScore) {
      try {
        await saveMatchResult({
          adminId: actorId,
          input: {
            matchId: match.id,
            homeScore: match.score.homeScore,
            awayScore: match.score.awayScore,
            goalEvents: [],
            allowIncompleteGoalEvents: true,
            idempotencyKey: `super-lig-sync_${match.eventId}_${match.score.homeScore}_${match.score.awayScore}`,
          },
        });
        await adminDb.collection("matches").doc(match.id).set(
          {
            resultSource: "tff-espn",
            sourceSynchronizedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        scoredCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Sonuç puanlanamadı.";
        scoringErrors.push(`${match.id}: ${message}`);
      }
    }

    const detailSummary = await syncMatchDetails(detailCandidates);

    const latest = [...detailCandidates].sort((a, b) => b.source.kickoff.getTime() - a.source.kickoff.getTime())[0];
    const latestData = latest ? (await adminDb.collection("matches").doc(latest.id).get()).data() : undefined;
    const latestFinishedMatchDetails = latestData?.status === "finished" ? {
      week: latestData.week, homeTeam: latestData.homeTeam, awayTeam: latestData.awayTeam,
      homeScore: latestData.homeScore, awayScore: latestData.awayScore,
      goalDetailsSource: latestData.goalDetailsSource ?? "unknown",
      assistDetailsStatus: latestData.assistDetailsStatus ?? "unavailable",
      assists: getMatchAssistTotals(latestData),
      linkedAssistCount: Array.isArray(latestData.goalEvents) ? latestData.goalEvents.filter(event => event?.assister).length : 0,
    } : null;
    return NextResponse.json({
      ...detailSummary,
      latestFinishedMatchDetails,
      success: scoringErrors.length === 0,
      seasonId,
      source: source.sourceStats,
      createdCount,
      updatedCount,
      newlyImportedFinishedCount,
      scoredCount,
      scoreConflictCount: source.scoreConflicts.length,
      ambiguousLegacyMatchCount,
      scoringErrors,
      automaticWeekAdvance: false,
      automaticWeeklyChampionAward: false,
      message:
        "Fikstür, saatler ve doğrulanmış sonuçlar eşitlendi. Yeni hafta yayınlanmadı; hafta geçişi ve şampiyon bonusu yönetici tarafından ayrıca yapılır.",
    }, { status: scoringErrors.length ? 500 : 200 });
  } catch (error) {
    const status = error instanceof AdminScoringError ? error.status : 500;

    console.error("Süper Lig eşitlemesi başarısız oldu:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Süper Lig eşitlemesi tamamlanamadı.",
      },
      { status },
    );
  }
}
