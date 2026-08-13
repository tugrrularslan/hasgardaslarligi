import {
  normalizeKahinTeamName,
  resolveKahinTeamName,
} from "@/lib/kahin";

const TEAM_CREST_FILES: Record<string, string> = {
  alanyaspor: "alanyaspor",
  amed: "amed-sfk",
  "amed sf": "amed-sfk",
  "amed sk": "amed-sfk",
  "amed sfk": "amed-sfk",
  amedspor: "amed-sfk",
  "amed sportif faaliyetler": "amed-sfk",
  besiktas: "besiktas",
  "besiktas jk": "besiktas",
  basaksehir: "istanbul-basaksehir",
  "basaksehir fk": "istanbul-basaksehir",
  "istanbul basaksehir": "istanbul-basaksehir",
  "istanbul basaksehir fk": "istanbul-basaksehir",
  "istanbul bb": "istanbul-basaksehir",
  "caykur rizespor": "caykur-rizespor",
  "caykur rize": "caykur-rizespor",
  "caykur rize spor": "caykur-rizespor",
  rizespor: "caykur-rizespor",
  corum: "corum-fk",
  "corum fk": "corum-fk",
  "corum futbol kulubu": "corum-fk",
  "buyuksehir belediye erzurumspor": "erzurum-bb",
  "erzurum bb": "erzurum-bb",
  erzurumspor: "erzurum-bb",
  "erzurumspor fk": "erzurum-bb",
  "eyup spor": "eyupspor",
  eyupspor: "eyupspor",
  fenerbahce: "fenerbahce",
  galatasaray: "galatasaray",
  gaziantep: "gaziantep-fk",
  "gaziantep fk": "gaziantep-fk",
  gaziantepspor: "gaziantep-fk",
  genclerbirligi: "genclerbirligi",
  goztepe: "goztepe",
  kasimpasa: "kasimpasa",
  kocaelispor: "kocaelispor",
  konyaspor: "konyaspor",
  samsunspor: "samsunspor",
  trabzonspor: "trabzonspor",
};

export function getTeamCrestUrl(team: string): string | null {
  const normalizedTeam = normalizeKahinTeamName(team);
  const canonicalTeam = normalizeKahinTeamName(resolveKahinTeamName(team));
  const fileName =
    TEAM_CREST_FILES[normalizedTeam] ?? TEAM_CREST_FILES[canonicalTeam];

  return fileName ? `/team-crests/${fileName}.png` : null;
}
