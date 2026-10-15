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

async function createShareImage({
  week,
  lines,
  themeId,
}: {
  week: number;
  lines: CardLine[];
  themeId: AppTheme["id"];
}) {
  const palette = {
    obsidyen: ["#08090d", "#251a38", "#f2c763", "#f8edcf"],
    "hitit-zeytini": ["#111708", "#3b431d", "#ddc75f", "#f3edcf"],
    traverten: ["#f5e6c8", "#c89158", "#7f481f", "#3d2818"],
    bazalt: ["#0a0b0d", "#402016", "#ed8640", "#f3f3f3"],
  }[themeId];
  const [background, accentBackground, accent, ink] = palette;
  const width = 1080;
  const rowHeight = 88;
  const height = Math.max(1350, 560 + lines.length * rowHeight + 170);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Görsel kart hazırlanamadı.");

  const backgroundGradient = context.createLinearGradient(0, 0, width, height);
  backgroundGradient.addColorStop(0, background);
  backgroundGradient.addColorStop(0.58, accentBackground);
  backgroundGradient.addColorStop(1, background);
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.24;
  context.fillStyle = accent;
  context.beginPath();
  context.arc(width - 30, 70, 270, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(100, height - 80, 240, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.strokeStyle = `${accent}99`;
  context.lineWidth = 3;
  roundedRect(context, 42, 42, width - 84, height - 84, 34);
  context.stroke();

  context.fillStyle = accent;
  context.font = "900 25px Arial";
  context.letterSpacing = "5px";
  context.fillText("HAS GARDAŞLAR LİGİ", 88, 123);
  context.letterSpacing = "0px";
  context.fillStyle = ink;
  context.font = "900 62px Arial";
  context.fillText(`${week}. HAFTA`, 86, 198);
  context.font = "700 30px Arial";
  context.globalAlpha = 0.76;
  context.fillText("TAHMİN KARTIM", 89, 244);
  context.globalAlpha = 1;

  context.fillStyle = `${accent}33`;
  roundedRect(context, 780, 110, 210, 112, 24);
  context.fill();
  context.strokeStyle = `${accent}bb`;
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = accent;
  context.font = "900 44px Arial";
  context.textAlign = "center";
  context.fillText(String(lines.filter((line) => line.prediction !== "—").length), 885, 160);
  context.fillStyle = ink;
  context.font = "800 18px Arial";
  context.fillText(`/${lines.length} MAÇ`, 885, 194);
  context.textAlign = "left";

  let rowTop = 315;
  for (const [index, line] of lines.entries()) {
    const alternating = index % 2 === 0 ? "18" : "2b";
    context.fillStyle = `${ink}${alternating}`;
    roundedRect(context, 76, rowTop, width - 152, 68, 18);
    context.fill();
    context.fillStyle = ink;
    context.font = "800 25px Arial";
    context.textAlign = "right";
    context.fillText(fitText(context, line.homeTeam, 330), 448, rowTop + 43);
    context.textAlign = "center";
    context.fillStyle = line.prediction === "—" ? `${ink}aa` : accent;
    roundedRect(context, 482, rowTop + 10, 116, 48, 14);
    context.fill();
    context.fillStyle = line.prediction === "—" ? background : background;
    context.font = "900 30px Arial";
    context.fillText(line.prediction, 540, rowTop + 44);
    context.fillStyle = ink;
    context.textAlign = "left";
    context.font = "800 25px Arial";
    context.fillText(fitText(context, line.awayTeam, 330), 632, rowTop + 43);
    rowTop += rowHeight;
  }

  context.fillStyle = `${ink}cc`;
  context.font = "700 23px Arial";
  context.textAlign = "center";
  context.fillText("Sen de tahminini yap · hasgardaslarligi.vercel.app", width / 2, height - 105);
  context.fillStyle = accent;
  context.fillRect(330, height - 77, 420, 4);
  context.textAlign = "left";

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Görsel kart hazırlanamadı.");
  return blob;
}

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
    const image = await createShareImage({ week, lines: matchLines, themeId: theme.id });
    const link = document.createElement("a");
    const imageUrl = URL.createObjectURL(image);
    link.href = imageUrl;
    link.download = `has-gardaslar-ligi-${week}-hafta-tahmin-karti.png`;
    link.click();
    URL.revokeObjectURL(imageUrl);
  }

  async function shareCard() {
    try {
      const image = await createShareImage({ week, lines: matchLines, themeId: theme.id });
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
      const image = await createShareImage({ week, lines: matchLines, themeId: theme.id });
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
