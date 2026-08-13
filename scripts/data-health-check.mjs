import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LEAGUE_TEAM_DATA,
  getLeagueTeamCrestFile,
  normalizeLeagueTeamName,
  resolveLeagueTeamName,
} from "../lib/league-data.ts";
import { MANUAL_LEAGUE_PLAYERS } from "../lib/manual-players.ts";

const projectRoot = process.cwd();
const expectedPngSignature = "89504e470d0a1a0a";
const normalizedNames = new Set();
const crestFiles = new Set();
const aliases = new Set();

assert.equal(
  LEAGUE_TEAM_DATA.length,
  18,
  "Lig takım listesi tam olarak 18 takım içermeli.",
);

for (const team of LEAGUE_TEAM_DATA) {
  const normalizedName = normalizeLeagueTeamName(team.name);
  assert.ok(normalizedName, `${team.name} için normalize edilmiş ad boş olamaz.`);
  assert.ok(
    !normalizedNames.has(normalizedName),
    `${team.name} takım adı birden fazla kez tanımlanmış.`,
  );
  normalizedNames.add(normalizedName);

  assert.equal(
    resolveLeagueTeamName(team.name),
    team.name,
    `${team.name} kendi standart adına çözümlenemiyor.`,
  );
  assert.equal(
    getLeagueTeamCrestFile(team.name),
    team.crest,
    `${team.name} amblem eşlemesi hatalı.`,
  );
  assert.ok(
    !crestFiles.has(team.crest),
    `${team.crest}.png birden fazla takıma atanmış.`,
  );
  crestFiles.add(team.crest);

  const crestPath = path.join(
    projectRoot,
    "public",
    "team-crests",
    `${team.crest}.png`,
  );
  const crestBytes = readFileSync(crestPath);
  assert.ok(crestBytes.length > 100, `${team.name} amblem dosyası boş veya bozuk.`);
  assert.equal(
    crestBytes.subarray(0, 8).toString("hex"),
    expectedPngSignature,
    `${team.name} amblem dosyası geçerli bir PNG değil.`,
  );

  for (const alias of team.aliases) {
    const normalizedAlias = normalizeLeagueTeamName(alias);
    assert.ok(
      !aliases.has(normalizedAlias),
      `${alias} takım takma adı birden fazla kez tanımlanmış.`,
    );
    aliases.add(normalizedAlias);
    assert.equal(
      resolveLeagueTeamName(alias),
      team.name,
      `${alias} takma adı ${team.name} takımına çözümlenemiyor.`,
    );
    assert.equal(
      getLeagueTeamCrestFile(alias),
      team.crest,
      `${alias} takma adı doğru ambleme çözümlenemiyor.`,
    );
  }
}

const manualPlayerNames = new Set();
for (const player of MANUAL_LEAGUE_PLAYERS) {
  const normalizedPlayer = player.name
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .trim();
  assert.ok(player.name.trim(), "Manuel oyuncu adı boş olamaz.");
  assert.ok(
    !manualPlayerNames.has(normalizedPlayer),
    `${player.name} manuel oyuncu listesinde yinelenmiş.`,
  );
  manualPlayerNames.add(normalizedPlayer);
  assert.ok(
    normalizedNames.has(normalizeLeagueTeamName(player.team)),
    `${player.name} geçersiz bir takıma atanmış: ${player.team}.`,
  );
}

console.log(
  `Veri sağlık kontrolü başarılı: ${LEAGUE_TEAM_DATA.length} takım, ` +
    `${crestFiles.size} amblem, ${MANUAL_LEAGUE_PLAYERS.length} manuel oyuncu.`,
);
