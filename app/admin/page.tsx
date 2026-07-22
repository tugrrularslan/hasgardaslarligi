"use client";

import { FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type MatchResult = "1" | "X" | "2";

type NotificationTarget =
  | "/"
  | "/predictions"
  | "/standings"
  | "/profile"
  | "/themes"
  | "custom";

type Match = {
  id: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: Timestamp;
  predictionDeadline: Timestamp;
  status: "scheduled" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  result: MatchResult | null;
  pointsCalculated?: boolean;
};

type ScoreInputs = Record<
  string,
  {
    home: string;
    away: string;
  }
>;

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [week, setWeek] = useState("1");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoff, setKickoff] = useState("");

  const [matches, setMatches] = useState<Match[]>([]);
  const [scoreInputs, setScoreInputs] = useState<ScoreInputs>({});

  const [savingMatch, setSavingMatch] = useState(false);
  const [savingResultId, setSavingResultId] = useState<string | null>(
    null
  );
  const [deletingMatchId, setDeletingMatchId] = useState<
    string | null
  >(null);

  const [message, setMessage] = useState("");

  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [notificationTarget, setNotificationTarget] =
    useState<NotificationTarget>("/predictions");
  const [customTargetUrl, setCustomTargetUrl] = useState("");
  const [sendingNotification, setSendingNotification] =
    useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          router.replace("/");
          return;
        }

        setUser(firebaseUser);

        try {
          const profileSnapshot = await getDoc(
            doc(db, "users", firebaseUser.uid)
          );

          const admin =
            profileSnapshot.exists() &&
            profileSnapshot.data().isAdmin === true;

          if (!admin) {
            router.replace("/");
            return;
          }

          setIsAdmin(true);
        } catch (error) {
          console.error(error);
          setMessage("Yönetici yetkisi kontrol edilemedi.");
        } finally {
          setCheckingAccess(false);
        }
      }
    );

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;

    const matchesQuery = query(
      collection(db, "matches"),
      orderBy("kickoff", "asc")
    );

    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const matchList = snapshot.docs.map((matchDocument) => ({
          id: matchDocument.id,
          ...matchDocument.data(),
        })) as Match[];

        setMatches(matchList);

        setScoreInputs((current) => {
          const next: ScoreInputs = {};

          for (const match of matchList) {
            const existing = current[match.id];

            next[match.id] = existing ?? {
              home:
                typeof match.homeScore === "number"
                  ? String(match.homeScore)
                  : "",
              away:
                typeof match.awayScore === "number"
                  ? String(match.awayScore)
                  : "",
            };
          }

          return next;
        });
      },
      (error) => {
        console.error(error);
        setMessage("Maçlar alınamadı.");
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  async function handleSendNotification(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    const title = notificationTitle.trim();
    const body = notificationBody.trim();

    const targetUrl =
      notificationTarget === "custom"
        ? customTargetUrl.trim()
        : notificationTarget;

    if (!title) {
      setMessage("Bildirim başlığını gir.");
      return;
    }

    if (!body) {
      setMessage("Bildirim mesajını gir.");
      return;
    }

    if (!targetUrl.startsWith("/")) {
      setMessage(
        "Yönlendirme adresi site içi bir sayfa olmalı ve / ile başlamalı."
      );
      return;
    }

    if (!user) {
      setMessage("Bildirim göndermek için yeniden giriş yap.");
      return;
    }

    setSendingNotification(true);

    try {
      const idToken = await user.getIdToken();

      const response = await fetch("/api/send-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title,
          body,
          targetUrl,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error || "Bildirim gönderilemedi."
        );
      }

      setNotificationTitle("");
      setNotificationBody("");
      setNotificationTarget("/predictions");
      setCustomTargetUrl("");

      setMessage(
        `Bildirim gönderildi. Başarılı: ${
          responseData.successCount ?? 0
        }, başarısız: ${responseData.failureCount ?? 0}.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Bildirim gönderilemedi."
      );
    } finally {
      setSendingNotification(false);
    }
  }

  async function handleAddMatch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    const weekNumber = Number(week);
    const kickoffDate = new Date(kickoff);

    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      setMessage("Geçerli bir hafta numarası gir.");
      return;
    }

    if (!homeTeam.trim() || !awayTeam.trim()) {
      setMessage("Ev sahibi ve deplasman takımlarını gir.");
      return;
    }

    if (
      homeTeam.trim().toLocaleLowerCase("tr-TR") ===
      awayTeam.trim().toLocaleLowerCase("tr-TR")
    ) {
      setMessage("Bir takım kendisiyle maç yapamaz.");
      return;
    }

    if (Number.isNaN(kickoffDate.getTime())) {
      setMessage("Geçerli bir maç tarihi ve saati seç.");
      return;
    }

    setSavingMatch(true);

    try {
      await addDoc(collection(db, "matches"), {
        week: weekNumber,
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        kickoff: Timestamp.fromDate(kickoffDate),

        predictionDeadline: Timestamp.fromDate(
          new Date(kickoffDate.getTime() - 5 * 60 * 1000)
        ),

        status: "scheduled",
        homeScore: null,
        awayScore: null,
        result: null,
        pointsCalculated: false,

        createdBy: user?.uid ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setHomeTeam("");
      setAwayTeam("");
      setKickoff("");

      setMessage("Maç başarıyla eklendi.");
    } catch (error) {
      console.error(error);
      setMessage(
        "Maç eklenemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingMatch(false);
    }
  }

  function handleScoreChange(
    matchId: string,
    side: "home" | "away",
    value: string
  ) {
    if (value !== "" && !/^\d+$/.test(value)) {
      return;
    }

    setScoreInputs((current) => ({
      ...current,
      [matchId]: {
        home: current[matchId]?.home ?? "",
        away: current[matchId]?.away ?? "",
        [side]: value,
      },
    }));
  }

  async function handleSaveResult(match: Match) {
    const score = scoreInputs[match.id];

    if (!score || score.home === "" || score.away === "") {
      setMessage("Ev sahibi ve deplasman skorlarını gir.");
      return;
    }

    const homeScore = Number(score.home);
    const awayScore = Number(score.away);

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      setMessage("Skorlar 0 veya daha büyük tam sayı olmalı.");
      return;
    }

    const result = calculateResult(homeScore, awayScore);

    const resultText =
      result === "1"
        ? match.homeTeam
        : result === "2"
          ? match.awayTeam
          : "Beraberlik";

    const confirmed = window.confirm(
      `${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam}\n\nMaç sonucu: ${resultText}\n\nSonucu kaydedip puanları hesaplamak istiyor musun?`
    );

    if (!confirmed) return;

    setSavingResultId(match.id);
    setMessage("");

    try {
      await updateDoc(doc(db, "matches", match.id), {
        homeScore,
        awayScore,
        result,
        status: "finished",
        pointsCalculated: false,
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const checkedPredictionCount = await calculateMatchPoints(
        match.id,
        result
      );

      await updateDoc(doc(db, "matches", match.id), {
        pointsCalculated: true,
        pointsCalculatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage(
        `${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam} sonucu kaydedildi. ${checkedPredictionCount} tahmin kontrol edildi ve puanlar otomatik hesaplandı.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Maç sonucu veya puanlar kaydedilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingResultId(null);
    }
  }

  async function calculateMatchPoints(
    matchId: string,
    result: MatchResult
  ): Promise<number> {
    const predictionsQuery = query(
      collection(db, "predictions"),
      where("matchId", "==", matchId)
    );

    const predictionSnapshot = await getDocs(predictionsQuery);

    if (!predictionSnapshot.empty) {
      const predictionBatch = writeBatch(db);

      predictionSnapshot.forEach((predictionDocument) => {
        const predictionData = predictionDocument.data();

        const isCorrect =
          predictionData.prediction === result;

        predictionBatch.update(predictionDocument.ref, {
          isCorrect,
          awardedPoints: isCorrect ? 1 : 0,
          scoredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await predictionBatch.commit();
    }

    await recalculateAllUserPoints();

    return predictionSnapshot.size;
  }

  async function recalculateAllUserPoints() {
    const usersSnapshot = await getDocs(collection(db, "users"));

    for (const userDocument of usersSnapshot.docs) {
      const userPredictionsQuery = query(
        collection(db, "predictions"),
        where("userId", "==", userDocument.id)
      );

      const userPredictionsSnapshot = await getDocs(
        userPredictionsQuery
      );

      let correctPredictions = 0;

      userPredictionsSnapshot.forEach((predictionDocument) => {
        const predictionData = predictionDocument.data();

        if (
          predictionData.isCorrect === true &&
          predictionData.awardedPoints === 1
        ) {
          correctPredictions += 1;
        }
      });

      const userData = userDocument.data();

      const weeklyWins =
        typeof userData.weeklyWins === "number"
          ? userData.weeklyWins
          : 0;

      await updateDoc(doc(db, "users", userDocument.id), {
        correctPredictions,
        totalPoints: correctPredictions + weeklyWins,
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function handleDeleteMatch(match: Match) {
    const confirmed = window.confirm(
      `${match.homeTeam} - ${match.awayTeam} maçını silmek istediğine emin misin?\n\nBu maça ait tahminler de silinecek ve kullanıcı puanları yeniden hesaplanacak.`
    );

    if (!confirmed) return;

    setDeletingMatchId(match.id);
    setMessage("");

    try {
      const predictionsQuery = query(
        collection(db, "predictions"),
        where("matchId", "==", match.id)
      );

      const predictionSnapshot = await getDocs(predictionsQuery);

      if (!predictionSnapshot.empty) {
        const deleteBatch = writeBatch(db);

        predictionSnapshot.forEach((predictionDocument) => {
          deleteBatch.delete(predictionDocument.ref);
        });

        await deleteBatch.commit();
      }

      await deleteDoc(doc(db, "matches", match.id));

      await recalculateAllUserPoints();

      setMessage(
        `${match.homeTeam} - ${match.awayTeam} maçı ve bu maça ait tahminler silindi.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Maç silinemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setDeletingMatchId(null);
    }
  }

  if (checkingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Yönetici yetkisi kontrol ediliyor...
      </main>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-yellow-500">
              Has Gardaşlar Ligi
            </p>

            <h1 className="mt-1 text-3xl font-black">
              👑 Admin Paneli
            </h1>

            <p className="mt-2 text-zinc-400">
              Maçları ve sonuçları buradan yönetebilirsin.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-300 transition hover:border-yellow-500 hover:text-yellow-400"
          >
            Ana Sayfaya Dön
          </button>
        </header>

        {message && (
          <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
            {message}
          </div>
        )}

        <section className="mb-8 rounded-3xl border border-blue-500/30 bg-zinc-950 p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-400">
              Bildirim Merkezi
            </p>

            <h2 className="text-2xl font-black">
              Herkese Manuel Bildirim Gönder
            </h2>

            <p className="text-sm text-zinc-400">
              Başlık, mesaj ve bildirime dokunulduğunda açılacak sayfayı seç.
            </p>
          </div>

          <form
            onSubmit={handleSendNotification}
            className="mt-6 grid gap-5 lg:grid-cols-2"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Bildirim başlığı
              </label>

              <input
                type="text"
                maxLength={60}
                value={notificationTitle}
                onChange={(event) =>
                  setNotificationTitle(event.target.value)
                }
                placeholder="Örneğin: Puan durumu güncellendi"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-blue-500"
              />

              <p className="mt-1 text-right text-xs text-zinc-500">
                {notificationTitle.length}/60
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Açılacak sayfa
              </label>

              <select
                value={notificationTarget}
                onChange={(event) =>
                  setNotificationTarget(
                    event.target.value as NotificationTarget
                  )
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-blue-500"
              >
                <option value="/">Ana Sayfa</option>
                <option value="/predictions">Tahminler</option>
                <option value="/standings">Puan Durumu</option>
                <option value="/profile">Profil</option>
                <option value="/themes">Tema Mağazası</option>
                <option value="custom">Özel site içi bağlantı</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Bildirim mesajı
              </label>

              <textarea
                maxLength={180}
                rows={4}
                value={notificationBody}
                onChange={(event) =>
                  setNotificationBody(event.target.value)
                }
                placeholder="Kullanıcılara gönderilecek mesajı yaz."
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-blue-500"
              />

              <p className="mt-1 text-right text-xs text-zinc-500">
                {notificationBody.length}/180
              </p>
            </div>

            {notificationTarget === "custom" && (
              <div className="lg:col-span-2">
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Özel site içi bağlantı
                </label>

                <input
                  type="text"
                  value={customTargetUrl}
                  onChange={(event) =>
                    setCustomTargetUrl(event.target.value)
                  }
                  placeholder="/ornek-sayfa"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-blue-500"
                />

                <p className="mt-2 text-xs text-zinc-500">
                  Güvenlik için bağlantı / işaretiyle başlamalıdır.
                </p>
              </div>
            )}

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={sendingNotification}
                className="w-full rounded-xl bg-blue-500 px-5 py-3 font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingNotification
                  ? "Bildirim isteği oluşturuluyor..."
                  : "Herkese Bildirim Gönder"}
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="h-fit rounded-3xl border border-yellow-500/30 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-yellow-400">
              Yeni Maç Ekle
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Tahminler maç saatinden 5 dakika önce otomatik
              kapanır.
            </p>

            <form
              onSubmit={handleAddMatch}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Hafta
                </label>

                <input
                  type="number"
                  min="1"
                  value={week}
                  onChange={(event) =>
                    setWeek(event.target.value)
                  }
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Ev sahibi
                </label>

                <input
                  type="text"
                  value={homeTeam}
                  onChange={(event) =>
                    setHomeTeam(event.target.value)
                  }
                  required
                  placeholder="Galatasaray"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Deplasman
                </label>

                <input
                  type="text"
                  value={awayTeam}
                  onChange={(event) =>
                    setAwayTeam(event.target.value)
                  }
                  required
                  placeholder="Fenerbahçe"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Maç tarihi ve saati
                </label>

                <input
                  type="datetime-local"
                  value={kickoff}
                  onChange={(event) =>
                    setKickoff(event.target.value)
                  }
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingMatch}
                className="w-full rounded-xl bg-yellow-500 px-4 py-3 font-black text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingMatch ? "Ekleniyor..." : "Maçı Ekle"}
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-6">
              <h2 className="text-xl font-black">
                Maçlar ve Sonuçlar
              </h2>

              <p className="mt-1 text-sm text-zinc-400">
                Toplam {matches.length} maç
              </p>
            </div>

            {matches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
                Henüz maç eklenmedi.
              </div>
            ) : (
              <div className="space-y-5">
                {matches.map((match) => {
                  const kickoffDate = match.kickoff.toDate();

                  const score = scoreInputs[match.id] ?? {
                    home: "",
                    away: "",
                  };

                  const savingThisResult =
                    savingResultId === match.id;

                  const deletingThisMatch =
                    deletingMatchId === match.id;

                  return (
                    <article
                      key={match.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
                    >
                      <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-400">
                                {match.week}. Hafta
                              </span>

                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  match.status === "finished"
                                    ? "bg-green-500/10 text-green-400"
                                    : "bg-blue-500/10 text-blue-400"
                                }`}
                              >
                                {match.status === "finished"
                                  ? "Tamamlandı"
                                  : "Planlandı"}
                              </span>

                              {match.pointsCalculated && (
                                <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-400">
                                  Puanlar hesaplandı
                                </span>
                              )}

                              <span className="text-xs text-zinc-500">
                                {kickoffDate.toLocaleDateString(
                                  "tr-TR"
                                )}{" "}
                                •{" "}
                                {kickoffDate.toLocaleTimeString(
                                  "tr-TR",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </span>
                            </div>

                            <div className="text-lg font-black">
                              {match.homeTeam}

                              {match.status === "finished" ? (
                                <span className="mx-3 text-yellow-400">
                                  {match.homeScore} -{" "}
                                  {match.awayScore}
                                </span>
                              ) : (
                                <span className="mx-3 text-zinc-600">
                                  —
                                </span>
                              )}

                              {match.awayTeam}
                            </div>

                            {match.result && (
                              <p className="mt-2 text-sm text-green-400">
                                Maç sonucu:{" "}
                                {getResultDescription(
                                  match.result,
                                  match.homeTeam,
                                  match.awayTeam
                                )}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteMatch(match)
                            }
                            disabled={
                              deletingThisMatch ||
                              savingThisResult
                            }
                            className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-bold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingThisMatch
                              ? "Siliniyor..."
                              : "Maçı Sil"}
                          </button>
                        </div>

                        <div className="border-t border-zinc-800 pt-4">
                          <p className="mb-1 text-sm font-bold text-zinc-300">
                            Maç sonucunu gir
                          </p>

                          <p className="mb-4 text-xs text-zinc-500">
                            Sonucu kaydettiğinde kullanıcı puanları
                            otomatik hesaplanır.
                          </p>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex flex-1 items-center gap-3">
                              <div className="flex-1">
                                <label className="mb-1 block truncate text-xs text-zinc-500">
                                  {match.homeTeam}
                                </label>

                                <input
                                  type="number"
                                  min="0"
                                  value={score.home}
                                  onChange={(event) =>
                                    handleScoreChange(
                                      match.id,
                                      "home",
                                      event.target.value
                                    )
                                  }
                                  disabled={
                                    savingThisResult ||
                                    deletingThisMatch
                                  }
                                  className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-center text-lg font-black outline-none focus:border-yellow-500 disabled:opacity-50"
                                />
                              </div>

                              <span className="mb-3 font-black text-zinc-500">
                                -
                              </span>

                              <div className="flex-1">
                                <label className="mb-1 block truncate text-xs text-zinc-500">
                                  {match.awayTeam}
                                </label>

                                <input
                                  type="number"
                                  min="0"
                                  value={score.away}
                                  onChange={(event) =>
                                    handleScoreChange(
                                      match.id,
                                      "away",
                                      event.target.value
                                    )
                                  }
                                  disabled={
                                    savingThisResult ||
                                    deletingThisMatch
                                  }
                                  className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-center text-lg font-black outline-none focus:border-yellow-500 disabled:opacity-50"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleSaveResult(match)
                              }
                              disabled={
                                savingThisResult ||
                                deletingThisMatch ||
                                score.home === "" ||
                                score.away === ""
                              }
                              className="rounded-xl bg-green-500 px-5 py-3 font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingThisResult
                                ? "Sonuç ve puanlar kaydediliyor..."
                                : match.status === "finished"
                                  ? "Sonucu Güncelle"
                                  : "Sonucu Kaydet"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function calculateResult(
  homeScore: number,
  awayScore: number
): MatchResult {
  if (homeScore > awayScore) {
    return "1";
  }

  if (homeScore < awayScore) {
    return "2";
  }

  return "X";
}

function getResultDescription(
  result: MatchResult,
  homeTeam: string,
  awayTeam: string
): string {
  if (result === "1") {
    return `1 — ${homeTeam} kazandı`;
  }

  if (result === "2") {
    return `2 — ${awayTeam} kazandı`;
  }

  return "X — Beraberlik";
}