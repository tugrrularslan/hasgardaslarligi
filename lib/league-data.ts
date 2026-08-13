export const LEAGUE_TEAM_DATA = [
  { name: "Alanyaspor", crest: "alanyaspor", aliases: [] },
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
  { name: "Beşiktaş", crest: "besiktas", aliases: ["Beşiktaş JK"] },
  {
    name: "Başakşehir",
    crest: "istanbul-basaksehir",
    aliases: [
      "Başakşehir FK",
      "İstanbul Başakşehir",
      "İstanbul Başakşehir FK",
      "İstanbul BB",
    ],
  },
  {
    name: "Çaykur Rizespor",
    crest: "caykur-rizespor",
    aliases: ["Rizespor", "Çaykur Rize", "Çaykur Rize Spor"],
  },
  {
    name: "Çorum FK",
    crest: "corum-fk",
    aliases: ["Çorum", "Çorum Futbol Kulübü"],
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
  { name: "Eyüpspor", crest: "eyupspor", aliases: ["Eyüp Spor"] },
  { name: "Fenerbahçe", crest: "fenerbahce", aliases: [] },
  { name: "Galatasaray", crest: "galatasaray", aliases: [] },
  {
    name: "Gaziantep FK",
    crest: "gaziantep-fk",
    aliases: ["Gaziantep", "Gaziantepspor"],
  },
  {
    name: "Gençlerbirliği",
    crest: "genclerbirligi",
    aliases: [],
  },
  { name: "Göztepe", crest: "goztepe", aliases: [] },
  { name: "Kasımpaşa", crest: "kasimpasa", aliases: [] },
  { name: "Kocaelispor", crest: "kocaelispor", aliases: [] },
  { name: "Konyaspor", crest: "konyaspor", aliases: [] },
  { name: "Samsunspor", crest: "samsunspor", aliases: [] },
  { name: "Trabzonspor", crest: "trabzonspor", aliases: [] },
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
