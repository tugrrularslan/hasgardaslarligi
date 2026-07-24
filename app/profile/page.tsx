"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { getThemeById } from "@/lib/themes";
import {
  BADGES,
  BADGE_RARITY_LABELS,
  DEFAULT_BADGE_PROGRESS,
  MAX_SELECTED_BADGES,
  calculateUnlockedBadgeIds,
  getActiveTitleBadge,
  getBadgeById,
  getBadgeProgress,
  getLockedBadges,
  getSelectedBadgeDefinitions,
  getUnlockedBadges,
  mergeUnlockedBadgeIds,
  normalizeBadgeProgress,
  sanitizeBadgeIds,
  sanitizeSelectedBadges,
  type BadgeDefinition,
  type BadgeProgressData,
  type BadgeRarity,
} from "@/lib/achievements";

type ProfileData = {
  username: string;
  avatar: string;
  selectedTheme: string;
  totalPoints: number;
  correctPredictions: number;
  weeklyWins: number;
  usernameChanged: boolean;
  isAdmin: boolean;
  unlockedBadges: string[];
  selectedBadges: string[];
  activeTitle: string;
  badgeProgress: BadgeProgressData;
};

type AvatarCategory = {
  title: string;
  description: string;
  avatars: string[];
};

const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    title: "Futbol",
    description: "Sahanın yıldızları",
    avatars: ["⚽", "🥅", "🏆", "🥇", "👟", "🧤", "📣", "🏟️"],
  },
  {
    title: "Karakter",
    description: "Gardaşını temsil edecek yüzü seç",
    avatars: ["😎", "🤠", "🥷", "🧔‍♂️", "👑", "🫡", "🥸", "😈"],
  },
  {
    title: "Hayvan",
    description: "Takım ruhunu ortaya çıkar",
    avatars: ["🦁", "🐺", "🦅", "🐯", "🦊", "🐻", "🐉", "🦈"],
  },
  {
    title: "Güç ve Eğlence",
    description: "Daha iddialı ve renkli seçenekler",
    avatars: ["🔥", "⚡", "🚀", "💣", "🧿", "🗿", "👽", "💪"],
  },
];

const DEFAULT_PROFILE: ProfileData = {
  username: "İsimsiz Gardaş",
  avatar: "⚽",
  selectedTheme: "obsidyen",
  totalPoints: 0,
  correctPredictions: 0,
  weeklyWins: 0,
  usernameChanged: false,
  isAdmin: false,
  unlockedBadges: [],
  selectedBadges: [],
  activeTitle: "",
  badgeProgress: DEFAULT_BADGE_PROGRESS,
};

export default function ProfilePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [selectedAvatar, setSelectedAvatar] = useState("⚽");
  const [newUsername, setNewUsername] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingBadges, setSavingBadges] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!firebaseUser) {
        router.replace("/");
        return;
      }

      setCurrentUser(firebaseUser);

      unsubscribeProfile = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        async (snapshot) => {
          if (!snapshot.exists()) {
            setProfile(DEFAULT_PROFILE);
            setSelectedAvatar(DEFAULT_PROFILE.avatar);
            setNewUsername(DEFAULT_PROFILE.username);
            setLoading(false);
            return;
          }

          const data = snapshot.data();

          const totalPoints =
            typeof data.totalPoints === "number" ? data.totalPoints : 0;
          const correctPredictions =
            typeof data.correctPredictions === "number"
              ? data.correctPredictions
              : 0;
          const weeklyWins =
            typeof data.weeklyWins === "number" ? data.weeklyWins : 0;

          const storedProgress = normalizeBadgeProgress(data.badgeProgress);
          const badgeProgress: BadgeProgressData = {
            ...storedProgress,
            totalCorrectPredictions: Math.max(
              storedProgress.totalCorrectPredictions,
              correctPredictions
            ),
            weeklyWins: Math.max(storedProgress.weeklyWins, weeklyWins),
          };

          const storedUnlocked = sanitizeBadgeIds(data.unlockedBadges);
          const automaticallyUnlocked = calculateUnlockedBadgeIds(badgeProgress);
          const unlockedBadges = mergeUnlockedBadgeIds(
            storedUnlocked,
            automaticallyUnlocked
          );

          const selectedBadges = sanitizeSelectedBadges(
            data.selectedBadges,
            unlockedBadges
          );

          const activeTitle =
            typeof data.activeTitle === "string" &&
            unlockedBadges.includes(data.activeTitle)
              ? data.activeTitle
              : "";

          const loadedProfile: ProfileData = {
            username:
              typeof data.username === "string" && data.username.trim()
                ? data.username
                : "İsimsiz Gardaş",
            avatar:
              typeof data.avatar === "string" && data.avatar.trim()
                ? data.avatar
                : "⚽",
            selectedTheme:
              typeof data.selectedTheme === "string"
                ? normalizeThemeId(data.selectedTheme)
                : "obsidyen",
            totalPoints,
            correctPredictions,
            weeklyWins,
            usernameChanged: data.usernameChanged === true,
            isAdmin: data.isAdmin === true,
            unlockedBadges,
            selectedBadges,
            activeTitle,
            badgeProgress,
          };

          setProfile(loadedProfile);
          setSelectedAvatar(loadedProfile.avatar);
          setNewUsername(loadedProfile.username);
          setLoading(false);

          const fieldsNeedSync =
            JSON.stringify(storedUnlocked) !==
              JSON.stringify(unlockedBadges) ||
            JSON.stringify(sanitizeBadgeIds(data.selectedBadges)) !==
              JSON.stringify(selectedBadges) ||
            data.activeTitle !== activeTitle ||
            JSON.stringify(normalizeBadgeProgress(data.badgeProgress)) !==
              JSON.stringify(badgeProgress);

          if (fieldsNeedSync) {
            try {
              await setDoc(
                doc(db, "users", firebaseUser.uid),
                {
                  unlockedBadges,
                  selectedBadges,
                  activeTitle,
                  badgeProgress,
                  badgesUpdatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            } catch (error) {
              console.error("Rozet alanları otomatik oluşturulamadı:", error);
            }
          }
        },
        (error) => {
          console.error(error);
          setMessageType("error");
          setMessage("Profil bilgileri alınamadı.");
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [router]);

  const activeTheme = useMemo(
    () => getThemeById(profile.selectedTheme),
    [profile.selectedTheme]
  );

  const selectedBadgeDefinitions = useMemo(
    () =>
      getSelectedBadgeDefinitions(
        profile.selectedBadges,
        profile.unlockedBadges
      ),
    [profile.selectedBadges, profile.unlockedBadges]
  );

  const unlockedBadgeDefinitions = useMemo(
    () => getUnlockedBadges(profile.unlockedBadges),
    [profile.unlockedBadges]
  );

  const lockedBadgeDefinitions = useMemo(
    () => getLockedBadges(profile.unlockedBadges),
    [profile.unlockedBadges]
  );

  const activeTitleBadge = useMemo(
    () => getActiveTitleBadge(profile.activeTitle, profile.unlockedBadges),
    [profile.activeTitle, profile.unlockedBadges]
  );

  const avatarChanged = selectedAvatar !== profile.avatar;

  async function handleSaveAvatar() {
    if (!currentUser || !avatarChanged) return;

    setSavingAvatar(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        avatar: selectedAvatar,
        updatedAt: serverTimestamp(),
      });

      showSuccess("Profil avatarın başarıyla güncellendi.");
    } catch (error) {
      console.error(error);
      showError("Avatar kaydedilemedi. Firestore kurallarını kontrol et.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleSaveUsername() {
    if (!currentUser || (profile.usernameChanged && !profile.isAdmin)) return;

    const trimmedUsername = newUsername.trim();
    const normalizedUsername = trimmedUsername.toLocaleLowerCase("tr-TR");

    setMessage("");

    if (trimmedUsername.length < 3) {
      showError("Kullanıcı adı en az 3 karakter olmalı.");
      return;
    }

    if (trimmedUsername.length > 20) {
      showError("Kullanıcı adı en fazla 20 karakter olabilir.");
      return;
    }

    if (!/^[a-zA-ZçÇğĞıİöÖşŞüÜ0-9 _.-]+$/.test(trimmedUsername)) {
      showError(
        "Yalnızca harf, rakam, boşluk, nokta, tire ve alt çizgi kullanabilirsin."
      );
      return;
    }

    if (
      normalizedUsername ===
      profile.username.trim().toLocaleLowerCase("tr-TR")
    ) {
      showError("Yeni kullanıcı adı mevcut kullanıcı adından farklı olmalı.");
      return;
    }

    setSavingUsername(true);

    try {
      const usernameQuery = query(
        collection(db, "users"),
        where("usernameLower", "==", normalizedUsername),
        limit(1)
      );

      const usernameSnapshot = await getDocs(usernameQuery);
      const isUsernameTaken = usernameSnapshot.docs.some(
        (userDoc) => userDoc.id !== currentUser.uid
      );

      if (isUsernameTaken) {
        showError("Bu kullanıcı adı başka biri tarafından kullanılıyor.");
        return;
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        username: trimmedUsername,
        usernameLower: normalizedUsername,
        usernameChanged: true,
        usernameChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showSuccess(
        profile.isAdmin
          ? "Yönetici kullanıcı adın başarıyla değiştirildi."
          : "Kullanıcı adın başarıyla değiştirildi. Bu hakkını artık tekrar kullanamazsın."
      );
    } catch (error) {
      console.error(error);
      showError(
        "Kullanıcı adı değiştirilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingUsername(false);
    }
  }

  async function toggleShowcaseBadge(badgeId: string) {
    if (!currentUser || savingBadges) return;

    const isSelected = profile.selectedBadges.includes(badgeId);
    let nextSelected: string[];

    if (isSelected) {
      nextSelected = profile.selectedBadges.filter((id) => id !== badgeId);
    } else {
      if (profile.selectedBadges.length >= MAX_SELECTED_BADGES) {
        showError("Rozet vitrininde en fazla 3 rozet gösterebilirsin.");
        return;
      }
      nextSelected = [...profile.selectedBadges, badgeId];
    }

    await saveBadgePreferences(nextSelected, profile.activeTitle);
  }

  async function selectActiveTitle(badgeId: string) {
    if (!currentUser || savingBadges) return;

    const nextTitle = profile.activeTitle === badgeId ? "" : badgeId;
    await saveBadgePreferences(profile.selectedBadges, nextTitle);
  }

  async function saveBadgePreferences(
    selectedBadges: string[],
    activeTitle: string
  ) {
    if (!currentUser) return;

    setSavingBadges(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        selectedBadges: sanitizeSelectedBadges(
          selectedBadges,
          profile.unlockedBadges
        ),
        activeTitle: profile.unlockedBadges.includes(activeTitle)
          ? activeTitle
          : "",
        badgesUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showSuccess("Rozet vitrinin güncellendi.");
    } catch (error) {
      console.error(error);
      showError(
        "Rozet seçimi kaydedilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingBadges(false);
    }
  }

  function showSuccess(text: string) {
    setMessageType("success");
    setMessage(text);
  }

  function showError(text: string) {
    setMessageType("error");
    setMessage(text);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Profil yükleniyor...
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-4 py-8 transition-all duration-500 ${activeTheme.pageClass}`}
    >
      <div className="mx-auto max-w-7xl">
        <header
          className={`relative mb-8 overflow-hidden rounded-[2rem] border p-6 shadow-2xl backdrop-blur-md sm:p-8 ${activeTheme.headerClass}`}
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p
                className={`text-sm font-bold uppercase tracking-[0.24em] ${activeTheme.mutedTextClass}`}
              >
                Has Gardaşlar Ligi
              </p>
              <SeasonLabel className={activeTheme.mutedTextClass} />
              <h1
                className={`mt-2 text-3xl font-black sm:text-4xl ${activeTheme.titleClass}`}
              >
                Oyuncu Merkezi
              </h1>
              <p
                className={`mt-3 max-w-2xl ${activeTheme.mutedTextClass}`}
              >
                Profilini düzenle, rozetlerini vitrine çıkar ve kazandığın
                puanlarla yeni temaların kilidini aç.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className={`rounded-2xl px-6 py-3 text-center font-bold transition ${activeTheme.secondaryButtonClass}`}
              >
                Ana Sayfa
              </Link>
            </div>
          </div>
        </header>

        {message && (
          <div
            className={`mb-6 rounded-2xl border p-4 font-medium shadow-lg ${
              messageType === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message}
          </div>
        )}

        <section className="grid gap-7 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-7">
            <div
              className={`overflow-hidden rounded-[2rem] border p-6 shadow-2xl ${activeTheme.cardClass}`}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`relative flex h-36 w-36 items-center justify-center rounded-full border text-7xl shadow-2xl ring-4 ring-white/5 transition-transform duration-300 hover:scale-105 ${activeTheme.secondaryCardClass}`}
                >
                  {selectedAvatar}
                  {avatarChanged && (
                    <span
                      className={`absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black ${activeTheme.badgeClass}`}
                    >
                      ✓
                    </span>
                  )}
                </div>

                <h2
                  className={`mt-5 text-2xl font-black ${activeTheme.textClass}`}
                >
                  {profile.username}
                </h2>

                {activeTitleBadge ? (
                  <div
                    className={`mt-2 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${activeTheme.secondaryCardClass}`}
                  >
                    <img
                      src={activeTitleBadge.image}
                      alt=""
                      className="h-6 w-6 rounded-full"
                    />
                    <span className={activeTheme.textClass}>
                      {activeTitleBadge.name}
                    </span>
                  </div>
                ) : (
                  <span
                    className={`mt-3 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${activeTheme.badgeClass}`}
                  >
                    {profile.selectedTheme}
                  </span>
                )}

                <div className="mt-5 flex min-h-16 items-center justify-center gap-2">
                  {selectedBadgeDefinitions.length > 0 ? (
                    selectedBadgeDefinitions.map((badge) => (
                      <img
                        key={badge.id}
                        src={badge.image}
                        alt={badge.name}
                        title={badge.name}
                        className="h-16 w-16 rounded-2xl object-contain drop-shadow-xl transition hover:-translate-y-1 hover:scale-110"
                      />
                    ))
                  ) : (
                    <p className={`text-sm ${activeTheme.mutedTextClass}`}>
                      Vitrininde henüz rozet yok.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-3">
                <ProfileStat
                  label="Puan"
                  value={profile.totalPoints}
                  theme={activeTheme}
                />
                <ProfileStat
                  label="Doğru"
                  value={profile.correctPredictions}
                  theme={activeTheme}
                />
                <ProfileStat
                  label="Zafer"
                  value={profile.weeklyWins}
                  theme={activeTheme}
                />
              </div>

              <div
                className={`mt-6 rounded-2xl border p-4 ${activeTheme.secondaryCardClass}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`font-black ${activeTheme.textClass}`}>
                    Kullanıcı Adı
                  </h3>
                  {profile.isAdmin && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${activeTheme.badgeClass}`}
                    >
                      YÖNETİCİ
                    </span>
                  )}
                </div>

                {profile.usernameChanged && !profile.isAdmin ? (
                  <div className="mt-3">
                    <p className={`text-sm ${activeTheme.mutedTextClass}`}>
                      Kullanıcı adı değiştirme hakkını kullandın.
                    </p>
                    <div
                      className={`mt-3 rounded-xl border px-4 py-3 font-bold opacity-70 ${activeTheme.cardClass}`}
                    >
                      {profile.username}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <p
                      className={`mb-3 text-sm ${activeTheme.mutedTextClass}`}
                    >
                      {profile.isAdmin
                        ? "Yönetici olduğun için kullanıcı adını istediğin kadar değiştirebilirsin."
                        : "Kullanıcı adını yalnızca 1 kez değiştirebilirsin."}
                    </p>
                    <input
                      type="text"
                      value={newUsername}
                      maxLength={20}
                      onChange={(event) => {
                        setNewUsername(event.target.value);
                        setMessage("");
                      }}
                      disabled={savingUsername}
                      placeholder="Yeni kullanıcı adı"
                      className={`w-full rounded-xl border px-4 py-3 outline-none transition focus:ring-2 disabled:opacity-50 ${activeTheme.cardClass} ${activeTheme.textClass}`}
                    />
                    <p
                      className={`mt-2 text-right text-xs ${activeTheme.mutedTextClass}`}
                    >
                      {newUsername.trim().length}/20
                    </p>
                    <button
                      type="button"
                      onClick={handleSaveUsername}
                      disabled={
                        savingUsername ||
                        !newUsername.trim() ||
                        newUsername.trim() === profile.username.trim()
                      }
                      className={`mt-3 w-full rounded-xl px-5 py-3 font-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 ${activeTheme.badgeClass}`}
                    >
                      {savingUsername
                        ? "Değiştiriliyor..."
                        : "Kullanıcı Adını Değiştir"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`rounded-[2rem] border p-6 shadow-xl ${activeTheme.cardClass}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${activeTheme.secondaryCardClass}`}
                >
                  🎨
                </div>
                <div>
                  <h3 className={`text-xl font-black ${activeTheme.titleClass}`}>
                    Tema Mağazası
                  </h3>
                  <p className={`text-sm ${activeTheme.mutedTextClass}`}>
                    Puanlarınla yeni görünüşler aç.
                  </p>
                </div>
              </div>

              <div
                className={`mt-5 rounded-2xl border p-4 ${activeTheme.secondaryCardClass}`}
              >
                <p className={`text-xs uppercase ${activeTheme.mutedTextClass}`}>
                  Aktif Tema
                </p>
                <p className={`mt-1 text-lg font-black ${activeTheme.textClass}`}>
                  {profile.selectedTheme}
                </p>
              </div>

              <Link
                href="/themes"
                className={`mt-4 block w-full rounded-xl px-5 py-3 text-center font-black transition hover:scale-[1.02] ${activeTheme.badgeClass}`}
              >
                Tema Mağazasını Aç
              </Link>
            </div>
          </aside>

          <div className="space-y-7">
            <section
              className={`rounded-[2rem] border p-6 shadow-2xl sm:p-7 ${activeTheme.cardClass}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p
                    className={`text-xs font-black uppercase tracking-[0.22em] ${activeTheme.mutedTextClass}`}
                  >
                    Başarı Koleksiyonu
                  </p>
                  <h2
                    className={`mt-1 text-2xl font-black ${activeTheme.titleClass}`}
                  >
                    Rozet Vitrini
                  </h2>
                  <p className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}>
                    Kazandığın rozetlerden en fazla 3 tanesini seç. Seçilenler
                    profilinde ve puan durumunda gösterilecek.
                  </p>
                </div>

                <div
                  className={`rounded-full border px-4 py-2 text-sm font-black ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
                >
                  {profile.selectedBadges.length}/{MAX_SELECTED_BADGES} seçili
                </div>
              </div>

              <div className="mt-6 grid min-h-36 grid-cols-3 gap-3">
                {[0, 1, 2].map((slotIndex) => {
                  const badge = selectedBadgeDefinitions[slotIndex];

                  return (
                    <div
                      key={slotIndex}
                      className={`flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed p-3 text-center ${activeTheme.secondaryCardClass}`}
                    >
                      {badge ? (
                        <>
                          <img
                            src={badge.image}
                            alt={badge.name}
                            className="h-20 w-20 object-contain drop-shadow-xl"
                          />
                          <p
                            className={`mt-2 text-xs font-black ${activeTheme.textClass}`}
                          >
                            {badge.name}
                          </p>
                        </>
                      ) : (
                        <>
                          <span
                            className={`text-3xl ${activeTheme.mutedTextClass}`}
                          >
                            +
                          </span>
                          <p
                            className={`mt-2 text-xs ${activeTheme.mutedTextClass}`}
                          >
                            Boş vitrin alanı
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-7">
                <h3 className={`text-lg font-black ${activeTheme.textClass}`}>
                  Kazanılan Rozetler
                </h3>

                {unlockedBadgeDefinitions.length === 0 ? (
                  <div
                    className={`mt-4 rounded-2xl border p-6 text-center ${activeTheme.secondaryCardClass}`}
                  >
                    <p className={`font-black ${activeTheme.textClass}`}>
                      Henüz rozet kazanılmadı.
                    </p>
                    <p className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}>
                      İlk doğru tahmininle “İlk Kan” rozetini açacaksın.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {unlockedBadgeDefinitions.map((badge) => {
                      const isSelected = profile.selectedBadges.includes(
                        badge.id
                      );
                      const isActiveTitle = profile.activeTitle === badge.id;

                      return (
                        <BadgeCard
                          key={badge.id}
                          badge={badge}
                          theme={activeTheme}
                          unlocked
                          isSelected={isSelected}
                          isActiveTitle={isActiveTitle}
                          disabled={savingBadges}
                          onToggleShowcase={() =>
                            toggleShowcaseBadge(badge.id)
                          }
                          onToggleTitle={() => selectActiveTitle(badge.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section
              className={`rounded-[2rem] border p-6 shadow-2xl sm:p-7 ${activeTheme.cardClass}`}
            >
              <div>
                <p
                  className={`text-xs font-black uppercase tracking-[0.22em] ${activeTheme.mutedTextClass}`}
                >
                  Sıradaki Hedefler
                </p>
                <h2
                  className={`mt-1 text-2xl font-black ${activeTheme.titleClass}`}
                >
                  Kilitli Rozetler
                </h2>
                <p className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}>
                  İlerlemeyi tamamladığında rozet otomatik olarak açılır.
                </p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lockedBadgeDefinitions.map((badge) => (
                  <LockedBadgeCard
                    key={badge.id}
                    badge={badge}
                    progress={profile.badgeProgress}
                    theme={activeTheme}
                  />
                ))}
              </div>
            </section>

            <section
              className={`rounded-[2rem] border p-6 shadow-2xl sm:p-7 ${activeTheme.cardClass}`}
            >
              <div className="mb-7">
                <p
                  className={`text-xs font-black uppercase tracking-[0.22em] ${activeTheme.mutedTextClass}`}
                >
                  Profil Görünümü
                </p>
                <h2
                  className={`mt-1 text-2xl font-black ${activeTheme.titleClass}`}
                >
                  Avatarını Seç
                </h2>
                <p className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}>
                  Bir avatara dokun ve ardından kaydet.
                </p>
              </div>

              <div className="space-y-8">
                {AVATAR_CATEGORIES.map((category) => (
                  <div key={category.title}>
                    <div className="mb-4">
                      <h3
                        className={`text-lg font-black ${activeTheme.textClass}`}
                      >
                        {category.title}
                      </h3>
                      <p
                        className={`mt-1 text-sm ${activeTheme.mutedTextClass}`}
                      >
                        {category.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
                      {category.avatars.map((avatar) => {
                        const isSelected = selectedAvatar === avatar;

                        return (
                          <button
                            key={`${category.title}-${avatar}`}
                            type="button"
                            onClick={() => {
                              setSelectedAvatar(avatar);
                              setMessage("");
                            }}
                            aria-label={`${avatar} avatarını seç`}
                            aria-pressed={isSelected}
                            className={`relative flex aspect-square items-center justify-center rounded-2xl border text-4xl transition duration-200 hover:-translate-y-1 hover:scale-105 ${
                              isSelected
                                ? activeTheme.secondaryCardClass
                                : activeTheme.cardClass
                            }`}
                          >
                            {avatar}
                            {isSelected && (
                              <span
                                className={`absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${activeTheme.badgeClass}`}
                              >
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleSaveAvatar}
                  disabled={!avatarChanged || savingAvatar}
                  className={`w-full rounded-xl px-5 py-3 font-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 ${activeTheme.badgeClass}`}
                >
                  {savingAvatar
                    ? "Kaydediliyor..."
                    : avatarChanged
                      ? "Avatarı Kaydet"
                      : "Avatar Güncel"}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAvatar(profile.avatar)}
                  disabled={!avatarChanged || savingAvatar}
                  className={`w-full rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${activeTheme.secondaryButtonClass}`}
                >
                  Değişikliği İptal Et
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function BadgeCard({
  badge,
  theme,
  unlocked,
  isSelected,
  isActiveTitle,
  disabled,
  onToggleShowcase,
  onToggleTitle,
}: {
  badge: BadgeDefinition;
  theme: ReturnType<typeof getThemeById>;
  unlocked: boolean;
  isSelected: boolean;
  isActiveTitle: boolean;
  disabled: boolean;
  onToggleShowcase: () => void;
  onToggleTitle: () => void;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 transition hover:-translate-y-1 ${theme.secondaryCardClass}`}
    >
      <div className="flex items-start gap-3">
        <img
          src={badge.image}
          alt={badge.name}
          className="h-20 w-20 shrink-0 rounded-2xl object-contain drop-shadow-xl"
        />

        <div className="min-w-0">
          <p className={`font-black ${theme.textClass}`}>{badge.name}</p>
          <RarityBadge rarity={badge.rarity} />
          <p className={`mt-2 text-xs leading-5 ${theme.mutedTextClass}`}>
            {badge.description}
          </p>
        </div>
      </div>

      {unlocked && (
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleShowcase}
            className={`rounded-xl px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
              isSelected ? theme.badgeClass : theme.secondaryButtonClass
            }`}
          >
            {isSelected ? "Vitrinden Çıkar" : "Vitrine Ekle"}
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={onToggleTitle}
            className={`rounded-xl px-3 py-2 text-xs font-black transition disabled:opacity-50 ${
              isActiveTitle ? theme.badgeClass : theme.secondaryButtonClass
            }`}
          >
            {isActiveTitle ? "Aktif Ünvanı Kaldır" : "Ünvan Olarak Kullan"}
          </button>
        </div>
      )}
    </article>
  );
}

function LockedBadgeCard({
  badge,
  progress,
  theme,
}: {
  badge: BadgeDefinition;
  progress: BadgeProgressData;
  theme: ReturnType<typeof getThemeById>;
}) {
  const result = getBadgeProgress(badge, progress);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border p-4 ${theme.secondaryCardClass}`}
    >
      <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-xs text-white">
        🔒
      </div>

      <div className="flex items-start gap-3">
        <img
          src={badge.image}
          alt={badge.name}
          className="h-20 w-20 shrink-0 rounded-2xl object-contain grayscale opacity-40 blur-[0.3px]"
        />

        <div className="min-w-0">
          <p className={`font-black ${theme.textClass}`}>{badge.name}</p>
          <RarityBadge rarity={badge.rarity} />
          <p className={`mt-2 text-xs leading-5 ${theme.mutedTextClass}`}>
            {badge.description}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className={theme.mutedTextClass}>İlerleme</span>
          <span className={`font-black ${theme.textClass}`}>
            {result.currentValue}/{result.targetValue}
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-black/25">
          <div
            className="h-full rounded-full bg-white/70 transition-all duration-500"
            style={{ width: `${result.percentage}%` }}
          />
        </div>
      </div>
    </article>
  );
}

function RarityBadge({ rarity }: { rarity: BadgeRarity }) {
  const classes: Record<BadgeRarity, string> = {
    common: "border-slate-400/30 bg-slate-400/10 text-slate-200",
    rare: "border-blue-400/30 bg-blue-500/10 text-blue-300",
    epic: "border-purple-400/30 bg-purple-500/10 text-purple-300",
    legendary: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    secret: "border-red-400/30 bg-red-500/10 text-red-300",
  };

  return (
    <span
      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${classes[rarity]}`}
    >
      {BADGE_RARITY_LABELS[rarity]}
    </span>
  );
}

function ProfileStat({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: ReturnType<typeof getThemeById>;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center ${theme.secondaryCardClass}`}
    >
      <p className={`text-xl font-black ${theme.titleClass}`}>{value}</p>
      <p className={`mt-1 text-xs ${theme.mutedTextClass}`}>{label}</p>
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

  return normalizedTheme;
  }