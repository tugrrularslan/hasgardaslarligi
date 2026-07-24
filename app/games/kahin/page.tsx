import Link from "next/link";
import HittiteIcon from "@/components/HittiteIcon";
import KahinNavigation from "@/components/KahinNavigation";

const sections = [
  {
    href: "/games/kahin/predictions",
    icon: "rules" as const,
    title: "Sezon Tahminleri",
    description:
      "18 takımı sezon sonu sırasına diz ve beş özel kategoride kehanetini mühürle.",
  },
  {
    href: "/games/kahin/standings",
    icon: "trophy" as const,
    title: "Puan Durumu",
    description:
      "Kahinlerin puanlarını, tam sıra isabetlerini ve özel tahmin başarılarını karşılaştır.",
  },
  {
    href: "/games/kahin/rules",
    icon: "record" as const,
    title: "Kurallar",
    description:
      "Sıralama, şampiyon bonusu ve özel kategorilerin puanlama düzenini incele.",
  },
];

export default function KahinPage() {
  return (
    <main className="hg-page px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <KahinNavigation />

        <header className="hg-card overflow-hidden rounded-3xl p-6 sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="hg-title text-sm font-black uppercase tracking-[0.28em]">
                Has Gardaşlar
              </p>
              <h1 className="hg-title mt-3 flex items-center gap-3 text-4xl font-black sm:text-6xl">
                <HittiteIcon name="sun" size="xl" />
                Kahin
              </h1>
              <p className="hg-muted mt-4 max-w-2xl text-lg leading-8">
                Sezonun yazgısını daha ilk düdük çalmadan gör. Tahminlerini
                mühürle, sezon sonunda en büyük Kahin sen ol.
              </p>
            </div>

            <div className="hg-card-soft rounded-3xl border p-5 text-center">
              <p className="hg-muted text-xs font-black uppercase tracking-widest">
                En yüksek puan
              </p>
              <p className="hg-title mt-2 text-4xl font-black">112</p>
              <p className="hg-muted mt-1 text-sm">puan</p>
            </div>
          </div>
        </header>

        <section className="mt-7 grid gap-5 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="hg-card group rounded-3xl p-6 transition hover:-translate-y-1"
            >
              <div className="flex items-start justify-between gap-4">
                <HittiteIcon name={section.icon} size="lg" />
                <HittiteIcon
                  name="forward"
                  size="sm"
                  className="transition group-hover:translate-x-1"
                />
              </div>
              <h2 className="hg-title mt-5 text-2xl font-black">
                {section.title}
              </h2>
              <p className="hg-muted mt-3 leading-7">{section.description}</p>
              <span className="hg-primary hg-icon-label mt-6 w-full rounded-xl px-4 py-3 font-black">
                <HittiteIcon name={section.icon} size="sm" />
                Aç
              </span>
            </Link>
          ))}
        </section>

        <Link
          href="/games"
          className="hg-secondary hg-icon-label mt-7 rounded-xl px-5 py-3 font-bold"
        >
          <HittiteIcon name="back" size="sm" />
          Oyunlara Dön
        </Link>
      </div>
    </main>
  );
}
