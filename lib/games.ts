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
};

export const games: GameDefinition[] = [
  {
    id: "league-prediction",
    slug: "league-prediction",
    name: "Lig Tahmin Oyunu",
    shortName: "Lig Arenası",
    description:
      "Haftalık lig maçlarını tahmin et, puanları topla ve sezonun şampiyonu ol.",
    status: "active",
    icon: "⚽",
    href: "/games/league-prediction",
  },
  {
    id: "second-game",
    slug: "second-game",
    name: "İkinci Oyun",
    shortName: "Yakında",
    description:
      "Has Gardaşlar'ın sıradaki oyunu için altyapı hazır. Oyun duyurulduğunda burada açılacak.",
    status: "coming-soon",
    icon: "🏛️",
    href: "/games",
  },
];

export function getGameBySlug(slug: string): GameDefinition | undefined {
  return games.find((game) => game.slug === slug);
}
