import Link from "next/link";
import GameNavigation from "@/components/GameNavigation";

const rules = [
  {
    title: "Tahmin süresi",
    text: "Her maç için tahmin yapma süresi maçın başlamasından 5 dakika önce sona erer.",
  },
  {
    title: "Tahmin seçenekleri",
    text: "1 ev sahibi galibiyeti, X beraberlik, 2 deplasman galibiyeti anlamına gelir.",
  },
  {
    title: "Doğru tahmin puanı",
    text: "Doğru tahmin edilen her maç sonucu 1 puan kazandırır.",
  },
  {
    title: "Hafta şampiyonu",
    text: "Haftanın en fazla doğru tahminini yapan oyuncu veya oyuncular 1 ek puan kazanır.",
  },
  {
    title: "Eşitlik",
    text: "Haftanın en yüksek doğru tahmin sayısında eşitlik varsa eşit durumdaki tüm oyuncular 1 ek puan alır.",
  },
  {
    title: "Sezon sistemi",
    text: "Puanlar aktif sezon içinde hesaplanır. Geçmiş sezonlar sezon arşivinde korunur.",
  },
];

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-red-950 to-black px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <GameNavigation />

        <header className="mb-7 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-md">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-300">
            Lig Tahmin Oyunu
          </p>

          <h1 className="mt-2 text-3xl font-black">
            📜 Oyun Kuralları
          </h1>

          <p className="mt-3 text-zinc-300">
            Lig Tahmin Oyunu için geçerli kurallar aşağıdadır.
          </p>
        </header>

        <section className="space-y-4">
          {rules.map((rule, index) => (
            <article
              key={rule.title}
              className="rounded-2xl border border-white/10 bg-black/30 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white font-black text-red-800">
                  {index + 1}
                </div>

                <div>
                  <h2 className="text-lg font-black">
                    {rule.title}
                  </h2>

                  <p className="mt-2 text-zinc-300">
                    {rule.text}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href="/predictions"
            className="rounded-xl bg-white px-5 py-4 text-center font-black text-red-800"
          >
            ⚽ Tahminlere Git
          </Link>

          <Link
            href="/games"
            className="rounded-xl border border-white/20 px-5 py-4 text-center font-black transition hover:bg-white/10"
          >
            🎮 Oyunlara Dön
          </Link>
        </div>
      </div>
    </main>
  );
}