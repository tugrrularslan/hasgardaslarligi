"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GameReturnLinks from "@/components/GameReturnLinks";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

const links: Array<{
  href: string;
  label: string;
  icon: HittiteIconName;
}> = [
  { href: "/predictions", label: "Tahminler", icon: "ball" },
  { href: "/standings", label: "Sıralama", icon: "trophy" },
  { href: "/statistics", label: "İstatistikler", icon: "chart" },
  {
    href: "/games/league-prediction/tablet",
    label: "Haftanın Tableti",
    icon: "record",
  },
  { href: "/games/league-prediction/rules", label: "Kurallar", icon: "rules" },
];

export default function GameNavigation() {
  const pathname = usePathname();

  return (
    <div className="mb-6 space-y-3">
      <GameReturnLinks />

      <nav
        className="hg-desktop-game-nav hg-nav rounded-2xl p-3"
        aria-label="Gardaş 1X2 menüsü"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href === "/predictions" &&
                pathname.startsWith("/predictions")) ||
              (link.href === "/standings" &&
                pathname.startsWith("/standings")) ||
              (link.href === "/statistics" &&
                pathname.startsWith("/statistics")) ||
              (link.href === "/games/league-prediction/tablet" &&
                pathname.startsWith("/games/league-prediction/tablet"));

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`hg-icon-label rounded-xl px-3 py-3 text-center text-sm font-bold transition ${
                  active ? "hg-nav-active" : "hg-nav-item"
                }`}
              >
                <HittiteIcon name={link.icon} size="sm" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
