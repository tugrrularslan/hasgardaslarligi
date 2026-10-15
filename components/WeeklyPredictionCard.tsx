"use client";

import { useMemo, useState } from "react";
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
  const matchLines = useMemo<Array<CardMatch & { prediction: PredictionValue | "—" }>>(
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
    <aside className={`mb-5 rounded-3xl border p-4 sm:p-5 ${theme.secondaryCardClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${theme.mutedTextClass}`}>
            Paylaşılabilir tahmin kartı
          </p>
          <h3 className={`mt-1 text-xl font-black ${theme.titleClass}`}>
            {week}. Hafta · Tahmin Kartım
          </h3>
          <p className={`mt-1 text-sm ${theme.mutedTextClass}`}>
            {savedCount}/{matches.length} tahmin kaydedildi. Kartta yalnızca senin tahminlerin görünür.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}>
          Paylaşmaya hazır
        </span>
      </div>

      <div className={`mt-4 overflow-hidden rounded-2xl border ${theme.borderClass}`}>
        {matchLines.map((match) => (
          <div key={match.id} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 py-3 text-sm last:border-b-0 ${theme.borderClass}`}>
            <span className={`truncate text-right font-bold ${theme.textClass}`}>{match.homeTeam}</span>
            <span className={`rounded-lg px-3 py-1 text-base font-black ${theme.badgeClass}`}>{match.prediction}</span>
            <span className={`truncate font-bold ${theme.textClass}`}>{match.awayTeam}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={shareOnWhatsApp} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.primaryButtonClass}`}>
          WhatsApp&apos;ta Paylaş
        </button>
        <button type="button" onClick={shareCard} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.secondaryButtonClass}`}>
          Paylaş
        </button>
        <button type="button" onClick={copyCard} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.secondaryButtonClass}`}>
          Kartı Kopyala
        </button>
      </div>

      {notice && <p className={`mt-3 text-sm font-semibold ${theme.mutedTextClass}`}>{notice}</p>}
    </aside>
  );
}
