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
  updateDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { getThemeById } from "@/lib/themes";

type ProfileData = {
  username: string;
  avatar: string;
  selectedTheme: string;
  totalPoints: number;
  correctPredictions: number;
  weeklyWins: number;
  usernameChanged: boolean;
  isAdmin: boolean;
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
  selectedTheme: "klasik",
  totalPoints: 0,
  correctPredictions: 0,
  weeklyWins: 0,
  usernameChanged: false,
  isAdmin: false,
};

export default function ProfilePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] =
    useState<ProfileData>(DEFAULT_PROFILE);
  const [selectedAvatar, setSelectedAvatar] = useState("⚽");
  const [newUsername, setNewUsername] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
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
          (snapshot) => {
            if (!snapshot.exists()) {
              setProfile(DEFAULT_PROFILE);
              setSelectedAvatar(DEFAULT_PROFILE.avatar);
              setLoading(false);
              return;
            }

            const data = snapshot.data();

            const loadedProfile: ProfileData = {
              username:
                typeof data.username === "string" &&
                data.username.trim()
                  ? data.username
                  : "İsimsiz Gardaş",

              avatar:
                typeof data.avatar === "string" &&
                data.avatar.trim()
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

              usernameChanged:
                data.usernameChanged === true,

              isAdmin:
                data.isAdmin === true,
            };

            setProfile(loadedProfile);
            setSelectedAvatar(loadedProfile.avatar);
            setNewUsername(loadedProfile.username);
            setLoading(false);
          },
          (error) => {
            console.error(error);
            setMessageType("error");
            setMessage("Profil bilgileri alınamadı.");
            setLoading(false);
          }
        );
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [router]);

  const activeTheme = useMemo(() => {
    return getThemeById(profile.selectedTheme);
  }, [profile.selectedTheme]);

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

      setMessageType("success");
      setMessage("Profil avatarın başarıyla güncellendi.");
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage(
        "Avatar kaydedilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleSaveUsername() {
    if (
      !currentUser ||
      (profile.usernameChanged && !profile.isAdmin)
    ) {
      return;
    }

    const trimmedUsername = newUsername.trim();
    const normalizedUsername =
      trimmedUsername.toLocaleLowerCase("tr-TR");

    setMessage("");

    if (trimmedUsername.length < 3) {
      setMessageType("error");
      setMessage("Kullanıcı adı en az 3 karakter olmalı.");
      return;
    }

    if (trimmedUsername.length > 20) {
      setMessageType("error");
      setMessage("Kullanıcı adı en fazla 20 karakter olabilir.");
      return;
    }

    if (!/^[a-zA-ZçÇğĞıİöÖşŞüÜ0-9 _.-]+$/.test(trimmedUsername)) {
      setMessageType("error");
      setMessage(
        "Yalnızca harf, rakam, boşluk, nokta, tire ve alt çizgi kullanabilirsin."
      );
      return;
    }

    if (
      normalizedUsername ===
      profile.username.trim().toLocaleLowerCase("tr-TR")
    ) {
      setMessageType("error");
      setMessage("Yeni kullanıcı adı mevcut kullanıcı adından farklı olmalı.");
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
        setMessageType("error");
        setMessage("Bu kullanıcı adı başka biri tarafından kullanılıyor.");
        return;
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        username: trimmedUsername,
        usernameLower: normalizedUsername,
        usernameChanged: true,
        usernameChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessageType("success");
      setMessage(
        profile.isAdmin
          ? "Yönetici kullanıcı adın başarıyla değiştirildi."
          : "Kullanıcı adın başarıyla değiştirildi. Bu hakkını artık tekrar kullanamazsın."
      );
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage(
        "Kullanıcı adı değiştirilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingUsername(false);
    }
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
      <div className="mx-auto max-w-6xl">
        <header
          className={`mb-8 rounded-3xl border p-6 backdrop-blur-md ${activeTheme.headerClass}`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}
              >
                Has Gardaşlar Ligi
              </p>

              <SeasonLabel className={activeTheme.mutedTextClass} />

              <h1
                className={`mt-1 text-3xl font-black ${activeTheme.titleClass}`}
              >
                👤 Profilim
              </h1>

              <p
                className={`mt-2 ${activeTheme.mutedTextClass}`}
              >
                Gardaşını temsil edecek avatarı seç ve
                istatistiklerini görüntüle.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/themes"
                className={`rounded-xl px-5 py-3 text-center font-bold transition ${activeTheme.secondaryButtonClass}`}
              >
                Tema Mağazası
              </Link>

              <Link
                href="/"
                className={`rounded-xl px-5 py-3 text-center font-bold transition ${activeTheme.secondaryButtonClass}`}
              >
                Ana Sayfaya Dön
              </Link>
            </div>
          </div>
        </header>

        {message && (
          <div
            className={`mb-6 rounded-2xl border p-4 font-medium ${
              messageType === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message}
          </div>
        )}

        <section className="grid gap-8 lg:grid-cols-[340px_1fr]">
          <aside
            className={`h-fit rounded-3xl border p-6 ${activeTheme.cardClass}`}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className={`relative flex h-32 w-32 items-center justify-center rounded-full border text-7xl shadow-2xl transition-transform duration-300 hover:scale-105 ${activeTheme.secondaryCardClass}`}
              >
                {selectedAvatar}

                {avatarChanged && (
                  <span
                    className={`absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-black ${activeTheme.badgeClass}`}
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

              <span
                className={`mt-3 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${activeTheme.badgeClass}`}
              >
                {profile.selectedTheme}
              </span>

              <p
                className={`mt-4 text-sm ${activeTheme.mutedTextClass}`}
              >
                Seçili avatar puan durumu ve diğer oyuncu
                listelerinde görünür.
              </p>
            </div>

            <div
              className={`mt-7 rounded-2xl border p-4 ${activeTheme.secondaryCardClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  className={`font-black ${activeTheme.textClass}`}
                >
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
                  <p
                    className={`text-sm ${activeTheme.mutedTextClass}`}
                  >
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

            <button
              type="button"
              onClick={handleSaveAvatar}
              disabled={!avatarChanged || savingAvatar}
              className={`mt-6 w-full rounded-xl px-5 py-3 font-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 ${activeTheme.badgeClass}`}
            >
              {savingAvatar
                ? "Kaydediliyor..."
                : avatarChanged
                  ? "Avatarı Kaydet"
                  : "Avatar Güncel"}
            </button>

            {avatarChanged && (
              <button
                type="button"
                onClick={() => setSelectedAvatar(profile.avatar)}
                disabled={savingAvatar}
                className={`mt-3 w-full rounded-xl px-5 py-3 text-sm font-bold transition ${activeTheme.secondaryButtonClass}`}
              >
                Değişikliği İptal Et
              </button>
            )}
          </aside>

          <section
            className={`rounded-3xl border p-6 ${activeTheme.cardClass}`}
          >
            <div className="mb-7">
              <h2
                className={`text-2xl font-black ${activeTheme.titleClass}`}
              >
                Avatarını Seç
              </h2>

              <p
                className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}
              >
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
                      const isSelected =
                        selectedAvatar === avatar;

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
          </section>
        </section>
      </div>
    </main>
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
      <p className={`text-xl font-black ${theme.titleClass}`}>
        {value}
      </p>

      <p className={`mt-1 text-xs ${theme.mutedTextClass}`}>
        {label}
      </p>
    </div>
  );
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