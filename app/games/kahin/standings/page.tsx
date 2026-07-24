"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import HittiteIcon from "@/components/HittiteIcon";
import KahinNavigation from "@/components/KahinNavigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import { DEFAULT_AVATAR } from "@/lib/avatars";
import { auth, db } from "@/lib/firebase";
import {
  DEFAULT_KAHIN_SETTINGS,
  type KahinScoreBreakdown,
} from "@/lib/kahin";

type KahinStanding = {
  id: string;
  username: string;
  avatar: string;
  score: number;
  breakdown: Partial<KahinScoreBreakdown>;
  updatedAt: Date | null;
};

export default function KahinStandingsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [seasonId, setSeasonId] = useState(DEFAULT_KAHIN_SETTINGS.seasonId);
  const [seasonName, setSeasonName] = useState(
    DEFAULT_KAHIN_SETTINGS.seasonName,
  );
  const [resultsPublished, setResultsPublished] = useState(false);
  const [users, setUsers] = useState<KahinStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      setCurrentUser(user);
    });
    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeSettings = onSnapshot(
      doc(db, "settings", "kahin"),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        setSeasonId(
          typeof data.seasonId === "string" && data.seasonId.trim()
            ? data.seasonId
            : DEFAULT_KAHIN_SETTINGS.seasonId,
        );
        setSeasonName(
          typeof data.seasonName === "string" && data.seasonName.trim()
            ? data.seasonName
            : DEFAULT_KAHIN_SETTINGS.seasonName,
        );
        setResultsPublished(data.resultsPublished === true);
      },
      (error) => {
        console.error(error);
        setMessage("Kahin sezon bilgisi alınamadı.");
      },
    );

    return unsubscribeSettings;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const standings = snapshot.docs
          .map((userDocument): KahinStanding | null => {
            const data = userDocument.data();
            if (data.kahinSeasonId !== seasonId || !data.kahinPrediction) {
              return null;
            }

            const rawBreakdown =
              data.kahinBreakdown &&
              typeof data.kahinBreakdown === "object"
                ? data.kahinBreakdown
                : {};

            return {
              id: userDocument.id,
              username:
                typeof data.username === "string" && data.username.trim()
                  ? data.username
                  : "İsimsiz Gardaş",
              avatar:
                typeof data.avatar === "string" && data.avatar
                  ? data.avatar
                  : DEFAULT_AVATAR,
              score:
                typeof data.kahinScore === "number" ? data.kahinScore : 0,
              breakdown: rawBreakdown,
              updatedAt:
                data.kahinUpdatedAt?.toDate instanceof Function
                  ? data.kahinUpdatedAt.toDate()
                  : null,
            };
          })
          .filter((item): item is KahinStanding => item !== null);

        setUsers(standings);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("Kahin puan durumu alınamadı.");
        setLoading(false);
      },
    );

    return unsubscribeUsers;
  }, [currentUser, seasonId]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const exactDifference =
          (b.breakdown.exactPositions ?? 0) -
          (a.breakdown.exactPositions ?? 0);
        if (exactDifference !== 0) return exactDifference;
        const specialDifference =
          (b.breakdown.correctSpecials ?? 0) -
          (a.breakdown.correctSpecials ?? 0);
        if (specialDifference !== 0) return specialDifference;
        return a.username.localeCompare(b.username, "tr-TR");
      }),
    [users],
  );

  const currentStanding = sortedUsers.find(
    (standing) => standing.id === currentUser?.uid,
  );
  const currentRank = currentStanding
    ? sortedUsers.findIndex((standing) => standing.id === currentStanding.id) + 1
    : 0;

  if (loading) {
    return (
      <main className="hg-page flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <HittiteIcon name="trophy" size="xl" />
          <p className="hg-muted mt-4 font-bold">
            Kahinler sıralanıyor...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="hg-page px-3 py-6 sm:px-5">
      <div className="mx-auto max-w-6xl">
        <KahinNavigation />

        <header className="hg-card rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="hg-title text-sm font-black uppercase tracking-widest">
                {seasonName}
              </p>
              <h1 className="hg-title mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl">
                <HittiteIcon name="trophy" size="lg" />
                Kahinler Meclisi
              </h1>
              <p className="hg-muted mt-3">
                Puan eşitliğinde tam sıra isabeti, ardından özel tahmin sayısı
                üstünlük sağlar.
              </p>
            </div>

            <span className="hg-badge rounded-full px-4 py-2 text-sm font-black">
              {resultsPublished ? "Sonuçlar hesaplandı" : "Kehanetler mühürleniyor"}
            </span>
          </div>
        </header>

        {message && (
          <div className="hg-card-soft mt-5 rounded-2xl border p-4">{message}</div>
        )}

        {currentStanding && (
          <section className="hg-card-soft mt-6 grid gap-4 rounded-3xl border p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                avatar={currentStanding.avatar}
                alt={`${currentStanding.username} avatarı`}
                className="h-16 w-16 rounded-2xl"
              />
              <div>
                <p className="hg-muted text-sm font-bold">Senin kehanetin</p>
                <p className="hg-title text-2xl font-black">
                  {currentRank}. sıra
                </p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="hg-title text-3xl font-black">
                {currentStanding.score} puan
              </p>
              <p className="hg-muted text-sm">
                {currentStanding.breakdown.exactPositions ?? 0} tam sıra •{" "}
                {currentStanding.breakdown.correctSpecials ?? 0} özel isabet
              </p>
            </div>
          </section>
        )}

        {sortedUsers.length === 0 ? (
          <section className="hg-card mt-6 rounded-3xl p-12 text-center">
            <HittiteIcon name="sun" size="xl" />
            <h2 className="hg-title mt-4 text-2xl font-black">
              Henüz mühürlenmiş kehanet yok
            </h2>
            <p className="hg-muted mt-2">
              İlk kehanet kaydedildiğinde puan durumu burada başlayacak.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-3">
              {sortedUsers.slice(0, 3).map((standing, index) => (
                <PodiumCard
                  key={standing.id}
                  standing={standing}
                  position={index + 1}
                />
              ))}
            </section>

            <section className="hg-card mt-6 overflow-hidden rounded-3xl">
              <div className="border-b p-5">
                <h2 className="hg-title text-xl font-black">
                  Bütün Kahinler
                </h2>
                <p className="hg-muted mt-1 text-sm">
                  Toplam {sortedUsers.length} mühürlü tahmin
                </p>
              </div>

              <div className="divide-y">
                {sortedUsers.map((standing, index) => (
                  <div
                    key={standing.id}
                    className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 p-4 sm:grid-cols-[3rem_1fr_7rem_7rem_7rem]"
                  >
                    <span className="hg-title text-center text-lg font-black">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-3">
                      <ProfileAvatar
                        avatar={standing.avatar}
                        alt=""
                        className="h-11 w-11 rounded-xl"
                      />
                      <span className="truncate font-black">
                        {standing.username}
                      </span>
                    </div>
                    <span className="hg-title text-right text-xl font-black sm:order-5">
                      {standing.score}
                    </span>
                    <span className="hg-muted hidden text-center text-sm sm:block">
                      {standing.breakdown.exactPositions ?? 0} tam sıra
                    </span>
                    <span className="hg-muted hidden text-center text-sm sm:block">
                      {standing.breakdown.correctSpecials ?? 0} özel
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PodiumCard({
  standing,
  position,
}: {
  standing: KahinStanding;
  position: number;
}) {
  const icon = position === 1 ? "crown" : position === 2 ? "sun" : "shield";
  const label = position === 1 ? "Başkahin" : position === 2 ? "İkinci" : "Üçüncü";

  return (
    <article
      className={`hg-card rounded-3xl p-5 text-center ${
        position === 1 ? "md:-translate-y-2" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <HittiteIcon name={icon} size="md" />
        <span className="hg-badge rounded-full px-3 py-1 text-xs font-black">
          {label}
        </span>
      </div>
      <ProfileAvatar
        avatar={standing.avatar}
        alt={`${standing.username} avatarı`}
        className="mx-auto mt-5 h-24 w-24 rounded-full"
      />
      <h2 className="hg-title mt-4 truncate text-xl font-black">
        {standing.username}
      </h2>
      <p className="hg-title mt-2 text-4xl font-black">{standing.score}</p>
      <p className="hg-muted text-xs font-bold uppercase tracking-widest">
        puan
      </p>
      <div className="hg-card-soft mt-4 grid grid-cols-2 gap-2 rounded-2xl border p-3 text-sm">
        <span>{standing.breakdown.exactPositions ?? 0} tam sıra</span>
        <span>{standing.breakdown.correctSpecials ?? 0} özel</span>
      </div>
    </article>
  );
}
