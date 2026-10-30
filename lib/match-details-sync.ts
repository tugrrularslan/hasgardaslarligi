import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { loadEspnMatchDetails } from "@/lib/super-lig-sync-server";
import { getPlayerIdentityKey } from "@/lib/player-identity";
import { canonicalTeamName, type SuperLigSourceMatch } from "@/lib/super-lig-sync";

type Candidate = { id: string; data: FirebaseFirestore.DocumentData; source: SuperLigSourceMatch };
const VERSION = 1;
function manualDetails(data: FirebaseFirestore.DocumentData) {
  return data.goalDetailsSource === "manual" || (!data.goalDetailsSource && data.goalDetailsStatus === "complete" && Array.isArray(data.goalEvents) && data.goalEvents.length > 0);
}
export async function syncMatchDetails(candidates: Candidate[]) {
  const now = Date.now();
  const eligible = candidates.filter(({ data, source }) => {
    if (!source.completedScore) return false;
    const scoreChanged = data.homeScore !== source.completedScore.homeScore || data.awayScore !== source.completedScore.awayScore;
    if (manualDetails(data) && !scoreChanged) return false;
    const checkedAt = !scoreChanged && data.goalDetailsLastCheckedAt instanceof Timestamp ? data.goalDetailsLastCheckedAt.toMillis() : 0;
    const retryAfter = data.goalDetailsSourceVersion === VERSION && data.goalDetailsStatus === "complete" && data.assistDetailsStatus === "complete" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    return checkedAt === 0 || now - checkedAt >= retryAfter;
  }).sort((a, b) => {
    const aChecked = a.data.goalDetailsLastCheckedAt instanceof Timestamp ? 1 : 0;
    const bChecked = b.data.goalDetailsLastCheckedAt instanceof Timestamp ? 1 : 0;
    return aChecked - bChecked || b.source.kickoff.getTime() - a.source.kickoff.getTime();
  });
  const selected = eligible.slice(0, 12);
  let goalDetailsUpdatedCount = 0;
  let assistDetailsUpdatedCount = 0;
  let importedGoalCount = 0;
  let importedAssistCount = 0;
  const goalDetailErrors: string[] = [];
  for (let offset = 0; offset < selected.length; offset += 4) {
    await Promise.all(selected.slice(offset, offset + 4).map(async ({ id, source }) => {
      const score = source.completedScore!;
      const reference = adminDb.collection("matches").doc(id);
      try {
        const details = await loadEspnMatchDetails({ ...score, sourceEventId: source.sourceEventId, homeTeam: source.homeTeam, awayTeam: source.awayTeam });
        const written = await adminDb.runTransaction(async transaction => {
          const snapshot = await transaction.get(reference);
          const current = snapshot.data() ?? {};
          if (!snapshot.exists || current.status !== "finished" || current.homeScore !== score.homeScore || current.awayScore !== score.awayScore || manualDetails(current) ||
              canonicalTeamName(current.homeTeam) !== source.homeTeam || canonicalTeamName(current.awayTeam) !== source.awayTeam) return false;
          const events = details.goalEvents.map(goal => ({
            team: goal.side === "home" ? current.homeTeam : current.awayTeam,
            scorer: goal.scorer, scorerKey: getPlayerIdentityKey(goal.scorer),
            assister: goal.assister || null, assisterKey: goal.assister ? getPlayerIdentityKey(goal.assister) : null,
            ownGoal: goal.ownGoal,
          }));
          transaction.update(reference, {
            goalEvents: events, goalDetailsStatus: "complete", goalDetailsSource: "espn",
            goalDetailsSourceVersion: VERSION, goalDetailsLastCheckedAt: FieldValue.serverTimestamp(),
            goalDetailsLastError: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
            ...(details.assistTotals !== null ? { assistTotals: details.assistTotals.map(value => ({ ...value, team: value.team === source.homeTeam ? current.homeTeam : current.awayTeam })), assistDetailsStatus: "complete" } : {}),
          });
          return true;
        });
        if (written) {
          goalDetailsUpdatedCount++;
          importedGoalCount += details.goalEvents.length;
          if (details.assistTotals !== null) {
            assistDetailsUpdatedCount++;
            importedAssistCount += details.assistTotals.reduce((sum, value) => sum + value.count, 0);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Maç ayrıntıları alınamadı.";
        goalDetailErrors.push(`${id}: ${message}`);
        // Do not erase a previously confirmed detail or touch scores on source failures.
        await adminDb.runTransaction(async transaction => {
          const snapshot = await transaction.get(reference);
          const current = snapshot.data() ?? {};
          if (snapshot.exists && current.status === "finished" && current.homeScore === score.homeScore && current.awayScore === score.awayScore && !manualDetails(current)) {
            transaction.update(reference, { goalDetailsLastCheckedAt: FieldValue.serverTimestamp(), goalDetailsLastError: message });
          }
        });
      }
    }));
  }
  return { goalDetailsUpdatedCount, assistDetailsUpdatedCount, importedGoalCount, importedAssistCount,
    goalDetailsRemainingCount: Math.max(0, eligible.length - selected.length), goalDetailErrors };
}
