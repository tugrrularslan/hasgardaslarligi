import Link from "next/link";
import PlatformNavigation from "@/components/PlatformNavigation";
import { games } from "@/lib/games";

export default function RankingsPage() {
  const activeGames = games.filter((game) => game.status === "active");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#4a321f_0%,#1c1712_42%,#090807_100%)] px-4 py-8 text-stone-100 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <PlatformNavigation active="rankings" />

        <header className="rounded-3xl border border-amber-200/15 bg-stone-950/70 p-6 backdrop-blur sm:p-9">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300/80">
            Has Gardaşlar
          </p>
          <h1 className="mt-3 text-3xl font-black text-amber-100 sm:text-5xl">
            Sıralamalar
          </h1>
          <p className="mt-4 max-w-3xl text-stone-300">
            Her oyunun puan durumu kendi sezon ve kurallarıyla ayrı tutulur.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {activeGames.map((game) => (
            <Link
              key={game.id}
              href={`${game.href}/standings`}
              className="rounded-2xl border border-stone-700/80 bg-black/30 p-5 transition hover:border-amber-300/40 hover:bg-black/45"
            >
              <div className="text-3xl" aria-hidden="true">{game.icon}</div>
              <h2 className="mt-4 text-xl font-black text-amber-100">{game.name}</h2>
              <p className="mt-2 text-stone-400">Güncel sezon puan durumunu görüntüle.</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
