import Link from "next/link";
import GameNavigation from "@/components/GameNavigation";

const rules = [
  {
    title: "Tahminlerin kapanması",
    text: "Her maçın tahmini, maçın başlama saatinden 5 dakika önce kapanır. Kapanan tahmin değiştirilemez.",
  },
  {
    title: "Doğru tahmin puanı",
    text: "Maç sonucunu doğru tahmin eden oyuncu 1 puan kazanır. Ev sahibi, beraberlik ve deplasman sonucu esas alınır.",
  },
  {
    title: "Hafta şampiyonu bonusu",
    text: "Haftanın en yüksek puanını alan oyuncu toplam puanına +1 bonus kazanır.",
  },
  {
    title: "Haftalık eşitlik",
    text: "Birden fazla oyuncu haftanın en yüksek puanında eşitse, eşit durumdaki oyuncuların tamamı +1 bonus kazanır.",
  },
  {
    title: "Sezon sistemi",
    text: "Puan durumu ve istatistikler sezon bazında tutulur. Geçmiş sezonlar arşivden ayrıca görüntülenebilir.",
  },
  {
    title: "Kural güncellemeleri",
    text: "Zorunlu bir kural değişikliği yapılırsa yönetim bunu uygulama içinden duyurur. Değişiklikler geriye dönük haksız puan kaybı oluşturmayacak şekilde uygulanır.",
  },
];

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#4a321f_0%,#1c1712_42%,#090807_100%)] px-4 py-8 text-stone-100 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/games/league-prediction" className="font-bold text-amber-200 hover:text-amber-100">← Oyuna Dön</Link>
          <span className="text-sm font-bold text-stone-400">Son güncelleme: Temmuz 2026</span>
        </div>

        <GameNavigation active="rules" />

        <header className="rounded-3xl border border-amber-200/15 bg-stone-950/70 p-6 backdrop-blur sm:p-9">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300/80">Lig Tahmin Oyunu</p>
          <h1 className="mt-3 text-3xl font-black text-amber-100 sm:text-5xl">Kurallar</h1>
          <p className="mt-4 text-stone-300">Oyuna katılan her kullanıcı aşağıdaki kuralları kabul etmiş sayılır.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {rules.map((rule, index) => (
            <article key={rule.title} className="rounded-2xl border border-stone-700/80 bg-black/30 p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300 font-black text-stone-950">{index + 1}</span>
                <div>
                  <h2 className="text-lg font-black text-amber-100">{rule.title}</h2>
                  <p className="mt-2 leading-7 text-stone-300">{rule.text}</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
