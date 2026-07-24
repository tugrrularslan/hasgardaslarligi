import Link from "next/link";
import { getGameBySlug } from "@/lib/games";

type GameNavigationProps = {
  gameSlug?: string;
  active?: "home" | "predictions" | "standings" | "statistics" | "rules";
};

export default function GameNavigation({
  gameSlug = "league-prediction",
  active,
}: GameNavigationProps) {
  const game = getGameBySlug(gameSlug);
  const basePath = game?.href ?? `/games/${gameSlug}`;

  const items = [
    { id: "home", label: "Oyun", href: basePath },
    { id: "predictions", label: "Tahminler", href: `${basePath}/predictions` },
    { id: "standings", label: "Puan Durumu", href: `${basePath}/standings` },
    { id: "statistics", label: "İstatistikler", href: `${basePath}/statistics` },
    { id: "rules", label: "Kurallar", href: `${basePath}/rules` },
  ] as const;

  return (
    <nav aria-label={`${game?.name ?? "Oyun"} menüsü`} className="overflow-x-auto">
      <div className="flex min-w-max gap-2 rounded-2xl border border-amber-200/15 bg-black/25 p-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              active === item.id
                ? "bg-amber-300 text-stone-950"
                : "text-stone-200 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
