"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

type NavigationItem = {
  href: string;
  label: string;
  icon: HittiteIconName;
};

const leagueItems: NavigationItem[] = [
  { href: "/predictions", label: "Tahminler", icon: "ball" },
  { href: "/standings", label: "Puan", icon: "trophy" },
  { href: "/statistics", label: "İstatistik", icon: "chart" },
  { href: "/games/league-prediction/tablet", label: "Tablet", icon: "record" },
  { href: "/games/league-prediction/rules", label: "Kurallar", icon: "rules" },
];

const kahinItems: NavigationItem[] = [
  { href: "/games/kahin/predictions", label: "Tahminler", icon: "rules" },
  { href: "/games/kahin/standings", label: "Puan", icon: "trophy" },
  { href: "/games/kahin/rules", label: "Kurallar", icon: "record" },
];

function isLeagueRoute(pathname: string) {
  return (
    pathname === "/predictions" ||
    pathname === "/standings" ||
    pathname === "/statistics" ||
    pathname.startsWith("/games/league-prediction")
  );
}

export default function MobileNavigation() {
  const pathname = usePathname();
  const items = pathname.startsWith("/games/kahin")
    ? kahinItems
    : isLeagueRoute(pathname)
      ? leagueItems
      : null;

  if (!items) return null;

  return (
    <nav className="hg-mobile-nav" aria-label="Mobil oyun menüsü">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/predictions" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={active ? "hg-mobile-nav-active" : undefined}
          >
            <HittiteIcon name={item.icon} size="sm" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
