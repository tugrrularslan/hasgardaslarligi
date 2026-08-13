"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import HittiteIcon, { type HittiteIconName } from "@/components/HittiteIcon";
import PlatformNavigation from "@/components/PlatformNavigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import SeasonLabel from "@/components/SeasonLabel";
import TeamCrest from "@/components/TeamCrest";
import { db } from "@/lib/firebase";
import type { AppTheme } from "@/lib/themes";

type HomeDashboardProps = {
  userId: string;
  username: string;
  avatar?: string | null;
  totalPoints: number;
  correctPredictions: number;
  weeklyWins: number;
  isAdmin: boolean;
  theme: AppTheme;
  message: string;
  onLogout: () => void | Promise<void>;
};

type MatchPreview = {
  id: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: Timestamp | null;
  predictionDeadline: Timestamp | null;
  status: "scheduled" | "finished";
};

type LeagueStandingPreview = {
  position: number;
  team: string;
  points: number;
};

export default function HomeDashboard({
  userId,
  username,
  avatar,
  totalPoints,
  correctPredictions,
  weeklyWins,
  isAdmin,
  theme,
  message,
  onLogout,
}: HomeDashboardProps) {
  const [matches, setMatches] = useState<MatchPreview[]>([]);
  const [leagueStandings, setLeagueStandings] = useState<
    LeagueStandingPreview[]
  >([]);
  const [leagueStandingsLoading, setLeagueStandingsLoading] = useState(true);
  const [savedMatchIds, setSavedMatchIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const unsubscribeMatches = onSnapshot(
      collection(db, "matches"),
      (snapshot) => {
        const nextMatches = snapshot.docs
          .map((matchDocument): MatchPreview => {
            const data = matchDocument.data();

            return {
              id: matchDocument.id,
              week: typeof data.week === "number" ? data.week : 0,
              homeTeam:
                typeof data.homeTeam === "string" ? data.homeTeam : "Ev sahibi",
              awayTeam:
                typeof data.awayTeam === "string" ? data.awayTeam : "Deplasman",
              kickoff: data.kickoff instanceof Timestamp ? data.kickoff : null,
              predictionDeadline:
                data.predictionDeadline instanceof Timestamp
                  ? data.predictionDeadline
                  : null,
              status: data.status === "finished" ? "finished" : "scheduled",
            };
          })
          .sort(
            (first, second) =>
              (first.kickoff?.toMillis() ?? Number.MAX_SAFE_INTEGER) -
              (second.kickoff?.toMillis() ?? Number.MAX_SAFE_INTEGER),
          );

        setMatches(nextMatches);
      },
      (error) => console.error("Ana sayfa maçları alınamadı:", error),
    );

    return unsubscribeMatches;
  }, []);

  useEffect(() => {
    const unsubscribePredictions = onSnapshot(
      query(collection(db, "predictions"), where("userId", "==", userId)),
      (snapshot) => {
        const nextSavedMatchIds = new Set(
          snapshot.docs
            .map((predictionDocument) => predictionDocument.data().matchId)
            .filter((matchId): matchId is string => typeof matchId === "string"),
        );

        setSavedMatchIds(nextSavedMatchIds);
      },
      (error) => console.error("Ana sayfa tahminleri alınamadı:", error),
    );

    return unsubscribePredictions;
  }, [userId]);

  useEffect(() => {
    let active = true;

    const loadLeagueStandings = async () => {
      try {
        const response = await fetch("/api/league-standings", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          success?: boolean;
          standings?: LeagueStandingPreview[];
        };

        if (!response.ok || !data.success || !data.standings) {
          throw new Error("Canlı puan durumu alınamadı.");
        }

        if (active) setLeagueStandings(data.standings);
      } catch (error) {
        console.error("Ana sayfa canlı puan durumu alınamadı:", error);
      } finally {
        if (active) setLeagueStandingsLoading(false);
      }
    };

    void loadLeagueStandings();
    const interval = window.setInterval(() => void loadLeagueStandings(), 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const nextMatch = useMemo(() => {
    const now = Date.now();

    return (
      matches.find(
        (match) =>
          match.status === "scheduled" &&
          (!match.predictionDeadline || match.predictionDeadline.toMillis() > now),
      ) ?? matches.find((match) => match.status === "scheduled") ?? null
    );
  }, [matches]);

  const currentWeekMatches = useMemo(() => {
    if (!nextMatch || nextMatch.week <= 0) return [];

    return matches.filter(
      (match) => match.status === "scheduled" && match.week === nextMatch.week,
    );
  }, [matches, nextMatch]);

  const hasCompletedCurrentWeek =
    currentWeekMatches.length > 0 &&
    currentWeekMatches.every((match) => savedMatchIds.has(match.id));
  const completedPredictionCount = currentWeekMatches.filter((match) =>
    savedMatchIds.has(match.id),
  ).length;
  const missingPredictionMatches = currentWeekMatches.filter(
    (match) => !savedMatchIds.has(match.id),
  );

  return (
    <main
      className={`min-h-screen px-4 py-6 transition-colors duration-300 sm:px-6 sm:py-8 ${theme.pageClass}`}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <PlatformNavigation active="home" />

        <header
          className={`rounded-3xl border p-5 shadow-2xl backdrop-blur-md sm:p-7 ${theme.headerClass}`}
        >
          <div className="flex items-center">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <ProfileAvatar
                avatar={avatar}
                alt={`${username} profil avatarı`}
                priority
                className="h-16 w-16 rounded-full shadow-xl sm:h-20 sm:w-20"
              />

              <div className="min-w-0">
                <p
                  className={`text-xs font-black uppercase tracking-[0.22em] sm:text-sm ${theme.mutedTextClass}`}
                >
                  Has Gardaşlar
                </p>

                <SeasonLabel className={theme.mutedTextClass} />

                <h1
                  className={`mt-2 truncate text-2xl font-black sm:text-4xl ${theme.titleClass}`}
                >
                  Hoş geldin, {username}
                </h1>

                <p className={`mt-2 text-sm sm:text-base ${theme.mutedTextClass}`}>
                  Tahminini yap, puanını yükselt ve zirveye çık.
                </p>
              </div>
            </div>

          </div>
        </header>

        <section className="grid grid-cols-3 gap-2 sm:gap-3">
          <DashboardStat
            title="Toplam Puan"
            value={totalPoints}
            icon="sun"
            theme={theme}
          />
          <DashboardStat
            title="Doğru Tahmin"
            value={correctPredictions}
            icon="check"
            theme={theme}
          />
          <DashboardStat
            title="Haftalık Zafer"
            value={weeklyWins}
            icon="trophy"
            theme={theme}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.8fr)]">
          <article className={`rounded-3xl border p-5 shadow-xl sm:p-7 ${theme.cardClass}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={`text-xs font-black uppercase tracking-widest ${theme.mutedTextClass}`}>
                  Gardaş 1X2
                </p>
                <h2 className={`mt-1 text-2xl font-black sm:text-3xl ${theme.titleClass}`}>
                  Kaldığın yerden devam et
                </h2>
                <p className={`mt-2 ${theme.mutedTextClass}`}>
                  {nextMatch
                    ? hasCompletedCurrentWeek
                      ? `Bu haftadaki ${currentWeekMatches.length} tahmininin tamamını yaptın.`
                      : `${completedPredictionCount}/${currentWeekMatches.length} tahminini tamamladın.`
                    : "Yeni maçlar eklendiğinde tahminini burada yapabilirsin."}
                </p>
              </div>

              {nextMatch && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}>
                    {nextMatch.week > 0 ? `${nextMatch.week}. Hafta` : "Açık Tahmin"}
                  </span>
                  {hasCompletedCurrentWeek && (
                    <span className={`hg-icon-label rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}>
                      <HittiteIcon name="check" size="xs" />
                      {completedPredictionCount}/{currentWeekMatches.length} tamamlandı
                    </span>
                  )}
                  {!hasCompletedCurrentWeek && currentWeekMatches.length > 0 && (
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}>
                      {completedPredictionCount}/{currentWeekMatches.length} tahmin
                    </span>
                  )}
                </div>
              )}
            </div>

            {nextMatch ? (
              <div className={`mt-6 rounded-2xl border p-4 sm:p-5 ${theme.secondaryCardClass}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
                  <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                    <TeamCrest team={nextMatch.homeTeam} size="lg" />
                    <span className="truncate text-base font-black sm:text-lg">
                      {nextMatch.homeTeam}
                    </span>
                  </div>

                  <span className={`text-xl font-black sm:text-2xl ${theme.titleClass}`}>
                    —
                  </span>

                  <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row-reverse sm:text-right">
                    <TeamCrest team={nextMatch.awayTeam} size="lg" />
                    <span className="truncate text-base font-black sm:text-lg">
                      {nextMatch.awayTeam}
                    </span>
                  </div>
                </div>

                <p className={`mt-4 text-center text-sm ${theme.mutedTextClass}`}>
                  {formatKickoff(nextMatch.kickoff)}
                </p>
              </div>
            ) : (
              <div className={`mt-6 flex min-h-32 items-center justify-center rounded-2xl border border-dashed p-5 text-center ${theme.secondaryCardClass} ${theme.mutedTextClass}`}>
                <div>
                  <HittiteIcon name="ball" size="lg" />
                  <p className="mt-3 font-bold">Şu an gösterilecek açık maç yok.</p>
                </div>
              </div>
            )}

            {currentWeekMatches.length > 0 && (
              <div className={`mt-4 rounded-2xl border p-4 ${theme.secondaryCardClass}`}>
                <div className="flex items-start gap-3">
                  <HittiteIcon
                    name={hasCompletedCurrentWeek ? "check" : "clock"}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className={`font-black ${theme.textClass}`}>
                      {hasCompletedCurrentWeek
                        ? "Haftanın tüm tahminleri hazır"
                        : `${missingPredictionMatches.length} tahminin bekliyor`}
                    </p>
                    <p className={`mt-1 text-sm ${theme.mutedTextClass}`}>
                      {hasCompletedCurrentWeek
                        ? "Bu haftada eksik tahminin kalmadı."
                        : <MissingMatchList matches={missingPredictionMatches} />}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Link
              href="/predictions"
              className={`hg-icon-label mt-5 w-full rounded-xl px-5 py-3 text-center font-black transition hover:-translate-y-0.5 ${theme.primaryButtonClass}`}
            >
              <HittiteIcon name="ball" size="sm" />
              {hasCompletedCurrentWeek
                ? "Tahminlerini Gör"
                : missingPredictionMatches.length > 0
                  ? "Eksik Tahminleri Tamamla"
                  : "Tahmin Yap"}
            </Link>
          </article>

          <aside className={`rounded-3xl border p-5 shadow-xl sm:p-6 ${theme.cardClass}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-xs font-black uppercase tracking-widest ${theme.mutedTextClass}`}>
                  Süper Lig
                </p>
                <h2 className={`mt-1 text-2xl font-black ${theme.titleClass}`}>
                  Canlı Puan Durumu
                </h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}>
                Canlı
              </span>
            </div>

            {leagueStandings.length > 0 ? (
              <ol className="mt-5 space-y-3">
                {leagueStandings.slice(0, 4).map((standing) => (
                  <li
                    key={standing.team}
                    className={`flex items-center gap-3 rounded-2xl border p-3 ${theme.secondaryCardClass}`}
                  >
                    <span className={`w-5 text-center font-black ${theme.titleClass}`}>
                      {standing.position}
                    </span>
                    <TeamCrest team={standing.team} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {standing.team}
                    </span>
                    <span className={`font-black ${theme.titleClass}`}>
                      {standing.points} P
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={`mt-6 text-sm ${theme.mutedTextClass}`}>
                {leagueStandingsLoading
                  ? "Canlı puan durumu yükleniyor..."
                  : "Canlı puan durumu şu anda gösterilemiyor."}
              </p>
            )}

            <p className={`mt-4 text-xs ${theme.mutedTextClass}`}>
              Tablo her dakika otomatik güncellenir.
            </p>

            <Link
              href="/league-table"
              className={`hg-icon-label mt-5 w-full rounded-xl px-4 py-3 text-center text-sm font-bold ${theme.secondaryButtonClass}`}
            >
              <HittiteIcon name="trophy" size="sm" />
              Tüm Puan Durumunu Gör
            </Link>
          </aside>
        </section>

        {isAdmin && (
          <section className={`rounded-3xl border p-5 sm:p-6 ${theme.secondaryCardClass}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`hg-icon-label font-black ${theme.textClass}`}>
                  <HittiteIcon name="crown" size="sm" />
                  Yönetici hesabıyla giriş yaptın
                </p>
                <p className={`mt-1 text-sm ${theme.mutedTextClass}`}>
                  Maçları ve sezonu yönetmek için yönetici paneline geç.
                </p>
              </div>
              <Link
                href="/admin"
                className={`hg-icon-label w-full rounded-xl px-5 py-3 text-center font-black sm:w-auto ${theme.primaryButtonClass}`}
              >
                <HittiteIcon name="crown" size="sm" />
                Admin Paneline Git
              </Link>
            </div>
          </section>
        )}

        {message && (
          <div className={`rounded-2xl border p-4 text-center text-sm ${theme.secondaryCardClass} ${theme.textClass}`}>
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className={`hg-icon-label w-full rounded-2xl px-6 py-4 text-lg font-black transition hover:-translate-y-0.5 ${theme.secondaryButtonClass}`}
        >
          <HittiteIcon name="exit" size="sm" />
          Çıkış Yap
        </button>
      </div>
    </main>
  );
}

function DashboardStat({
  title,
  value,
  icon,
  theme,
}: {
  title: string;
  value: string | number;
  icon: HittiteIconName;
  theme: AppTheme;
}) {
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${theme.secondaryCardClass}`}>
      <div className="flex items-center justify-between gap-3">
        <HittiteIcon name={icon} size="sm" />
        <span className={`truncate text-right text-lg font-black sm:text-xl ${theme.titleClass}`}>
          {value}
        </span>
      </div>
      <p className={`mt-3 text-xs font-bold ${theme.mutedTextClass}`}>{title}</p>
    </div>
  );
}

function formatKickoff(kickoff: Timestamp | null): string {
  if (!kickoff) return "Maç tarihi henüz belirlenmedi";

  return kickoff.toDate().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MissingMatchList({ matches }: { matches: MatchPreview[] }) {
  const visibleMatches = matches.slice(0, 2);
  const remainingCount = matches.length - visibleMatches.length;

  return (
    <>
      Eksik maçlar: {visibleMatches.map((match, index) => (
        <span key={match.id} className="inline-flex items-center gap-1">
          {index > 0 && " · "}
          <TeamCrest team={match.homeTeam} size="xs" />
          {match.homeTeam} –
          <TeamCrest team={match.awayTeam} size="xs" />
          {match.awayTeam}
        </span>
      ))}
      {remainingCount > 0 && ` · +${remainingCount} maç daha`}
    </>
  );
}
