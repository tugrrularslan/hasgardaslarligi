import Link from "next/link";

export default function GamesPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-red-950 to-black px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 rounded-3xl border border-white/10 bg-black/30 p-6 shadow-xl backdrop-blur-md sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-300">
            Has Gardaşlar
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            🎮 Oyunlar
          </h1>

          <p className="mt-3 max-w-2xl text-zinc-300">
            Oynamak istediğin oyunu seç.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block rounded-xl border border-white/20 px-5 py-3 font-bold transition hover:bg-white/10"
          >
            ← Ana Sayfaya Dön
          </Link>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Link
            href="/games/league-prediction"
            className="group rounded-3xl border border-red-400/30 bg-red-950/60 p-7 shadow-xl transition hover:-translate-y-1 hover:border-red-300 hover:bg-red-900/60"
          >
            <div className="text-6xl">⚽</div>

            <div className="mt-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-red-300">
                  Aktif oyun
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Lig Tahmin Oyunu
                </h2>
              </div>

              <span className="text-3xl transition group-hover:translate-x-1">
                →
              </span>
            </div>

            <p className="mt-4 text-zinc-300">
              Haftanın maçlarını tahmin et, puan kazan ve sezon sıralamasında
              zirveye çık.
            </p>

            <div className="mt-6 rounded-xl bg-white px-5 py-3 text-center font-black text-red-800">
              Oyuna Gir
            </div>
          </Link>

          <div className="rounded-3xl border border-zinc-700 bg-zinc-950/70 p-7 opacity-75">
            <div className="text-6xl">🔒</div>

            <p className="mt-5 text-sm font-bold uppercase tracking-widest text-zinc-400">
              Yakında
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Yeni Oyun
            </h2>

            <p className="mt-4 text-zinc-400">
              Yeni oyunlar hazırlandığında burada görüntülenecek.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}