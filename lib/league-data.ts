export const LEAGUE_TEAM_DATA = [
  {
    name: "Alanyaspor",
    crest: "alanyaspor",
    aliases: ["Corendon Alanyaspor"],
  },
  {
    name: "Amed SK",
    crest: "amed-sfk",
    aliases: [
      "Amed",
      "Amed SF",
      "Amed SFK",
      "Amedspor",
      "Amed Sportif Faaliyetler",
    ],
  },
  {
    name: "Beşiktaş",
    crest: "besiktas",
    aliases: ["Beşiktaş JK", "Beşiktaş A.Ş.", "Besiktas"],
  },
  {
    name: "Başakşehir",
    crest: "istanbul-basaksehir",
    aliases: [
      "Başakşehir FK",
      "İstanbul Başakşehir",
      "İstanbul Başakşehir FK",
      "İstanbul BB",
      "İstanbul Başakşehir FK A.Ş.",
    ],
  },
  {
    name: "Çaykur Rizespor",
    crest: "caykur-rizespor",
    aliases: [
      "Rizespor",
      "Çaykur Rize",
      "Çaykur Rize Spor",
      "Çaykur Rizespor A.Ş.",
      "Caykur Rizespor",
    ],
  },
  {
    name: "Çorum FK",
    crest: "corum-fk",
    aliases: ["Çorum", "Çorum Futbol Kulübü", "Arca Çorum FK"],
  },
  {
    name: "Erzurumspor FK",
    crest: "erzurum-bb",
    aliases: [
      "Erzurum BB",
      "Erzurumspor",
      "Büyükşehir Belediye Erzurumspor",
    ],
  },
  {
    name: "Eyüpspor",
    crest: "eyupspor",
    aliases: ["Eyüp Spor", "Eyupspor"],
  },
  {
    name: "Fenerbahçe",
    crest: "fenerbahce",
    aliases: ["Fenerbahçe A.Ş.", "Fenerbahce"],
  },
  {
    name: "Galatasaray",
    crest: "galatasaray",
    aliases: ["Galatasaray A.Ş.", "Galatasaray AS"],
  },
  {
    name: "Gaziantep FK",
    crest: "gaziantep-fk",
    aliases: [
      "Gaziantep",
      "Gaziantepspor",
      "Gaziantep Futbol Kulübü A.Ş.",
    ],
  },
  {
    name: "Gençlerbirliği",
    crest: "genclerbirligi",
    aliases: [],
  },
  {
    name: "Göztepe",
    crest: "goztepe",
    aliases: ["Göztepe A.Ş.", "Goztepe"],
  },
  {
    name: "Kasımpaşa",
    crest: "kasimpasa",
    aliases: ["Kasımpaşa A.Ş.", "Kasimpasa"],
  },
  { name: "Kocaelispor", crest: "kocaelispor", aliases: [] },
  {
    name: "Konyaspor",
    crest: "konyaspor",
    aliases: ["Tümosan Konyaspor"],
  },
  {
    name: "Samsunspor",
    crest: "samsunspor",
    aliases: ["Samsunspor A.Ş."],
  },
  {
    name: "Trabzonspor",
    crest: "trabzonspor",
    aliases: ["Trabzonspor A.Ş."],
  },
] as const;

export type LeagueTeamName = (typeof LEAGUE_TEAM_DATA)[number]["name"];

export function normalizeLeagueTeamName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_BY_NORMALIZED_NAME = new Map<string, LeagueTeamName>();

for (const team of LEAGUE_TEAM_DATA) {
  TEAM_BY_NORMALIZED_NAME.set(normalizeLeagueTeamName(team.name), team.name);
  for (const alias of team.aliases) {
    TEAM_BY_NORMALIZED_NAME.set(normalizeLeagueTeamName(alias), team.name);
  }
}

export function resolveLeagueTeamName(value: string): string {
  return (
    TEAM_BY_NORMALIZED_NAME.get(normalizeLeagueTeamName(value)) ?? value.trim()
  );
}

export function getLeagueTeamCrestFile(value: string): string | null {
  const canonicalName = resolveLeagueTeamName(value);
  const team = LEAGUE_TEAM_DATA.find((item) => item.name === canonicalName);
  return team?.crest ?? null;
}
