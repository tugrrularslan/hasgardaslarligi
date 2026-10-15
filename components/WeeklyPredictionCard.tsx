"use client";

import { useMemo, useState } from "react";
import HittiteIcon from "@/components/HittiteIcon";
import type { AppTheme } from "@/lib/themes";

type PredictionValue = "1" | "X" | "2";

type CardMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
};

export default function WeeklyPredictionCard({
  week,
  matches,
  predictions,
  theme,
}: {
  week: number;
  matches: CardMatch[];
  predictions: Record<string, PredictionValue>;
  theme: AppTheme;
}) {
  const [notice, setNotice] = useState("");
  const matchLines = useMemo<
    Array<CardMatch & { prediction: PredictionValue | "—" }>
  >(
    () =>
      matches.map((match) => ({
        ...match,
        prediction: predictions[match.id] || "—",
      })),
    [matches, predictions],
  );
  const savedCount = matchLines.filter(
    (match) => match.prediction !== "—",
  ).length;
  const isReady = savedCount === matches.length && matches.length > 0;
  const shareText = [
    "🏛️ HAS GARDAŞLAR LİGİ",
    `${week}. Hafta Tahmin Kartım`,
    "",
    ...matchLines.map(
      (match) => `${match.homeTeam}  ${match.prediction}  ${match.awayTeam}`,
    ),
    "",
    "Sen de tahminini yap:",
    "https://hasgardaslarligi.vercel.app/predictions",
  ].join("\n");

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(shareText);
      setNotice("Tahmin kartı kopyalandı. İstediğin yere yapıştırabilirsin.");
    } catch {
      setNotice("Kart kopyalanamadı. WhatsApp ile paylaşmayı deneyebilirsin.");
    }
  }

  async function shareCard() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${week}. Hafta Tahmin Kartım`,
          text: shareText,
        });
        setNotice("Tahmin kartı paylaşılmaya hazır.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyCard();
  }

  function shareOnWhatsApp() {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <aside className={`mb-6 overflow-hidden rounded-[1.75rem] border ${theme.cardClass}`}>
      <div className={`relative overflow-hidden border-b px-5 py-5 sm:px-6 ${theme.borderClass}`}>
        <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-[var(--hg-accent)] opacity-10 blur-2xl" />
        <div className="absolute -bottom-20 left-1/3 h-32 w-32 rounded-full bg-[var(--hg-accent-2)] opacity-20 blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`grid h-12 w-12 place-items-center rounded-2xl border ${theme.badgeClass}`}>
              <HittiteIcon name="ball" size="sm" />
            </div>
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${theme.mutedTextClass}`}>
                Has Gardaşlar Ligi
              </p>
              <h3 className={`mt-1 text-xl font-black sm:text-2xl ${theme.titleClass}`}>
                {week}. Hafta Tahmin Kartım
              </h3>
            </div>
          </div>
          <div className={`shrink-0 rounded-2xl border px-3 py-2 text-center ${theme.secondaryCardClass}`}>
            <span className={`block text-lg font-black leading-none ${theme.textClass}`}>{savedCount}</span>
            <span className={`mt-1 block text-[9px] font-black uppercase tracking-wider ${theme.mutedTextClass}`}>
              / {matches.length} maç
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className={`mb-3 flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-[0.18em] ${theme.mutedTextClass}`}>
          <span>Maç bülteni</span>
          <span>{isReady ? "Tam kadro" : "Tahminleri tamamla"}</span>
        </div>
        <div className={`overflow-hidden rounded-2xl border bg-black/10 ${theme.borderClass}`}>
          {matchLines.map((match, index) => (
            <div
              key={match.id}
              className={`grid grid-cols-[minmax(0,1fr)_46px_minmax(0,1fr)] items-center gap-2 px-3 py-3 sm:px-4 ${
                index !== matchLines.length - 1 ? `border-b ${theme.borderClass}` : ""
              }`}
            >
              <span className={`truncate text-right text-sm font-extrabold sm:text-base ${theme.textClass}`}>
                {match.homeTeam}
              </span>
              <span className={`grid h-9 place-items-center rounded-xl border text-base font-black shadow-sm ${
                match.prediction === "—" ? theme.secondaryButtonClass : theme.badgeClass
              }`}>
                {match.prediction}
              </span>
              <span className={`truncate text-sm font-extrabold sm:text-base ${theme.textClass}`}>
                {match.awayTeam}
              </span>
            </div>
          ))}
        </div>
        <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 ${theme.secondaryCardClass}`}>
          <span className="text-base">🏛️</span>
          <p className={`text-xs font-semibold ${theme.mutedTextClass}`}>
            Tahminlerini paylaş, gardaşları lige davet et.
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1.35fr_1fr_1fr]">
          <button type="button" onClick={shareOnWhatsApp} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.primaryButtonClass}`}>
            WhatsApp&apos;ta Paylaş
          </button>
          <button type="button" onClick={shareCard} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.secondaryButtonClass}`}>
            Paylaş
          </button>
          <button type="button" onClick={copyCard} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.secondaryButtonClass}`}>
            Metni Kopyala
          </button>
        </div>
        {notice && <p className={`mt-3 text-center text-sm font-semibold ${theme.mutedTextClass}`}>{notice}</p>}
      </div>
    </aside>
  );
}
