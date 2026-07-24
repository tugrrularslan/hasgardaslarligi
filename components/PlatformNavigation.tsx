import Link from "next/link";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";

type PlatformNavigationProps = {
  active?: "home" | "games" | "rankings" | "profile";
};

const items: ReadonlyArray<{
  id: NonNullable<PlatformNavigationProps["active"]>;
  label: string;
  href: string;
  icon: HittiteIconName;
}> = [
  { id: "home", label: "Ana Sayfa", href: "/", icon: "home" },
  { id: "games", label: "Oyunlar", href: "/games", icon: "game" },
  { id: "rankings", label: "Sıralamalar", href: "/rankings", icon: "trophy" },
  { id: "profile", label: "Profil", href: "/profile", icon: "user" },
] as const;

export default function PlatformNavigation({ active }: PlatformNavigationProps) {
  return (
    <nav aria-label="Has Gardaşlar ana menüsü" className="overflow-x-auto">
      <div className="hg-nav flex min-w-max gap-2 rounded-2xl p-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
            className={`hg-icon-label rounded-xl px-4 py-2 text-sm font-bold transition ${
              active === item.id ? "hg-nav-active" : "hg-nav-item"
            }`}
          >
            <HittiteIcon name={item.icon} size="sm" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
