import assert from "node:assert/strict";
import {
  mergeSuperLigSources,
  parseSeasonYears,
  parseTffFixtures,
} from "../lib/super-lig-sync.ts";

const FIXTURE_HTML = `
  <section>Trendyol Süper Lig Fikstür Listesi</section>
  <span>Trendyol Süper Lig Adnan Süvari Sezonu<br/>Sezon 2026-2027<br/></span>
  <table>
    <tr><td class="belirginYazi" align="Center">1.Hafta</td></tr>
    <tr>
      <td class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=1">GALATASARAY A.Ş.</a></td>
      <td class="altCizgi"><a href="/Default.aspx?pageID=29&macId=317790">2 - 2</a></td>
      <td class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=2">ARCA ÇORUM FK</a></td>
    </tr>
    <tr><td class="belirginYazi" align="Center">2.Hafta</td></tr>
    <tr>
      <td class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=2">ARCA ÇORUM FK</a></td>
      <td class="altCizgi"><a href="/Default.aspx?pageID=29&macId=317791">-</a></td>
      <td class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=1">GALATASARAY A.Ş.</a></td>
    </tr>
  </table>
`;

assert.deepEqual(parseSeasonYears("2026-2027"), {
  startYear: 2026,
  endYear: 2027,
});
assert.equal(parseSeasonYears("2026"), null);

const fixtures = parseTffFixtures(FIXTURE_HTML, "2026-2027");
assert.equal(fixtures.length, 2, "TFF satırları ayrıştırılmalı.");
assert.deepEqual(fixtures[0], {
  sourceTffMatchId: "317790",
  week: 1,
  homeTeam: "Galatasaray",
  awayTeam: "Çorum FK",
  officialScore: { homeScore: 2, awayScore: 2 },
});
assert.equal(fixtures[1].officialScore, null);

const merged = mergeSuperLigSources(fixtures, [
  {
    sourceEventId: "espn-1",
    seasonYear: 2026,
    kickoff: new Date("2026-08-14T18:30:00.000Z"),
    homeTeam: "Galatasaray",
    awayTeam: "Corum FK",
    completed: true,
    score: { homeScore: 2, awayScore: 2 },
  },
  {
    sourceEventId: "espn-2",
    seasonYear: 2026,
    kickoff: new Date("2026-08-21T18:30:00.000Z"),
    homeTeam: "Çorum FK",
    awayTeam: "Galatasaray",
    completed: false,
    score: null,
  },
]);

assert.equal(merged.matches.length, 2, "TFF ve ESPN eşleşmeleri birleşmeli.");
assert.deepEqual(merged.matches[0].completedScore, {
  homeScore: 2,
  awayScore: 2,
});
assert.equal(merged.matches[1].completedScore, null);

const conflict = mergeSuperLigSources(fixtures.slice(0, 1), [
  {
    sourceEventId: "espn-conflict",
    seasonYear: 2026,
    kickoff: new Date("2026-08-14T18:30:00.000Z"),
    homeTeam: "Galatasaray",
    awayTeam: "Çorum FK",
    completed: true,
    score: { homeScore: 3, awayScore: 2 },
  },
]);

assert.equal(conflict.scoreConflicts.length, 1);
assert.equal(conflict.matches[0].completedScore, null);

console.log("Süper Lig eşitleme veri kontrolleri başarılı.");
