export const CURRENT_SEASON_ID = "2026-2027";

export type GameDefinition = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  status: "active" | "coming-soon";
  icon: string;
  href: string;
  rankingHref: string;
};

export const games: GameDefinition[] = [
  {
    id: "league-prediction",
    slug: "league-prediction",
    name: "Gardaş 1X2",
    shortName: "Lig Arenası",
    description:
      "Haftalık lig maçlarını tahmin et, puanları topla ve sezonun şampiyonu ol.",
    status: "active",
    icon: "✥",
    href: "/games/league-prediction",
    rankingHref: "/standings",
  },
  {
    id: "second-game",
    slug: "kahin",
    name: "Kahin",
    shortName: "Sezon Kehaneti",
    description:
      "Lig sıralamasını, gol ve asist krallarını ve sezonun özel liderlerini tahmin et.",
    status: "active",
    icon: "☼",
    href: "/games/kahin",
    rankingHref: "/games/kahin/standings",
  },
];

export function getGameBySlug(slug: string): GameDefinition | undefined {
  return games.find((game) => game.slug === slug);
}
