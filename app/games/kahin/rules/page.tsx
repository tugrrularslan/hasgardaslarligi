import HittiteIcon from "@/components/HittiteIcon";
import KahinNavigation from "@/components/KahinNavigation";

const rules = [
  ["Tam sıra", "Bir takımın sezon sonu sırasını tam bilirsen 3 puan kazanırsın."],
  ["Yakın sıra", "Takım gerçek yerinin yalnızca bir basamak uzağındaysa 1 puan kazanırsın."],
  ["Şampiyon mührü", "Şampiyonu doğru sıraya koyarsan sıralama puanına ek 6 puan alırsın."],
  ["Gol kralı", "Resmî gol kralını doğru bilirsen 12 puan kazanırsın."],
  ["Asist kralı", "Resmî asist liderini doğru bilirsen 12 puan kazanırsın."],
  ["Kalesini gole kapatan kaleci", "En fazla lig maçında gol yemeyen kaleciyi doğru bilirsen 12 puan kazanırsın."],
  ["Hücum ve savunma", "En çok gol atan ve en az gol yiyen takımların her biri 8 puandır."],
  ["Eşitlik", "Bir kategoride birden fazla resmî lider varsa doğru isimlerden herhangi biri tam puan kazandırır."],
  ["Kahin mührü", "Adminin belirlediği süre dolduğunda tahminler kilitlenir ve değiştirilemez."],
];

export default function KahinRulesPage() {
  return (
    <main className="hg-page px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <KahinNavigation />

        <header className="hg-card rounded-3xl p-6 sm:p-8">
          <p className="hg-title text-sm font-black uppercase tracking-[0.25em]">
            Kahin
          </p>
          <h1 className="hg-title mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl">
            <HittiteIcon name="record" size="lg" />
            Oyun Kuralları
          </h1>
          <p className="hg-muted mt-3">
            Puanlama tamamen resmî sezon sonu verilerine göre yapılır.
          </p>
        </header>

        <section className="mt-6 space-y-4">
          {rules.map(([title, text], index) => (
            <article key={title} className="hg-card rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <HittiteIcon
                  name={index < 3 ? "sun" : index < 7 ? "target" : "shield"}
                  size="md"
                />
                <div>
                  <h2 className="hg-title font-black">{title}</h2>
                  <p className="hg-muted mt-1 leading-7">{text}</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
