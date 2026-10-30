import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { parseEspnMatchDetails, getMatchAssistTotals } from "../lib/match-details.ts";
import { normalizeManualAssistTotals } from "../lib/admin-assists.ts";
import { getPlayerIdentityKey } from "../lib/player-identity.ts";
const sample = JSON.parse(readFileSync(new URL("./fixtures/espn-super-lig-summary.json", import.meta.url), "utf8"));
const context = { sourceEventId: "401888259", homeTeam: "Konyaspor", awayTeam: "Galatasaray", homeScore: 0, awayScore: 4 };
const details = parseEspnMatchDetails(sample, context);
assert.ok(details);
assert.deepEqual(details.goalEvents.map(value => value.scorer), ["Victor Osimhen", "Yunus Akgün", "Alexey Batrakov", "Rafael Leão"]);
assert.equal(details.goalEvents.filter(value => value.side === "away").length, 4);
assert.deepEqual(details.assistTotals.map(value => [value.player, value.count]), [["Alexey Batrakov", 1], ["Gabriel Gomes", 2]]);
assert.ok(details.goalEvents.every(value => !value.assister), "Aggregate assists must not be assigned to arbitrary goals");
for (const change of [ { sourceEventId: "wrong" }, { homeScore: 1 }, { awayScore: 5 }, { homeTeam: "Beşiktaş" } ]) {
  assert.equal(parseEspnMatchDetails(sample, { ...context, ...change }), null);
}
for (const mutate of [
  value => { value.keyEvents = value.keyEvents.filter(event => event.id !== "54492563"); },
  value => { value.keyEvents.push(value.keyEvents[0]); },
  value => { value.keyEvents[0].shootout = true; },
  value => { value.keyEvents[0].participants = []; },
  value => { value.keyEvents[0].team.displayName = "Unknown team"; },
  value => { value.header.competitions[0].status.type.completed = false; },
]) {
  const altered = structuredClone(sample); mutate(altered);
  assert.equal(parseEspnMatchDetails(altered, context), null);
}
const noAssists = structuredClone(sample);
noAssists.rosters.forEach(roster => roster.roster.forEach(player => { player.stats = []; }));
assert.equal(parseEspnMatchDetails(noAssists, context).assistTotals, null);
const own = structuredClone(sample);
own.keyEvents = [own.keyEvents[0]];
own.keyEvents[0].ownGoal = true;
own.header.competitions[0].competitors.find(value => value.homeAway === "home").score = "1";
own.header.competitions[0].competitors.find(value => value.homeAway === "away").score = "0";
const ownDetails = parseEspnMatchDetails(own, { ...context, homeScore: 1, awayScore: 0 });
assert.equal(ownDetails.goalEvents[0].side, "home");
assert.equal(ownDetails.goalEvents[0].assister, "");
const totals = getMatchAssistTotals({ assistTotals: details.assistTotals, assistDetailsStatus: "complete", goalEvents: [{team:"Galatasaray",assister:"Gabriel Gomes"}] });
assert.equal(totals.reduce((sum, value) => sum + value.count, 0), 3, "Linked assists must not be counted on top of confirmed totals");
assert.equal(getMatchAssistTotals({ goalEvents: [{team:"Galatasaray",assister:"Manuel"},{team:"Galatasaray",assister:"Manuel"},{team:"Galatasaray",assister:"Other",ownGoal:true}] })[0].count, 2);

// Run the actual detail backfill against a transactional in-memory database.
const require = createRequire(import.meta.url);
const { Timestamp } = require("firebase-admin/firestore");
let stored, updates, sourceFailure, changeDuringFetch;
const snapshot = () => ({ exists: true, data: () => stored });
const reference = { id: "existing-match" };
const deleted = Symbol("deleted");
const db = {
  collection(name) { assert.equal(name, "matches"); return { doc(id) { assert.equal(id, reference.id); return reference; } }; },
  async runTransaction(callback) {
    return callback({ get: async () => snapshot(), update(_ref, patch) {
      updates.push(patch);
      for (const [key, value] of Object.entries(patch)) { if (value === deleted) delete stored[key]; else stored[key] = value; }
    } });
  },
};
const code = ts.transpileModule(readFileSync(new URL("../lib/match-details-sync.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mocks = {
  "firebase-admin/firestore": { Timestamp, FieldValue: { serverTimestamp: () => Timestamp.now(), delete: () => deleted } },
  "@/lib/firebase-admin": { adminDb: db },
  "@/lib/super-lig-sync": { canonicalTeamName: value => value },
  "@/lib/player-identity": { getPlayerIdentityKey },
  "@/lib/super-lig-sync-server": { async loadEspnMatchDetails() {
    if (sourceFailure) throw Error("source unavailable");
    if (changeDuringFetch) changeDuringFetch();
    return details;
  } },
};
const exports = {};
vm.runInNewContext(code, { exports, require: name => mocks[name] ?? require(name), Date, Map, Promise, Array });
function reset() {
  stored = { homeTeam: "Konyaspor", awayTeam: "Galatasaray", status: "finished", homeScore: 0, awayScore: 4, result: "2", pointsCalculated: true, scoreRevision: 3, goalEvents: [], goalDetailsStatus: "unavailable" };
  updates = []; sourceFailure = false; changeDuringFetch = null;
}
const source = { ...context, completedScore: { homeScore: 0, awayScore: 4 }, kickoff: new Date("2026-10-30T17:00Z") };
const run = () => exports.syncMatchDetails([{ id: reference.id, data: { ...stored }, source }]);
reset();
let result = await run();
assert.equal(result.importedGoalCount, 4);
assert.equal(result.importedAssistCount, 3);
assert.equal(stored.goalEvents.length, 4);
assert.equal(stored.assistTotals.length, 2);
for (const patch of updates) for (const forbidden of ["status","homeScore","awayScore","result","pointsCalculated","scoreRevision","totalPoints"]) assert.ok(!(forbidden in patch));
result = await run();
assert.equal(result.goalDetailsUpdatedCount, 0, "Already checked details should not be fetched and rewritten each run");
reset(); stored.goalDetailsSource = "manual";
await run(); assert.equal(updates.length, 0);
reset(); changeDuringFetch = () => { stored.goalDetailsSource = "manual"; };
await run(); assert.equal(updates.length, 0, "A concurrent administrator edit must win");
reset(); changeDuringFetch = () => { stored.awayScore = 3; };
await run(); assert.equal(updates.length, 0, "A stale summary must not be saved after a score correction");
reset(); sourceFailure = true;
result = await run();
assert.equal(result.goalDetailErrors.length, 1);
assert.equal(stored.goalEvents.length, 0);
assert.equal(stored.pointsCalculated, true);
console.log("Gol ve asist ayrıntıları: gerçek kaynak, skor/takım doğrulama, toplamlar, tekrar çalıştırma ve yönetici kaydı koruması başarılı.");

// Regression: clicking Save without changing a completed result must retain aggregate assists.
const scoringExports = {};
const scoringReference = {
  get: async () => snapshot(),
  update: async patch => {
    updates.push(patch);
    for (const [key, value] of Object.entries(patch)) {
      if (value === deleted) delete stored[key]; else stored[key] = value;
    }
  },
};
const scoringMocks = {
  "@/lib/admin-assists": { normalizeManualAssistTotals },
  "@/lib/match-details": { getMatchAssistTotals },
  "firebase-admin/firestore": { Timestamp, FieldValue: { serverTimestamp: () => Timestamp.now(), delete: () => deleted } },
  "@/lib/firebase-admin": { adminDb: { collection: () => ({ doc: () => scoringReference }) } },
  "@/lib/player-identity": { getPlayerIdentityKey },
  "@/lib/season": { DEFAULT_SEASON_ID: "2026-2027", DEFAULT_SEASON_NAME: "2026-2027 Sezonu" },
};
const scoringCode = ts.transpileModule(readFileSync(new URL("../lib/match-scoring.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(scoringCode, { exports: scoringExports, require: name => scoringMocks[name] ?? require(name), Date, Map, Promise, Array });
reset();
stored.goalEvents = details.goalEvents.map(goal => ({ team: goal.side === "home" ? context.homeTeam : context.awayTeam,
  scorer: goal.scorer, scorerKey: getPlayerIdentityKey(goal.scorer), assister: null, assisterKey: null, ownGoal: goal.ownGoal }));
stored.goalDetailsStatus = "complete";
stored.goalDetailsSource = "espn";
stored.assistDetailsStatus = "complete";
stored.assistTotals = details.assistTotals;
const originalTotals = JSON.stringify(stored.assistTotals);
const resultInput = { matchId: "existing-match", homeScore: 0, awayScore: 4, goalEvents: details.goalEvents, idempotencyKey: "manual-save-test" };
await scoringExports.saveMatchResult({ adminId: "administrator", input: resultInput });
assert.equal(JSON.stringify(stored.assistTotals), originalTotals);
assert.equal(stored.goalDetailsSource, "espn");
assert.equal(updates.length, 0, "An unchanged result save must not clear imported assists");
await scoringExports.saveMatchResult({ adminId: "administrator", input: { ...resultInput,
  goalEvents: resultInput.goalEvents.map((goal, index) => index === 0 ? { ...goal, assister: "Manuel Asistçi" } : goal),
} });
assert.equal(stored.assistTotals, undefined, "Explicit manual assist edits must replace imported aggregates");
assert.equal(stored.goalEvents[0].assister, "Manuel Asistçi");
assert.equal(stored.pointsCalculated, true);
assert.equal(stored.scoreRevision, 3);
console.log("Aynı sonucu yeniden kaydetmede asist kaybı regresyonu ve açık yönetici düzeltmesi kontrolü başarılı.");

reset();
stored.homeScore = 1; stored.awayScore = 1; stored.result = "X";
stored.goalEvents = [{ team: "Galatasaray", scorer: "Away Scorer", assister: null, ownGoal: false }, { team: "Konyaspor", scorer: "Home Scorer", assister: null, ownGoal: false }];
stored.goalDetailsStatus = "complete"; stored.goalDetailsSource = "espn";
stored.assistTotals = [{ team: "Galatasaray", player: "Imported", count: 1 }];
await scoringExports.saveMatchResult({ adminId: "administrator", input: {
  matchId: "existing-match", homeScore: 1, awayScore: 1, idempotencyKey: "reordered-save",
  goalEvents: [{ side: "home", scorer: "Home Scorer", assister: "", ownGoal: false }, { side: "away", scorer: "Away Scorer", assister: "", ownGoal: false }],
} });
assert.equal(updates.length, 0, "Administrator form grouping home and away goals must not erase aggregate assists");
assert.equal(stored.assistTotals[0].count, 1);
