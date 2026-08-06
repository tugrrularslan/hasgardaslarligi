"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import HittiteIcon from "@/components/HittiteIcon";
import PlayerPortrait from "@/components/PlayerPortrait";
import TeamCrest from "@/components/TeamCrest";
import { auth, db } from "@/lib/firebase";
import { DEFAULT_SEASON_ID } from "@/lib/season";
import { getThemeById, type AppTheme } from "@/lib/themes";

const REFRESH_INTERVAL = 60_000;

type LeagueStanding = {
  position: number;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  note: string | null;
};

type LeagueTableResponse = {
  success: boolean;
  competition?: string;
  season?: string;
  updatedAt?: string;
  standings?: LeagueStanding[];
  error?: string;
};

type GoalEvent = {
  team: string;
  scorer: string;
  assister: string | null;
};

type PlayerLeaderboardEntry = {
  name: string;
  team: string;
  total: number;
};

export default function LeagueTablePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedTheme, setSelectedTheme] = useState("obsidyen");
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [competition, setCompetition] = useState("Trendyol Süper Lig");
  const [season, setSeason] = useState("Güncel sezon");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeSeasonId, setActiveSeasonId] = useState(DEFAULT_SEASON_ID);
  const [goalEvents, setGoalEvents] = useState<GoalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const loadStandings = useCallback(async (initialLoad = false) => {
    if (initialLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const response = await fetch("/api/league-standings", {
        cache: "no-store",
      });
      const data = (await response.json()) as LeagueTableResponse;

      if (!response.ok || !data.success || !data.standings) {
        throw new Error(data.error ?? "Puan durumu alınamadı.");
      }

      setStandings(data.standings);
      setCompetition(data.competition ?? "Trendyol Süper Lig");
      setSeason(data.season ?? "Güncel sezon");
      setUpdatedAt(data.updatedAt ?? new Date().toISOString());
      setMessage("");
    } catch (error) {
      console.error("Canlı puan durumu istemcide alınamadı:", error);
      setMessage(
        "Canlı puan durumu şu an yenilenemedi. Son başarılı tablo ekranda tutuluyor.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!firebaseUser) {
        setCurrentUser(null);
        router.replace("/");
        return;
      }

      setCurrentUser(firebaseUser);
      unsubscribeProfile = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        (snapshot) => {
          const theme = snapshot.data()?.selectedTheme;
          setSelectedTheme(
            typeof theme === "string" && theme.trim()
              ? theme
              : "obsidyen",
          );
        },
        (error) => {
          console.error("Puan durumu teması alınamadı:", error);
          setSelectedTheme("obsidyen");
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = onSnapshot(
      doc(db, "settings", "currentSeason"),
      (snapshot) => {
        const seasonId = snapshot.data()?.seasonId;
        setActiveSeasonId(
          typeof seasonId === "string" && seasonId.trim()
            ? seasonId.trim()
            : DEFAULT_SEASON_ID,
        );
      },
      (error) => {
        console.error("Gol ve asist sezon bilgisi alınamadı:", error);
        setActiveSeasonId(DEFAULT_SEASON_ID);
      },
    );

    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = onSnapshot(
      collection(db, "matches"),
      (snapshot) => {
        const nextGoalEvents = snapshot.docs.flatMap((matchDocument) => {
          const data = matchDocument.data();
          const matchSeasonId =
            typeof data.seasonId === "string" && data.seasonId.trim()
              ? data.seasonId.trim()
              : DEFAULT_SEASON_ID;

          if (data.status !== "finished" || matchSeasonId !== activeSeasonId) {
            return [];
          }

          const rawEvents = Array.isArray(data.goalEvents)
            ? data.goalEvents
            : [];

          return rawEvents.flatMap((event): GoalEvent[] => {
            if (!event || typeof event !== "object") return [];

            const goal = event as Record<string, unknown>;
            const scorer =
              typeof goal.scorer === "string" ? goal.scorer.trim() : "";
            const team = typeof goal.team === "string" ? goal.team.trim() : "";

            if (!scorer || !team) return [];

            return [
              {
                team,
                scorer,
                assister:
                  typeof goal.assister === "string" && goal.assister.trim()
                    ? goal.assister.trim()
                    : null,
              },
            ];
          });
        });

        setGoalEvents(nextGoalEvents);
      },
      (error) => {
        console.error("Gol ve asist kayıtları alınamadı:", error);
        setGoalEvents([]);
      },
    );

    return unsubscribe;
  }, [activeSeasonId, currentUser]);

  useEffect(() => {
    void loadStandings(true);

    const interval = window.setInterval(() => {
      void loadStandings(false);
    }, REFRESH_INTERVAL);

    return () => window.clearInterval(interval);
  }, [loadStandings]);

  const theme = useMemo(() => getThemeById(selectedTheme), [selectedTheme]);
  const formattedUpdatedAt = updatedAt ? formatUpdatedAt(updatedAt) : null;
  const topScorers = useMemo(
    () => createPlayerLeaderboard(goalEvents, "scorer"),
    [goalEvents],
  );
  const topAssisters = useMemo(
    () => createPlayerLeaderboard(goalEvents, "assister"),
    [goalEvents],
  );
  const isSeasonUnstarted =
    standings.length > 0 && standings.every((standing) => standing.played === 0);

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Puan durumu hazırlanıyor...
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-3 py-6 transition-colors duration-300 sm:px-5 lg:px-6 ${theme.pageClass}`}
    >
      <div className="mx-auto max-w-7xl">
        <header
          className={`rounded-3xl border p-5 backdrop-blur-md sm:p-7 ${theme.headerClass}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p
                className={`text-xs font-black uppercase tracking-[0.2em] sm:text-sm ${theme.mutedTextClass}`}
              >
                Canlı futbol verisi
              </p>
              <h1
                className={`mt-2 flex items-center gap-3 text-2xl font-black sm:text-4xl ${theme.titleClass}`}
              >
                <HittiteIcon name="trophy" size="lg" />
                Puan Durumu
              </h1>
              <p className={`mt-2 ${theme.mutedTextClass}`}>
                {competition} · {season}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void loadStandings(false)}
                disabled={refreshing}
                className={`hg-icon-label rounded-xl px-5 py-3 text-center font-bold transition disabled:cursor-wait disabled:opacity-70 ${theme.secondaryButtonClass}`}
              >
                <HittiteIcon name="clock" size="sm" />
                {refreshing ? "Güncelleniyor..." : "Şimdi Güncelle"}
              </button>
              <Link
                href="/"
                className={`hg-icon-label rounded-xl px-5 py-3 text-center font-bold transition ${theme.secondaryButtonClass}`}
              >
                <HittiteIcon name="home" size="sm" />
                Ana Sayfa
              </Link>
            </div>
          </div>
        </header>

        <section
          className={`mt-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${theme.secondaryCardClass}`}
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <div>
              <p className={`font-black ${theme.textClass}`}>Canlı tablo açık</p>
              <p className={`mt-0.5 text-sm ${theme.mutedTextClass}`}>
                Puan durumu otomatik olarak her dakika yenilenir.
              </p>
            </div>
          </div>
          <p className={`text-sm ${theme.mutedTextClass}`}>
            {formattedUpdatedAt
              ? `ESPN verisi · ${formattedUpdatedAt}`
              : "Veri bekleniyor..."}
          </p>
        </section>

        {message && (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {message}
          </div>
        )}

        {isSeasonUnstarted && (
          <section
            className={`mt-5 flex gap-3 rounded-2xl border p-4 ${theme.secondaryCardClass}`}
          >
            <HittiteIcon name="clock" size="sm" />
            <div>
              <p className={`font-black ${theme.textClass}`}>Sezon henüz başlamadı</p>
              <p className={`mt-1 text-sm ${theme.mutedTextClass}`}>
                Tüm takımlar 0 puanda. İlk resmî maçtan sonra puan durumu
                otomatik oluşacak.
              </p>
            </div>
          </section>
        )}

        {loading ? (
          <div
            className={`mt-5 flex min-h-80 items-center justify-center rounded-3xl border text-center ${theme.cardClass} ${theme.mutedTextClass}`}
          >
            <div>
              <HittiteIcon name="trophy" size="lg" />
              <p className="mt-3 font-bold">Canlı puan durumu yükleniyor...</p>
            </div>
          </div>
        ) : standings.length === 0 ? (
          <div
            className={`mt-5 rounded-3xl border border-dashed p-12 text-center ${theme.cardClass} ${theme.mutedTextClass}`}
          >
            Puan durumu henüz gösterilemiyor.
          </div>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,.7fr)]">
            <section className={`overflow-hidden rounded-3xl border ${theme.cardClass}`}>
              <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full border-collapse text-sm">
                <thead className={`${theme.secondaryCardClass} ${theme.mutedTextClass}`}>
                  <tr className="border-b text-left text-xs font-black uppercase tracking-wider">
                    <th className="w-14 px-4 py-4 text-center">#</th>
                    <th className="min-w-56 px-4 py-4">Takım</th>
                    <th className="w-14 px-3 py-4 text-center" title="Oynadığı maç">O</th>
                    <th className="w-14 px-3 py-4 text-center" title="Galibiyet">G</th>
                    <th className="w-14 px-3 py-4 text-center" title="Beraberlik">B</th>
                    <th className="w-14 px-3 py-4 text-center" title="Mağlubiyet">M</th>
                    <th className="w-16 px-3 py-4 text-center" title="Attığı gol">AG</th>
                    <th className="w-16 px-3 py-4 text-center" title="Yediği gol">YG</th>
                    <th className="w-16 px-3 py-4 text-center" title="Averaj">AV</th>
                    <th className="w-20 px-4 py-4 text-right">Puan</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing) => (
                    <tr
                      key={standing.team}
                      className={`border-b last:border-b-0 ${theme.borderClass} ${isSeasonUnstarted ? "" : getStandingHighlight(standing.position)}`}
                    >
                      <td className="px-4 py-3 text-center font-black">
                        <span className={theme.titleClass}>{standing.position}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <TeamCrest team={standing.team} size="sm" />
                          <div className="min-w-0">
                            <p className={`truncate font-black ${theme.textClass}`}>
                              {standing.team}
                            </p>
                            {!isSeasonUnstarted && standing.note && (
                              <p className={`mt-0.5 truncate text-xs ${theme.mutedTextClass}`}>
                                {translateStandingNote(standing.note)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <TableNumber value={standing.played} />
                      <TableNumber value={standing.wins} />
                      <TableNumber value={standing.draws} />
                      <TableNumber value={standing.losses} />
                      <TableNumber value={standing.goalsFor} />
                      <TableNumber value={standing.goalsAgainst} />
                      <TableNumber
                        value={formatGoalDifference(standing.goalDifference)}
                      />
                      <td className={`px-4 py-3 text-right text-lg font-black ${theme.titleClass}`}>
                        {standing.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

              <div className={`border-t px-4 py-3 text-xs ${theme.borderClass} ${theme.mutedTextClass}`}>
                O: Oynanan · G: Galibiyet · B: Beraberlik · M: Mağlubiyet · AG: Atılan gol · YG: Yenilen gol · AV: Averaj
              </div>
            </section>

            <aside className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <PlayerLeaderboard
                title="Gol Krallığı"
                subtitle="Kaydedilen maç sonuçlarına göre"
                emptyMessage="Maç sonuçlarına golü atan oyuncular eklendiğinde liste burada oluşacak."
                players={topScorers}
                metricLabel="gol"
                icon="ball"
                theme={theme}
              />
              <PlayerLeaderboard
                title="Asist Krallığı"
                subtitle="Kaydedilen maç sonuçlarına göre"
                emptyMessage="Maç sonuçlarına asist yapan oyuncular eklendiğinde liste burada oluşacak."
                players={topAssisters}
                metricLabel="asist"
                icon="chart"
                theme={theme}
              />
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function TableNumber({ value }: { value: number | string }) {
  return <td className="px-3 py-3 text-center font-bold">{value}</td>;
}

function PlayerLeaderboard({
  title,
  subtitle,
  emptyMessage,
  players,
  metricLabel,
  icon,
  theme,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  players: PlayerLeaderboardEntry[];
  metricLabel: string;
  icon: "ball" | "chart";
  theme: AppTheme;
}) {
  return (
    <section className={`rounded-3xl border p-5 ${theme.cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black uppercase tracking-widest ${theme.mutedTextClass}`}>
            Sezon liderleri
          </p>
          <h2 className={`mt-1 text-xl font-black ${theme.titleClass}`}>{title}</h2>
          <p className={`mt-1 text-xs ${theme.mutedTextClass}`}>{subtitle}</p>
        </div>
        <HittiteIcon name={icon} size="md" />
      </div>

      {players.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {players.slice(0, 5).map((player, index) => (
            <li
              key={`${player.name}-${player.team}`}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${theme.secondaryCardClass}`}
            >
              <span className={`w-5 text-center font-black ${theme.titleClass}`}>
                {index + 1}
              </span>
              <PlayerPortrait
                name={player.name}
                team={player.team}
                className="h-9 w-9"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-black ${theme.textClass}`}>{player.name}</p>
                <p className={`mt-0.5 truncate text-xs ${theme.mutedTextClass}`}>
                  {player.team}
                </p>
              </div>
              <span className={`whitespace-nowrap font-black ${theme.titleClass}`}>
                {player.total} {metricLabel}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={`mt-5 rounded-2xl border border-dashed p-4 text-sm ${theme.secondaryCardClass} ${theme.mutedTextClass}`}>
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

function createPlayerLeaderboard(
  goalEvents: GoalEvent[],
  field: "scorer" | "assister",
): PlayerLeaderboardEntry[] {
  const players = new Map<string, PlayerLeaderboardEntry>();

  for (const goal of goalEvents) {
    const name = field === "scorer" ? goal.scorer : goal.assister;
    if (!name) continue;

    const key = `${name.toLocaleLowerCase("tr-TR")}::${goal.team.toLocaleLowerCase("tr-TR")}`;
    const current = players.get(key);

    if (current) {
      current.total += 1;
    } else {
      players.set(key, { name, team: goal.team, total: 1 });
    }
  }

  return [...players.values()].sort(
    (first, second) =>
      second.total - first.total ||
      first.name.localeCompare(second.name, "tr-TR"),
  );
}

function formatGoalDifference(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Az önce";

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  }).format(date);
}

function getStandingHighlight(position: number): string {
  if (position === 1) {
    return "bg-yellow-400/10";
  }

  if (position <= 4) {
    return "bg-sky-400/5";
  }

  if (position >= 16) {
    return "bg-red-500/5";
  }

  return "";
}

function translateStandingNote(note: string): string {
  const normalized = note.toLocaleLowerCase("en-US");

  if (normalized.includes("champions league")) return "Şampiyonlar Ligi hattı";
  if (normalized.includes("europa league")) return "Avrupa Ligi hattı";
  if (normalized.includes("conference")) return "Konferans Ligi hattı";
  if (normalized.includes("relegation")) return "Küme düşme hattı";

  return note;
}
