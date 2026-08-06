const TEAM_CREST_IDS: Record<string, number> = {
  alanyaspor: 9078,
  "amed sk": 132335,
  "amed sfk": 132335,
  amedspor: 132335,
  "amed sportif faaliyetler": 132335,
  besiktas: 1895,
  basaksehir: 7914,
  "basaksehir fk": 7914,
  "istanbul basaksehir": 7914,
  "caykur rizespor": 7656,
  "corum fk": 132334,
  "erzurumspor fk": 19267,
  "erzurum bb": 19267,
  eyupspor: 20729,
  fenerbahce: 436,
  galatasaray: 432,
  "gaziantep fk": 20070,
  genclerbirligi: 996,
  goztepe: 789,
  kasimpasa: 6870,
  kocaelispor: 995,
  konyaspor: 7648,
  samsunspor: 11429,
  trabzonspor: 997,
};

function normalizeTeamName(team: string): string {
  return team
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function getTeamCrestUrl(team: string): string | null {
  const teamId = TEAM_CREST_IDS[normalizeTeamName(team)];

  return teamId
    ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
    : null;
}
