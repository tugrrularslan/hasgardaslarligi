"use client";

import { useMemo, useState } from "react";
import HittiteIcon from "@/components/HittiteIcon";
import { getTeamCrestUrl } from "@/lib/team-crests";
import type { AppTheme } from "@/lib/themes";

type PredictionValue = "1" | "X" | "2";

type CardMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
};

type CardLine = CardMatch & { prediction: PredictionValue | "—" };

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (context.measureText(text).width <= maxWidth) return text;

  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }

  return `${shortened}…`;
}

function loadCrest(source: string | null) {
  if (!source) return Promise.resolve(null);

  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function createShareImage({ week, lines, ownerName }: {
  week: number;
  lines: CardLine[];
  ownerName: string;
}) {
  const width = 1080;
  const rowHeight = 124;
  const height = Math.max(1660, 565 + lines.length * rowHeight + 190);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Görsel kart hazırlanamadı.");

  const crests = await Promise.all(lines.flatMap((line) => [
    loadCrest(getTeamCrestUrl(line.homeTeam)),
    loadCrest(getTeamCrestUrl(line.awayTeam)),
  ]));
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#07060a");
  background.addColorStop(0.52, "#1d1028");
  background.addColorStop(1, "#070607");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.24;
  context.fillStyle = "#e0ad41";
  context.beginPath(); context.arc(width - 28, 75, 275, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#7039a5";
  context.beginPath(); context.arc(65, height - 55, 275, 0, Math.PI * 2); context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = "#f4ca6890";
  context.lineWidth = 3;
  roundedRect(context, 28, 28, width - 56, height - 56, 42);
  context.stroke();

  context.textAlign = "center";
  context.fillStyle = "#f5d47c";
  context.font = "900 22px Arial";
  context.fillText("HAS GARDAŞLAR LİGİ", width / 2, 115);
  context.fillStyle = "#fff2c9";
  context.font = "900 54px Arial";
  context.fillText(`${week}. HAFTA TAHMİN KARTI`, width / 2, 183);
  context.fillStyle = "#e7d4a6";
  context.font = "800 25px Arial";
  context.fillText(`${fitText(context, ownerName, 620)} · MAÇ GÜNÜ BÜLTENİ`, width / 2, 229);
  const line = context.createLinearGradient(310, 0, 770, 0);
  line.addColorStop(0, "transparent"); line.addColorStop(0.5, "#e6b851"); line.addColorStop(1, "transparent");
  context.fillStyle = line; context.fillRect(310, 261, 460, 5);

  let rowTop = 305;
  for (const [index, fixture] of lines.entries()) {
    context.fillStyle = index % 2 === 0 ? "#ffffff18" : "#7f4aaa2a";
    roundedRect(context, 64, rowTop, width - 128, 104, 25);
    context.fill();
    context.strokeStyle = "#f3cf7961";
    context.lineWidth = 1;
    context.stroke();
    const homeCrest = crests[index * 2];
    const awayCrest = crests[index * 2 + 1];
    if (homeCrest) context.drawImage(homeCrest, 88, rowTop + 14, 76, 76);
    if (awayCrest) context.drawImage(awayCrest, 916, rowTop + 14, 76, 76);
    context.fillStyle = "#fff6d8";
    context.font = "900 25px Arial";
    context.textAlign = "right";
    context.fillText(fitText(context, fixture.homeTeam, 260), 430, rowTop + 63);
    context.fillStyle = "#f9d978";
    roundedRect(context, 485, rowTop + 19, 110, 65, 18);
    context.fill();
    context.fillStyle = "#211303";
    context.font = "900 35px Arial";
    context.textAlign = "center";
    context.fillText(fixture.prediction, 540, rowTop + 62);
    context.fillStyle = "#fff6d8";
    context.font = "900 25px Arial";
    context.textAlign = "left";
    context.fillText(fitText(context, fixture.awayTeam, 260), 650, rowTop + 63);
    rowTop += rowHeight;
  }

  context.textAlign = "center";
  context.fillStyle = "#f5d47c";
  context.font = "900 25px Arial";
  context.fillText("SEN DE TAHMİNİNİ YAP", width / 2, height - 112);
  context.fillStyle = "#ead5a4";
  context.font = "700 21px Arial";
  context.fillText("hasgardaslarligi.vercel.app", width / 2, height - 72);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Görsel kart hazırlanamadı.");
  return blob;
}

export default function WeeklyPredictionCard({
  week,
  matches,
  predictions,
  theme,
  ownerName,
}: {
  week: number;
  matches: CardMatch[];
  predictions: Record<string, PredictionValue>;
  theme: AppTheme;
  ownerName: string;
}) {
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const matchLines = useMemo<CardLine[]>(
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
  async function downloadImage() {
    const image = await createShareImage({ week, lines: matchLines, ownerName });
    const link = document.createElement("a");
    const imageUrl = URL.createObjectURL(image);
    link.href = imageUrl;
    link.download = `has-gardaslar-ligi-${week}-hafta-tahmin-karti.png`;
    link.click();
    URL.revokeObjectURL(imageUrl);
  }

  async function shareCard() {
    try {
      const image = await createShareImage({ week, lines: matchLines, ownerName });
      const imageFile = new File([image], `has-gardaslar-ligi-${week}-hafta-tahmin-karti.png`, { type: "image/png" });

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [imageFile] }))) {
        await navigator.share({
          title: `${week}. Hafta Tahmin Kartım`,
          text: "Sen de tahminini yap: https://hasgardaslarligi.vercel.app/predictions",
          files: [imageFile],
        });
        setNotice("Görsel kart paylaşılmaya hazır. WhatsApp'ı seçebilirsin.");
        return;
      }

      await downloadImage();
      setNotice("Görsel indirildi. WhatsApp'ta ataç simgesinden seçip gönderebilirsin.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      setNotice("Görsel kart hazırlanamadı. Lütfen tekrar dene.");
    }
  }

  async function shareOnWhatsApp() {
    await shareCard();
  }

  async function previewImage() {
    try {
      const image = await createShareImage({ week, lines: matchLines, ownerName });
      const nextUrl = URL.createObjectURL(image);
      setPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextUrl;
      });
      setNotice("Paylaşılacak görsel aşağıda hazır.");
    } catch (error) {
      console.error(error);
      setNotice("Görsel kart hazırlanamadı. Lütfen tekrar dene.");
    }
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
            Görseli Paylaş
          </button>
          <button type="button" onClick={downloadImage} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.secondaryButtonClass}`}>
            Görseli İndir
          </button>
          <button type="button" onClick={previewImage} className={`rounded-xl px-4 py-3 text-sm font-black ${theme.secondaryButtonClass}`}>
            Kartı Önizle
          </button>
        </div>
        {previewUrl && (
          <div className={`mt-4 overflow-hidden rounded-2xl border p-2 ${theme.secondaryCardClass}`}>
            <img
              src={previewUrl}
              alt={`${week}. hafta paylaşım kartı önizlemesi`}
              className="mx-auto max-h-[560px] w-auto max-w-full rounded-xl"
            />
          </div>
        )}
        {notice && <p className={`mt-3 text-center text-sm font-semibold ${theme.mutedTextClass}`}>{notice}</p>}
      </div>
    </aside>
  );
}
