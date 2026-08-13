"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import HittiteIcon from "@/components/HittiteIcon";
import TeamCrest from "@/components/TeamCrest";
import { db } from "@/lib/firebase";
import {
  calculateKahinScore,
  DEFAULT_KAHIN_SETTINGS,
  KAHIN_FALLBACK_PLAYERS,
  KAHIN_TEAMS,
  mergeKahinPlayers,
  sanitizeKahinPrediction,
  sanitizeLeagueOrder,
  sanitizeKahinPlayers,
  sanitizeStringList,
  type KahinPlayer,
  type KahinResults,
} from "@/lib/kahin";

type KahinAdminPanelProps = {
  user: User;
  seasonId: string;
  seasonName: string;
};

function listToText(value: unknown): string {
  return sanitizeStringList(value).join("\n");
}

function textToList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function KahinAdminPanel({
  user,
  seasonId,
  seasonName,
}: KahinAdminPanelProps) {
  const [deadline, setDeadline] = useState(() =>
    DEFAULT_KAHIN_SETTINGS.deadline
      ? toDateTimeLocal(DEFAULT_KAHIN_SETTINGS.deadline)
      : "",
  );
  const [finalOrder, setFinalOrder] = useState<string[]>([...KAHIN_TEAMS]);
  const [topScorers, setTopScorers] = useState("");
  const [topAssisters, setTopAssisters] = useState("");
  const [cleanSheetKeepers, setCleanSheetKeepers] = useState("");
  const [topScoringTeams, setTopScoringTeams] = useState("");
  const [bestDefenseTeams, setBestDefenseTeams] = useState("");
  const [officialPlayers, setOfficialPlayers] = useState<KahinPlayer[]>(
    KAHIN_FALLBACK_PLAYERS,
  );
  const [customPlayers, setCustomPlayers] = useState<KahinPlayer[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerTeam, setNewPlayerTeam] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "kahin"), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (data.deadline instanceof Timestamp) {
        setDeadline(toDateTimeLocal(data.deadline.toDate()));
      }
      setCustomPlayers(sanitizeKahinPlayers(data.customPlayerOptions));
      if (data.results && typeof data.results === "object") {
        const results = data.results as Record<string, unknown>;
        setFinalOrder(sanitizeLeagueOrder(results.leagueOrder));
        setTopScorers(listToText(results.topScorers));
        setTopAssisters(listToText(results.topAssisters));
        setCleanSheetKeepers(listToText(results.cleanSheetKeepers));
        setTopScoringTeams(listToText(results.topScoringTeams));
        setBestDefenseTeams(listToText(results.bestDefenseTeams));
      }
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOfficialPlayers() {
      try {
        const response = await fetch("/api/kahin/players");
        const data = (await response.json()) as {
          success?: boolean;
          players?: KahinPlayer[];
        };

        if (active && response.ok && data.success && data.players?.length) {
          setOfficialPlayers(sanitizeKahinPlayers(data.players));
        }
      } catch (error) {
        console.error("Kahin oyuncu havuzu alınamadı:", error);
      }
    }

    void loadOfficialPlayers();
    return () => {
      active = false;
    };
  }, []);

  const playerOptions = useMemo(
    () => mergeKahinPlayers(officialPlayers, customPlayers),
    [customPlayers, officialPlayers],
  );
  const normalizedPlayerSearch = playerSearch.trim().toLocaleLowerCase("tr-TR");
  const visiblePlayers = playerOptions.filter((player) => {
    if (!normalizedPlayerSearch) return false;

    return (
      player.name.toLocaleLowerCase("tr-TR").includes(normalizedPlayerSearch) ||
      player.team.toLocaleLowerCase("tr-TR").includes(normalizedPlayerSearch)
    );
  });

  function moveTeam(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= finalOrder.length) return;
    const next = [...finalOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setFinalOrder(next);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setMessage("");

    try {
      await setDoc(
        doc(db, "settings", "kahin"),
        {
          seasonId,
          seasonName,
          deadline: deadline
            ? Timestamp.fromDate(new Date(deadline))
            : null,
          customPlayerOptions: customPlayers,
          scorerOptions: deleteField(),
          assistOptions: deleteField(),
          goalkeeperOptions: deleteField(),
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("Kahin ayarları kaydedildi.");
    } catch (error) {
      console.error(error);
      setMessage("Kahin ayarları kaydedilemedi.");
    } finally {
      setSavingSettings(false);
    }
  }

  function addPlayer() {
    const name = newPlayerName.trim();
    const team = newPlayerTeam.trim();

    if (!name) {
      setMessage("Önce futbolcunun adını yaz.");
      return;
    }

    const duplicate = playerOptions.some(
      (player) =>
        player.name.localeCompare(name, "tr-TR", { sensitivity: "accent" }) === 0 &&
        player.team.localeCompare(team, "tr-TR", { sensitivity: "accent" }) === 0,
    );
    if (duplicate) {
      setMessage("Bu futbolcu zaten listede.");
      return;
    }

    setCustomPlayers((current) => mergeKahinPlayers(current, [{ name, team }]));
    setNewPlayerName("");
    setNewPlayerTeam("");
    setMessage("Futbolcu eklendi. Kalıcı olması için Kahin ayarlarını kaydet.");
  }

  async function calculateResults() {
    const results: KahinResults = {
      leagueOrder: finalOrder,
      topScorers: textToList(topScorers),
      topAssisters: textToList(topAssisters),
      cleanSheetKeepers: textToList(cleanSheetKeepers),
      topScoringTeams: textToList(topScoringTeams),
      bestDefenseTeams: textToList(bestDefenseTeams),
    };

    if (
      results.leagueOrder.length !== KAHIN_TEAMS.length ||
      results.topScorers.length === 0 ||
      results.topAssisters.length === 0 ||
      results.cleanSheetKeepers.length === 0 ||
      results.topScoringTeams.length === 0 ||
      results.bestDefenseTeams.length === 0
    ) {
      setMessage("Puan hesaplamak için bütün resmî sonuçları doldur.");
      return;
    }

    const confirmed = window.confirm(
      "Resmî sonuçlar kaydedilecek ve bütün Kahin puanları yeniden hesaplanacak. Devam edilsin mi?",
    );
    if (!confirmed) return;

    setCalculating(true);
    setMessage("");

    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const batch = writeBatch(db);
      let participantCount = 0;

      usersSnapshot.docs.forEach((userDocument) => {
        const data = userDocument.data();
        if (data.kahinSeasonId !== seasonId || !data.kahinPrediction) return;

        const prediction = sanitizeKahinPrediction(data.kahinPrediction);
        const breakdown = calculateKahinScore(prediction, results);
        batch.update(userDocument.ref, {
          kahinScore: breakdown.total,
          kahinBreakdown: breakdown,
          kahinScoredAt: serverTimestamp(),
        });
        participantCount += 1;
      });

      batch.set(
        doc(db, "settings", "kahin"),
        {
          seasonId,
          seasonName,
          results,
          resultsPublished: true,
          scoredAt: serverTimestamp(),
          scoredBy: user.uid,
        },
        { merge: true },
      );

      await batch.commit();
      setMessage(`${participantCount} Kahin'in puanı hesaplandı.`);
    } catch (error) {
      console.error(error);
      setMessage("Kahin puanları hesaplanamadı.");
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="hg-card-soft rounded-2xl border p-4 font-bold">
          {message}
        </div>
      )}

      <section className="hg-card rounded-3xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <HittiteIcon name="clock" size="lg" />
          <div>
            <h3 className="hg-title text-xl font-black">Oyun Ayarları</h3>
            <p className="hg-muted text-sm">
              Tahminlerin kilitleneceği tarihi belirle.
            </p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-black">
            Tahminlerin kilitleneceği tarih
          </span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            className="w-full rounded-xl border px-4 py-3"
          />
        </label>

        <div className="hg-card-soft mt-5 rounded-2xl border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-black">Futbolcu Havuzu</p>
              <p className="hg-muted mt-1 text-sm">
                2026-27 kadroları otomatik yüklenir. Listede olmayan bir futbolcuyu buradan ekleyebilirsin.
              </p>
            </div>
            <span className="hg-badge rounded-full px-3 py-1 text-xs font-black">
              {playerOptions.length} futbolcu
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="text"
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              placeholder="Futbolcu adı"
              className="w-full rounded-xl border px-4 py-3"
            />
            <input
              type="text"
              value={newPlayerTeam}
              onChange={(event) => setNewPlayerTeam(event.target.value)}
              placeholder="Takımı (isteğe bağlı)"
              className="w-full rounded-xl border px-4 py-3"
            />
            <button
              type="button"
              onClick={addPlayer}
              className="hg-secondary rounded-xl px-4 py-3 font-black"
            >
              Futbolcu Ekle
            </button>
          </div>

          <label className="mt-4 block">
            <span className="sr-only">Oyuncu havuzunda ara</span>
            <input
              type="search"
              value={playerSearch}
              onChange={(event) => setPlayerSearch(event.target.value)}
              placeholder="Oyuncu havuzunda ara"
              className="w-full rounded-xl border px-4 py-3"
            />
          </label>

          {normalizedPlayerSearch && (
            <div className="mt-3 max-h-52 space-y-1 overflow-y-auto rounded-xl border p-2">
              {visiblePlayers.length > 0 ? (
                visiblePlayers.slice(0, 80).map((player) => (
                  <p
                    key={`${player.name}-${player.team}`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold"
                  >
                    {player.team && <TeamCrest team={player.team} size="xs" />}
                    <span className="truncate">
                      {player.name}
                      {player.team ? ` — ${player.team}` : ""}
                    </span>
                  </p>
                ))
              ) : (
                <p className="hg-muted px-3 py-2 text-sm">
                  Eşleşen futbolcu bulunamadı.
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={saveSettings}
          disabled={savingSettings}
          className="hg-primary hg-icon-label mt-5 w-full rounded-xl px-5 py-3 font-black disabled:opacity-50"
        >
          <HittiteIcon name="record" size="sm" />
          {savingSettings ? "Kaydediliyor..." : "Kahin Ayarlarını Kaydet"}
        </button>
      </section>

      <section className="hg-card rounded-3xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <HittiteIcon name="trophy" size="lg" />
          <div>
            <h3 className="hg-title text-xl font-black">
              Resmî Sonuçlar ve Puanlama
            </h3>
            <p className="hg-muted text-sm">
              Sezon sonunda doldur ve bütün puanları tek seferde hesapla.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_.85fr]">
          <div>
            <p className="mb-3 font-black">Resmî lig sıralaması</p>
            <div className="space-y-2">
              {finalOrder.map((team, index) => (
                <div
                  key={team}
                  className="hg-card-soft grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 rounded-xl border p-2"
                >
                  <span className="hg-title text-center font-black">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamCrest team={team} size="sm" />
                    <span className="truncate font-bold">{team}</span>
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveTeam(index, -1)}
                      disabled={index === 0}
                      className="hg-secondary h-8 w-8 rounded-lg disabled:opacity-30"
                      aria-label={`${team} yukarı`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTeam(index, 1)}
                      disabled={index === finalOrder.length - 1}
                      className="hg-secondary h-8 w-8 rounded-lg disabled:opacity-30"
                      aria-label={`${team} aşağı`}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <ResultInput
              label="Gol kralı / kralları"
              value={topScorers}
              onChange={setTopScorers}
            />
            <ResultInput
              label="Asist kralı / kralları"
              value={topAssisters}
              onChange={setTopAssisters}
            />
            <ResultInput
              label="Clean sheet lideri / liderleri"
              value={cleanSheetKeepers}
              onChange={setCleanSheetKeepers}
            />
            <ResultInput
              label="En çok gol atan takım / takımlar"
              value={topScoringTeams}
              onChange={setTopScoringTeams}
            />
            <ResultInput
              label="En az gol yiyen takım / takımlar"
              value={bestDefenseTeams}
              onChange={setBestDefenseTeams}
            />

            <div className="rounded-2xl border border-red-500/35 bg-red-950/15 p-4">
              <p className="font-black text-red-300">Son işlem</p>
              <p className="hg-muted mt-1 text-sm leading-6">
                Bu düğme bütün Kahin puanlarını resmî sonuçlara göre yeniden
                hesaplar ve puan durumunu yayınlar.
              </p>
              <button
                type="button"
                onClick={calculateResults}
                disabled={calculating}
                className="hg-primary hg-icon-label mt-4 w-full rounded-xl px-5 py-3 font-black disabled:opacity-50"
              >
                <HittiteIcon name="sun" size="sm" />
                {calculating
                  ? "Puanlar Hesaplanıyor..."
                  : "Sonuçları Mühürle ve Puanları Hesapla"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


function ResultInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Eşitlik varsa virgülle ayır"
        className="w-full rounded-xl border px-4 py-3"
      />
    </label>
  );
}
