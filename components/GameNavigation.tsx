"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

const links: Array<{
  href: string;
  label: string;
  icon: HittiteIconName;
}> = [
  { href: "/games/league-prediction", label: "Oyun", icon: "game" },
  { href: "/predictions", label: "Tahminler", icon: "ball" },
  { href: "/standings", label: "Puan Durumu", icon: "trophy" },
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
    <nav className="hg-nav mb-6 rounded-2xl p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.href === "/predictions" && pathname.startsWith("/predictions")) ||
            (link.href === "/standings" && pathname.startsWith("/standings")) ||
            (link.href === "/statistics" && pathname.startsWith("/statistics")) ||
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
  );
}
