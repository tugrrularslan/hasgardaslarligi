import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { getMatchAssistTotals } from "../lib/match-details.ts";
import { getAdminActiveWeek } from "../lib/active-week.ts";

assert.equal(getAdminActiveWeek({ activeWeek: 8, activeWeekSeasonId: "2026-2027" }, "2026-2027"), 8);
for (const activeWeek of [null, 0, -1, 1.5, "8", NaN]) {
  assert.equal(getAdminActiveWeek({ activeWeek, activeWeekSeasonId: "2026-2027" }, "2026-2027"), null);
}
assert.equal(getAdminActiveWeek({ activeWeek: 8, activeWeekSeasonId: "2025-2026" }, "2026-2027"), null);
assert.equal(getAdminActiveWeek({}, "2026-2027"), null);

// Execute the actual route against in-memory Firebase and external-source adapters.
const require = createRequire(import.meta.url);
const { Timestamp } = require("firebase-admin/firestore");
const sourceText = readFileSync(new URL("../app/api/admin/sync-super-lig/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const workflowToken = "github-oidc";
let rows, writes, scored, sourceCalls, failScoring, sourceFailure;
const fixture = {
  sourceTffMatchId: "123", sourceEventId: "456", week: 3,
  homeTeam: "Galatasaray", awayTeam: "Fenerbahçe", kickoff: new Date("2026-09-01T18:00:00Z"),
  completedScore: { homeScore: 2, awayScore: 1 },
};
function reset() {
  writes = []; scored = []; sourceCalls = 0; failScoring = false; sourceFailure = false;
  rows = [{ id: "legacy-match", data: () => ({ seasonId: "2026-2027", week: 3,
    homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, status: "scheduled" }) }];
}
const db = {
  collection(collection) {
    const query = {
      where() { return query; },
      async get() { return { docs: rows }; },
      doc(id) { return {
        collection, id,
        async get() {
          return { exists: true, data: () => collection === "settings"
            ? { seasonId: "2026-2027", activeWeek: 2, activeWeekSeasonId: "2026-2027" }
            : collection === "users" ? { isAdmin: id === "admin" } : { legacyReconciliationCompleted: true } };
        },
        async set(data) { writes.push({ collection, id, data }); },
      }; },
    };
    return query;
  },
  batch() { return {
    set(ref, data) { writes.push({ ...ref, data }); }, async commit() {},
  }; },
};
const mocks = {
  "@/lib/match-details-sync": { async syncMatchDetails() { return { goalDetailsUpdatedCount: 0 }; } },
  "@/lib/github-sync-auth": { async verifyGithubSyncToken(token) {
    if (token !== workflowToken) throw Error("invalid workflow identity");
  } },
  "firebase-admin/firestore": { Timestamp, FieldValue: { serverTimestamp: () => "timestamp" } },
  "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  "@/lib/firebase-admin": { adminDb: db, adminAuth: { async verifyIdToken(token) {
    if (!["admin", "user"].includes(token)) throw Error("bad token");
    return { uid: token };
  } } },
  "@/lib/season": { DEFAULT_SEASON_ID: "2026-2027", DEFAULT_SEASON_NAME: "2026-2027 Sezonu" },
  "@/lib/super-lig-sync": { canonicalTeamName: (name) => name, sourceMatchKey: (a, b) => `${a}_${b}` },
  "@/lib/super-lig-sync-server": { async loadSuperLigSources() {
    sourceCalls++;
    if (sourceFailure) throw Error("source unavailable");
    return { matches: [fixture], sourceStats: {}, scoreConflicts: [] };
  } },
  "@/lib/match-scoring": { AdminScoringError: class extends Error {}, async saveMatchResult(input) {
    scored.push(input);
    if (failScoring) throw Error("retry later");
  } },
};
const exports = {};
vm.runInNewContext(code, { exports, Buffer, process: { env: {} },
  require: (name) => mocks[name] ?? require(name), console: { error() {} }, Map, Date });
const post = (token, mode = token === workflowToken ? "github-actions" : null) => exports.POST({
  headers: new Headers({ ...(token ? { authorization: `Bearer ${token}` } : {}), ...(mode ? { "x-super-lig-auth": mode } : {}) }),
});
reset();
for (const [token, status] of [[null, 401], ["invalid", 401], ["user", 403]]) {
  assert.equal((await post(token)).status, status);
}
assert.equal((await post("fake-github-token", "github-actions")).status, 401);
assert.equal((await post("former-shared-secret")).status, 401);
assert.equal(sourceCalls, 0, "Unauthorized requests must not fetch sources or write data");
assert.equal(writes.length, 0);
for (const token of [workflowToken, "admin"]) {
  reset();
  const response = await post(token);
  assert.equal(response.status, 200);
  assert.equal(response.body.scoredCount, 1);
  assert.equal(scored[0].input.matchId, "legacy-match", "Existing prediction links must survive");
  assert.equal(scored[0].input.homeScore, 2);
  assert.equal(response.body.automaticWeekAdvance, false);
  assert.equal(response.body.automaticWeeklyChampionAward, false);
  assert.ok(writes.every((write) => !["settings", "publishedWeeks"].includes(write.collection)));
}
reset();
rows = [{ id: "legacy-match", data: () => ({ seasonId: "2026-2027", sourceTffMatchId: "123",
  status: "finished", pointsCalculated: true, homeScore: 2, awayScore: 1 }) }];
await post(workflowToken);
assert.equal(scored.length, 0, "Unchanged result must not award points again");
reset();
fixture.completedScore = null;
await post(workflowToken);
assert.equal(scored.length, 0, "Unconfirmed result must never be scored");
fixture.completedScore = { homeScore: 2, awayScore: 1 };
reset();
rows = [{ id: "legacy-match", data: () => ({ seasonId: "2026-2027", sourceTffMatchId: "123",
  status: "finished", pointsCalculated: false, scoringStatus: "failed", homeScore: 2, awayScore: 1 }) }];
await post(workflowToken);
assert.equal(scored.length, 1, "Failed revision must be retried using the existing scoring service");
reset(); failScoring = true;
const failure = await post(workflowToken);
assert.equal(failure.status, 500);
assert.equal(failure.body.success, false);
assert.equal(failure.body.scoringErrors.length, 1);
reset(); sourceFailure = true;
assert.equal((await post(workflowToken)).status, 500);
assert.equal(writes.length, 0, "Source failures must leave data untouched");
console.log("Otomasyon yetkisi, sonuç kaydı, puanlama tekrarı ve aktif hafta kontrolleri başarılı.");

// Render the real prediction page with deterministic hooks and Firebase listeners.
const pageCode = ts.transpileModule(readFileSync(new URL("../app/predictions/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText + "\nexports.MatchResultDetails = MatchResultDetails;";
let states, effects, pending, cursor;
const firebaseUser = { uid: "user", displayName: "Tester" };
const router = { replace() {} };
const pageMocks = {
  react: {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useMemo(callback) { return callback(); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!effects[index] || deps.some((value, n) => value !== effects[index][n])) {
        effects[index] = deps;
        pending.push(callback);
      }
    },
  },
  "next/navigation": { useRouter: () => router },
  "firebase/auth": { onAuthStateChanged(_auth, callback) { callback(firebaseUser); return () => {}; } },
  "firebase/firestore": {
    doc: (_db, collection) => collection, collection: (_db, name) => name,
    query: (collection) => collection, where() {}, orderBy() {},
    async getDocs() { return { forEach() {} }; },
    onSnapshot(ref, callback) {
      const matches = [2, 3, 4].map((week) => ({ id: `match-${week}`, data: () => ({
        week, seasonId: "2026-2027", homeTeam: "Galatasaray", awayTeam: "Fenerbahçe",
        kickoff: Timestamp.fromMillis(1900000000000), predictionDeadline: Timestamp.fromMillis(1900000000000), status: "scheduled",
      }) }));
      callback({ exists: () => true, docs: matches, data: () => ref === "settings"
        ? { seasonId: "2026-2027", activeWeek: 3, activeWeekSeasonId: "2026-2027" }
        : { username: "Tester", selectedTheme: "obsidyen" } });
      return () => {};
    },
  },
  "@/lib/firebase": {},
  "@/lib/themes": { getThemeById: () => ({}) },
  "@/lib/match-details": { getMatchAssistTotals },
  "@/lib/active-week": { getAdminActiveWeek },
  "@/lib/season": { DEFAULT_SEASON_ID: "2026-2027" },
};
const pageExports = {};
vm.runInNewContext(pageCode, { exports: pageExports, console,
  require: (name) => pageMocks[name] ?? (name.startsWith("@/components/") || name === "next/link"
    ? { __esModule: true, default: name } : require(name)),
});
async function renderPage(fresh = false) {
  if (fresh) { states = []; effects = []; }
  let tree;
  for (let count = 0; count < 4; count++) {
    cursor = 0; pending = [];
    tree = pageExports.default();
    for (const effect of pending) effect();
    await Promise.resolve();
  }
  return tree;
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function visibleWeeks(tree) {
  return elements(tree).filter((element) => element.type === "@/components/WeeklyPredictionCard").map((element) => element.props.week);
}
let tree = await renderPage(true);
assert.deepEqual(visibleWeeks(tree), [3], "Entry must use administrator week even when earlier predictions are open");
const otherWeekButton = elements(tree).find((element) => element.type === "button" &&
  Array.isArray(element.props.children) && element.props.children[0] === 2);
assert.ok(otherWeekButton);
otherWeekButton.props.onClick();
tree = await renderPage();
assert.deepEqual(visibleWeeks(tree), [2], "User may browse a different week");
const allButton = elements(tree).find((element) => element.type === "button" && element.props.children === "Tüm Haftalar");
allButton.props.onClick();
assert.deepEqual(visibleWeeks(await renderPage()), [2, 3, 4]);
assert.deepEqual(visibleWeeks(await renderPage(true)), [3], "Re-entry must reset browsing to administrator week");
console.log("Tahmin ekranı: aktif hafta ile açılış, diğer haftalar ve yeniden giriş kontrolü başarılı.");

function renderedText(node) {
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  if (node === null || node === undefined || node === false) return "";
  if (typeof node !== "object") return String(node);
  if (typeof node.type === "function") return renderedText(node.type(node.props));
  return renderedText(node.props?.children);
}
const detailsText = renderedText(pageExports.MatchResultDetails({ match: {
  homeTeam: "Konyaspor", awayTeam: "Galatasaray", homeScore: 0, awayScore: 1,
  goalEvents: [{ team: "Galatasaray", scorer: "Golcü", ownGoal: false }],
  assistTotals: [{ team: "Galatasaray", player: "Asistçi", playerKey: "asistci", count: 1 }],
  assistDetailsStatus: "complete",
}, theme: {} }));
assert.ok(detailsText.includes("Golcü"));
assert.ok(/Asistçi.*1.*asist/.test(detailsText), "Match detail card must show imported assists");
const pendingText = renderedText(pageExports.MatchResultDetails({ match: {
  homeTeam: "Konyaspor", awayTeam: "Galatasaray", homeScore: 0, awayScore: 1, goalEvents: [],
}, theme: {} }));
assert.ok(pendingText.includes("Gol ayrıntıları bekleniyor."), "Missing scorers must not be presented as no goals");
console.log("Maç kartı: golcü, asist toplamı ve eksik ayrıntı görünümü başarılı.");
