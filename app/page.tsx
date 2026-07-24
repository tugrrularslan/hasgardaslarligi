"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
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

type PageMode = "login" | "register";

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

const avatars = [
  "⚽",
  "👑",
  "🔥",
  "⚡",
  "🦁",
  "🐺",
  "🛡️",
  "🎯",
];

export default function HomePage() {
  const [mode, setMode] = useState<PageMode>("login");

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("⚽");

  const [authLoading, setAuthLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);

        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        if (!firebaseUser) {
          setProfile(null);
          setAuthLoading(false);
          return;
        }

        const profileReference = doc(
          db,
          "users",
          firebaseUser.uid
        );

        unsubscribeProfile = onSnapshot(
          profileReference,
          (snapshot) => {
            if (!snapshot.exists()) {
              setProfile({
                uid: firebaseUser.uid,
                username:
                  firebaseUser.displayName ||
                  firebaseUser.email?.split("@")[0] ||
                  "İsimsiz Gardaş",
                email: firebaseUser.email ?? "",
                avatar: "⚽",
                selectedTheme: "klasik",
                totalPoints: 0,
                correctPredictions: 0,
                weeklyWins: 0,
                isAdmin: false,
              });

              setAuthLoading(false);
              return;
            }

            const data = snapshot.data();

            setProfile({
              uid: firebaseUser.uid,

              username:
                typeof data.username === "string" &&
                data.username.trim()
                  ? data.username
                  : firebaseUser.email?.split("@")[0] ||
                    "İsimsiz Gardaş",

              email:
                typeof data.email === "string"
                  ? data.email
                  : firebaseUser.email ?? "",

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

              isAdmin: data.isAdmin === true,
            });

            setAuthLoading(false);
          },
          (error) => {
            console.error(
              "Kullanıcı profili alınamadı:",
              error
            );

            setMessage(
              "Kullanıcı bilgileri alınırken bir hata oluştu."
            );

            setAuthLoading(false);
          }
        );
      },
      (error) => {
        console.error(
          "Oturum bilgisi alınamadı:",
          error
        );

        setMessage(
          "Oturum bilgisi alınırken bir hata oluştu."
        );

        setAuthLoading(false);
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const activeTheme = useMemo(() => {
    return getThemeById(
      profile?.selectedTheme ?? "klasik"
    );
  }, [profile?.selectedTheme]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setFormLoading(true);

    const cleanEmail = email.trim();

    try {
      if (mode === "register") {
        const cleanUsername = username.trim();

        if (cleanUsername.length < 3) {
          throw new Error(
            "Kullanıcı adı en az 3 karakter olmalıdır."
          );
        }

        if (password.length < 6) {
          throw new Error(
            "Şifre en az 6 karakter olmalıdır."
          );
        }

        const result =
          await createUserWithEmailAndPassword(
            auth,
            cleanEmail,
            password
          );

        const newProfile: UserProfile = {
          uid: result.user.uid,
          username: cleanUsername,
          email:
            result.user.email ??
            cleanEmail,
          avatar,
          selectedTheme: "klasik",
          totalPoints: 0,
          correctPredictions: 0,
          weeklyWins: 0,
          isAdmin: false,
        };

        await setDoc(
          doc(
            db,
            "users",
            result.user.uid
          ),
          {
            ...newProfile,

            usernameLower:
              cleanUsername.toLocaleLowerCase(
                "tr-TR"
              ),

            usernameChanged: false,

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );

        setProfile(newProfile);

        setMessage(
          "Kayıt başarılı. Hoş geldin gardaş!"
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );

        setMessage("Giriş başarılı.");
      }

      setPassword("");
    } catch (error) {
      console.error(error);

      setMessage(
        getFirebaseErrorMessage(error)
      );
    } finally {
      setFormLoading(false);
    }
  }

  async function handlePasswordReset() {
    const cleanEmail = email.trim();

    setMessage("");

    if (!cleanEmail) {
      setMessage(
        "Şifre sıfırlamak için önce e-posta adresini yaz."
      );

      return;
    }

    try {
      await sendPasswordResetEmail(
        auth,
        cleanEmail
      );

      setMessage(
        "Şifre sıfırlama bağlantısı e-posta adresine gönderildi."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        getFirebaseErrorMessage(error)
      );
    }
  }

  async function handleLogout() {
    setMessage("");

    try {
      await signOut(auth);

      setUser(null);
      setProfile(null);

      setEmail("");
      setPassword("");
      setUsername("");
      setAvatar("⚽");

      setMode("login");
    } catch (error) {
      console.error(error);

      setMessage(
        "Çıkış yapılırken bir hata oluştu."
      );
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="text-center">
          <div className="text-6xl">
            ⚽
          </div>

          <p className="mt-4 font-bold">
            Has Gardaşlar yükleniyor...
          </p>
        </div>
      </main>
    );
  }

  if (user) {
    return (
      <main
        className={`min-h-screen px-4 py-8 transition-all duration-500 sm:px-6 sm:py-12 ${activeTheme.pageClass}`}
      >
        <div
          className={`mx-auto max-w-6xl rounded-3xl border p-5 shadow-2xl backdrop-blur-md sm:p-8 ${activeTheme.cardClass}`}
        >
          <header className="text-center">
            <div className="text-6xl sm:text-7xl">
              {profile?.avatar ?? "⚽"}
            </div>

            <p
              className={`mt-4 text-sm font-bold uppercase tracking-[0.25em] ${activeTheme.mutedTextClass}`}
            >
              Has Gardaşlar
            </p>

            <SeasonLabel
              className={
                activeTheme.mutedTextClass
              }
            />

            <h1
              className={`mt-3 text-3xl font-black sm:text-4xl ${activeTheme.titleClass}`}
            >
              Hoş geldin,{" "}
              {profile?.username ||
                user.email ||
                "Gardaş"}
            </h1>

            <p
              className={`mt-3 ${activeTheme.mutedTextClass}`}
            >
              Oyunu seç, tahminini yap ve
              zirveye çık.
            </p>
          </header>

          <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title="Toplam Puan"
              value={
                profile?.totalPoints ?? 0
              }
              theme={activeTheme}
            />

            <StatCard
              title="Doğru Tahmin"
              value={
                profile?.correctPredictions ??
                0
              }
              theme={activeTheme}
            />

            <StatCard
              title="Haftalık Zafer"
              value={
                profile?.weeklyWins ?? 0
              }
              theme={activeTheme}
            />

            <StatCard
              title="Aktif Tema"
              value={activeTheme.name}
              theme={activeTheme}
            />
          </section>

          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/games"
              className={`flex min-h-[120px] items-center justify-center rounded-2xl px-6 py-5 text-center text-xl font-black transition hover:-translate-y-1 ${activeTheme.primaryButtonClass}`}
            >
              🎮 Oyunlar
            </Link>

            <Link
              href="/profile"
              className={`flex min-h-[120px] items-center justify-center rounded-2xl px-6 py-5 text-center text-xl font-black transition hover:-translate-y-1 ${activeTheme.secondaryButtonClass}`}
            >
              👤 Profilim
            </Link>
          </section>

          {profile?.isAdmin && (
            <section className="mt-6 space-y-3">
              <div
                className={`rounded-2xl border p-4 text-center font-bold ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
              >
                👑 Yönetici hesabıyla
                giriş yaptın
              </div>

              <Link
                href="/admin"
                className={`block w-full rounded-2xl px-6 py-4 text-center text-lg font-black transition hover:-translate-y-1 ${activeTheme.primaryButtonClass}`}
              >
                👑 Admin Paneline Git
              </Link>
            </section>
          )}

          {message && (
            <div
              className={`mt-6 rounded-xl border p-4 text-center text-sm ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}
            >
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className={`mt-8 w-full rounded-2xl px-6 py-4 text-lg font-black transition hover:-translate-y-1 ${activeTheme.secondaryButtonClass}`}
          >
            🚪 Çıkış Yap
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-950 via-red-900 to-black px-4 py-10 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-red-400/40 bg-red-950/80 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <header className="mb-8 text-center">
          <div className="text-6xl">
            ⚽
          </div>

          <h1 className="mt-4 text-2xl font-black tracking-wide sm:text-3xl">
            HAS GARDAŞLAR
          </h1>

          <p className="mt-3 text-sm text-red-100/70">
            Tahminini yap, gardaşlığını
            kanıtla!
          </p>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
            className={`rounded-lg py-3 font-bold transition ${
              mode === "login"
                ? "bg-white text-red-700"
                : "text-red-100/70 hover:bg-white/10"
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
            className={`rounded-lg py-3 font-bold transition ${
              mode === "register"
                ? "bg-white text-red-700"
                : "text-red-100/70 hover:bg-white/10"
            }`}
          >
            Kayıt Ol
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {mode === "register" && (
            <>
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium text-red-100"
                >
                  Kullanıcı adı
                </label>

                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value
                    )
                  }
                  required
                  minLength={3}
                  autoComplete="username"
                  placeholder="Örnek: DeliGobel"
                  className="w-full rounded-xl border border-red-300/30 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-red-100/40 focus:border-white"
                />
              </div>

              <div>
                <p className="mb-2 block text-sm font-medium text-red-100">
                  Avatar
                </p>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {avatars.map(
                    (avatarItem) => (
                      <button
                        key={avatarItem}
                        type="button"
                        onClick={() =>
                          setAvatar(
                            avatarItem
                          )
                        }
                        className={`rounded-lg border py-2 text-xl transition ${
                          avatar ===
                          avatarItem
                            ? "border-white bg-white/20"
                            : "border-red-300/20 bg-black/20 hover:bg-white/10"
                        }`}
                        aria-label={`${avatarItem} avatarını seç`}
                      >
                        {avatarItem}
                      </button>
                    )
                  )}
                </div>
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-red-100"
            >
              E-posta
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
              autoComplete="email"
              placeholder="ornek@email.com"
              className="w-full rounded-xl border border-red-300/30 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-red-100/40 focus:border-white"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-red-100"
            >
              Şifre
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              required
              minLength={6}
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              placeholder="En az 6 karakter"
              className="w-full rounded-xl border border-red-300/30 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-red-100/40 focus:border-white"
            />
          </div>

          {mode === "login" && (
            <button
              type="button"
              onClick={
                handlePasswordReset
              }
              className="w-full text-sm font-bold text-red-100 underline underline-offset-4 transition hover:text-white"
            >
              Şifremi unuttum
            </button>
          )}

          {message && (
            <div className="rounded-xl border border-white/20 bg-white/10 p-3 text-sm">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={formLoading}
            className="w-full rounded-xl bg-white px-4 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {formLoading
              ? "İşlem yapılıyor..."
              : mode === "login"
                ? "Giriş Yap"
                : "Has Gardaşlar'a Katıl"}
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
      <div
        className={`text-xl font-black ${theme.titleClass}`}
      >
        {value}
      </div>

      <div
        className={`mt-1 text-xs ${theme.mutedTextClass}`}
      >
        {title}
      </div>
    </div>
  );
}

function normalizeThemeId(
  selectedTheme: string
): string {
  const normalizedTheme =
    selectedTheme.trim();

  if (
    normalizedTheme === "Klasik" ||
    normalizedTheme.toLocaleLowerCase(
      "tr-TR"
    ) === "klasik"
  ) {
    return "klasik";
  }

  return normalizedTheme;
}

function getFirebaseErrorMessage(
  error: unknown
): string {
  if (!(error instanceof Error)) {
    return "Beklenmeyen bir hata oluştu.";
  }

  const code =
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Bu e-posta adresi zaten kullanılıyor.";

    case "auth/invalid-email":
      return "Geçerli bir e-posta adresi gir.";

    case "auth/weak-password":
      return "Şifre en az 6 karakter olmalıdır.";

    case "auth/invalid-credential":
      return "E-posta veya şifre yanlış.";

    case "auth/user-not-found":
      return "Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.";

    case "auth/wrong-password":
      return "E-posta veya şifre yanlış.";

    case "auth/too-many-requests":
      return "Çok fazla deneme yapıldı. Biraz sonra tekrar dene.";

    case "auth/network-request-failed":
      return "İnternet bağlantısı kurulamadı.";

    case "permission-denied":
      return "Firestore erişim izni reddedildi.";

    default:
      return (
        error.message ||
        "Bir hata oluştu."
      );
  }
}