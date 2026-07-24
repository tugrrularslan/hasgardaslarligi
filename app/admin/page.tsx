"use client";

import { FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";

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
  seasonId?: string;
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
  const [publishingWeek, setPublishingWeek] = useState(false);
  const [declaringChampion, setDeclaringChampion] = useState(false);
  const [savingResultId, setSavingResultId] = useState<string | null>(
    null
  );
  const [deletingMatchId, setDeletingMatchId] = useState<
    string | null
  >(null);

  const [message, setMessage] = useState("");

  const [seasonId, setSeasonId] = useState(DEFAULT_SEASON_ID);
  const [seasonName, setSeasonName] = useState(DEFAULT_SEASON_NAME);
  const [savingSeason, setSavingSeason] = useState(false);

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

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = onSnapshot(
      doc(db, "settings", "currentSeason"),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setSeasonId(
          typeof data.seasonId === "string" && data.seasonId.trim()
            ? data.seasonId.trim()
            : DEFAULT_SEASON_ID
        );

        setSeasonName(
          typeof data.name === "string" && data.name.trim()
            ? data.name.trim()
            : DEFAULT_SEASON_NAME
        );
      },
      (error) => {
        console.error(error);
        setMessage("Sezon bilgisi alınamadı.");
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  async function handleSaveSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const cleanSeasonId = seasonId.trim();
    const cleanSeasonName = seasonName.trim();

    if (!cleanSeasonId || !cleanSeasonName) {
      setMessage("Sezon kimliği ve sezon adı boş bırakılamaz.");
      return;
    }

    if (!user) {
      setMessage("Sezonu kaydetmek için yeniden giriş yap.");
      return;
    }

    setSavingSeason(true);

    try {
      await setDoc(
        doc(db, "settings", "currentSeason"),
        {
          seasonId: cleanSeasonId,
          name: cleanSeasonName,
          isActive: true,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage(`${cleanSeasonName} aktif sezon olarak kaydedildi.`);
    } catch (error) {
      console.error(error);
      setMessage("Sezon kaydedilemedi. Firestore kurallarını kontrol et.");
    } finally {
      setSavingSeason(false);
    }
  }

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

    if (!user) {
      setMessage("Maç eklemek için yeniden giriş yap.");
      return;
    }

    setSavingMatch(true);

    try {
      const idToken = await user.getIdToken();

      const response = await fetch("/api/admin/create-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          week: weekNumber,
          seasonId: seasonId.trim() || DEFAULT_SEASON_ID,
          homeTeam: homeTeam.trim(),
          awayTeam: awayTeam.trim(),
          kickoff: kickoffDate.toISOString(),
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error || "Maç eklenemedi."
        );
      }

      setHomeTeam("");
      setAwayTeam("");
      setKickoff("");

      setMessage(
        "Maç eklendi ve iki otomatik bildirim görevi oluşturuldu."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Maç eklenemedi."
      );
    } finally {
      setSavingMatch(false);
    }
  }

  async function handlePublishWeek() {
    setMessage("");

    const weekNumber = Number(week);

    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      setMessage("Geçerli bir hafta numarası gir.");
      return;
    }

    if (!user) {
      setMessage("Haftayı yayınlamak için yeniden giriş yap.");
      return;
    }

    const activeSeasonId = seasonId.trim() || DEFAULT_SEASON_ID;

    const weekMatches = matches.filter(
      (match) =>
        match.week === weekNumber &&
        (match.seasonId === activeSeasonId ||
          (!match.seasonId && activeSeasonId === DEFAULT_SEASON_ID))
    );

    if (weekMatches.length === 0) {
      setMessage(
        `${weekNumber}. haftayı yayınlamadan önce en az bir maç eklemelisin.`
      );
      return;
    }

    const publicationReference = doc(
      db,
      "publishedWeeks",
      `${activeSeasonId}_${weekNumber}`
    );

    try {
      const publicationSnapshot = await getDoc(
        publicationReference
      );

      if (
        publicationSnapshot.exists() &&
        publicationSnapshot.data().published === true
      ) {
        setMessage(
          `${weekNumber}. hafta daha önce yayınlanmış. Yeniden bildirim gönderilmedi.`
        );
        return;
      }

      const confirmed = window.confirm(
        `${weekNumber}. haftayı ${weekMatches.length} maçla yayınlamak ve herkese bildirim göndermek istiyor musun?`
      );

      if (!confirmed) return;

      setPublishingWeek(true);

      const idToken = await user.getIdToken();

      const response = await fetch("/api/send-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: `📅 ${weekNumber}. hafta tahminleri açıldı`,
          body: `${weekNumber}. haftanın ${weekMatches.length} maçı tahminlere açıldı. Tahminlerini maçlardan 5 dakika öncesine kadar yapabilirsin!`,
          targetUrl: "/predictions",
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Hafta bildirimi gönderilemedi."
        );
      }

      await setDoc(
        publicationReference,
        {
          week: weekNumber,
          seasonId: seasonId.trim() || DEFAULT_SEASON_ID,
          seasonName: seasonName.trim() || DEFAULT_SEASON_NAME,
          matchCount: weekMatches.length,
          published: true,
          publishedBy: user.uid,
          publishedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage(
        `${weekNumber}. hafta yayınlandı. Bildirim başarılı: ${
          responseData.successCount ?? 0
        }, başarısız: ${responseData.failureCount ?? 0}.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Hafta yayınlanamadı."
      );
    } finally {
      setPublishingWeek(false);
    }
  }


  async function handleDeclareWeeklyChampion() {
    setMessage("");

    const weekNumber = Number(week);

    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      setMessage("Geçerli bir hafta numarası gir.");
      return;
    }

    if (!user) {
      setMessage("Haftalık şampiyonu belirlemek için yeniden giriş yap.");
      return;
    }

    setDeclaringChampion(true);

    try {
      const result = await recalculateWeeklyChampionBonus(
        weekNumber,
        true,
        false
      );

      if (result.cancelled) {
        return;
      }

      let notificationMessage = "";

      if (result.winnerProfiles.length > 0 && result.changed) {
        try {
          const idToken = await user.getIdToken();

          const notificationResponse = await fetch(
            "/api/send-notification",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                title:
                  result.winnerProfiles.length === 1
                    ? `🏆 ${weekNumber}. haftanın şampiyonu`
                    : `🏆 ${weekNumber}. haftanın ortak şampiyonları`,
                body:
                  result.winnerProfiles.length === 1
                    ? `${result.winnerNames}, ${result.highestCorrectCount} doğru tahminle haftayı kazandı ve +1 bonus puan aldı!`
                    : `${result.winnerNames}, ${result.highestCorrectCount} doğru tahminle haftayı ortak kazandı. Her biri +1 bonus puan aldı!`,
                targetUrl: "/standings",
              }),
            }
          );

          const notificationData =
            await notificationResponse.json();

          if (!notificationResponse.ok) {
            throw new Error(
              notificationData.error ||
                "Şampiyon bildirimi gönderilemedi."
            );
          }

          notificationMessage = ` Bildirim başarılı: ${
            notificationData.successCount ?? 0
          }, başarısız: ${
            notificationData.failureCount ?? 0
          }.`;
        } catch (notificationError) {
          console.error(notificationError);
          notificationMessage =
            " Bonus puanlar güncellendi fakat bildirim gönderilemedi.";
        }
      }

      if (result.winnerProfiles.length === 0) {
        setMessage(
          `${weekNumber}. haftada doğru tahmini bulunan kullanıcı yok. Önceki bonus varsa geri alındı.`
        );
        return;
      }

      if (!result.changed) {
        setMessage(
          `${weekNumber}. haftanın bonusu zaten doğru kişilere verilmiş: ${result.winnerNames}. İkinci kez puan eklenmedi.`
        );
        return;
      }

      setMessage(
        `${weekNumber}. haftanın ${
          result.winnerProfiles.length === 1
            ? "şampiyonu"
            : "ortak şampiyonları"
        }: ${result.winnerNames}. Bonus puanlar güncellendi.${notificationMessage}`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Haftalık şampiyon belirlenemedi."
      );
    } finally {
      setDeclaringChampion(false);
    }
  }

  async function recalculateWeeklyChampionBonus(
    weekNumber: number,
    askForConfirmation: boolean,
    onlyIfPreviouslyAwarded: boolean
  ): Promise<{
    cancelled: boolean;
    changed: boolean;
    highestCorrectCount: number;
    winnerNames: string;
    winnerProfiles: Array<{
      id: string;
      username: string;
    }>;
  }> {
    if (!user) {
      throw new Error(
        "Haftalık şampiyonu hesaplamak için yeniden giriş yap."
      );
    }

    const activeSeasonId = seasonId.trim() || DEFAULT_SEASON_ID;

    const championReference = doc(
      db,
      "weeklyChampions",
      `${activeSeasonId}_${weekNumber}`
    );

    const championSnapshot = await getDoc(championReference);
    const previousChampionData = championSnapshot.exists()
      ? championSnapshot.data()
      : null;

    const wasPreviouslyAwarded =
      previousChampionData?.awarded === true;

    if (onlyIfPreviouslyAwarded && !wasPreviouslyAwarded) {
      return {
        cancelled: false,
        changed: false,
        highestCorrectCount: 0,
        winnerNames: "",
        winnerProfiles: [],
      };
    }

    const weekMatchesSnapshot = await getDocs(
      query(
        collection(db, "matches"),
        where("week", "==", weekNumber)
      )
    );

    if (weekMatchesSnapshot.empty) {
      throw new Error(
        `${weekNumber}. haftaya ait maç bulunamadı.`
      );
    }

    const weekMatches = weekMatchesSnapshot.docs
      .map((matchDocument) => ({
        id: matchDocument.id,
        ...matchDocument.data(),
      }))
      .filter(
        (match) =>
          match.seasonId === activeSeasonId ||
          (!match.seasonId && activeSeasonId === DEFAULT_SEASON_ID)
      ) as Match[];

    if (weekMatches.length === 0) {
      throw new Error(
        `${activeSeasonId} sezonunun ${weekNumber}. haftasına ait maç bulunamadı.`
      );
    }

    const unfinishedMatches = weekMatches.filter(
      (match) =>
        match.status !== "finished" ||
        match.pointsCalculated !== true
    );

    if (unfinishedMatches.length > 0) {
      throw new Error(
        `${weekNumber}. haftanın bütün maç sonuçlarını girip puanları hesaplamadan haftalık şampiyon belirlenemez.`
      );
    }

    const correctCounts = new Map<string, number>();

    for (const match of weekMatches) {
      const predictionsSnapshot = await getDocs(
        query(
          collection(db, "predictions"),
          where("matchId", "==", match.id)
        )
      );

      predictionsSnapshot.forEach((predictionDocument) => {
        const predictionData = predictionDocument.data();

        if (
          predictionData.isCorrect === true &&
          predictionData.awardedPoints === 1 &&
          typeof predictionData.userId === "string"
        ) {
          correctCounts.set(
            predictionData.userId,
            (correctCounts.get(predictionData.userId) ?? 0) + 1
          );
        }
      });
    }

    const highestCorrectCount =
      correctCounts.size > 0
        ? Math.max(...Array.from(correctCounts.values()))
        : 0;

    const winnerIds =
      highestCorrectCount > 0
        ? Array.from(correctCounts.entries())
            .filter(
              ([, correctCount]) =>
                correctCount === highestCorrectCount
            )
            .map(([userId]) => userId)
            .sort()
        : [];

    const previousWinnerIds =
      wasPreviouslyAwarded &&
      Array.isArray(previousChampionData?.winnerIds)
        ? previousChampionData.winnerIds
            .filter(
              (winnerId: unknown): winnerId is string =>
                typeof winnerId === "string"
            )
            .sort()
        : [];

    const changed =
      winnerIds.length !== previousWinnerIds.length ||
      winnerIds.some(
        (winnerId, index) =>
          winnerId !== previousWinnerIds[index]
      );

    const winnerProfiles = await Promise.all(
      winnerIds.map(async (winnerId) => {
        const winnerSnapshot = await getDoc(
          doc(db, "users", winnerId)
        );

        if (!winnerSnapshot.exists()) {
          throw new Error(
            `Kazanan kullanıcı profili bulunamadı: ${winnerId}`
          );
        }

        const winnerData = winnerSnapshot.data();

        const username =
          typeof winnerData.username === "string" &&
          winnerData.username.trim()
            ? winnerData.username.trim()
            : typeof winnerData.displayName === "string" &&
                winnerData.displayName.trim()
              ? winnerData.displayName.trim()
              : typeof winnerData.email === "string" &&
                  winnerData.email.trim()
                ? winnerData.email.trim()
                : "İsimsiz kullanıcı";

        return {
          id: winnerId,
          username,
        };
      })
    );

    const winnerNames = winnerProfiles
      .map((winner) => winner.username)
      .join(", ");

    if (askForConfirmation && changed) {
      const previousWinnerNames =
        Array.isArray(previousChampionData?.winnerNames)
          ? previousChampionData.winnerNames
              .filter(
                (name: unknown): name is string =>
                  typeof name === "string"
              )
              .join(", ")
          : "";

      const confirmationText =
        winnerProfiles.length > 0
          ? `${weekNumber}. haftanın en yüksek doğru sayısı: ${highestCorrectCount}\n\nYeni kazananlar: ${winnerNames}${
              previousWinnerNames
                ? `\nÖnceki kazananlar: ${previousWinnerNames}`
                : ""
            }\n\nBonusları buna göre güncellemek istiyor musun?`
          : `${weekNumber}. haftada doğru tahmin bulunamadı.${
              previousWinnerNames
                ? `\n\nÖnceki kazananların bonusu geri alınacak: ${previousWinnerNames}`
                : ""
            }\n\nDevam etmek istiyor musun?`;

      if (!window.confirm(confirmationText)) {
        return {
          cancelled: true,
          changed,
          highestCorrectCount,
          winnerNames,
          winnerProfiles,
        };
      }
    }

    if (!changed) {
      return {
        cancelled: false,
        changed: false,
        highestCorrectCount,
        winnerNames,
        winnerProfiles,
      };
    }

    const affectedUserIds = Array.from(
      new Set([...previousWinnerIds, ...winnerIds])
    );

    const affectedUsers = await Promise.all(
      affectedUserIds.map(async (affectedUserId) => {
        const affectedUserSnapshot = await getDoc(
          doc(db, "users", affectedUserId)
        );

        if (!affectedUserSnapshot.exists()) {
          throw new Error(
            `Kullanıcı profili bulunamadı: ${affectedUserId}`
          );
        }

        const affectedUserData = affectedUserSnapshot.data();

        const existingSeasonStats =
          affectedUserData.seasonStats &&
          typeof affectedUserData.seasonStats === "object"
            ? affectedUserData.seasonStats
            : {};

        const currentSeasonStats =
          existingSeasonStats[activeSeasonId] &&
          typeof existingSeasonStats[activeSeasonId] === "object"
            ? existingSeasonStats[activeSeasonId]
            : {};

        const correctPredictions =
          typeof currentSeasonStats.correctPredictions === "number"
            ? currentSeasonStats.correctPredictions
            : activeSeasonId === DEFAULT_SEASON_ID &&
                typeof affectedUserData.correctPredictions === "number"
              ? affectedUserData.correctPredictions
              : 0;

        const currentWeeklyWins =
          typeof currentSeasonStats.weeklyWins === "number"
            ? currentSeasonStats.weeklyWins
            : activeSeasonId === DEFAULT_SEASON_ID &&
                typeof affectedUserData.weeklyWins === "number"
              ? affectedUserData.weeklyWins
              : 0;

        const hadPreviousBonus =
          previousWinnerIds.includes(affectedUserId);
        const receivesNewBonus =
          winnerIds.includes(affectedUserId);

        const newWeeklyWins = Math.max(
          0,
          currentWeeklyWins -
            (hadPreviousBonus ? 1 : 0) +
            (receivesNewBonus ? 1 : 0)
        );

        return {
          id: affectedUserId,
          correctPredictions,
          newWeeklyWins,
          existingSeasonStats,
          currentSeasonStats,
        };
      })
    );

    const championBatch = writeBatch(db);

    for (const affectedUser of affectedUsers) {
      const totalPoints =
        affectedUser.correctPredictions + affectedUser.newWeeklyWins;

      championBatch.update(
        doc(db, "users", affectedUser.id),
        {
          weeklyWins: affectedUser.newWeeklyWins,
          correctPredictions: affectedUser.correctPredictions,
          totalPoints,
          seasonStats: {
            ...affectedUser.existingSeasonStats,
            [activeSeasonId]: {
              ...affectedUser.currentSeasonStats,
              correctPredictions: affectedUser.correctPredictions,
              weeklyWins: affectedUser.newWeeklyWins,
              totalPoints,
            },
          },
          updatedAt: serverTimestamp(),
        }
      );
    }

    championBatch.set(
      championReference,
      {
        week: weekNumber,
        seasonId: seasonId.trim() || DEFAULT_SEASON_ID,
        seasonName:
          seasonName.trim() || DEFAULT_SEASON_NAME,
        winnerIds,
        winnerNames: winnerProfiles.map(
          (winner) => winner.username
        ),
        winnerCount: winnerProfiles.length,
        highestCorrectCount,
        bonusPerWinner: winnerProfiles.length > 0 ? 1 : 0,
        awarded: winnerProfiles.length > 0,
        awardedBy: user.uid,
        awardedAt: serverTimestamp(),
        recalculatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await championBatch.commit();

    return {
      cancelled: false,
      changed: true,
      highestCorrectCount,
      winnerNames,
      winnerProfiles,
    };
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

      let weeklyBonusMessage = "";

      try {
        const weeklyBonusResult =
          await recalculateWeeklyChampionBonus(
            match.week,
            false,
            true
          );

        if (weeklyBonusResult.changed) {
          weeklyBonusMessage =
            " Haftalık şampiyon bonusu da yeni sonuca göre otomatik güncellendi.";
        }
      } catch (weeklyBonusError) {
        console.error(
          "Haftalık şampiyon bonusu güncellenemedi:",
          weeklyBonusError
        );

        weeklyBonusMessage =
          " Maç puanları hesaplandı ancak haftalık bonus otomatik güncellenemedi.";
      }

      const idToken = await user?.getIdToken();

      if (idToken) {
        const notificationResponse = await fetch(
          "/api/send-notification",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              title: "⚽ Maç sonucu açıklandı",
              body: `${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam} sona erdi. Puanlar güncellendi!`,
              targetUrl: "/standings",
            }),
          }
        );

        if (!notificationResponse.ok) {
          console.error(
            "Maç sonucu bildirimi gönderilemedi."
          );
        }
      }

      setMessage(
        `${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam} sonucu kaydedildi. ${checkedPredictionCount} tahmin kontrol edildi ve puanlar otomatik hesaplandı.${weeklyBonusMessage}`
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
    const activeSeasonId = seasonId.trim() || DEFAULT_SEASON_ID;

    const [usersSnapshot, matchesSnapshot] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "matches")),
    ]);

    const activeSeasonMatchIds = new Set(
      matchesSnapshot.docs
        .filter((matchDocument) => {
          const matchData = matchDocument.data();

          return (
            matchData.seasonId === activeSeasonId ||
            (!matchData.seasonId &&
              activeSeasonId === DEFAULT_SEASON_ID)
          );
        })
        .map((matchDocument) => matchDocument.id)
    );

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
          typeof predictionData.matchId === "string" &&
          activeSeasonMatchIds.has(predictionData.matchId) &&
          predictionData.isCorrect === true &&
          predictionData.awardedPoints === 1
        ) {
          correctPredictions += 1;
        }
      });

      const userData = userDocument.data();
      const existingSeasonStats =
        userData.seasonStats && typeof userData.seasonStats === "object"
          ? userData.seasonStats
          : {};

      const currentSeasonStats =
        existingSeasonStats[activeSeasonId] &&
        typeof existingSeasonStats[activeSeasonId] === "object"
          ? existingSeasonStats[activeSeasonId]
          : {};

      const weeklyWins =
        typeof currentSeasonStats.weeklyWins === "number"
          ? currentSeasonStats.weeklyWins
          : activeSeasonId === DEFAULT_SEASON_ID &&
              typeof userData.weeklyWins === "number"
            ? userData.weeklyWins
            : 0;

      const totalPoints = correctPredictions + weeklyWins;

      await updateDoc(doc(db, "users", userDocument.id), {
        correctPredictions,
        weeklyWins,
        totalPoints,
        seasonStats: {
          ...existingSeasonStats,
          [activeSeasonId]: {
            ...currentSeasonStats,
            correctPredictions,
            weeklyWins,
            totalPoints,
          },
        },
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

            <SeasonLabel className="text-yellow-300" />

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

        <section className="mb-8 rounded-3xl border border-emerald-500/30 bg-zinc-950 p-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-emerald-400">
              Aktif Sezon
            </p>

            <h2 className="mt-1 text-2xl font-black">
              {seasonName}
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Bu bilgi tüm sayfalarda görünür ve puan ya da maç sıfırlama işlemlerinden etkilenmez.
            </p>
          </div>

          <form onSubmit={handleSaveSeason} className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Sezon kimliği
              </label>
              <input
                type="text"
                value={seasonId}
                onChange={(event) => setSeasonId(event.target.value)}
                placeholder="2026-2027"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Görünecek sezon adı
              </label>
              <input
                type="text"
                value={seasonName}
                onChange={(event) => setSeasonName(event.target.value)}
                placeholder="2026-2027 Sezonu"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={savingSeason}
              className="md:col-span-2 rounded-xl bg-emerald-500 px-5 py-3 font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSeason ? "Sezon Kaydediliyor..." : "Aktif Sezonu Kaydet"}
            </button>
          </form>
        </section>

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

            <div className="mt-6 border-t border-zinc-800 pt-6">
              <h3 className="font-black text-blue-400">
                Haftayı Yayınla
              </h3>

              <p className="mt-2 text-sm text-zinc-500">
                Önce haftanın bütün maçlarını ekle. Sonra bu
                butona bir kez basarak herkese tek bildirim gönder.
              </p>

              <button
                type="button"
                onClick={handlePublishWeek}
                disabled={publishingWeek || savingMatch}
                className="mt-4 w-full rounded-xl bg-blue-500 px-4 py-3 font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishingWeek
                  ? `${week}. Hafta Yayınlanıyor...`
                  : `${week}. Haftayı Yayınla`}
              </button>
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-6">
              <h3 className="font-black text-green-400">
                Haftalık Şampiyonu Belirle
              </h3>

              <p className="mt-2 text-sm text-zinc-500">
                Haftanın bütün maç sonuçları kaydedildikten sonra
                en çok doğru tahmini yapan kullanıcıya +1 bonus
                puan verir. Eşitlikte bütün ortak kazananlar +1 alır.
              </p>

              <button
                type="button"
                onClick={handleDeclareWeeklyChampion}
                disabled={
                  declaringChampion ||
                  publishingWeek ||
                  savingMatch ||
                  savingResultId !== null
                }
                className="mt-4 w-full rounded-xl bg-green-500 px-4 py-3 font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {declaringChampion
                  ? `${week}. Hafta Hesaplanıyor...`
                  : "Hafta Şampiyonunu Belirle"}
              </button>
            </div>
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