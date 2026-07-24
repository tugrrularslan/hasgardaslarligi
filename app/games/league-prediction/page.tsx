import Link from "next/link";

const gameSections = [
  {
    href: "/predictions",
    icon: "⚽",
    title: "Tahminler",
    description:
      "Haftanın maçlarını görüntüle ve maçlar kapanmadan tahminlerini kaydet.",
  },
  {
    href: "/standings",
    icon: "🏆",
    title: "Puan Durumu",
    description:
      "Lig Tahmin Oyunu sezon sıralamasını ve oyuncuların puanlarını görüntüle.",
  },
  {
    href: "/statistics",
    icon: "📈",
    title: "İstatistikler",
    description:
      "Doğru tahminleri, başarı oranlarını ve oyuncu istatistiklerini incele.",
  },
  {
    href: "/games/league-prediction/rules",
    icon: "📜",
    title: "Kurallar",
    description:
      "Lig Tahmin Oyunu puanlama ve tahmin kurallarını görüntüle.",
  },
];

export default function LeaguePredictionPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-red-950 to-black px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 rounded-3xl border border-white/10 bg-black/30 p-6 shadow-xl backdrop-blur-md sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-300">
                Has Gardaşlar
              </p>

              <h1 className="mt-2 text-3xl font-black sm:text-4xl">
                ⚽ Lig Tahmin Oyunu
              </h1>

              <p className="mt-3 max-w-2xl text-zinc-300">
                Tahminlerini yap, puan durumunu takip et ve istatistiklerini
                incele.
              </p>
            </div>

            <div className="text-7xl">
              ⚽
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/games"
              className="rounded-xl border border-white/20 px-5 py-3 font-bold transition hover:bg-white/10"
            >
              ← Oyunlara Dön
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-white/20 px-5 py-3 font-bold transition hover:bg-white/10"
            >
              Ana Sayfa
            </Link>
          </div>
        </header>

        <section className="grid gap-5 sm:grid-cols-2">
          {gameSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-3xl border border-white/10 bg-black/30 p-6 shadow-xl transition hover:-translate-y-1 hover:border-red-300/60 hover:bg-red-950/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="text-5xl">
                  {section.icon}
                </div>

                <span className="text-2xl text-zinc-400 transition group-hover:translate-x-1 group-hover:text-white">
                  →
                </span>
              </div>

              <h2 className="mt-5 text-2xl font-black">
                {section.title}
              </h2>

              <p className="mt-3 text-zinc-300">
                {section.description}
              </p>

              <div className="mt-6 rounded-xl bg-white/10 px-4 py-3 text-center font-black transition group-hover:bg-white group-hover:text-red-800">
                Aç
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}