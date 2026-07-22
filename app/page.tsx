"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { getThemeById, type AppTheme } from "@/lib/themes";

type UserProfile = {
  uid: string;
  username: string;
  email: string;
  avatar: string;
  selectedTheme: string;
  totalPoints: number;
  correctPredictions: number;
  weeklyWins: number;
  isAdmin: boolean;
};

const avatars = ["⚽", "👑", "🔥", "⚡", "🦁", "🐺", "🛡️", "🎯"];

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("⚽");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const userReference = doc(db, "users", firebaseUser.uid);

      unsubscribeProfile = onSnapshot(
        userReference,
        (snapshot) => {
          if (!snapshot.exists()) {
            setProfile(null);
            setMessage("Kullanıcı profili bulunamadı.");
            setLoading(false);
            return;
          }

          const data = snapshot.data();

          setProfile({
            uid: firebaseUser.uid,
            username:
              typeof data.username === "string" && data.username.trim()
                ? data.username
                : "İsimsiz Gardaş",
            email:
              typeof data.email === "string"
                ? data.email
                : firebaseUser.email ?? "",
            avatar:
              typeof data.avatar === "string" && data.avatar
                ? data.avatar
                : "⚽",
            selectedTheme:
              typeof data.selectedTheme === "string"
                ? normalizeThemeId(data.selectedTheme)
                : "klasik",
            totalPoints:
              typeof data.totalPoints === "number" ? data.totalPoints : 0,
            correctPredictions:
              typeof data.correctPredictions === "number"
                ? data.correctPredictions
                : 0,
            weeklyWins:
              typeof data.weeklyWins === "number" ? data.weeklyWins : 0,
            isAdmin: data.isAdmin === true,
          });

          setLoading(false);
        },
        (error) => {
          console.error(error);
          setMessage("Kullanıcı bilgileri alınamadı.");
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const activeTheme = useMemo(() => {
    return getThemeById(profile?.selectedTheme);
  }, [profile?.selectedTheme]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      if (mode === "register") {
        if (username.trim().length < 3) {
          throw new Error("Kullanıcı adı en az 3 karakter olmalıdır.");
        }

        if (password.length < 6) {
          throw new Error("Şifre en az 6 karakter olmalıdır.");
        }

        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        const userProfile: UserProfile = {
          uid: result.user.uid,
          username: username.trim(),
          email: result.user.email ?? email.trim(),
          avatar,
          selectedTheme: "klasik",
          totalPoints: 0,
          correctPredictions: 0,
          weeklyWins: 0,
          isAdmin: false,
        };

        await setDoc(doc(db, "users", result.user.uid), {
          ...userProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setProfile(userProfile);
        setMessage("Kayıt başarılı. Hoş geldin gardaş!");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setMessage("Giriş başarılı.");
      }

      setPassword("");
    } catch (error) {
      setMessage(getFirebaseErrorMessage(error));
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setMessage("");
      setProfile(null);
    } catch {
      setMessage("Çıkış yapılırken bir hata oluştu.");
    }
  }

  if (loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Yükleniyor...
      </main>
    );
  }

  if (user) {
    return (
      <main
        className={`min-h-screen px-4 py-10 transition-all duration-500 sm:px-6 sm:py-12 ${activeTheme.pageClass}`}
      >
        <div
          className={`mx-auto max-w-5xl rounded-3xl border p-6 shadow-2xl backdrop-blur-md sm:p-8 ${activeTheme.cardClass}`}
        >
          <div className="mb-7 text-center">
            <div className="mb-3 text-6xl sm:text-7xl">
              {profile?.avatar ?? "⚽"}
            </div>

            <p
              className={`text-sm font-bold uppercase tracking-[0.25em] ${activeTheme.mutedTextClass}`}
            >
              Has Gardaşlar Ligi
            </p>

            <SeasonLabel className={activeTheme.mutedTextClass} />

            <h1
              className={`mt-2 text-3xl font-black ${activeTheme.titleClass}`}
            >
              Hoş geldin, {profile?.username ?? user.email}
            </h1>

            <p className={`mt-2 ${activeTheme.mutedTextClass}`}>
              Tahminini Yap, Gardaşlığını Kanıtla!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:grid-cols-4">
            <StatCard
              title="Toplam Puan"
              value={profile?.totalPoints ?? 0}
              theme={activeTheme}
            />

            <StatCard
              title="Doğru Tahmin"
              value={profile?.correctPredictions ?? 0}
              theme={activeTheme}
            />

            <StatCard
              title="Haftalık Zafer"
              value={profile?.weeklyWins ?? 0}
              theme={activeTheme}
            />

            <StatCard
              title="Aktif Tema"
              value={activeTheme.name}
              theme={activeTheme}
            />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
  <Link
    href="/predictions"
    className={`flex min-h-[90px] w-full items-center justify-center rounded-xl px-4 py-3 text-center font-black transition ${activeTheme.primaryButtonClass}`}
  >
    ⚽ Tahmin Yap
  </Link>

  <Link
    href="/standings"
    className={`flex min-h-[90px] w-full items-center justify-center rounded-xl px-4 py-3 text-center font-black transition ${activeTheme.secondaryButtonClass}`}
  >
    📊 Puan Durumu
  </Link>

  <Link
    href="/themes"
    className={`flex min-h-[90px] w-full items-center justify-center rounded-xl px-4 py-3 text-center font-black transition ${activeTheme.secondaryButtonClass}`}
  >
    🎨 Tema Mağazası
  </Link>

  <Link
    href="/profile"
    className={`flex min-h-[90px] w-full items-center justify-center rounded-xl px-4 py-3 text-center font-black transition ${activeTheme.secondaryButtonClass}`}
  >
    👤 Profilim
  </Link>
</div>
          {profile?.isAdmin && (
            <div className="mt-6 space-y-3">
              <div
                className={`rounded-xl border p-4 text-center font-bold ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
              >
                👑 Yönetici hesabı
              </div>

              <Link
                href="/admin"
                className={`block w-full rounded-xl px-4 py-3 text-center font-black transition ${activeTheme.primaryButtonClass}`}
              >
                Admin Paneline Git
              </Link>
            </div>
          )}

          {message && (
            <div
              className={`mt-6 rounded-xl border p-3 text-sm ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
            >
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className={`mt-8 w-full rounded-xl px-4 py-3 font-bold transition ${activeTheme.secondaryButtonClass}`}
          >
            Çıkış Yap
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-950 via-red-900 to-black px-4 py-10 text-white">
      <div className="w-full max-w-md sm:max-w-lg rounded-3xl border border-red-400/40 bg-red-950/80 p-8 shadow-2xl backdrop-blur-md">
        <div className="mb-8 text-center">
          <div className="mb-3 text-6xl">⚽</div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-wide text-white">
            HAS GARDAŞLAR LİGİ
          </h1>

          <p className="mt-3 text-sm text-red-100/70">
            Tahminini Yap, Gardaşlığını Kanıtla!
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl bg-black/30 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
            className={`rounded-lg py-2 font-bold transition ${
              mode === "login"
                ? "bg-white text-red-700"
                : "text-red-100/70"
            }`}
          >
            Giriş
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
            className={`rounded-lg py-2 font-bold transition ${
              mode === "register"
                ? "bg-white text-red-700"
                : "text-red-100/70"
            }`}
          >
            Kayıt Ol
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-red-100">
                  Kullanıcı adı
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  minLength={3}
                  placeholder="Örnek: DeliGobel"
                  className="w-full rounded-xl border border-red-300/30 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-red-100/40 focus:border-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-red-100">
                  Avatar
                </label>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {avatars.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setAvatar(item)}
                      className={`rounded-lg py-2 text-xl transition ${
                        avatar === item
                          ? "bg-white text-red-700"
                          : "bg-black/30 hover:bg-white/10"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-red-100">
              E-posta
            </label>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="ornek@email.com"
              className="w-full rounded-xl border border-red-300/30 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-red-100/40 focus:border-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-red-100">
              Şifre
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              placeholder="En az 6 karakter"
              className="w-full rounded-xl border border-red-300/30 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-red-100/40 focus:border-white"
            />
          </div>

          {message && (
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "İşlem yapılıyor..."
              : mode === "login"
                ? "Giriş Yap"
                : "Gardaşlar Ligine Katıl"}
          </button>
        </form>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  theme,
}: {
  title: string;
  value: string | number;
  theme: AppTheme;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-center ${theme.secondaryCardClass}`}
    >
      <div className={`text-xl font-black ${theme.titleClass}`}>
        {value}
      </div>

      <div className={`mt-1 text-xs ${theme.mutedTextClass}`}>
        {title}
      </div>
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

function getFirebaseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Beklenmeyen bir hata oluştu.";
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Bu e-posta adresi zaten kullanılıyor.";
    case "auth/invalid-email":
      return "Geçerli bir e-posta adresi gir.";
    case "auth/weak-password":
      return "Şifre en az 6 karakter olmalıdır.";
    case "auth/invalid-credential":
      return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests":
      return "Çok fazla deneme yapıldı. Biraz sonra tekrar dene.";
    case "permission-denied":
      return "Firestore erişim izni reddedildi.";
    default:
      return error.message || "Bir hata oluştu.";
  }
}