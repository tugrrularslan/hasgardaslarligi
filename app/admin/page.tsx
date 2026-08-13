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
import CollapsiblePanel from "@/components/CollapsiblePanel";
import HittiteIcon from "@/components/HittiteIcon";
import KahinAdminPanel from "@/components/KahinAdminPanel";
import SeasonLabel from "@/components/SeasonLabel";
import TeamCrest from "@/components/TeamCrest";
import { DEFAULT_SEASON_ID, DEFAULT_SEASON_NAME } from "@/lib/season";
import { getSeasonResetConfirmation } from "@/lib/admin-reset";
import { resolveKahinTeamName } from "@/lib/kahin";

type MatchResult = "1" | "X" | "2";

type GoalEvent = {
  team: string;
  scorer: string;
  assister?: string | null;
};

type GoalEventInput = {
  side: "home" | "away";
  scorer: string;
  assister: string;
};

type NotificationTarget =
  | "/"
  | "/games"
  | "/league-table"
  | "/rankings"
  | "/predictions"
  | "/standings"
  | "/statistics"
  | "/games/league-prediction"
  | "/games/league-prediction/tablet"
  | "/games/league-prediction/rules"
  | "/games/kahin"
  | "/games/kahin/predictions"
  | "/games/kahin/standings"
  | "/games/kahin/rules"
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
  goalEvents?: GoalEvent[];
  pointsCalculated?: boolean;
};

type ScoreInputs = Record<
  string,
  {
    home: string;
    away: string;
  }
>;

type GoalEventInputs = Record<string, GoalEventInput[]>;

type AdminWeekFilter = number | "all" | null;
type AdminMatchStatusFilter = "all" | "scheduled" | "finished";

type LeaguePlayer = {
  name: string;
  team: string;
};

type ImportedMatchResult = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  goalEvents: GoalEventInput[];
};
type DeletableUser = {
  uid: string;
  username: string;
};

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
  const [goalEventInputs, setGoalEventInputs] = useState<GoalEventInputs>({});
  const [leaguePlayers, setLeaguePlayers] = useState<LeaguePlayer[]>([]);
  const [adminWeekFilter, setAdminWeekFilter] =
    useState<AdminWeekFilter>(null);
  const [adminMatchStatusFilter, setAdminMatchStatusFilter] =
    useState<AdminMatchStatusFilter>("all");

  const [savingMatch, setSavingMatch] = useState(false);
  const [publishingWeek, setPublishingWeek] = useState(false);
  const [declaringChampion, setDeclaringChampion] = useState(false);
  const [savingResultId, setSavingResultId] = useState<string | null>(
    null
  );
  const [syncingResults, setSyncingResults] = useState(false);
  const [updatingPlayers, setUpdatingPlayers] = useState(false);
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
  const [showResetConfirmation, setShowResetConfirmation] =
    useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resettingSeason, setResettingSeason] = useState(false);
  const [showUserDeletion, setShowUserDeletion] = useState(false);
  const [deletableUsers, setDeletableUsers] = useState<DeletableUser[]>([]);
  const [loadingDeletableUsers, setLoadingDeletableUsers] = useState(false);
  const [selectedUserToDelete, setSelectedUserToDelete] = useState("");
  const [deleteUserConfirmation, setDeleteUserConfirmation] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);

  const resetConfirmationText = getSeasonResetConfirmation(
    seasonId.trim() || DEFAULT_SEASON_ID
  );
  const activeSeasonId = seasonId.trim() || DEFAULT_SEASON_ID;
  const activeSeasonMatches = matches.filter(
    (match) =>
      match.seasonId === activeSeasonId ||
      (!match.seasonId && activeSeasonId === DEFAULT_SEASON_ID),
  );
  const adminWeekNumbers = getAdminWeekNumbers(activeSeasonMatches);
  const suggestedAdminWeek =
    activeSeasonMatches.find((match) => match.status === "scheduled")?.week ??
    adminWeekNumbers.at(-1) ??
    null;
  const activeAdminWeek =
    adminWeekFilter === "all" ||
    (typeof adminWeekFilter === "number" &&
      adminWeekNumbers.includes(adminWeekFilter))
      ? adminWeekFilter
      : suggestedAdminWeek;
  const filteredAdminMatches = activeSeasonMatches.filter(
    (match) =>
      (activeAdminWeek === "all" || match.week === activeAdminWeek) &&
      (adminMatchStatusFilter === "all" ||
        match.status === adminMatchStatusFilter),
  );

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

        setGoalEventInputs((current) => {
          const next: GoalEventInputs = {};

          for (const match of matchList) {
            const existing = current[match.id];
            const loadedEvents = sanitizeGoalEvents(match.goalEvents, match);

            next[match.id] = reconcileGoalEventInputs(
              existing ?? loadedEvents,
              typeof match.homeScore === "number" ? match.homeScore : 0,
              typeof match.awayScore === "number" ? match.awayScore : 0,
            );
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

    void handleLoadLeaguePlayers();
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

  async function handleResetSeason() {
    if (!user) {
      setMessage("Sezonu sıfırlamak için yeniden giriş yap.");
      return;
    }

    if (resetConfirmation !== resetConfirmationText) {
      setMessage("Onay metni eksiksiz olarak eşleşmiyor.");
      return;
    }

    setResettingSeason(true);
    setMessage("");

    try {
      const idToken = await user.getIdToken();

      const response = await fetch("/api/admin/reset-season", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          confirmation: resetConfirmation,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error || "Aktif sezon sıfırlanamadı."
        );
      }

      const deleted = responseData.deleted ?? {};
      const taskCleanupNote =
        (responseData.taskCleanupWarnings ?? 0) > 0
          ? " Bazı eski bildirim görevleri yetki nedeniyle kaldırılamadı; maç kayıtları silindiği için bu görevler çalıştığında bildirim göndermeden otomatik olarak atlanacak."
          : "";

      setMessage(
        `${responseData.message} ` +
          `${deleted.matches ?? 0} maç, ` +
          `${deleted.predictions ?? 0} tahmin ve ` +
          `${deleted.weeklyChampions ?? 0} haftalık şampiyon kaydı temizlendi. ` +
          `${deleted.matchMessages ?? 0} maç sohbeti mesajı silindi. ` +
          `${responseData.resetUsers ?? 0} kullanıcının puan ve rozetleri sıfırlandı.` +
          taskCleanupNote
      );
      setResetConfirmation("");
      setShowResetConfirmation(false);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Aktif sezon sıfırlanamadı."
      );
    } finally {
      setResettingSeason(false);
    }
  }

  async function loadDeletableUsers() {
    if (!user) return;

    setLoadingDeletableUsers(true);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/delete-user", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const responseData = (await response.json()) as {
        success?: boolean;
        error?: string;
        users?: DeletableUser[];
      };

      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || "Kullanıcı listesi alınamadı.");
      }

      setDeletableUsers(responseData.users ?? []);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Kullanıcı listesi alınamadı."
      );
      setShowUserDeletion(false);
    } finally {
      setLoadingDeletableUsers(false);
    }
  }

  async function handleDeleteUser() {
    if (!user) {
      setMessage("Kullanıcı silmek için yeniden giriş yap.");
      return;
    }

    const selectedProfile = deletableUsers.find(
      (profile) => profile.uid === selectedUserToDelete
    );

    if (!selectedProfile) {
      setMessage("Silinecek kullanıcıyı seç.");
      return;
    }

    const expectedConfirmation = `HESABI SİL: ${selectedProfile.username}`;

    if (deleteUserConfirmation !== expectedConfirmation) {
      setMessage("Onay metni seçilen kullanıcıyla eşleşmiyor.");
      return;
    }

    const confirmed = window.confirm(
      `${selectedProfile.username} kullanıcısının hesabı ve verileri kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musun?`
    );

    if (!confirmed) return;

    setDeletingUser(true);
    setMessage("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId: selectedProfile.uid,
          confirmation: deleteUserConfirmation,
        }),
      });
      const responseData = (await response.json()) as {
        success?: boolean;
        error?: string;
        username?: string;
        deleted?: {
          predictions?: number;
          matchMessages?: number;
        };
      };

      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || "Kullanıcı silinemedi.");
      }

      setMessage(
        `${responseData.username ?? selectedProfile.username} hesabı kalıcı olarak silindi. ` +
          `${responseData.deleted?.predictions ?? 0} tahmin ve ` +
          `${responseData.deleted?.matchMessages ?? 0} sohbet mesajı temizlendi.`
      );
      setDeletableUsers((current) =>
        current.filter((profile) => profile.uid !== selectedProfile.uid)
      );
      setSelectedUserToDelete("");
      setDeleteUserConfirmation("");
      setShowUserDeletion(false);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? error.message : "Kullanıcı silinemedi."
      );
    } finally {
      setDeletingUser(false);
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

  async function handleFetchMatchResults() {
    if (!user) {
      setMessage("Sonuçları getirmek için yeniden giriş yap.");
      return;
    }

    setSyncingResults(true);
    setMessage("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/fetch-match-results", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        checkedMatchCount?: number;
        results?: ImportedMatchResult[];
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Otomatik sonuçlar alınamadı.");
      }

      const results = Array.isArray(data.results) ? data.results : [];

      if (results.length === 0) {
        setMessage(
          `${data.checkedMatchCount ?? 0} planlanmış maç kontrol edildi; tamamlanmış sonuç bulunamadı.`,
        );
        return;
      }

      setScoreInputs((current) => {
        const next = { ...current };

        for (const result of results) {
          next[result.matchId] = {
            home: String(result.homeScore),
            away: String(result.awayScore),
          };
        }

        return next;
      });

      setGoalEventInputs((current) => {
        const next = { ...current };

        for (const result of results) {
          next[result.matchId] = reconcileGoalEventInputs(
            result.goalEvents,
            result.homeScore,
            result.awayScore,
          );
        }

        return next;
      });

      setMessage(
        `${results.length} maçın skoru ve golcüleri otomatik getirildi. Asistleri tamamlayıp sonucu kaydet.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Otomatik sonuçlar alınamadı.",
      );
    } finally {
      setSyncingResults(false);
    }
  }

  async function handleLoadLeaguePlayers(forceRefresh = false) {
    setUpdatingPlayers(true);

    try {
      const response = await fetch(
        `/api/kahin/players${forceRefresh ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        success?: boolean;
        players?: LeaguePlayer[];
        error?: string;
      };

      if (!response.ok || !data.success || !Array.isArray(data.players)) {
        throw new Error(data.error ?? "Oyuncu listesi alınamadı.");
      }

      setLeaguePlayers(data.players);
      setMessage(`${data.players.length} oyuncu güncel kadrolardan hazırlandı.`);
    } catch (error) {
      console.error(error);
      setMessage("Oyuncu listesi şu anda güncellenemedi. Lütfen tekrar dene.");
    } finally {
      setUpdatingPlayers(false);
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
  .map(
    (matchDocument) =>
      ({
        id: matchDocument.id,
        ...matchDocument.data(),
      }) as Match
  )
  .filter(
    (match) =>
      match.seasonId === activeSeasonId ||
      (!match.seasonId && activeSeasonId === DEFAULT_SEASON_ID)
  );

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

    const nextScore = {
      home: scoreInputs[matchId]?.home ?? "",
      away: scoreInputs[matchId]?.away ?? "",
      [side]: value,
    };

    setScoreInputs((current) => ({
      ...current,
      [matchId]: nextScore,
    }));

    setGoalEventInputs((current) => ({
      ...current,
      [matchId]: reconcileGoalEventInputs(
        current[matchId] ?? [],
        scoreValue(nextScore.home),
        scoreValue(nextScore.away),
      ),
    }));
  }

  function handleGoalEventChange(
    matchId: string,
    index: number,
    field: "scorer" | "assister",
    value: string,
  ) {
    setGoalEventInputs((current) => {
      const events = current[matchId] ?? [];

      return {
        ...current,
        [matchId]: events.map((event, eventIndex) =>
          eventIndex === index ? { ...event, [field]: value } : event,
        ),
      };
    });
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

    const goalEvents = goalEventInputs[match.id] ?? [];
    const expectedGoalCount = homeScore + awayScore;

    if (
      goalEvents.length !== expectedGoalCount ||
      goalEvents.some(
        (event) => !event.scorer.trim() || !event.assister.trim(),
      )
    ) {
      setMessage(
        "Skora karşılık gelen her gol için golü atan ve asist yapan oyuncuyu gir.",
      );
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
        goalEvents: goalEvents.map((event) => ({
          team: event.side === "home" ? match.homeTeam : match.awayTeam,
          scorer: event.scorer.trim(),
          assister: event.assister.trim(),
        })),
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
      let tabletNotificationMessage = "";

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

        try {
          const tabletNotificationResponse = await fetch(
            "/api/admin/publish-weekly-tablet",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                week: match.week,
              }),
            }
          );
          const tabletNotificationData =
            await tabletNotificationResponse.json();

          if (!tabletNotificationResponse.ok) {
            throw new Error(
              tabletNotificationData.error ||
                "Haftanın Tableti bildirimi gönderilemedi."
            );
          }

          if (tabletNotificationData.sent === true) {
            tabletNotificationMessage =
              (tabletNotificationData.tokenCount ?? 0) > 0
                ? ` ${match.week}. Haftanın Tableti hazırlandı ve bildirim ${
                    tabletNotificationData.successCount ?? 0
                  } cihaza ulaştı.`
                : ` ${match.week}. Haftanın Tableti hazırlandı; kayıtlı bildirim cihazı bulunamadı.`;
          }
        } catch (tabletNotificationError) {
          console.error(
            "Haftanın Tableti bildirimi gönderilemedi:",
            tabletNotificationError
          );

          tabletNotificationMessage =
            " Haftanın Tableti hazır olabilir ancak bildirimi gönderilemedi.";
        }
      }

      setMessage(
        `${match.homeTeam} ${homeScore} - ${awayScore} ${match.awayTeam} sonucu kaydedildi. ${checkedPredictionCount} tahmin kontrol edildi ve puanlar otomatik hesaplandı.${weeklyBonusMessage}${tabletNotificationMessage}`
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

            <h1 className="mt-1 flex items-center gap-3 text-3xl font-black">
              <HittiteIcon name="crown" size="lg" />
              Admin Paneli
            </h1>

            <p className="mt-2 text-zinc-400">
              Oyunları, maçları ve sonuçları buradan yönetebilirsin.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => void handleLoadLeaguePlayers(true)}
              disabled={updatingPlayers}
              className="hg-secondary hg-icon-label rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm font-black text-zinc-200 transition hover:border-amber-400/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HittiteIcon name="group" size="sm" />
              {updatingPlayers
                ? "Senkronize ediliyor..."
                : "Futbolcu Senkronizasyonu"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="hg-secondary hg-icon-label rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-300 transition hover:border-yellow-500 hover:text-yellow-400"
            >
              <HittiteIcon name="home" size="sm" />
              Ana Sayfaya Dön
            </button>
          </div>
        </header>

        {message && (
          <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
            {message}
          </div>
        )}

        <CollapsiblePanel
          title="Sezon Ayarları"
          description="Aktif sezon kimliğini ve görünen adını yönet"
          icon="sun"
          className="mb-8"
        >
        <section className="rounded-3xl border border-emerald-500/30 bg-zinc-950 p-6">
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
              className="hg-primary md:col-span-2 rounded-xl bg-emerald-500 px-5 py-3 font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSeason ? "Sezon Kaydediliyor..." : "Aktif Sezonu Kaydet"}
            </button>
          </form>
        </section>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Bildirim Araçları"
          description="Tüm oyunculara site içi bildirim gönder"
          icon="record"
          className="mb-8"
        >
        <section className="rounded-3xl border border-blue-500/30 bg-zinc-950 p-6">
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
                <optgroup label="Genel">
                  <option value="/">Ana Sayfa</option>
                  <option value="/games">Oyunlar</option>
                  <option value="/league-table">Canlı Lig Puan Durumu</option>
                  <option value="/rankings">Oyun Sıralamaları</option>
                  <option value="/profile">Profil</option>
                  <option value="/themes">Tema Mağazası</option>
                </optgroup>

                <optgroup label="Gardaş 1X2">
                  <option value="/games/league-prediction">
                    Oyun Ana Sayfası
                  </option>
                  <option value="/predictions">Tahminler</option>
                  <option value="/standings">Sıralama</option>
                  <option value="/statistics">İstatistikler</option>
                  <option value="/games/league-prediction/tablet">
                    Haftanın Tableti
                  </option>
                  <option value="/games/league-prediction/rules">
                    Kurallar
                  </option>
                </optgroup>

                <optgroup label="Kahin">
                  <option value="/games/kahin">Oyun Ana Sayfası</option>
                  <option value="/games/kahin/predictions">
                    Sezon Tahminleri
                  </option>
                  <option value="/games/kahin/standings">Sıralama</option>
                  <option value="/games/kahin/rules">Kurallar</option>
                </optgroup>

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
                className="hg-primary w-full rounded-xl bg-blue-500 px-5 py-3 font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingNotification
                  ? "Bildirim isteği oluşturuluyor..."
                  : "Herkese Bildirim Gönder"}
              </button>
            </div>
          </form>
        </section>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Gardaş 1X2 Maç Yönetimi"
          description={`${matches.length} maç • Gardaş 1X2 maç ekleme, yayınlama ve sonuç işlemleri`}
          icon="ball"
          className="mb-8"
        >
        <section className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="h-fit rounded-3xl border border-yellow-500/30 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-yellow-400">
              Gardaş 1X2 Maç Ekle
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

                <div className="flex items-center gap-2">
                  {homeTeam.trim() && <TeamCrest team={homeTeam} size="sm" />}
                  <input
                    type="text"
                    value={homeTeam}
                    onChange={(event) =>
                      setHomeTeam(event.target.value)
                    }
                    required
                    placeholder="Galatasaray"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Deplasman
                </label>

                <div className="flex items-center gap-2">
                  {awayTeam.trim() && <TeamCrest team={awayTeam} size="sm" />}
                  <input
                    type="text"
                    value={awayTeam}
                    onChange={(event) =>
                      setAwayTeam(event.target.value)
                    }
                    required
                    placeholder="Fenerbahçe"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
                  />
                </div>
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
                className="hg-primary w-full rounded-xl bg-yellow-500 px-4 py-3 font-black text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="hg-primary mt-4 w-full rounded-xl bg-blue-500 px-4 py-3 font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="hg-primary mt-4 w-full rounded-xl bg-green-500 px-4 py-3 font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {declaringChampion
                  ? `${week}. Hafta Hesaplanıyor...`
                  : "Hafta Şampiyonunu Belirle"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">
                  Gardaş 1X2 Maçları ve Sonuçları
                </h2>

                <p className="mt-1 text-sm text-zinc-400">
                  Bu sezonda {activeSeasonMatches.length} maç
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  onClick={handleFetchMatchResults}
                  disabled={
                    syncingResults ||
                    savingResultId !== null ||
                    deletingMatchId !== null
                  }
                  className="hg-secondary hg-icon-label w-full rounded-xl border border-sky-400/35 px-4 py-3 text-sm font-black text-sky-200 transition hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <HittiteIcon name="clock" size="sm" />
                  {syncingResults
                    ? "Sonuçlar getiriliyor..."
                    : "Sonuçları Otomatik Getir"}
                </button>
              </div>
            </div>

            {activeSeasonMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
                Bu sezona ait maç henüz eklenmedi.
              </div>
            ) : (
              <>
                <div className="mb-6 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black text-zinc-100">Maç listesini daralt</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Sonuç gireceğin haftayı seç; geçmiş maçlar aşağıda birikmez.
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-black text-yellow-300">
                      {filteredAdminMatches.length} maç gösteriliyor
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {adminWeekNumbers.map((weekNumber) => {
                      const isActive = activeAdminWeek === weekNumber;

                      return (
                        <button
                          key={weekNumber}
                          type="button"
                          onClick={() => setAdminWeekFilter(weekNumber)}
                          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black transition ${
                            isActive
                              ? "bg-yellow-400 text-black"
                              : "border border-zinc-700 text-zinc-300 hover:bg-white/5"
                          }`}
                        >
                          {weekNumber}. Hafta
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setAdminWeekFilter("all")}
                      className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black transition ${
                        activeAdminWeek === "all"
                          ? "bg-yellow-400 text-black"
                          : "border border-zinc-700 text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      Tüm Haftalar
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      [
                        ["all", "Tüm Maçlar"],
                        ["scheduled", "Sonuç Bekleyen"],
                        ["finished", "Sonuçlanmış"],
                      ] as const
                    ).map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setAdminMatchStatusFilter(status)}
                        className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                          adminMatchStatusFilter === status
                            ? "bg-sky-400/20 text-sky-200"
                            : "border border-zinc-700 text-zinc-400 hover:bg-white/5"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredAdminMatches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
                    Bu filtrede gösterilecek maç bulunmuyor.
                  </div>
                ) : (
              <div className="space-y-5">
                {filteredAdminMatches.map((match) => {
                  const kickoffDate = match.kickoff.toDate();

                  const score = scoreInputs[match.id] ?? {
                    home: "",
                    away: "",
                  };
                  const goalEvents = goalEventInputs[match.id] ?? [];
                  const homePlayers = getPlayersForTeam(
                    leaguePlayers,
                    match.homeTeam,
                  );
                  const awayPlayers = getPlayersForTeam(
                    leaguePlayers,
                    match.awayTeam,
                  );
                  const expectedGoalCount =
                    scoreValue(score.home) + scoreValue(score.away);

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

                            <div className="flex flex-wrap items-center gap-2 text-lg font-black">
                              <span className="flex items-center gap-2">
                                <TeamCrest team={match.homeTeam} size="sm" />
                                {match.homeTeam}
                              </span>

                              {match.status === "finished" ? (
                                <span className="mx-1 text-yellow-400">
                                  {match.homeScore} -{" "}
                                  {match.awayScore}
                                </span>
                              ) : (
                                <span className="mx-1 text-zinc-600">
                                  —
                                </span>
                              )}

                              <span className="flex items-center gap-2">
                                <TeamCrest team={match.awayTeam} size="sm" />
                                {match.awayTeam}
                              </span>
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
                            className="hg-danger-outline rounded-xl border border-red-500/30 px-4 py-2 text-sm font-bold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
                              className="hg-primary rounded-xl bg-green-500 px-5 py-3 font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingThisResult
                                ? "Sonuç ve puanlar kaydediliyor..."
                                : match.status === "finished"
                                  ? "Sonucu Güncelle"
                                  : "Sonucu Kaydet"}
                            </button>
                          </div>

                          {score.home !== "" && score.away !== "" && (
                            <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="font-black text-zinc-100">
                                  Gol ve asist detayları
                                </p>
                                <span className="text-xs text-zinc-500">
                                  {expectedGoalCount} gol kaydı bekleniyor
                                </span>
                              </div>

                              <p className="mt-1 text-xs text-zinc-500">
                                Her gol için golü atan ve asist yapan oyuncu zorunludur.
                              </p>

                              {goalEvents.length > 0 ? (
                                <div className="mt-4 space-y-3">
                                  {goalEvents.map((event, index) => {
                                    const eventTeam =
                                      event.side === "home"
                                        ? match.homeTeam
                                        : match.awayTeam;
                                    const teamPlayers =
                                      event.side === "home"
                                        ? homePlayers
                                        : awayPlayers;
                                    const hasScorer = teamPlayers.some(
                                      (player) => player.name === event.scorer,
                                    );
                                    const hasAssister = teamPlayers.some(
                                      (player) => player.name === event.assister,
                                    );

                                    return (
                                      <div
                                        key={`${event.side}-${index}`}
                                        className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 sm:grid-cols-[minmax(8rem,.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
                                      >
                                        <span className="self-center truncate text-sm font-bold text-yellow-300">
                                          {eventTeam}
                                        </span>
                                        <select
                                          value={event.scorer}
                                          onChange={(inputEvent) =>
                                            handleGoalEventChange(
                                              match.id,
                                              index,
                                              "scorer",
                                              inputEvent.target.value,
                                            )
                                          }
                                          disabled={
                                            savingThisResult ||
                                            deletingThisMatch ||
                                            updatingPlayers ||
                                            teamPlayers.length === 0
                                          }
                                          className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-yellow-500 disabled:opacity-50"
                                        >
                                          <option value="">
                                            {updatingPlayers
                                              ? "Futbolcular senkronize ediliyor..."
                                              : "Golü atan oyuncuyu seç"}
                                          </option>
                                          {!hasScorer && event.scorer && (
                                            <option value={event.scorer}>
                                              {event.scorer}
                                            </option>
                                          )}
                                          {teamPlayers.map((player) => (
                                            <option
                                              key={`${player.team}-${player.name}`}
                                              value={player.name}
                                            >
                                              {player.name}
                                            </option>
                                          ))}
                                        </select>
                                        <select
                                          value={event.assister}
                                          onChange={(inputEvent) =>
                                            handleGoalEventChange(
                                              match.id,
                                              index,
                                              "assister",
                                              inputEvent.target.value,
                                            )
                                          }
                                          disabled={
                                            savingThisResult ||
                                            deletingThisMatch ||
                                            updatingPlayers ||
                                            teamPlayers.length === 0
                                          }
                                          className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-yellow-500 disabled:opacity-50"
                                        >
                                          <option value="">
                                            {updatingPlayers
                                              ? "Futbolcular senkronize ediliyor..."
                                              : "Asisti yapan oyuncuyu seç"}
                                          </option>
                                          {!hasAssister && event.assister && (
                                            <option value={event.assister}>
                                              {event.assister}
                                            </option>
                                          )}
                                          {teamPlayers.map((player) => (
                                            <option
                                              key={`${player.team}-${player.name}`}
                                              value={player.name}
                                            >
                                              {player.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mt-4 text-sm text-zinc-500">
                                  Bu skor için oyuncu bilgisi gerekmez.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
                )}
              </>
            )}
          </div>
        </section>
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Kahin Yönetimi"
          description="Sezon kehanetlerini, adayları ve sonuç puanlamasını yönet"
          icon="sun"
          className="mb-8"
        >
          {user && (
            <KahinAdminPanel
              user={user}
              seasonId={seasonId}
              seasonName={seasonName}
            />
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Tehlikeli İşlemler"
          description="Sezon verilerini veya seçtiğin kullanıcı hesabını kalıcı olarak silme alanı"
          icon="shield"
          className="mt-8"
        >
        <section className="rounded-3xl border border-red-500/40 bg-red-950/20 p-6 shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-widest text-red-400">
                Tehlikeli Bölge
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Aktif Sezon Verilerini Sıfırla
              </h2>
              <p className="mt-3 leading-7 text-zinc-300">
                Aktif sezondaki maçları, tahminleri, puanları,
                haftalık şampiyonlukları ve bütün kullanıcıların rozet
                ilerlemelerini; ayrıca Kahin tahminlerini ve puanlarını
                temizler. Kullanıcı hesapları, adları, avatarları, temaları ve
                yönetici yetkileri korunur.
              </p>
            </div>

            {!showResetConfirmation && (
              <button
                type="button"
                onClick={() => {
                  setResetConfirmation("");
                  setShowResetConfirmation(true);
                }}
                className="hg-danger-outline shrink-0 rounded-xl border border-red-500/50 px-5 py-3 font-black text-red-300 transition hover:bg-red-500/10"
              >
                Sıfırlama Ekranını Aç
              </button>
            )}
          </div>

          {showResetConfirmation && (
            <div className="mt-6 rounded-2xl border border-red-500/35 bg-black/30 p-5">
              <p className="font-black text-red-200">
                Bu işlem geri alınamaz.
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Devam etmek için aşağıdaki metni boşlukları ve büyük
                harfleriyle birlikte aynen yaz:
              </p>
              <div
                id="season-reset-required-text"
                className="season-reset-required-text mt-4"
                role="note"
                aria-label="Yazılması gereken onay metni"
              >
                <span>YAZMAN GEREKEN METİN</span>
                <strong>{resetConfirmationText}</strong>
              </div>

              <label
                htmlFor="season-reset-confirmation"
                className="mt-5 block text-sm font-bold text-zinc-200"
              >
                Onay metni
              </label>
              <input
                id="season-reset-confirmation"
                type="text"
                value={resetConfirmation}
                onChange={(event) =>
                  setResetConfirmation(event.target.value)
                }
                disabled={resettingSeason}
                autoComplete="off"
                spellCheck={false}
                placeholder={resetConfirmationText}
                aria-describedby="season-reset-required-text"
                className="mt-2 w-full rounded-xl border border-red-500/35 bg-black px-4 py-3 font-bold outline-none focus:border-red-400 disabled:opacity-50"
              />

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleResetSeason}
                  disabled={
                    resettingSeason ||
                    resetConfirmation !== resetConfirmationText
                  }
                  className="hg-danger rounded-xl bg-red-600 px-5 py-3 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {resettingSeason
                    ? "Veriler Sıfırlanıyor..."
                    : "Aktif Sezonu Kalıcı Olarak Sıfırla"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetConfirmation("");
                    setShowResetConfirmation(false);
                  }}
                  disabled={resettingSeason}
                  className="hg-secondary rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-red-500/40 bg-red-950/20 p-6 shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-widest text-red-400">
                Hesap Silme
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Kullanıcı Hesabını Kalıcı Olarak Sil
              </h2>
              <p className="mt-3 leading-7 text-zinc-300">
                Seçilen kullanıcının giriş hesabı, profili, tahminleri, cihaz
                bildirim anahtarları ve maç sohbeti mesajları kalıcı olarak
                silinir. Kendi hesabın ve diğer yönetici hesapları korunur.
              </p>
            </div>

            {!showUserDeletion && (
              <button
                type="button"
                onClick={() => {
                  setSelectedUserToDelete("");
                  setDeleteUserConfirmation("");
                  setShowUserDeletion(true);
                  void loadDeletableUsers();
                }}
                className="hg-danger-outline shrink-0 rounded-xl border border-red-500/50 px-5 py-3 font-black text-red-300 transition hover:bg-red-500/10"
              >
                Kullanıcı Silme Ekranını Aç
              </button>
            )}
          </div>

          {showUserDeletion && (
            <div className="mt-6 rounded-2xl border border-red-500/35 bg-black/30 p-5">
              <p className="font-black text-red-200">
                Bu işlem geri alınamaz.
              </p>

              {loadingDeletableUsers ? (
                <p className="mt-3 text-sm text-zinc-300">
                  Kullanıcılar yükleniyor...
                </p>
              ) : (
                <>
                  <label
                    htmlFor="delete-user-select"
                    className="mt-5 block text-sm font-bold text-zinc-200"
                  >
                    Silinecek kullanıcı
                  </label>
                  <select
                    id="delete-user-select"
                    value={selectedUserToDelete}
                    onChange={(event) => {
                      setSelectedUserToDelete(event.target.value);
                      setDeleteUserConfirmation("");
                    }}
                    disabled={deletingUser}
                    className="mt-2 w-full rounded-xl border border-red-500/35 bg-black px-4 py-3 font-bold outline-none focus:border-red-400 disabled:opacity-50"
                  >
                    <option value="">Kullanıcı seç</option>
                    {deletableUsers.map((profile) => (
                      <option key={profile.uid} value={profile.uid}>
                        {profile.username}
                      </option>
                    ))}
                  </select>

                  {selectedUserToDelete && (() => {
                    const selectedProfile = deletableUsers.find(
                      (profile) => profile.uid === selectedUserToDelete
                    );

                    if (!selectedProfile) return null;

                    const expectedConfirmation = `HESABI SİL: ${selectedProfile.username}`;

                    return (
                      <>
                        <p className="mt-5 text-sm leading-6 text-zinc-300">
                          Devam etmek için aşağıdaki metni eksiksiz yaz:
                        </p>
                        <div
                          id="delete-user-required-text"
                          className="season-reset-required-text mt-4"
                          role="note"
                          aria-label="Yazılması gereken kullanıcı silme onay metni"
                        >
                          <span>YAZMAN GEREKEN METİN</span>
                          <strong>{expectedConfirmation}</strong>
                        </div>
                        <label
                          htmlFor="delete-user-confirmation"
                          className="mt-5 block text-sm font-bold text-zinc-200"
                        >
                          Onay metni
                        </label>
                        <input
                          id="delete-user-confirmation"
                          type="text"
                          value={deleteUserConfirmation}
                          onChange={(event) =>
                            setDeleteUserConfirmation(event.target.value)
                          }
                          disabled={deletingUser}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={expectedConfirmation}
                          aria-describedby="delete-user-required-text"
                          className="mt-2 w-full rounded-xl border border-red-500/35 bg-black px-4 py-3 font-bold outline-none focus:border-red-400 disabled:opacity-50"
                        />
                      </>
                    );
                  })()}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleDeleteUser}
                      disabled={
                        deletingUser ||
                        !selectedUserToDelete ||
                        !deleteUserConfirmation
                      }
                      className="hg-danger rounded-xl bg-red-600 px-5 py-3 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deletingUser
                        ? "Kullanıcı Siliniyor..."
                        : "Hesabı Kalıcı Olarak Sil"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserToDelete("");
                        setDeleteUserConfirmation("");
                        setShowUserDeletion(false);
                      }}
                      disabled={deletingUser}
                      className="hg-secondary rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                    >
                      Vazgeç
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
        </CollapsiblePanel>
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

function scoreValue(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : 0;
}

function getPlayersForTeam(
  players: LeaguePlayer[],
  team: string,
): LeaguePlayer[] {
  const normalizedTeam = normalizeTeamForRoster(team);

  return players
    .filter((player) => normalizeTeamForRoster(player.team) === normalizedTeam)
    .sort((first, second) => first.name.localeCompare(second.name, "tr-TR"));
}

function normalizeTeamForRoster(team: string): string {
  return resolveKahinTeamName(team)
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .replace(/\b(istanbul|fk|sk|sfk|bb)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getAdminWeekNumbers(matches: Match[]): number[] {
  return [...new Set(matches.map((match) => match.week))].sort(
    (first, second) => first - second,
  );
}

function sanitizeGoalEvents(
  value: GoalEvent[] | undefined,
  match: Pick<Match, "homeTeam" | "awayTeam">,
): GoalEventInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (event): event is GoalEvent =>
        Boolean(event) &&
        typeof event.scorer === "string" &&
        typeof event.team === "string",
    )
    .map((event) => ({
      side: event.team === match.awayTeam ? "away" : "home",
      scorer: event.scorer,
      assister: typeof event.assister === "string" ? event.assister : "",
    }));
}

function reconcileGoalEventInputs(
  currentEvents: GoalEventInput[],
  homeScore: number,
  awayScore: number,
): GoalEventInput[] {
  const createEvents = (
    side: GoalEventInput["side"],
    count: number,
  ): GoalEventInput[] => {
    const existingForSide = currentEvents.filter(
      (event) => event.side === side,
    );

    return Array.from({ length: Math.max(0, count) }, (_, index) =>
      existingForSide[index] ?? { side, scorer: "", assister: "" },
    );
  };

  return [
    ...createEvents("home", homeScore),
    ...createEvents("away", awayScore),
  ];
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
