"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { getThemeById, type AppTheme } from "@/lib/themes";

type StandingUser = {
  id: string;
  username: string;
  avatar?: string;
  selectedTheme?: string;
  totalPoints: number;
  correctPredictions: number;
  weeklyWins: number;
  createdAt?: Timestamp;
};

type CurrentUserProfile = {
  selectedTheme: string;
};

export default function StandingsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] =
    useState<CurrentUserProfile | null>(null);
  const [users, setUsers] = useState<StandingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!firebaseUser) {
        setCurrentUser(null);
        setCurrentUserProfile(null);
        router.replace("/");
        return;
      }

      setCurrentUser(firebaseUser);

      unsubscribeProfile = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        (snapshot) => {
          if (!snapshot.exists()) {
            setCurrentUserProfile({ selectedTheme: "klasik" });
            return;
          }

          const data = snapshot.data();

          setCurrentUserProfile({
            selectedTheme:
              typeof data.selectedTheme === "string"
                ? normalizeThemeId(data.selectedTheme)
                : "klasik",
          });
        },
        (error) => {
          console.error(error);
          setCurrentUserProfile({ selectedTheme: "klasik" });
          setMessage(
            "Tema bilgisi alınamadı. Klasik tema kullanılıyor."
          );
        }
      );
    });

    return () => {
      unsubscribeAuth();

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeUsers = onSnapshot(
      query(collection(db, "users")),
      (snapshot) => {
        const loadedUsers: StandingUser[] = snapshot.docs.map(
          (userDocument) => {
            const data = userDocument.data();

            return {
              id: userDocument.id,
              username:
                typeof data.username === "string" &&
                data.username.trim()
                  ? data.username
                  : "İsimsiz Gardaş",
              avatar:
                typeof data.avatar === "string" && data.avatar
                  ? data.avatar
                  : "⚽",
              selectedTheme:
                typeof data.selectedTheme === "string"
                  ? normalizeThemeId(data.selectedTheme)
                  : "klasik",
              totalPoints:
                typeof data.totalPoints === "number"
                  ? data.totalPoints
                  : 0,
              correctPredictions:
                typeof data.correctPredictions === "number"
                  ? data.correctPredictions
                  : 0,
              weeklyWins:
                typeof data.weeklyWins === "number"
                  ? data.weeklyWins
                  : 0,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : undefined,
            };
          }
        );

        setUsers(loadedUsers);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("Puan durumu alınamadı.");
        setLoading(false);
      }
    );

    return unsubscribeUsers;
  }, [currentUser]);

  const activeTheme = useMemo(() => {
    return getThemeById(currentUserProfile?.selectedTheme);
  }, [currentUserProfile?.selectedTheme]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      if (b.correctPredictions !== a.correctPredictions) {
        return b.correctPredictions - a.correctPredictions;
      }

      if (b.weeklyWins !== a.weeklyWins) {
        return b.weeklyWins - a.weeklyWins;
      }

      const aCreatedAt =
        a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      const bCreatedAt =
        b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;

      return aCreatedAt - bCreatedAt;
    });
  }, [users]);

  const currentUserStanding = sortedUsers.findIndex(
    (standingUser) => standingUser.id === currentUser?.uid
  );

  const highestCorrectPredictionCount = useMemo(() => {
    return Math.max(
      0,
      ...sortedUsers.map((user) => user.correctPredictions)
    );
  }, [sortedUsers]);

  const highestWeeklyWinCount = useMemo(() => {
    return Math.max(0, ...sortedUsers.map((user) => user.weeklyWins));
  }, [sortedUsers]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Puan durumu yükleniyor...
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-3 sm:px-5 lg:px-6 py-6 transition-all duration-500 ${activeTheme.pageClass}`}
    >
      <div className="mx-auto max-w-7xl">
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
                🏆 Puan Durumu
              </h1>

              <p className={`mt-2 ${activeTheme.mutedTextClass}`}>
                Zirveye çıkan gardaşlar burada belli olur.
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
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {message}
          </div>
        )}

        {currentUserStanding >= 0 && (
          <section
            className={`mb-8 overflow-hidden rounded-3xl border ${activeTheme.secondaryCardClass}`}
          >
            <div className="grid gap-4 p-4 md:p-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl ${activeTheme.cardClass}`}
                >
                  {sortedUsers[currentUserStanding].avatar ?? "⚽"}
                </div>

                <div>
                  <p
                    className={`text-sm font-bold ${activeTheme.mutedTextClass}`}
                  >
                    Senin sıran
                  </p>

                  <p
                    className={`text-3xl font-black ${activeTheme.titleClass}`}
                  >
                    {getPositionIcon(currentUserStanding + 1)}
                  </p>
                </div>
              </div>

              <div className="sm:text-right">
                <p
                  className={`text-3xl font-black ${activeTheme.titleClass}`}
                >
                  {sortedUsers[currentUserStanding].totalPoints} puan
                </p>

                <p
                  className={`text-sm ${activeTheme.mutedTextClass}`}
                >
                  Toplam {sortedUsers.length} oyuncu
                </p>
              </div>
            </div>
          </section>
        )}

        {sortedUsers.length === 0 ? (
          <div
            className={`rounded-3xl border border-dashed p-12 text-center ${activeTheme.cardClass} ${activeTheme.mutedTextClass}`}
          >
            Henüz puan durumunda oyuncu yok.
          </div>
        ) : (
          <>
            <section className="mb-10">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p
                    className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}
                  >
                    Şampiyonluk Podyumu
                  </p>

                  <h2
                    className={`mt-1 text-xl sm:text-2xl font-black ${activeTheme.titleClass}`}
                  >
                    Zirvedeki Gardaşlar
                  </h2>
                </div>

                <span
                  className={`hidden rounded-full px-3 py-1 text-xs font-black sm:block ${activeTheme.badgeClass}`}
                >
                  İlk 3
                </span>
              </div>

              <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {sortedUsers[1] && (
                  <PodiumCard
                    user={sortedUsers[1]}
                    position={2}
                    isCurrentUser={
                      sortedUsers[1].id === currentUser?.uid
                    }
                    isMostAccurate={
                      sortedUsers[1].correctPredictions ===
                        highestCorrectPredictionCount &&
                      highestCorrectPredictionCount > 0
                    }
                    isWeeklyChampion={
                      sortedUsers[1].weeklyWins ===
                        highestWeeklyWinCount &&
                      highestWeeklyWinCount > 0
                    }
                    theme={activeTheme}
                  />
                )}

                {sortedUsers[0] && (
                  <PodiumCard
                    user={sortedUsers[0]}
                    position={1}
                    isCurrentUser={
                      sortedUsers[0].id === currentUser?.uid
                    }
                    isMostAccurate={
                      sortedUsers[0].correctPredictions ===
                        highestCorrectPredictionCount &&
                      highestCorrectPredictionCount > 0
                    }
                    isWeeklyChampion={
                      sortedUsers[0].weeklyWins ===
                        highestWeeklyWinCount &&
                      highestWeeklyWinCount > 0
                    }
                    theme={activeTheme}
                  />
                )}

                {sortedUsers[2] && (
                  <PodiumCard
                    user={sortedUsers[2]}
                    position={3}
                    isCurrentUser={
                      sortedUsers[2].id === currentUser?.uid
                    }
                    isMostAccurate={
                      sortedUsers[2].correctPredictions ===
                        highestCorrectPredictionCount &&
                      highestCorrectPredictionCount > 0
                    }
                    isWeeklyChampion={
                      sortedUsers[2].weeklyWins ===
                        highestWeeklyWinCount &&
                      highestWeeklyWinCount > 0
                    }
                    theme={activeTheme}
                  />
                )}
              </div>
            </section>

            <section
              className={`overflow-hidden rounded-3xl border ${activeTheme.cardClass}`}
            >
              <div
                className={`hidden grid-cols-[90px_1fr_130px_150px_120px] border-b px-5 py-4 text-sm font-bold md:grid ${activeTheme.secondaryCardClass} ${activeTheme.mutedTextClass}`}
              >
                <div>Sıra</div>
                <div>Oyuncu</div>
                <div className="text-center">Doğru</div>
                <div className="text-center">Hafta Zaferi</div>
                <div className="text-right">Puan</div>
              </div>

              <div>
                {sortedUsers.map((standingUser, index) => {
                  const position = index + 1;
                  const isCurrentUser =
                    standingUser.id === currentUser?.uid;
                  const rowStyle = getStandingRowStyle(position);

                  return (
                    <article
                      key={standingUser.id}
                      className={`border-b px-5 py-5 transition last:border-b-0 hover:translate-x-1 ${activeTheme.borderClass} ${
                        isCurrentUser
                          ? activeTheme.secondaryCardClass
                          : ""
                      } ${rowStyle}`}
                    >
                      <div className="grid items-center gap-4 md:grid-cols-[90px_1fr_130px_150px_120px]">
                        <div className="flex items-center gap-3">
                          <span className="text-xl sm:text-2xl font-black">
                            {getPositionIcon(position)}
                          </span>

                          <span
                            className={`text-sm md:hidden ${activeTheme.mutedTextClass}`}
                          >
                            sıra
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-2xl ${activeTheme.secondaryCardClass}`}
                          >
                            {standingUser.avatar ?? "⚽"}

                            {position <= 3 && (
                              <span className="absolute -right-1 -top-1 text-sm">
                                {position === 1
                                  ? "👑"
                                  : position === 2
                                    ? "✨"
                                    : "⭐"}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={`truncate font-black ${activeTheme.textClass}`}
                              >
                                {standingUser.username}
                              </p>

                              {position === 1 && (
                                <span className="rounded-full border border-yellow-300/40 bg-yellow-400/15 px-2 py-0.5 text-xs font-black text-yellow-300">
                                  Lider
                                </span>
                              )}

                              {isCurrentUser && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-black ${activeTheme.badgeClass}`}
                                >
                                  Sen
                                </span>
                              )}
                            </div>

                            <p
                              className={`mt-1 truncate text-xs ${activeTheme.mutedTextClass}`}
                            >
                              Tema: {standingUser.selectedTheme}
                            </p>
                          </div>
                        </div>

                        <StatValue
                          label="Doğru tahmin"
                          value={standingUser.correctPredictions}
                          theme={activeTheme}
                        />

                        <StatValue
                          label="Haftalık zafer"
                          value={standingUser.weeklyWins}
                          theme={activeTheme}
                        />

                        <div className="text-left md:text-right">
                          <p
                            className={`text-xs md:hidden ${activeTheme.mutedTextClass}`}
                          >
                            Toplam puan
                          </p>

                          <p
                            className={`text-xl sm:text-2xl font-black ${activeTheme.titleClass}`}
                          >
                            {standingUser.totalPoints}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PodiumCard({
  user,
  position,
  isCurrentUser,
  isMostAccurate,
  isWeeklyChampion,
  theme,
}: {
  user: StandingUser;
  position: number;
  isCurrentUser: boolean;
  isMostAccurate: boolean;
  isWeeklyChampion: boolean;
  theme: AppTheme;
}) {
  const podiumStyle = getPodiumStyle(position);

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border p-4 md:p-5 transition duration-300 hover:-translate-y-2 ${podiumStyle.cardClass} ${
        position === 1 ? "md:min-h-[390px]" : "md:min-h-[350px]"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${podiumStyle.barClass}`} />

      <div className="absolute -right-8 -top-8 text-8xl opacity-10">
        {podiumStyle.medal}
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-4xl md:text-5xl">{podiumStyle.medal}</span>

            <p
              className={`mt-2 text-xs font-black uppercase tracking-widest ${podiumStyle.labelClass}`}
            >
              {podiumStyle.title}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {position === 1 && (
              <span className="rounded-full border border-yellow-300/40 bg-yellow-400/15 px-3 py-1 text-xs font-black text-yellow-200">
                👑 Lider
              </span>
            )}

            {isCurrentUser && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}
              >
                Sen
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <div
            className={`relative flex items-center justify-center rounded-full border-2 text-4xl md:text-5xl shadow-2xl ${
              position === 1 ? "h-20 w-20 md:h-24 md:w-24 md:h-28 md:w-28" : "h-20 w-20 md:h-24 md:w-24"
            } ${podiumStyle.avatarClass}`}
          >
            {user.avatar ?? "⚽"}

            {position === 1 && (
              <span className="absolute -top-6 text-3xl">👑</span>
            )}
          </div>
        </div>

        <h2
          className={`mt-5 truncate text-center text-xl sm:text-2xl font-black ${theme.textClass}`}
        >
          {user.username}
        </h2>

        <p
          className={`mt-1 truncate text-center text-sm ${theme.mutedTextClass}`}
        >
          Tema: {user.selectedTheme ?? "klasik"}
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {isMostAccurate && (
            <span className="rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1 text-xs font-black text-orange-200">
              🎯 En İsabetli
            </span>
          )}

          {isWeeklyChampion && (
            <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-black text-fuchsia-200">
              🔥 Hafta Canavarı
            </span>
          )}
        </div>

        <div
          className={`mt-6 rounded-2xl border p-4 text-center ${podiumStyle.scoreClass}`}
        >
          <p className={`text-4xl font-black ${podiumStyle.scoreTextClass}`}>
            {user.totalPoints}
          </p>

          <p className={`mt-1 text-sm ${theme.mutedTextClass}`}>
            toplam puan
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className={`font-black ${theme.textClass}`}>
                {user.correctPredictions}
              </p>
              <p className={`text-xs ${theme.mutedTextClass}`}>
                doğru
              </p>
            </div>

            <div>
              <p className={`font-black ${theme.textClass}`}>
                {user.weeklyWins}
              </p>
              <p className={`text-xs ${theme.mutedTextClass}`}>
                zafer
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function StatValue({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: AppTheme;
}) {
  return (
    <div className="text-left md:text-center">
      <p className={`text-xs md:hidden ${theme.mutedTextClass}`}>
        {label}
      </p>

      <p className={`font-black ${theme.textClass}`}>{value}</p>
    </div>
  );
}

function getPositionIcon(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";

  return `${position}.`;
}

function getStandingRowStyle(position: number): string {
  if (position === 1) {
    return "bg-gradient-to-r from-yellow-400/10 via-yellow-300/5 to-transparent";
  }

  if (position === 2) {
    return "bg-gradient-to-r from-slate-300/10 via-slate-200/5 to-transparent";
  }

  if (position === 3) {
    return "bg-gradient-to-r from-orange-500/10 via-orange-400/5 to-transparent";
  }

  return "";
}

function getPodiumStyle(position: number) {
  if (position === 1) {
    return {
      medal: "🥇",
      title: "Şampiyon",
      cardClass:
        "border-yellow-300/50 bg-gradient-to-b from-yellow-400/20 via-yellow-950/20 to-black/30 shadow-[0_0_45px_rgba(250,204,21,0.18)] md:scale-105",
      barClass:
        "bg-gradient-to-r from-yellow-700 via-yellow-300 to-yellow-700",
      labelClass: "text-yellow-200",
      avatarClass:
        "border-yellow-300 bg-yellow-400/15 shadow-[0_0_35px_rgba(250,204,21,0.35)]",
      scoreClass: "border-yellow-300/30 bg-yellow-400/10",
      scoreTextClass: "text-yellow-200",
    };
  }

  if (position === 2) {
    return {
      medal: "🥈",
      title: "İkinci",
      cardClass:
        "border-slate-300/40 bg-gradient-to-b from-slate-300/15 via-slate-900/20 to-black/30 shadow-[0_0_35px_rgba(203,213,225,0.12)]",
      barClass:
        "bg-gradient-to-r from-slate-600 via-slate-200 to-slate-600",
      labelClass: "text-slate-200",
      avatarClass:
        "border-slate-200 bg-slate-300/10 shadow-[0_0_25px_rgba(203,213,225,0.2)]",
      scoreClass: "border-slate-300/25 bg-slate-300/10",
      scoreTextClass: "text-slate-100",
    };
  }

  return {
    medal: "🥉",
    title: "Üçüncü",
    cardClass:
      "border-orange-400/40 bg-gradient-to-b from-orange-500/15 via-orange-950/20 to-black/30 shadow-[0_0_35px_rgba(249,115,22,0.12)]",
    barClass:
      "bg-gradient-to-r from-orange-900 via-orange-400 to-orange-900",
    labelClass: "text-orange-200",
    avatarClass:
      "border-orange-400 bg-orange-500/10 shadow-[0_0_25px_rgba(249,115,22,0.2)]",
    scoreClass: "border-orange-400/25 bg-orange-500/10",
    scoreTextClass: "text-orange-200",
  };
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