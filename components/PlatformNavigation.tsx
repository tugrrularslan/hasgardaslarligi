import Link from "next/link";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

type PlatformNavigationProps = {
  active?: "home" | "games" | "leagueTable" | "rankings" | "profile";
};

const items: ReadonlyArray<{
  id: NonNullable<PlatformNavigationProps["active"]>;
  label: string;
  compactLabel?: string;
  href: string;
  icon: HittiteIconName;
}> = [
  { id: "home", label: "Ana Sayfa", href: "/", icon: "home" },
  { id: "games", label: "Oyunlar", href: "/games", icon: "game" },
  {
    id: "leagueTable",
    label: "Canlı Puan Durumu",
    compactLabel: "Canlı Puan",
    href: "/league-table",
    icon: "trophy",
  },
  {
    id: "rankings",
    label: "Sıralamalar",
    compactLabel: "Sıralama",
    href: "/rankings",
    icon: "trophy",
  },
  { id: "profile", label: "Profil", href: "/profile", icon: "user" },
] as const;

export default function PlatformNavigation({ active }: PlatformNavigationProps) {
  return (
    <nav aria-label="Has Gardaşlar ana menüsü" className="overflow-x-auto">
      <div className="hg-nav flex min-w-max gap-1 rounded-2xl p-1.5 sm:gap-2 sm:p-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
            className={`hg-icon-label rounded-xl px-2.5 py-2 text-xs font-bold transition sm:px-4 sm:text-sm ${
              active === item.id ? "hg-nav-active" : "hg-nav-item"
            }`}
          >
            <HittiteIcon name={item.icon} size="sm" />
            <span className="sm:hidden">{item.compactLabel ?? item.label}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
