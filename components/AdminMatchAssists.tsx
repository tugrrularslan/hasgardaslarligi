"use client";

import type { AssistDraft, AssistInputMode } from "@/lib/admin-assists";

type Props = {
  draft: AssistDraft;
  homeTeam: string;
  awayTeam: string;
  players: Array<{ name: string; team: string }>;
  disabled: boolean;
  onChange: (next: AssistDraft) => void;
  onModeChange: (mode: AssistInputMode) => void;
};
export default function AdminMatchAssists({ draft, homeTeam, awayTeam, players, disabled, onChange, onModeChange }: Props) {
  return (
    <section className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/5 p-3" aria-label="Asist kayıtlarını düzenle">
      <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-sky-100">
        Asist girişi
        <select aria-label="Asist girişi" value={draft.mode} disabled={disabled} onChange={event => onModeChange(event.target.value as AssistInputMode)} className="rounded-lg border border-zinc-700 bg-black px-3 py-2">
          <option value="totals">Oyuncu başına asist toplamı</option>
          <option value="goals">Her gol için asist seç</option>
        </select>
      </label>
      {draft.mode === "goals" ? <p className="mt-2 text-xs text-zinc-400">Asist yapan oyuncuyu aşağıda her golün yanından seç.</p> : (
        <div className="mt-3 space-y-2">
          {draft.rows.length === 0 && <p className="text-sm text-zinc-400">Bu maç için asist girilmedi.</p>}
          {draft.rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_5rem_auto]">
              <select aria-label={`Asist takımı ${index + 1}`} value={row.team} disabled={disabled} onChange={event => onChange({ ...draft, rows: draft.rows.map((value, n) => n === index ? { ...value, team: event.target.value, player: "" } : value) })} className="min-w-0 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm">
                <option value={homeTeam}>{homeTeam}</option><option value={awayTeam}>{awayTeam}</option>
              </select>
              <select aria-label={`Asist oyuncusu ${index + 1}`} value={row.player} disabled={disabled} onChange={event => onChange({ ...draft, rows: draft.rows.map((value, n) => n === index ? { ...value, player: event.target.value } : value) })} className="min-w-0 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm">
                <option value="">Asist yapan oyuncuyu seç</option>
                {players.filter(player => player.team === row.team).map(player => <option key={player.name} value={player.name}>{player.name}</option>)}
              </select>
              <input aria-label={`Asist sayısı ${index + 1}`} type="number" min="1" max="99" value={row.count} disabled={disabled} onChange={event => onChange({ ...draft, rows: draft.rows.map((value, n) => n === index ? { ...value, count: event.target.value } : value) })} className="min-w-0 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm" />
              <button type="button" aria-label={`Asisti kaldır ${index + 1}`} disabled={disabled} onClick={() => onChange({ ...draft, rows: draft.rows.filter((_, n) => n !== index) })} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-red-300">Kaldır</button>
            </div>
          ))}
          <button type="button" disabled={disabled} onClick={() => onChange({ ...draft, rows: [...draft.rows, { team: awayTeam, player: "", count: "1" }] })} className="rounded-lg border border-sky-400/40 px-3 py-2 text-sm font-bold text-sky-200">Asist oyuncusu ekle</button>
          <p className="text-xs text-zinc-400">Değişiklikler “Sonucu Kaydet / Güncelle” ile kaydedilir.</p>
        </div>
      )}
    </section>
  );
}
