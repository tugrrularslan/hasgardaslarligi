"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  {
    href: "/games/league-prediction",
    label: "Oyun",
    icon: "🎮",
  },
  {
    href: "/predictions",
    label: "Tahminler",
    icon: "⚽",
  },
  {
    href: "/standings",
    label: "Puan Durumu",
    icon: "🏆",
  },
  {
    href: "/statistics",
    label: "İstatistikler",
    icon: "📈",
  },
  {
    href: "/games/league-prediction/rules",
    label: "Kurallar",
    icon: "📜",
  },
];

export default function GameNavigation() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 rounded-2xl border border-white/10 bg-black/30 p-3 shadow-lg backdrop-blur-md">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.href === "/predictions" &&
              pathname.startsWith("/predictions")) ||
            (link.href === "/standings" &&
              pathname.startsWith("/standings")) ||
            (link.href === "/statistics" &&
              pathname.startsWith("/statistics"));

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl px-3 py-3 text-center text-sm font-bold transition ${
                active
                  ? "bg-white text-red-800"
                  : "bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              <span className="mr-1">
                {link.icon}
              </span>

              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}