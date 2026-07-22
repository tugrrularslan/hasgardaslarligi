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
import SeasonLabel from "@/components/SeasonLabel";
import {
  appThemes,
  getThemeById,
  isThemeUnlocked,
  type AppTheme,
} from "../../lib/themes";

type UserProfile = {
  username: string;
  totalPoints: number;
  selectedTheme: string;
  isAdmin: boolean;
};

export default function ThemesPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingThemeId, setSavingThemeId] = useState<string | null>(
    null
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (!firebaseUser) {
          router.replace("/");
          return;
        }

        setCurrentUser(firebaseUser);
      }
    );

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const userReference = doc(
      db,
      "users",
      currentUser.uid
    );

    const unsubscribe = onSnapshot(
      userReference,
      (snapshot) => {
        if (!snapshot.exists()) {
          setMessage("Kullanıcı profili bulunamadı.");
          setLoading(false);
          return;
        }

        const data = snapshot.data();

        const savedTheme =
          typeof data.selectedTheme === "string"
            ? data.selectedTheme
            : "klasik";

        setProfile({
          username:
            typeof data.username === "string" &&
            data.username.trim()
              ? data.username
              : "İsimsiz Gardaş",

          totalPoints:
            typeof data.totalPoints === "number"
              ? data.totalPoints
              : 0,

          selectedTheme:
            savedTheme === "Klasik"
              ? "klasik"
              : savedTheme,

          isAdmin: data.isAdmin === true,
        });

        setLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("Tema bilgileri alınamadı.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUser]);

  const activeTheme = useMemo(() => {
    return getThemeById(profile?.selectedTheme);
  }, [profile?.selectedTheme]);

  const unlockedThemeCount = useMemo(() => {
    if (!profile) return 0;

    return appThemes.filter((theme) =>
      isThemeUnlocked(
        theme,
        profile.totalPoints,
        profile.isAdmin
      )
    ).length;
  }, [profile]);

  const nextTheme = useMemo(() => {
    if (!profile || profile.isAdmin) {
      return null;
    }

    return appThemes.find(
      (theme) =>
        theme.requiredPoints > profile.totalPoints
    );
  }, [profile]);

  async function handleSelectTheme(theme: AppTheme) {
    if (!currentUser || !profile) return;

    const unlocked = isThemeUnlocked(
      theme,
      profile.totalPoints,
      profile.isAdmin
    );

    if (!unlocked) {
      const missingPoints =
        theme.requiredPoints - profile.totalPoints;

      setMessage(
        `Bu temayı açmak için ${missingPoints} puan daha kazanmalısın.`
      );

      return;
    }

    if (profile.selectedTheme === theme.id) {
      setMessage("Bu tema zaten seçili.");
      return;
    }

    setSavingThemeId(theme.id);
    setMessage("");

    try {
      await updateDoc(
        doc(db, "users", currentUser.uid),
        {
          selectedTheme: theme.id,
          updatedAt: serverTimestamp(),
        }
      );

      setMessage(
        `${theme.name} teması başarıyla seçildi.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Tema seçilemedi. Firestore kurallarını kontrol et."
      );
    } finally {
      setSavingThemeId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Tema mağazası yükleniyor...
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="text-center">
          <p>Kullanıcı profili bulunamadı.</p>

          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-red-600 px-5 py-3 font-black text-white"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-3 sm:px-5 lg:px-6 py-6 transition-all duration-500 ${activeTheme.pageClass}`}
    >
      <div className="mx-auto max-w-7xl">
        <header
          className={`mb-8 rounded-3xl border p-6 backdrop-blur-md ${activeTheme.headerClass}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p
                className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}
              >
                Has Gardaşlar Ligi
              </p>

              <SeasonLabel className={activeTheme.mutedTextClass} />

              <h1
                className={`mt-1 text-2xl sm:text-3xl lg:text-4xl font-black ${activeTheme.titleClass}`}
              >
                🎨 Tema Mağazası
              </h1>

              <p
                className={`mt-2 ${activeTheme.mutedTextClass}`}
              >
                Puan kazandıkça yeni temaların
                kilidini aç.
              </p>
            </div>

            <Link
              href="/"
              className={`w-full lg:w-auto rounded-xl px-5 py-3 text-center font-bold transition ${activeTheme.secondaryButtonClass}`}
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </header>

        {message && (
          <div
            className={`mb-6 rounded-2xl border p-4 ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
          >
            {message}
          </div>
        )}

        {profile.isAdmin && (
          <section
            className={`mb-6 rounded-3xl border p-4 md:p-5 ${activeTheme.cardClass}`}
          >
            <p
              className={`text-lg font-black ${activeTheme.titleClass}`}
            >
              👑 Admin ayrıcalığı
            </p>

            <p
              className={`mt-2 text-sm ${activeTheme.mutedTextClass}`}
            >
              Admin olduğun için bütün temalar açık.
            </p>
          </section>
        )}

        <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className={`rounded-3xl border p-4 md:p-5 ${activeTheme.cardClass}`}
          >
            <p
              className={`text-sm font-bold ${activeTheme.mutedTextClass}`}
            >
              Oyuncu
            </p>

            <p
              className={`mt-2 text-2xl font-black ${activeTheme.titleClass}`}
            >
              {profile.username}
            </p>
          </div>

          <div
            className={`rounded-3xl border p-4 md:p-5 ${activeTheme.cardClass}`}
          >
            <p
              className={`text-sm font-bold ${activeTheme.mutedTextClass}`}
            >
              Toplam puan
            </p>

            <p
              className={`mt-2 text-2xl sm:text-3xl font-black ${activeTheme.titleClass}`}
            >
              {profile.totalPoints}
            </p>
          </div>

          <div
            className={`rounded-3xl border p-4 md:p-5 ${activeTheme.cardClass}`}
          >
            <p
              className={`text-sm font-bold ${activeTheme.mutedTextClass}`}
            >
              Açılan temalar
            </p>

            <p
              className={`mt-2 text-2xl sm:text-3xl font-black ${activeTheme.titleClass}`}
            >
              {unlockedThemeCount} /{" "}
              {appThemes.length}
            </p>
          </div>

          <div
            className={`rounded-3xl border p-4 md:p-5 ${activeTheme.cardClass}`}
          >
            <p
              className={`text-sm font-bold ${activeTheme.mutedTextClass}`}
            >
              Aktif tema
            </p>

            <p
              className={`mt-2 text-xl font-black ${activeTheme.titleClass}`}
            >
              {activeTheme.icon} {activeTheme.name}
            </p>
          </div>
        </section>

        {nextTheme ? (
          <section
            className={`mb-8 rounded-3xl border p-4 md:p-5 ${activeTheme.secondaryCardClass}`}
          >
            <p
              className={`text-sm font-bold ${activeTheme.mutedTextClass}`}
            >
              Sıradaki tema
            </p>

            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p
                  className={`text-2xl font-black ${activeTheme.titleClass}`}
                >
                  {nextTheme.icon} {nextTheme.name}
                </p>

                <p
                  className={`mt-1 text-sm ${activeTheme.mutedTextClass}`}
                >
                  Açılması için{" "}
                  {nextTheme.requiredPoints -
                    profile.totalPoints}{" "}
                  puan daha gerekiyor.
                </p>
              </div>

              <p
                className={`text-xl font-black ${activeTheme.titleClass}`}
              >
                {profile.totalPoints} /{" "}
                {nextTheme.requiredPoints}
              </p>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-current transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (profile.totalPoints /
                      nextTheme.requiredPoints) *
                      100
                  )}%`,
                }}
              />
            </div>
          </section>
        ) : (
          <section
            className={`mb-8 rounded-3xl border p-4 md:p-5 ${activeTheme.secondaryCardClass}`}
          >
            <p
              className={`text-xl font-black ${activeTheme.titleClass}`}
            >
              {profile.isAdmin
                ? "👑 Bütün temalar admin hesabına açık."
                : "⚡ Bütün temaların kilidini açtın!"}
            </p>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {appThemes.map((theme) => {
            const unlocked = isThemeUnlocked(
              theme,
              profile.totalPoints,
              profile.isAdmin
            );

            const selected =
              profile.selectedTheme === theme.id;

            const saving =
              savingThemeId === theme.id;

            return (
              <article
                key={theme.id}
                className={`relative overflow-hidden rounded-3xl border p-4 md:p-5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${theme.cardClass}`}
              >
                {!unlocked && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-[3px]">
                    <div className="text-center text-white">
                      <p className="text-4xl sm:text-5xl">🔒</p>

                      <p className="mt-3 font-black">
                        {theme.requiredPoints} puan gerekli
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {theme.requiredPoints -
                          profile.totalPoints}{" "}
                        puan eksik
                      </p>
                    </div>
                  </div>
                )}

                <div
                  className={`relative min-h-44 sm:min-h-52 overflow-hidden rounded-2xl border p-5 ${theme.previewClass}`}
                >
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

                  <div className="relative flex items-start justify-between gap-3">
                    <span className="text-4xl sm:text-5xl">
                      {theme.icon}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}
                    >
                      {theme.requiredPoints === 0
                        ? "Ücretsiz"
                        : `${theme.requiredPoints} puan`}
                    </span>
                  </div>

                  <div className="relative mt-10 sm:mt-14">
                    <p
                      className={`text-xs font-bold uppercase tracking-widest ${theme.mutedTextClass}`}
                    >
                      Has Gardaşlar Ligi
                    </p>

                    <p
                      className={`mt-1 text-2xl font-black ${theme.titleClass}`}
                    >
                      {theme.name}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2
                        className={`text-xl font-black ${theme.titleClass}`}
                      >
                        {theme.name}
                      </h2>

                      <p
                        className={`mt-2 text-sm leading-6 ${theme.mutedTextClass}`}
                      >
                        {theme.description}
                      </p>
                    </div>

                    {selected && (
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${theme.badgeClass}`}
                      >
                        Seçili
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleSelectTheme(theme)
                    }
                    disabled={
                      !unlocked || selected || saving
                    }
                    className={`mt-5 w-full rounded-xl px-4 py-3 font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? theme.secondaryCardClass
                        : unlocked
                          ? theme.primaryButtonClass
                          : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {saving
                      ? "Seçiliyor..."
                      : selected
                        ? "Aktif Tema"
                        : unlocked
                          ? "Temayı Seç"
                          : "Kilitli"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}