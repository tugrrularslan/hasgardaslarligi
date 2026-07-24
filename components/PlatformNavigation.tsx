import Link from "next/link";

type PlatformNavigationProps = {
  active?: "home" | "games" | "rankings" | "profile";
};

const items = [
  { id: "home", label: "Ana Sayfa", href: "/" },
  { id: "games", label: "Oyunlar", href: "/games" },
  { id: "rankings", label: "Sıralamalar", href: "/rankings" },
  { id: "profile", label: "Profil", href: "/profile" },
] as const;

export default function PlatformNavigation({ active }: PlatformNavigationProps) {
  return (
    <nav aria-label="Has Gardaşlar ana menüsü" className="overflow-x-auto">
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
