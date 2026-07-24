"use client";

import GameNavigation from "@/components/GameNavigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { getThemeById, type AppTheme } from "@/lib/themes";

type MatchResult = "1" | "X" | "2";

type UserProfile = {
  id: string;
  username: string;
  photoURL: string | null;
  correctPredictions: number;
  weeklyWins: number;
  totalPoints: number;
};

type Match = {
  id: string;
  week: number;
  kickoff: Timestamp | null;
  result: MatchResult | null;
  status: "scheduled" | "finished";
};

type Prediction = {
  id: string;
  userId: string;
  matchId: string;
  prediction: MatchResult | null;
  isCorrect: boolean;
  awardedPoints: number;
};

type ResultBreakdown = {
  predictionCount: number;
  correctCount: number;
  successRate: number;
};

type UserStatistics = UserProfile & {
  predictionCount: number;
  correctCount: number;
  wrongCount: number;
  pendingCount: number;
  successRate: number;
  longestCorrectStreak: number;
  longestWrongStreak: number;
  homeWin: ResultBreakdown;
  draw: ResultBreakdown;
  awayWin: ResultBreakdown;
};

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : 0;
}

function calculateRate(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

function calculateStreaks(
  predictions: Array<Prediction & { kickoffTime: number }>
) {
  let currentCorrectStreak = 0;
  let currentWrongStreak = 0;
  let longestCorrectStreak = 0;
  let longestWrongStreak = 0;

  for (const prediction of predictions) {
    if (prediction.isCorrect) {
      currentCorrectStreak += 1;
      currentWrongStreak = 0;
      longestCorrectStreak = Math.max(
        longestCorrectStreak,
        currentCorrectStreak
      );
    } else {
      currentWrongStreak += 1;
      currentCorrectStreak = 0;
      longestWrongStreak = Math.max(
        longestWrongStreak,
        currentWrongStreak
      );
    }
  }

  return {
    longestCorrectStreak,
    longestWrongStreak,
  };
}

function createBreakdown(
  predictions: Prediction[],
  result: MatchResult
): ResultBreakdown {
  const selectedPredictions = predictions.filter(
    (prediction) => prediction.prediction === result
  );

  const correctCount = selectedPredictions.filter(
    (prediction) => prediction.isCorrect
  ).length;

  return {
    predictionCount: selectedPredictions.length,
    correctCount,
    successRate: calculateRate(
      correctCount,
      selectedPredictions.length
    ),
  };
}

export default function StatisticsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("obsidyen");
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          router.replace("/");
          return;
        }

        setCurrentUser(firebaseUser);

        try {
          const profileSnapshot = await getDoc(
            doc(db, "users", firebaseUser.uid)
          );

          const profileData = profileSnapshot.exists()
            ? profileSnapshot.data()
            : null;

          const admin = profileData?.isAdmin === true;

          const savedTheme =
            typeof profileData?.selectedTheme === "string"
              ? normalizeThemeId(profileData.selectedTheme)
              : "obsidyen";

          setIsAdmin(admin);
          setSelectedTheme(savedTheme);
          setSelectedUserId(firebaseUser.uid);
        } catch (error) {
          console.error(error);
          setMessage("Kullanıcı yetkisi kontrol edilemedi.");
        } finally {
          setCheckingAccess(false);
        }
      }
    );

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!currentUser || checkingAccess) return;

    const currentUserId = currentUser.uid;

    async function loadStatistics() {
      setLoading(true);
      setMessage("");

      try {
        const [usersSnapshot, matchesSnapshot, predictionsSnapshot] =
          await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "matches")),
            getDocs(collection(db, "predictions")),
          ]);

        const allUsers: UserProfile[] = usersSnapshot.docs.map(
          (userDocument) => {
            const data = userDocument.data();

            const username =
              typeof data.username === "string" &&
              data.username.trim()
                ? data.username.trim()
                : typeof data.displayName === "string" &&
                    data.displayName.trim()
                  ? data.displayName.trim()
                  : typeof data.email === "string" &&
                      data.email.trim()
                    ? data.email.trim()
                    : "İsimsiz kullanıcı";

            const photoURL =
              typeof data.photoURL === "string" &&
              data.photoURL.trim()
                ? data.photoURL.trim()
                : typeof data.profilePhotoURL === "string" &&
                    data.profilePhotoURL.trim()
                  ? data.profilePhotoURL.trim()
                  : null;

            return {
              id: userDocument.id,
              username,
              photoURL,
              correctPredictions: safeNumber(
                data.correctPredictions
              ),
              weeklyWins: safeNumber(data.weeklyWins),
              totalPoints: safeNumber(data.totalPoints),
            };
          }
        );

        const visibleUsers = isAdmin
          ? allUsers
          : allUsers.filter(
              (profile) => profile.id === currentUserId
            );

        const matchList: Match[] = matchesSnapshot.docs.map(
          (matchDocument) => {
            const data = matchDocument.data();

            return {
              id: matchDocument.id,
              week: safeNumber(data.week),
              kickoff:
                data.kickoff instanceof Timestamp
                  ? data.kickoff
                  : null,
              result:
                data.result === "1" ||
                data.result === "X" ||
                data.result === "2"
                  ? data.result
                  : null,
              status:
                data.status === "finished"
                  ? "finished"
                  : "scheduled",
            };
          }
        );

        const allPredictions: Prediction[] =
          predictionsSnapshot.docs.map((predictionDocument) => {
            const data = predictionDocument.data();

            return {
              id: predictionDocument.id,
              userId:
                typeof data.userId === "string"
                  ? data.userId
                  : "",
              matchId:
                typeof data.matchId === "string"
                  ? data.matchId
                  : "",
              prediction:
                data.prediction === "1" ||
                data.prediction === "X" ||
                data.prediction === "2"
                  ? data.prediction
                  : null,
              isCorrect: data.isCorrect === true,
              awardedPoints: safeNumber(data.awardedPoints),
            };
          });

        const visiblePredictions = isAdmin
          ? allPredictions
          : allPredictions.filter(
              (prediction) =>
                prediction.userId === currentUserId
            );

        setUsers(visibleUsers);
        setMatches(matchList);
        setPredictions(visiblePredictions);

        if (isAdmin) {
          const firstUser = [...visibleUsers].sort(
            (a, b) =>
              b.totalPoints - a.totalPoints ||
              a.username.localeCompare(b.username, "tr")
          )[0];

          if (firstUser) {
            setSelectedUserId((current) =>
              visibleUsers.some((user) => user.id === current)
                ? current
                : firstUser.id
            );
          }
        } else {
          setSelectedUserId(currentUserId);
        }
      } catch (error) {
        console.error(error);
        setMessage(
          "İstatistikler yüklenemedi. Firestore kurallarını kontrol et."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadStatistics();
  }, [currentUser, checkingAccess, isAdmin]);

  const activeTheme = useMemo(
    () => getThemeById(selectedTheme),
    [selectedTheme]
  );

  const finishedMatchMap = useMemo(() => {
    const map = new Map<string, Match>();

    for (const match of matches) {
      if (
        match.status === "finished" &&
        match.result !== null
      ) {
        map.set(match.id, match);
      }
    }

    return map;
  }, [matches]);

  const statistics = useMemo<UserStatistics[]>(() => {
    return users
      .map((user) => {
        const finishedPredictions = predictions
          .filter(
            (prediction) =>
              prediction.userId === user.id &&
              finishedMatchMap.has(prediction.matchId)
          )
          .map((prediction) => ({
            ...prediction,
            kickoffTime:
              finishedMatchMap
                .get(prediction.matchId)
                ?.kickoff?.toMillis() ?? 0,
          }))
          .sort(
            (first, second) =>
              first.kickoffTime - second.kickoffTime
          );

        const pendingCount = predictions.filter(
          (prediction) =>
            prediction.userId === user.id &&
            !finishedMatchMap.has(prediction.matchId)
        ).length;

        const correctCount = finishedPredictions.filter(
          (prediction) => prediction.isCorrect
        ).length;

        const predictionCount = finishedPredictions.length;
        const wrongCount = predictionCount - correctCount;

        const { longestCorrectStreak, longestWrongStreak } =
          calculateStreaks(finishedPredictions);

        return {
          ...user,
          predictionCount,
          correctCount,
          wrongCount,
          pendingCount,
          successRate: calculateRate(
            correctCount,
            predictionCount
          ),
          longestCorrectStreak,
          longestWrongStreak,
          homeWin: createBreakdown(
            finishedPredictions,
            "1"
          ),
          draw: createBreakdown(finishedPredictions, "X"),
          awayWin: createBreakdown(
            finishedPredictions,
            "2"
          ),
        };
      })
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints ||
          b.successRate - a.successRate ||
          a.username.localeCompare(b.username, "tr")
      );
  }, [users, predictions, finishedMatchMap]);

  const selectedUser =
    statistics.find(
      (user) => user.id === selectedUserId
    ) ?? statistics[0];

  const leagueSummary = useMemo(() => {
    const totalPredictions = statistics.reduce(
      (sum, user) => sum + user.predictionCount,
      0
    );

    const totalCorrect = statistics.reduce(
      (sum, user) => sum + user.correctCount,
      0
    );

    const bestSuccessRate = Math.max(
      0,
      ...statistics
        .filter((user) => user.predictionCount > 0)
        .map((user) => user.successRate)
    );

    return {
      participantCount: statistics.length,
      finishedMatchCount: finishedMatchMap.size,
      totalPredictions,
      averageSuccessRate: calculateRate(
        totalCorrect,
        totalPredictions
      ),
      bestSuccessRate,
    };
  }, [statistics, finishedMatchMap]);

  if (checkingAccess || loading) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center px-4 ${activeTheme.pageClass}`}
      >
        <div className="text-center">
          <div className="text-4xl">📊</div>
          <p className={`mt-4 font-bold ${activeTheme.textClass}`}>
            {checkingAccess
              ? "Kullanıcı yetkisi kontrol ediliyor..."
              : "İstatistikler hesaplanıyor..."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-4 py-8 transition-all duration-500 ${activeTheme.pageClass}`}
    >
      <div className="mx-auto max-w-6xl">
        <header
          className={`mb-8 rounded-3xl border p-6 shadow-2xl backdrop-blur-md sm:p-8 ${activeTheme.headerClass}`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}>
              Has Gardaşlar Ligi
            </p>

            <SeasonLabel className={activeTheme.mutedTextClass} />

            <h1 className={`mt-1 text-3xl font-black ${activeTheme.titleClass}`}>
              📊 İstatistikler
            </h1>

            <p className={`mt-2 ${activeTheme.mutedTextClass}`}>
              {isAdmin
                ? "Tüm oyuncuların tahmin performansını ayrıntılı incele."
                : "Kendi tahmin performansını ayrıntılı incele."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className={`rounded-xl px-5 py-3 font-bold transition ${activeTheme.secondaryButtonClass}`}
          >
            Ana Sayfaya Dön
          </button>
          </div>
        </header>

        {message && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {message}
          </div>
        )}

        {isAdmin && (
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            label="Oyuncu"
            value={leagueSummary.participantCount}
            icon="👥"
            theme={activeTheme}
          />
          <SummaryCard
            label="Biten maç"
            value={leagueSummary.finishedMatchCount}
            icon="⚽"
            theme={activeTheme}
          />
          <SummaryCard
            label="Kontrol edilen tahmin"
            value={leagueSummary.totalPredictions}
            icon="🧾"
            theme={activeTheme}
          />
          <SummaryCard
            label="Lig başarı oranı"
            value={`%${leagueSummary.averageSuccessRate}`}
            icon="🎯"
            theme={activeTheme}
          />
          <SummaryCard
            label="En yüksek oran"
            value={`%${leagueSummary.bestSuccessRate}`}
            icon="👑"
            theme={activeTheme}
          />
          </section>
        )}

        {statistics.length === 0 ? (
          <div className={`rounded-3xl border border-dashed p-12 text-center ${activeTheme.cardClass}`}>
            <p className="text-4xl">📭</p>
            <p className={`mt-4 font-bold ${activeTheme.textClass}`}>
              Henüz istatistiği gösterilecek kullanıcı yok.
            </p>
          </div>
        ) : (
          <>
            {isAdmin && (
              <section className={`mb-8 rounded-3xl border p-6 ${activeTheme.cardClass}`}>
                <label className={`mb-2 block text-sm font-bold ${activeTheme.titleClass}`}>
                  Oyuncu seç
                </label>

                <select
                  value={selectedUser?.id ?? ""}
                  onChange={(event) =>
                    setSelectedUserId(event.target.value)
                  }
                  className={`w-full rounded-xl border px-4 py-3 font-bold outline-none ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
                >
                  {statistics.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
                  ))}
                </select>
              </section>
            )}

            {selectedUser && (
              <section className={`mb-8 overflow-hidden rounded-3xl border shadow-2xl ${activeTheme.cardClass}`}>
                <div className={`border-b p-6 ${activeTheme.secondaryCardClass}`}>
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-3xl font-black ${activeTheme.secondaryCardClass} ${activeTheme.titleClass}`}>
                      {selectedUser.photoURL ? (
                        <img
                          src={selectedUser.photoURL}
                          alt={selectedUser.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        selectedUser.username
                          .charAt(0)
                          .toLocaleUpperCase("tr-TR")
                      )}
                    </div>

                    <div className="flex-1">
                      <p className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}>
                        Oyuncu performansı
                      </p>
                      <h2 className={`mt-1 text-3xl font-black ${activeTheme.titleClass}`}>
                        {selectedUser.username}
                      </h2>
                      <p className={`mt-2 ${activeTheme.mutedTextClass}`}>
                        Toplam {selectedUser.totalPoints} puan •{" "}
                        {selectedUser.weeklyWins} haftalık şampiyonluk
                      </p>
                    </div>

                    <div className={`rounded-2xl border px-6 py-4 text-center ${activeTheme.secondaryCardClass}`}>
                      <p className={`text-xs font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}>
                        Başarı
                      </p>
                      <p className={`mt-1 text-4xl font-black ${activeTheme.titleClass}`}>
                        %{selectedUser.successRate}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Toplam puan"
                    value={selectedUser.totalPoints}
                    icon="⭐"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="Doğru tahmin"
                    value={selectedUser.correctCount}
                    icon="✅"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="Yanlış tahmin"
                    value={selectedUser.wrongCount}
                    icon="❌"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="Bekleyen tahmin"
                    value={selectedUser.pendingCount}
                    icon="⏳"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="Hafta şampiyonluğu"
                    value={selectedUser.weeklyWins}
                    icon="🏆"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="En uzun doğru seri"
                    value={selectedUser.longestCorrectStreak}
                    icon="🔥"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="En uzun yanlış seri"
                    value={selectedUser.longestWrongStreak}
                    icon="🥶"
                    theme={activeTheme}
                  />
                  <StatCard
                    label="Sonuçlanan tahmin"
                    value={selectedUser.predictionCount}
                    icon="📋"
                    theme={activeTheme}
                  />
                </div>

                <div className={`border-t p-6 ${activeTheme.borderClass}`}>
                  <h3 className={`text-xl font-black ${activeTheme.titleClass}`}>
                    1 - X - 2 Performansı
                  </h3>

                  <p className={`mt-1 text-sm ${activeTheme.mutedTextClass}`}>
                    Oyuncunun tercih ettiği sonuç türlerindeki başarı oranları.
                  </p>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <ResultCard
                      title="Ev sahibi kazanır"
                      result="1"
                      breakdown={selectedUser.homeWin}
                      theme={activeTheme}
                    />
                    <ResultCard
                      title="Beraberlik"
                      result="X"
                      breakdown={selectedUser.draw}
                      theme={activeTheme}
                    />
                    <ResultCard
                      title="Deplasman kazanır"
                      result="2"
                      breakdown={selectedUser.awayWin}
                      theme={activeTheme}
                    />
                  </div>
                </div>
              </section>
            )}

            {isAdmin && (
              <section className={`rounded-3xl border p-6 ${activeTheme.cardClass}`}>
              <div className="mb-5">
                <h2 className={`text-2xl font-black ${activeTheme.titleClass}`}>
                  Genel Performans Sıralaması
                </h2>
                <p className={`mt-1 text-sm ${activeTheme.mutedTextClass}`}>
                  Puan eşitliğinde başarı oranı öne geçer.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className={`border-b text-left text-xs uppercase tracking-widest ${activeTheme.borderClass} ${activeTheme.mutedTextClass}`}>
                      <th className="px-3 py-4">Sıra</th>
                      <th className="px-3 py-4">Oyuncu</th>
                      <th className="px-3 py-4 text-center">Puan</th>
                      <th className="px-3 py-4 text-center">Doğru</th>
                      <th className="px-3 py-4 text-center">Yanlış</th>
                      <th className="px-3 py-4 text-center">Başarı</th>
                      <th className="px-3 py-4 text-center">Seri</th>
                      <th className="px-3 py-4 text-center">Şampiyonluk</th>
                    </tr>
                  </thead>

                  <tbody>
                    {statistics.map((user, index) => (
                      <tr
                        key={user.id}
                        onClick={() =>
                          setSelectedUserId(user.id)
                        }
                        className={`cursor-pointer border-b transition hover:translate-x-1 ${activeTheme.borderClass}`}
                      >
                        <td className="px-3 py-4 font-black text-zinc-400">
                          {index + 1}
                        </td>
                        <td className={`px-3 py-4 font-bold ${activeTheme.textClass}`}>
                          {user.username}
                        </td>
                        <td className={`px-3 py-4 text-center font-black ${activeTheme.titleClass}`}>
                          {user.totalPoints}
                        </td>
                        <td className="px-3 py-4 text-center text-green-400">
                          {user.correctCount}
                        </td>
                        <td className="px-3 py-4 text-center text-red-400">
                          {user.wrongCount}
                        </td>
                        <td className={`px-3 py-4 text-center font-black ${activeTheme.titleClass}`}>
                          %{user.successRate}
                        </td>
                        <td className="px-3 py-4 text-center">
                          🔥 {user.longestCorrectStreak}
                        </td>
                        <td className="px-3 py-4 text-center">
                          🏆 {user.weeklyWins}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  theme,
}: {
  label: string;
  value: number | string;
  icon: string;
  theme: AppTheme;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${theme.cardClass}`}>
      <div className="text-2xl">{icon}</div>
      <p className={`mt-3 text-2xl font-black ${theme.titleClass}`}>{value}</p>
      <p className={`mt-1 text-xs font-bold uppercase tracking-widest ${theme.mutedTextClass}`}>
        {label}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  theme,
}: {
  label: string;
  value: number | string;
  icon: string;
  theme: AppTheme;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${theme.secondaryCardClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl">{icon}</span>
        <span className={`text-2xl font-black ${theme.titleClass}`}>{value}</span>
      </div>
      <p className={`mt-4 text-sm font-bold ${theme.mutedTextClass}`}>
        {label}
      </p>
    </div>
  );
}

function ResultCard({
  title,
  result,
  breakdown,
  theme,
}: {
  title: string;
  result: MatchResult;
  breakdown: ResultBreakdown;
  theme: AppTheme;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${theme.secondaryCardClass}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-bold ${theme.mutedTextClass}`}>
            {title}
          </p>
          <p className={`mt-1 text-3xl font-black ${theme.titleClass}`}>
            %{breakdown.successRate}
          </p>
        </div>

        <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black ${theme.badgeClass}`}>
          {result}
        </div>
      </div>

      <div className={`mt-5 h-2 overflow-hidden rounded-full ${theme.cardClass}`}>
        <div
          className={`h-full rounded-full ${theme.badgeClass}`}
          style={{
            width: `${breakdown.successRate}%`,
          }}
        />
      </div>

      <p className={`mt-3 text-xs ${theme.mutedTextClass}`}>
        {breakdown.correctCount} doğru /{" "}
        {breakdown.predictionCount} tahmin
      </p>
    </div>
  );
}


function normalizeThemeId(selectedTheme: string): string {
  const normalizedTheme = selectedTheme.trim();

  if (
    normalizedTheme === "Obsidyen" ||
    normalizedTheme.toLocaleLowerCase("tr-TR") === "obsidyen"
  ) {
    return "obsidyen";
  }

  return normalizedTheme || "obsidyen";
}