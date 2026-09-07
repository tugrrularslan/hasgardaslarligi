"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import HittiteIcon from "@/components/HittiteIcon";
import KahinNavigation from "@/components/KahinNavigation";
import TeamCrest from "@/components/TeamCrest";
import { auth, db } from "@/lib/firebase";
import {
  DEFAULT_KAHIN_SETTINGS,
  EMPTY_KAHIN_PREDICTION,
  getKahinPlayerPredictionLabel,
  isKahinPlayerPredictionKey,
  isKahinPredictionComplete,
  KAHIN_FALLBACK_PLAYERS,
  KAHIN_GAME_ID,
  KAHIN_PLAYER_PREDICTION_CATEGORIES,
  KAHIN_TEAMS,
  normalizeKahinSearch,
  sanitizeKahinPrediction,
  sanitizeKahinPlayers,
  sanitizeKahinTransferReopens,
  type KahinPlayer,
  type KahinPlayerPredictionKey,
  type KahinPrediction,
  type KahinSettings,
  type KahinTransferReopens,
} from "@/lib/kahin";

export default function KahinPredictionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<KahinSettings>(
    DEFAULT_KAHIN_SETTINGS,
  );
  const [prediction, setPrediction] = useState<KahinPrediction>(
    EMPTY_KAHIN_PREDICTION,
  );
  const [transferReopens, setTransferReopens] =
    useState<KahinTransferReopens>({});
  const [savedSeasonId, setSavedSeasonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTransferField, setSavingTransferField] =
    useState<KahinPlayerPredictionKey | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [officialPlayers, setOfficialPlayers] = useState<KahinPlayer[]>(
    KAHIN_FALLBACK_PLAYERS,
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOfficialPlayers() {
      try {
        const response = await fetch("/api/players");
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

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeSettings: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      unsubscribeSettings?.();
      unsubscribeSettings = null;

      if (!firebaseUser) {
        setTransferReopens({});
        router.replace("/");
        return;
      }

      setUser(firebaseUser);

      unsubscribeProfile = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) return;
          const data = profileSnapshot.data();
          setPrediction(sanitizeKahinPrediction(data.kahinPrediction));
          setSavedSeasonId(
            typeof data.kahinSeasonId === "string" ? data.kahinSeasonId : "",
          );
          setTransferReopens(
            sanitizeKahinTransferReopens(data.kahinTransferReopens),
          );
        },
        (error) => {
          console.error(error);
          setMessage("Kahin tahminlerin alınamadı.");
        },
      );

      unsubscribeSettings = onSnapshot(
        doc(db, "settings", "kahin"),
        (snapshot) => {
          if (!snapshot.exists()) {
            setSettings(DEFAULT_KAHIN_SETTINGS);
            setLoading(false);
            return;
          }

          const data = snapshot.data();
          const deadline =
            data.deadline instanceof Timestamp
              ? data.deadline.toDate()
              : DEFAULT_KAHIN_SETTINGS.deadline;

          setSettings({
            seasonId:
              typeof data.seasonId === "string" && data.seasonId.trim()
                ? data.seasonId
                : DEFAULT_KAHIN_SETTINGS.seasonId,
            seasonName:
              typeof data.seasonName === "string" && data.seasonName.trim()
                ? data.seasonName
                : DEFAULT_KAHIN_SETTINGS.seasonName,
            deadline,
            resultsPublished: data.resultsPublished === true,
          });
          setLoading(false);
        },
        (error) => {
          console.error(error);
          setMessage("Kahin ayarları alınamadı.");
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
      unsubscribeSettings?.();
    };
  }, [router]);

  useEffect(() => {
    if (!savedSeasonId || savedSeasonId === settings.seasonId) return;

    const resetTimer = window.setTimeout(
      () => setPrediction(EMPTY_KAHIN_PREDICTION),
      0,
    );
    return () => window.clearTimeout(resetTimer);
  }, [savedSeasonId, settings.seasonId]);

  const submitted =
    savedSeasonId.length > 0 && savedSeasonId === settings.seasonId;

  const isLocked =
    settings.resultsPublished ||
    (settings.deadline !== null && now >= settings.deadline);
  const complete = useMemo(
    () => isKahinPredictionComplete(prediction),
    [prediction],
  );
  const playerOptions = officialPlayers;

  function isTransferReopenOpen(field: KahinPlayerPredictionKey) {
    const reopen = transferReopens[field];

    return Boolean(
      submitted &&
        !settings.resultsPublished &&
        reopen &&
        reopen.gameId === KAHIN_GAME_ID &&
        reopen.seasonId === settings.seasonId &&
        !reopen.replacementSelection &&
        reopen.replacementDeadline !== null &&
        now < reopen.replacementDeadline,
    );
  }

  function canEditPredictionField(field: keyof KahinPrediction) {
    return !isLocked ||
      (isKahinPlayerPredictionKey(field) && isTransferReopenOpen(field));
  }

  const openTransferFields = KAHIN_PLAYER_PREDICTION_CATEGORIES.map(
    ({ key }) => key,
  ).filter((field) => isTransferReopenOpen(field));
  const primaryTransferField =
    openTransferFields.length === 1 ? openTransferFields[0] : null;
  const primaryTransferReopen = primaryTransferField
    ? transferReopens[primaryTransferField]
    : null;
  const primaryTransferSelectionChanged = Boolean(
    primaryTransferField &&
      primaryTransferReopen &&
      prediction[primaryTransferField].trim() !==
        primaryTransferReopen.originalSelection.trim(),
  );

  function updateField<K extends keyof KahinPrediction>(
    field: K,
    value: KahinPrediction[K],
  ) {
    setPrediction((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function moveTeam(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= prediction.leagueOrder.length) return;

    const nextOrder = [...prediction.leagueOrder];
    [nextOrder[index], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[index],
    ];
    updateField("leagueOrder", nextOrder);
  }

  async function savePrediction() {
    if (!user || isLocked || !complete) return;

    setSaving(true);
    setMessage("");

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          kahinSeasonId: settings.seasonId,
          kahinPrediction: prediction,
          kahinUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSavedSeasonId(settings.seasonId);
      setMessage("Kehanetin mühürlendi. Kilit tarihine kadar değiştirebilirsin.");
    } catch (error) {
      console.error(error);
      setMessage("Kehanet kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransferReplacement(field: KahinPlayerPredictionKey) {
    const reopen = transferReopens[field];
    const replacementSelection = prediction[field].trim();

    if (!user || !reopen || !isTransferReopenOpen(field)) return;

    if (!replacementSelection) {
      setMessage("Yeni futbolcuyu seçmeden tahmini kaydedemezsin.");
      return;
    }

    if (replacementSelection === reopen.originalSelection) {
      setMessage("Transfer olan futbolcunun yerine farklı bir futbolcu seçmelisin.");
      return;
    }

    setSavingTransferField(field);
    setMessage("");

    try {
      const transferPath = `kahinTransferReopens.${field}`;
      await updateDoc(doc(db, "users", user.uid), {
        [`kahinPrediction.${field}`]: replacementSelection,
        [`${transferPath}.replacementSelection`]: replacementSelection,
        [`${transferPath}.replacementSelectedAt`]: serverTimestamp(),
        kahinUpdatedAt: serverTimestamp(),
      });
      setMessage(`${getKahinPlayerPredictionLabel(field)} tahminin yenilendi ve yeniden kilitlendi.`);
    } catch (error) {
      console.error(error);
      setMessage("Yeni tahmin kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      setSavingTransferField(null);
    }
  }

  if (loading) {
    return (
      <main className="hg-page flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <HittiteIcon name="sun" size="xl" />
          <p className="hg-muted mt-4 font-bold">Kahin tableti hazırlanıyor...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="hg-page px-3 py-6 sm:px-5">
      <div className="mx-auto max-w-6xl">
        <KahinNavigation />

        <header className="hg-card rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="hg-title text-sm font-black uppercase tracking-widest">
                {settings.seasonName}
              </p>
              <h1 className="hg-title mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl">
                <HittiteIcon name="rules" size="lg" />
                Kehanet Tableti
              </h1>
              <p className="hg-muted mt-3 max-w-2xl">
                Sıralamayı düzenle, beş özel tahmini doldur ve kehanetini
                mühürle.
              </p>
            </div>

            <div className={`rounded-2xl border p-4 ${isLocked ? "border-red-500/40" : "hg-card-soft"}`}>
              <p className="hg-muted text-xs font-black uppercase tracking-widest">
                {isLocked ? "Tahminler kilitli" : "Mühür tarihi"}
              </p>
              <p className="hg-title mt-1 font-black">
                {settings.deadline
                  ? settings.deadline.toLocaleString("tr-TR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Admin tarafından henüz belirlenmedi"}
              </p>
            </div>
          </div>
        </header>

        {message && (
          <div className="hg-card-soft mt-5 rounded-2xl border p-4 font-bold">
            {message}
          </div>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="hg-card rounded-3xl p-5 sm:p-7">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="hg-muted text-xs font-black uppercase tracking-widest">
                  18 takım
                </p>
                <h2 className="hg-title mt-1 text-2xl font-black">
                  Sezon Sonu Sıralaması
                </h2>
              </div>
              <span className="hg-badge rounded-full px-3 py-1 text-xs font-black">
                Tam sıra 3 puan
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {prediction.leagueOrder.map((team, index) => (
                <div
                  key={team}
                  className="hg-card-soft grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl border p-2.5"
                >
                  <span className="hg-title text-center text-lg font-black">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamCrest team={team} size="sm" />
                    <span className="truncate font-black">{team}</span>
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveTeam(index, -1)}
                      disabled={isLocked || index === 0}
                      aria-label={`${team} takımını yukarı taşı`}
                      className="hg-secondary grid h-9 w-9 place-items-center rounded-lg disabled:opacity-30"
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTeam(index, 1)}
                      disabled={
                        isLocked || index === prediction.leagueOrder.length - 1
                      }
                      aria-label={`${team} takımını aşağı taşı`}
                      className="hg-secondary grid h-9 w-9 place-items-center rounded-lg disabled:opacity-30"
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <section className="hg-card rounded-3xl p-5 sm:p-7">
              <p className="hg-muted text-xs font-black uppercase tracking-widest">
                Özel Kehanetler
              </p>
              <h2 className="hg-title mt-1 text-2xl font-black">
                Sezonun Liderleri
              </h2>

              <div className="mt-5 space-y-4">
                <PredictionInput
                  label="Gol kralı"
                  value={prediction.topScorer}
                  options={playerOptions}
                  disabled={!canEditPredictionField("topScorer")}
                  onChange={(value) => updateField("topScorer", value)}
                />
                <TransferReopenNotice
                  field="topScorer"
                  reopen={transferReopens.topScorer}
                  open={isTransferReopenOpen("topScorer")}
                  saving={savingTransferField === "topScorer"}
                  onSave={() => void saveTransferReplacement("topScorer")}
                />
                <PredictionInput
                  label="Asist kralı"
                  value={prediction.topAssist}
                  options={playerOptions}
                  disabled={!canEditPredictionField("topAssist")}
                  onChange={(value) => updateField("topAssist", value)}
                />
                <TransferReopenNotice
                  field="topAssist"
                  reopen={transferReopens.topAssist}
                  open={isTransferReopenOpen("topAssist")}
                  saving={savingTransferField === "topAssist"}
                  onSave={() => void saveTransferReplacement("topAssist")}
                />
                <PredictionInput
                  label="En fazla clean sheet yapan kaleci"
                  value={prediction.cleanSheetKeeper}
                  options={playerOptions}
                  disabled={!canEditPredictionField("cleanSheetKeeper")}
                  onChange={(value) =>
                    updateField("cleanSheetKeeper", value)
                  }
                />
                <TransferReopenNotice
                  field="cleanSheetKeeper"
                  reopen={transferReopens.cleanSheetKeeper}
                  open={isTransferReopenOpen("cleanSheetKeeper")}
                  saving={savingTransferField === "cleanSheetKeeper"}
                  onSave={() => void saveTransferReplacement("cleanSheetKeeper")}
                />
                <TeamSelect
                  label="En çok gol atan takım"
                  value={prediction.topScoringTeam}
                  disabled={isLocked}
                  onChange={(value) => updateField("topScoringTeam", value)}
                />
                <TeamSelect
                  label="En az gol yiyen takım"
                  value={prediction.bestDefenseTeam}
                  disabled={isLocked}
                  onChange={(value) => updateField("bestDefenseTeam", value)}
                />
              </div>
            </section>

            <section className="hg-card rounded-3xl p-5">
              <div className="flex items-center gap-3">
                <HittiteIcon
                  name={submitted ? "check" : "shield"}
                  size="lg"
                />
                <div>
                  <p className="hg-title font-black">
                    {submitted ? "Kehanet kayıtlı" : "Kehaneti mühürle"}
                  </p>
                  <p className="hg-muted text-sm">
                    {primaryTransferField
                      ? `${getKahinPlayerPredictionLabel(primaryTransferField)} için seçimini yenileyip kaydet.`
                      : complete
                      ? "Bütün alanlar hazır."
                      : "Kaydetmek için beş özel tahmini tamamla."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (primaryTransferField) {
                    void saveTransferReplacement(primaryTransferField);
                    return;
                  }

                  void savePrediction();
                }}
                disabled={
                  primaryTransferField
                    ? savingTransferField !== null || !primaryTransferSelectionChanged
                    : saving || isLocked || !complete
                }
                className="hg-primary hg-icon-label mt-5 w-full rounded-xl px-5 py-3 font-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <HittiteIcon name="sun" size="sm" />
                {primaryTransferField
                  ? savingTransferField === primaryTransferField
                    ? "Yeni Tahmin Kaydediliyor..."
                    : `${getKahinPlayerPredictionLabel(primaryTransferField)} Tahminini Yenile`
                  : saving
                  ? "Mühürleniyor..."
                  : submitted
                    ? "Kehaneti Güncelle"
                    : "Kehaneti Mühürle"}
              </button>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function PredictionInput({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: KahinPlayer[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const hasLegacyValue = value.trim() && !options.some((player) => player.name === value);
  const normalizedSearch = normalizeKahinSearch(search);
  const visibleOptions = options.filter((player) => {
    if (!normalizedSearch) return true;

    return (
      normalizeKahinSearch(player.name).includes(normalizedSearch) ||
      normalizeKahinSearch(player.team).includes(normalizedSearch)
    );
  });

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black">{label}</span>
      <input
        type="search"
        value={search}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Oyuncu veya takım ara"
        className="mb-2 w-full rounded-xl border px-4 py-2.5 text-sm disabled:opacity-60"
      />
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border px-4 py-3 disabled:opacity-60"
      >
        <option value="">Futbolcu seç</option>
        {hasLegacyValue && <option value={value}>{value} (eski seçim)</option>}
        {visibleOptions.map((player) => (
          <option
            key={`${player.name}-${player.team}`}
            value={player.name}
          >
            {player.team ? `${player.name} — ${player.team}` : player.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function TransferReopenNotice({
  field,
  reopen,
  open,
  saving,
  onSave,
}: {
  field: KahinPlayerPredictionKey;
  reopen: KahinTransferReopens[KahinPlayerPredictionKey] | undefined;
  open: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  if (!reopen || !open || !reopen.replacementDeadline) return null;

  const label = getKahinPlayerPredictionLabel(field);
  const deadlineText = reopen.replacementDeadline.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/15 p-4">
      <p className="font-black text-amber-200">Transfer nedeniyle bu alan açık</p>
      <p className="hg-muted mt-1 text-sm leading-6">
        {reopen.originalSelection} Süper Lig&apos;den ayrıldığı için yalnızca {label} tahminini {deadlineText} tarihine kadar bir kez yenileyebilirsin. Diğer Kahin tahminlerin kilitli kalır.
      </p>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="hg-primary mt-4 rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-50"
      >
        {saving ? "Yeni Tahmin Kaydediliyor..." : `${label} Tahminini Yenile`}
      </button>
    </div>
  );
}

function TeamSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black">{label}</span>
      <span className="flex items-center gap-2">
        {value && <TeamCrest team={value} size="sm" />}
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border px-4 py-3 disabled:opacity-60"
        >
          <option value="">Takım seç</option>
          {KAHIN_TEAMS.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
