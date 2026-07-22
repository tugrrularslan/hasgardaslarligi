"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { useCurrentSeason } from "@/hooks/useCurrentSeason";
import { getThemeById, type AppTheme } from "@/lib/themes";

type PredictionValue = "1" | "X" | "2";

type Match = {
  id: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: Timestamp;
  predictionDeadline: Timestamp;
  status: "scheduled" | "finished";
};

type PredictionMap = Record<string, PredictionValue>;

type UserProfile = {
  selectedTheme: string;
};

export default function PredictionsPage() {
  const router = useRouter();
  const currentSeason = useCurrentSeason();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<PredictionMap>({});
  const [savedPredictions, setSavedPredictions] =
    useState<PredictionMap>({});

  const [loading, setLoading] = useState(true);
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        if (!firebaseUser) {
          setUser(null);
          setProfile(null);
          router.replace("/");
          return;
        }

        setUser(firebaseUser);

        const userReference = doc(db, "users", firebaseUser.uid);

        unsubscribeProfile = onSnapshot(
          userReference,
          (snapshot) => {
            if (!snapshot.exists()) {
              setProfile({ selectedTheme: "klasik" });
              return;
            }

            const data = snapshot.data();

            setProfile({
              selectedTheme:
                typeof data.selectedTheme === "string"
                  ? normalizeThemeId(data.selectedTheme)
                  : "klasik",
            });
          },
          (error) => {
            console.error(error);
            setProfile({ selectedTheme: "klasik" });
            setMessage("Tema bilgisi alınamadı. Klasik tema kullanılıyor.");
          }
        );

        try {
          const predictionsQuery = query(
            collection(db, "predictions"),
            where("userId", "==", firebaseUser.uid)
          );

          const predictionSnapshot = await getDocs(predictionsQuery);
          const loadedPredictions: PredictionMap = {};

          predictionSnapshot.forEach((predictionDocument) => {
            const data = predictionDocument.data();

            if (
              typeof data.matchId === "string" &&
              isPredictionValue(data.prediction)
            ) {
              loadedPredictions[data.matchId] = data.prediction;
            }
          });

          setPredictions(loadedPredictions);
          setSavedPredictions(loadedPredictions);
        } catch (error) {
          console.error(error);
          setMessage("Kayıtlı tahminler alınamadı.");
        } finally {
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const matchesQuery = query(
      collection(db, "matches"),
      orderBy("kickoff", "asc")
    );

    const unsubscribeMatches = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const loadedMatches = snapshot.docs.map((matchDocument) => ({
          id: matchDocument.id,
          ...matchDocument.data(),
        })) as Match[];

        setMatches(loadedMatches);
      },
      (error) => {
        console.error(error);
        setMessage("Maçlar alınamadı.");
      }
    );

    return unsubscribeMatches;
  }, [user]);

  const activeTheme = useMemo(() => {
    return getThemeById(profile?.selectedTheme);
  }, [profile?.selectedTheme]);

  function selectPrediction(
    matchId: string,
    prediction: PredictionValue,
    isClosed: boolean
  ) {
    if (isClosed) return;

    setPredictions((current) => ({
      ...current,
      [matchId]: prediction,
    }));

    setMessage("");
  }

  async function savePrediction(match: Match) {
    if (!user) return;

    const prediction = predictions[match.id];

    if (!prediction) {
      setMessage("Önce 1, X veya 2 seçeneklerinden birini seç.");
      return;
    }

    if (isPredictionClosed(match)) {
      setMessage("Bu maçın tahmin süresi kapanmış.");
      return;
    }

    setSavingMatchId(match.id);
    setMessage("");

    try {
      const predictionId = `${user.uid}_${match.id}`;

      await setDoc(doc(db, "predictions", predictionId), {
        userId: user.uid,
        matchId: match.id,
        week: match.week,
        seasonId: currentSeason.seasonId,
        prediction,
        updatedAt: serverTimestamp(),
      });

      setSavedPredictions((current) => ({
        ...current,
        [match.id]: prediction,
      }));

      setMessage(
        `${match.homeTeam} - ${match.awayTeam} tahmini kaydedildi.`
      );
    } catch (error) {
      console.error(error);
      setMessage(
        "Tahmin kaydedilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingMatchId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Tahminler yükleniyor...
      </main>
    );
  }

  const groupedMatches = groupMatchesByWeek(matches);

  return (
    <main
      className={`min-h-screen px-3 sm:px-5 lg:px-6 py-6 transition-all duration-500 ${activeTheme.pageClass}`}
    >
      <div className="mx-auto max-w-6xl">
        <header
          className={`mb-8 rounded-3xl border p-6 backdrop-blur-md ${activeTheme.headerClass}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p
                className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}
              >
                Has Gardaşlar Ligi
              </p>

              <SeasonLabel className={activeTheme.mutedTextClass} />

              <h1
                className={`mt-1 text-2xl sm:text-3xl lg:text-4xl font-black ${activeTheme.titleClass}`}
              >
                ⚽ Tahminler
              </h1>

              <p className={`mt-2 ${activeTheme.mutedTextClass}`}>
                Her maç için 1, X veya 2 seçimini yap.
              </p>
            </div>

            <Link
              href="/"
              className={`w-full lg:w-auto rounded-xl px-5 py-3 text-center font-bold transition ${activeTheme.secondaryButtonClass}`}
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </header>

        {message && (
          <div
            className={`mb-6 rounded-2xl border p-4 ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
          >
            {message}
          </div>
        )}

        {matches.length === 0 ? (
          <div
            className={`rounded-3xl border border-dashed p-12 text-center ${activeTheme.cardClass} ${activeTheme.mutedTextClass}`}
          >
            Henüz maç eklenmedi.
          </div>
        ) : (
          <div className="space-y-6 lg:space-y-10">
            {Object.entries(groupedMatches).map(
              ([week, weekMatches]) => (
                <section key={week}>
                  <div className="mb-4 flex items-center gap-3">
                    <h2
                      className={`text-3xl font-black ${activeTheme.titleClass}`}
                    >
                      {week}. Hafta
                    </h2>

                    <span
                      className={`rounded-full px-3 py-1 text-xs ${activeTheme.badgeClass}`}
                    >
                      {weekMatches.length} maç
                    </span>
                  </div>

                  <div className="space-y-4">
                    {weekMatches.map((match) => {
                      const closed = isPredictionClosed(match);
                      const selectedPrediction = predictions[match.id];
                      const savedPrediction = savedPredictions[match.id];

                      const hasUnsavedChange =
                        selectedPrediction !== savedPrediction;

                      return (
                        <article
                          key={match.id}
                          className={`rounded-3xl border p-4 md:p-6 shadow-xl hover:scale-[1.01] transition-all duration-300 ${activeTheme.cardClass}`}
                        >
                          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div
                                className={`text-lg sm:text-xl lg:text-2xl font-black text-center md:text-left break-words ${activeTheme.textClass}`}
                              >
                                {match.homeTeam}
                                <span
                                  className={`mx-3 ${activeTheme.mutedTextClass}`}
                                >
                                  —
                                </span>
                                {match.awayTeam}
                              </div>

                              <p
                                className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}
                              >
                                {formatDate(match.kickoff)}
                              </p>
                            </div>

                            <StatusBadge
                              closed={closed}
                              theme={activeTheme}
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <PredictionButton
                              label="1"
                              description={match.homeTeam}
                              active={selectedPrediction === "1"}
                              disabled={closed}
                              theme={activeTheme}
                              onClick={() =>
                                selectPrediction(match.id, "1", closed)
                              }
                            />

                            <PredictionButton
                              label="X"
                              description="Beraberlik"
                              active={selectedPrediction === "X"}
                              disabled={closed}
                              theme={activeTheme}
                              onClick={() =>
                                selectPrediction(match.id, "X", closed)
                              }
                            />

                            <PredictionButton
                              label="2"
                              description={match.awayTeam}
                              active={selectedPrediction === "2"}
                              disabled={closed}
                              theme={activeTheme}
                              onClick={() =>
                                selectPrediction(match.id, "2", closed)
                              }
                            />
                          </div>

                          <div className="mt-5">
                            {closed ? (
                              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-300">
                                Tahmin süresi kapandı
                                {savedPrediction
                                  ? ` · Tahminin: ${savedPrediction}`
                                  : " · Tahmin yapılmadı"}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => savePrediction(match)}
                                disabled={
                                  !selectedPrediction ||
                                  savingMatchId === match.id
                                }
                                className={`w-full rounded-xl px-4 py-3 font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${activeTheme.primaryButtonClass}`}
                              >
                                {savingMatchId === match.id
                                  ? "Kaydediliyor..."
                                  : savedPrediction && !hasUnsavedChange
                                    ? `Kaydedildi: ${savedPrediction}`
                                    : hasUnsavedChange
                                      ? "Değişikliği Kaydet"
                                      : "Tahmini Kaydet"}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function PredictionButton({
  label,
  description,
  active,
  disabled,
  theme,
  onClick,
}: {
  label: PredictionValue;
  description: string;
  active: boolean;
  disabled: boolean;
  theme: AppTheme;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[90px] sm:min-h-[110px] rounded-2xl border p-3 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? theme.primaryButtonClass
          : `${theme.secondaryCardClass} ${theme.textClass} hover:-translate-y-0.5`
      }`}
    >
      <div className="text-3xl font-black">{label}</div>

      <div
        className={`mt-1 truncate text-sm ${
          active ? "opacity-70" : theme.mutedTextClass
        }`}
      >
        {description}
      </div>
    </button>
  );
}

function StatusBadge({
  closed,
  theme,
}: {
  closed: boolean;
  theme: AppTheme;
}) {
  if (closed) {
    return (
      <span className="w-fit rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400">
        Tahmin Kapalı
      </span>
    );
  }

  return (
    <span
      className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${theme.badgeClass}`}
    >
      Tahmin Açık
    </span>
  );
}

function isPredictionClosed(match: Match): boolean {
  if (match.status === "finished") return true;

  return Date.now() >= match.predictionDeadline.toMillis();
}

function isPredictionValue(
  value: unknown
): value is PredictionValue {
  return value === "1" || value === "X" || value === "2";
}

function formatDate(timestamp: Timestamp): string {
  return timestamp.toDate().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupMatchesByWeek(
  matches: Match[]
): Record<string, Match[]> {
  return matches.reduce<Record<string, Match[]>>(
    (groups, match) => {
      const key = String(match.week);

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(match);
      return groups;
    },
    {}
  );
}

function normalizeThemeId(selectedTheme: string): string {
  const normalizedTheme = selectedTheme.trim();

  if (
    normalizedTheme === "Klasik" ||
    normalizedTheme.toLocaleLowerCase("tr-TR") === "klasik"
  ) {
    return "klasik";
  }

  return normalizedTheme;
}