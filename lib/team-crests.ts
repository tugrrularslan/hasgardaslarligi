const TEAM_CREST_FILES: Record<string, string> = {
  alanyaspor: "alanyaspor",
  "amed sk": "amed-sfk",
  "amed sfk": "amed-sfk",
  amedspor: "amed-sfk",
  "amed sportif faaliyetler": "amed-sfk",
  besiktas: "besiktas",
  basaksehir: "istanbul-basaksehir",
  "basaksehir fk": "istanbul-basaksehir",
  "istanbul basaksehir": "istanbul-basaksehir",
  "caykur rizespor": "caykur-rizespor",
  "corum fk": "corum-fk",
  "erzurumspor fk": "erzurum-bb",
  "erzurum bb": "erzurum-bb",
  eyupspor: "eyupspor",
  fenerbahce: "fenerbahce",
  galatasaray: "galatasaray",
  "gaziantep fk": "gaziantep-fk",
  genclerbirligi: "genclerbirligi",
  goztepe: "goztepe",
  kasimpasa: "kasimpasa",
  kocaelispor: "kocaelispor",
  konyaspor: "konyaspor",
  samsunspor: "samsunspor",
  trabzonspor: "trabzonspor",
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
  const fileName = TEAM_CREST_FILES[normalizeTeamName(team)];

  return fileName ? `/team-crests/${fileName}.png` : null;
}
