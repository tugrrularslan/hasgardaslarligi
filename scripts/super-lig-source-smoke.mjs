import assert from "node:assert/strict";
import {
  ESPN_SUPER_LIG_SCOREBOARD_URL,
  TFF_SUPER_LIG_FIXTURE_URL,
  mergeSuperLigSources,
  parseEspnFixtureEvents,
  parseTffFixtures,
} from "../lib/super-lig-sync.ts";

const seasonId = "2026-2027";
const [tffResponse, firstYearResponse, secondYearResponse] = await Promise.all([
  fetch(TFF_SUPER_LIG_FIXTURE_URL),
  fetch(`${ESPN_SUPER_LIG_SCOREBOARD_URL}?dates=2026&limit=500`),
  fetch(`${ESPN_SUPER_LIG_SCOREBOARD_URL}?dates=2027&limit=500`),
]);

assert.ok(tffResponse.ok, `TFF yanıtı başarısız: ${tffResponse.status}`);
assert.ok(
  firstYearResponse.ok,
  `ESPN ilk yıl yanıtı başarısız: ${firstYearResponse.status}`,
);
assert.ok(
  secondYearResponse.ok,
  `ESPN ikinci yıl yanıtı başarısız: ${secondYearResponse.status}`,
);

const [tffHtml, firstYearScoreboard, secondYearScoreboard] = await Promise.all([
  tffResponse
    .arrayBuffer()
    .then((bytes) => new TextDecoder("windows-1254").decode(bytes)),
  firstYearResponse.json(),
  secondYearResponse.json(),
]);
const fixtures = parseTffFixtures(tffHtml, seasonId);
const events = [
  ...parseEspnFixtureEvents(firstYearScoreboard, 2026),
  ...parseEspnFixtureEvents(secondYearScoreboard, 2026),
];
const merged = mergeSuperLigSources(fixtures, events);

assert.equal(fixtures.length, 306, "TFF 34 haftada 306 maç sunmalı.");
assert.equal(new Set(fixtures.map((fixture) => fixture.week)).size, 34);
assert.equal(merged.matches.length, 306, "Her resmi eşleşme saat kaynağıyla eşleşmeli.");
assert.equal(merged.unmatchedTffFixtureIds.length, 0);
assert.equal(merged.duplicateEspnMatchKeys.length, 0);

console.log(
  `Canlı kaynak testi başarılı: ${fixtures.length} resmi fikstür, ` +
    `${events.length} ESPN olayı, ${merged.scoreConflicts.length} skor çelişkisi.`,
);
