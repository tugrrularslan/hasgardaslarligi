"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { getThemeById } from "@/lib/themes";

type ProfileData = {
  username: string;
  avatar: string;
  selectedTheme: string;
  totalPoints: number;
  correctPredictions: number;
  weeklyWins: number;
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
};

export default function ProfilePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] =
    useState<ProfileData>(DEFAULT_PROFILE);
  const [selectedAvatar, setSelectedAvatar] = useState("⚽");

  const [loading, setLoading] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
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
            };

            setProfile(loadedProfile);
            setSelectedAvatar(loadedProfile.avatar);
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