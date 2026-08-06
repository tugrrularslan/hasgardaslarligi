const TEAM_CREST_IDS: Record<string, number> = {
  alanyaspor: 6362,
  "amed sk": 207011,
  "amed sfk": 207011,
  amedspor: 207011,
  "amed sportif faaliyetler": 207011,
  besiktas: 3050,
  basaksehir: 3086,
  "basaksehir fk": 3086,
  "istanbul basaksehir": 3086,
  "caykur rizespor": 3064,
  "corum fk": 77629,
  "erzurumspor fk": 55603,
  "erzurum bb": 55603,
  eyupspor: 7040,
  fenerbahce: 3052,
  galatasaray: 3061,
  "gaziantep fk": 5138,
  genclerbirligi: 7802,
  goztepe: 3054,
  kasimpasa: 6063,
  kocaelispor: 3065,
  konyaspor: 3085,
  samsunspor: 3053,
  trabzonspor: 3051,
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
    ? `https://img.sofascore.com/api/v1/team/${teamId}/image`
    : null;
}
