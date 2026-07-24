"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

const links: Array<{
  href: string;
  label: string;
  icon: HittiteIconName;
}> = [
  { href: "/games/kahin/predictions", label: "Tahminler", icon: "rules" },
  { href: "/games/kahin/standings", label: "Puan Durumu", icon: "trophy" },
  { href: "/games/kahin/rules", label: "Kurallar", icon: "record" },
];

export default function KahinNavigation() {
  const pathname = usePathname();

  return (
    <div className="mb-6 space-y-3">
      <Link
        href="/games"
        className="hg-secondary hg-icon-label rounded-xl px-4 py-2.5 text-sm font-black"
      >
        <HittiteIcon name="back" size="sm" />
        Oyunlara Dön
      </Link>

      <nav className="hg-nav rounded-2xl p-3" aria-label="Kahin menüsü">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {links.map((link) => {
            const active = pathname === link.href;

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
