"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BadgeArtwork from "@/components/BadgeArtwork";
import GameNavigation from "@/components/GameNavigation";
import HittiteIcon from "@/components/HittiteIcon";
import ProfileAvatar from "@/components/ProfileAvatar";
import TeamCrest from "@/components/TeamCrest";
import { auth } from "@/lib/firebase";
import { BADGES } from "@/lib/achievements";
import { getThemeById } from "@/lib/themes";

type PublicUser = {
  id: string;
  username: string;
  avatar: string;
};

type TabletData = {
  week: number;
  matchCount: number;
  highestCorrectCount: number;
  leaders: PublicUser[];
  biggestRiser:
    | (PublicUser & {
        rankBefore: number;
        rankAfter: number;
        rise: number;
      })
    | null;
  hardestMatch: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    predictionCount: number;
    correctCount: number;
    successRate: number;
  } | null;
  personal: PublicUser & {
    predictionCount: number;
    correctCount: number;
    rank: number | null;
    participantCount: number;
    points: number;
    championBonus: number;
    correctStreak: number;
    championStreak: number;
    newlyEarnedBadges: Array<{
      id: string;
      name: string;
      image: string;
      rarity: string;
      shortDescription: string;
    }>;
  };
};

type TabletResponse = {
  success: boolean;
  error?: string;
  activeSeasonId: string;
  activeSeasonName: string;
  selectedTheme: string;
  completedWeeks: number[];
  tablet: TabletData | null;
};

export default function WeeklyTabletPage() {
  const router = useRouter();
  const [data, setData] = useState<TabletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadTablet = useCallback(async (week?: number) => {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const idToken = await user.getIdToken();
      const weekParameter =
        typeof week === "number" ? `?week=${week}` : "";
      const response = await fetch(
        `/api/weekly-tablet${weekParameter}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          cache: "no-store",
        },
      );
      const responseData = (await response.json()) as TabletResponse;

      if (!response.ok || responseData.success !== true) {
        throw new Error(
          responseData.error || "Haftanın Tableti yüklenemedi.",
        );
      }

      setData(responseData);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Haftanın Tableti yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      const weekFromUrl = Number(
        new URLSearchParams(window.location.search).get("week"),
      );

      void loadTablet(
        Number.isInteger(weekFromUrl) && weekFromUrl > 0
          ? weekFromUrl
          : undefined,
      );
    });

    return unsubscribe;
  }, [loadTablet, router]);

  const activeTheme = useMemo(
    () => getThemeById(data?.selectedTheme),
    [data?.selectedTheme],
  );

  if (loading && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Haftanın Tableti hazırlanıyor...
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-3 py-6 transition-colors duration-300 sm:px-5 lg:px-6 ${activeTheme.pageClass}`}
    >
      <div className="mx-auto max-w-6xl">
        <GameNavigation />

        <header
          className={`mb-7 rounded-3xl border p-6 shadow-xl sm:p-8 ${activeTheme.headerClass}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p
                className={`text-sm font-bold uppercase tracking-[0.24em] ${activeTheme.mutedTextClass}`}
              >
                Gardaş 1X2
              </p>
              <h1
                className={`mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl ${activeTheme.titleClass}`}
              >
                <HittiteIcon name="record" size="lg" />
                Haftanın Tableti
              </h1>
              <p className={`mt-3 ${activeTheme.mutedTextClass}`}>
                Hafta tamamlandığı anda şampiyonlar, sürprizler ve kişisel
                sonucun burada hazır olur.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {data && data.completedWeeks.length > 0 && (
                <label className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${activeTheme.textClass}`}>
                    Hafta
                  </span>
                  <select
                    value={data.tablet?.week ?? ""}
                    onChange={(event) =>
                      void loadTablet(Number(event.target.value))
                    }
                    disabled={loading}
                    className={`rounded-xl border bg-transparent px-4 py-3 font-black outline-none ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
                  >
                    {data.completedWeeks.map((week) => (
                      <option key={week} value={week} className="text-black">
                        {week}. Hafta
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <Link
                href="/games"
                className={`hg-icon-label rounded-xl px-5 py-3 text-center font-bold ${activeTheme.secondaryButtonClass}`}
              >
                <HittiteIcon name="back" size="sm" />
                Oyunlara Dön
              </Link>
            </div>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-950/35 p-4 text-red-200">
            {errorMessage}
          </div>
        )}

        {loading && data && (
          <div
            className={`mb-6 rounded-2xl border p-4 text-center font-bold ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
          >
            Seçilen haftanın tableti hazırlanıyor...
          </div>
        )}

        {!data?.tablet ? (
          <section
            className={`rounded-3xl border border-dashed p-10 text-center sm:p-14 ${activeTheme.cardClass}`}
          >
            <HittiteIcon name="clock" size="xl" />
            <h2
              className={`mt-5 text-2xl font-black ${activeTheme.titleClass}`}
            >
              Tablet için hafta sonuçları bekleniyor
            </h2>
            <p className={`mt-3 ${activeTheme.mutedTextClass}`}>
              Bir haftadaki bütün maçların sonuçları ve puanları
              tamamlandığında özet kendiliğinden burada görünecek.
            </p>
          </section>
        ) : (
          <TabletContents
            tablet={data.tablet}
            seasonName={data.activeSeasonName}
            theme={activeTheme}
          />
        )}
      </div>
    </main>
  );
}

function TabletContents({
  tablet,
  seasonName,
  theme,
}: {
  tablet: TabletData;
  seasonName: string;
  theme: ReturnType<typeof getThemeById>;
}) {
  const personalBadges = tablet.personal.newlyEarnedBadges
    .map((earnedBadge) =>
      BADGES.find((badge) => badge.id === earnedBadge.id),
    )
    .filter((badge): badge is (typeof BADGES)[number] => Boolean(badge));

  return (
    <div className="space-y-5">
      <section
        className={`relative overflow-hidden rounded-3xl border p-6 shadow-xl sm:p-8 ${theme.cardClass}`}
      >
        <div
          className={`absolute -right-8 -top-8 opacity-10 ${theme.titleClass}`}
        >
          <HittiteIcon name="sun" size="xl" />
        </div>

        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}
            >
              {seasonName}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}
            >
              {tablet.week}. Hafta · {tablet.matchCount} maç
            </span>
          </div>

          <p
            className={`mt-6 text-sm font-bold uppercase tracking-[0.22em] ${theme.mutedTextClass}`}
          >
            Haftanın Şampiyonu
          </p>

          {tablet.leaders.length === 0 ? (
            <h2 className={`mt-2 text-3xl font-black ${theme.titleClass}`}>
              Bu hafta kimse doğru tahmin yapamadı
            </h2>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-4">
                {tablet.leaders.map((leader) => (
                  <div
                    key={leader.id}
                    className={`flex items-center gap-3 rounded-2xl border p-3 ${theme.secondaryCardClass}`}
                  >
                    <ProfileAvatar
                      avatar={leader.avatar}
                      alt={leader.username}
                      className="h-14 w-14 rounded-full"
                    />
                    <div>
                      <p className={`text-xl font-black ${theme.textClass}`}>
                        {leader.username}
                      </p>
                      <p className={`text-sm ${theme.mutedTextClass}`}>
                        {tablet.highestCorrectCount} doğru tahmin · +1 hafta
                        bonusu
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className={`mt-4 text-sm ${theme.mutedTextClass}`}>
                En çok doğru tahmini yapan
                {tablet.leaders.length > 1 ? " gardaşlar" : " gardaş"} aynı
                zamanda haftanın zirvesine çıktı.
              </p>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SummaryCard
          eyebrow="En Büyük Sıçrayış"
          icon="chart"
          theme={theme}
        >
          {tablet.biggestRiser ? (
            <div className="flex items-center gap-4">
              <ProfileAvatar
                avatar={tablet.biggestRiser.avatar}
                alt={tablet.biggestRiser.username}
                className="h-16 w-16 rounded-full"
              />
              <div>
                <h3 className={`text-2xl font-black ${theme.titleClass}`}>
                  {tablet.biggestRiser.username}
                </h3>
                <p className={`mt-1 ${theme.textClass}`}>
                  {tablet.biggestRiser.rankBefore}. sıradan{" "}
                  {tablet.biggestRiser.rankAfter}. sıraya
                </p>
                <p className={`mt-1 font-black ${theme.mutedTextClass}`}>
                  {tablet.biggestRiser.rise} basamak yükseldi
                </p>
              </div>
            </div>
          ) : (
            <p className={theme.mutedTextClass}>
              Bu hafta sıralamada yukarı çıkan olmadı.
            </p>
          )}
        </SummaryCard>

        <SummaryCard
          eyebrow="Haftanın En Zor Maçı"
          icon="target"
          theme={theme}
        >
          {tablet.hardestMatch ? (
            <>
              <div
                className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-lg font-black sm:text-2xl ${theme.titleClass}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TeamCrest team={tablet.hardestMatch.homeTeam} size="sm" />
                  <span className="truncate">{tablet.hardestMatch.homeTeam}</span>
                </span>
                <span className="whitespace-nowrap">
                  {tablet.hardestMatch.homeScore ?? "?"} —{" "}
                  {tablet.hardestMatch.awayScore ?? "?"}
                </span>
                <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                  <span className="truncate">{tablet.hardestMatch.awayTeam}</span>
                  <TeamCrest team={tablet.hardestMatch.awayTeam} size="sm" />
                </span>
              </div>
              <p className={`mt-3 ${theme.textClass}`}>
                {tablet.hardestMatch.predictionCount} tahminden yalnızca{" "}
                {tablet.hardestMatch.correctCount} tanesi doğru.
              </p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-current"
                  style={{
                    width: `${tablet.hardestMatch.successRate}%`,
                  }}
                />
              </div>
              <p className={`mt-2 text-sm font-black ${theme.mutedTextClass}`}>
                Doğru bilinme oranı %{tablet.hardestMatch.successRate}
              </p>
            </>
          ) : (
            <p className={theme.mutedTextClass}>
              Bu haftanın maçlarında yeterli tahmin verisi yok.
            </p>
          )}
        </SummaryCard>
      </div>

      <section
        className={`rounded-3xl border p-6 shadow-xl sm:p-8 ${theme.cardClass}`}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              avatar={tablet.personal.avatar}
              alt={tablet.personal.username}
              className="h-16 w-16 rounded-full"
            />
            <div>
              <p
                className={`text-sm font-bold uppercase tracking-[0.2em] ${theme.mutedTextClass}`}
              >
                Senin Haftan
              </p>
              <h2 className={`text-2xl font-black ${theme.titleClass}`}>
                {tablet.personal.username}
              </h2>
            </div>
          </div>

          <div
            className={`rounded-2xl border px-5 py-3 text-center ${theme.secondaryCardClass}`}
          >
            <p className={`text-3xl font-black ${theme.titleClass}`}>
              {tablet.personal.points}
            </p>
            <p className={`text-xs font-bold ${theme.mutedTextClass}`}>
              HAFTA PUANI
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PersonalStat
            value={`${tablet.personal.correctCount}/${tablet.matchCount}`}
            label="Doğru tahmin"
            theme={theme}
          />
          <PersonalStat
            value={
              tablet.personal.rank
                ? `${tablet.personal.rank}.`
                : "—"
            }
            label={`${tablet.personal.participantCount} kişi içinde`}
            theme={theme}
          />
          <PersonalStat
            value={`${tablet.personal.correctStreak}`}
            label="Devam eden doğru serisi"
            theme={theme}
          />
          <PersonalStat
            value={`${tablet.personal.championStreak}`}
            label="Devam eden şampiyonluk serisi"
            theme={theme}
          />
        </div>

        {tablet.personal.championBonus > 0 && (
          <div
            className={`mt-4 rounded-2xl border p-4 font-bold ${theme.secondaryCardClass} ${theme.textClass}`}
          >
            Haftanın zirvesi için 1 bonus puan bu özete eklendi.
          </div>
        )}
      </section>

      <section
        className={`rounded-3xl border p-6 shadow-xl sm:p-8 ${theme.cardClass}`}
      >
        <div className="flex items-center gap-3">
          <HittiteIcon name="shield" size="lg" />
          <div>
            <p
              className={`text-sm font-bold uppercase tracking-[0.2em] ${theme.mutedTextClass}`}
            >
              Haftanın Ganimeti
            </p>
            <h2 className={`text-2xl font-black ${theme.titleClass}`}>
              Kazanılan Rozetler
            </h2>
          </div>
        </div>

        {personalBadges.length === 0 ? (
          <p className={`mt-5 ${theme.mutedTextClass}`}>
            Bu hafta yeni rozet açılmadı. Serilerini sürdür; tablet seni
            izliyor.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {personalBadges.map((badge) => (
              <div
                key={badge.id}
                className={`flex items-center gap-4 rounded-2xl border p-4 ${theme.secondaryCardClass}`}
              >
                <BadgeArtwork badge={badge} size="md" />
                <div>
                  <p className={`font-black ${theme.textClass}`}>
                    {badge.name}
                  </p>
                  <p className={`mt-1 text-sm ${theme.mutedTextClass}`}>
                    {badge.shortDescription}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  eyebrow,
  icon,
  theme,
  children,
}: {
  eyebrow: string;
  icon: "chart" | "target";
  theme: ReturnType<typeof getThemeById>;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border p-6 shadow-xl ${theme.cardClass}`}
    >
      <div className="mb-5 flex items-center gap-3">
        <HittiteIcon name={icon} size="lg" />
        <p
          className={`text-sm font-bold uppercase tracking-[0.18em] ${theme.mutedTextClass}`}
        >
          {eyebrow}
        </p>
      </div>
      {children}
    </section>
  );
}

function PersonalStat({
  value,
  label,
  theme,
}: {
  value: string;
  label: string;
  theme: ReturnType<typeof getThemeById>;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-center ${theme.secondaryCardClass}`}
    >
      <p className={`text-2xl font-black ${theme.titleClass}`}>{value}</p>
      <p className={`mt-1 text-xs font-bold ${theme.mutedTextClass}`}>
        {label}
      </p>
    </div>
  );
}
