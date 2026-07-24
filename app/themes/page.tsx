"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";
import { appThemes, getThemeById, normalizeThemeId, type AppTheme } from "@/lib/themes";

type UserProfile = { username: string; selectedTheme: string };

export default function ThemesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingThemeId, setSavingThemeId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(auth, (firebaseUser) => {
    if (!firebaseUser) { router.replace("/"); return; }
    setCurrentUser(firebaseUser);
  }), [router]);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(doc(db, "users", currentUser.uid), (snapshot) => {
      if (!snapshot.exists()) { setMessage("Kullanıcı profili bulunamadı."); setLoading(false); return; }
      const data = snapshot.data();
      setProfile({
        username: typeof data.username === "string" && data.username.trim() ? data.username : "İsimsiz Gardaş",
        selectedTheme: normalizeThemeId(typeof data.selectedTheme === "string" ? data.selectedTheme : null),
      });
      setLoading(false);
    }, (error) => {
      console.error(error);
      setMessage("Tema bilgileri alınamadı.");
      setLoading(false);
    });
  }, [currentUser]);

  const activeTheme = useMemo(() => getThemeById(profile?.selectedTheme), [profile?.selectedTheme]);

  async function handleSelectTheme(theme: AppTheme) {
    if (!currentUser || !profile || profile.selectedTheme === theme.id) return;
    setSavingThemeId(theme.id);
    setMessage("");
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        selectedTheme: theme.id,
        updatedAt: serverTimestamp(),
      });
      setMessage(`${theme.name} teması uygulamanın tamamına uygulandı.`);
    } catch (error) {
      console.error(error);
      setMessage("Tema seçilemedi. Firestore kurallarını kontrol et.");
    } finally { setSavingThemeId(null); }
  }

  if (loading) return <main className="theme-surface theme-obsidyen flex min-h-screen items-center justify-center text-amber-200">Dört özel tema hazırlanıyor...</main>;
  if (!profile) return null;

  return (
    <main className={`min-h-screen px-3 py-6 sm:px-5 lg:px-6 ${activeTheme.pageClass}`}>
      <div className="mx-auto max-w-7xl">
        <header className={`mb-8 rounded-3xl border p-6 ${activeTheme.headerClass}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className={`text-sm font-bold uppercase tracking-[.24em] ${activeTheme.mutedTextClass}`}>Has Gardaşlar</p>
              <SeasonLabel className={activeTheme.mutedTextClass} />
              <h1 className={`mt-2 text-3xl font-black sm:text-4xl ${activeTheme.titleClass}`}>4 Özel Tema</h1>
              <p className={`mt-2 max-w-2xl ${activeTheme.mutedTextClass}`}>Obsidyen, Hitit Zeytini, Traverten ve Bazalt herkese açık. Seçtiğin kimlik tüm ekranlara yansır.</p>
            </div>
            <Link href="/" className={`rounded-xl px-5 py-3 text-center font-bold ${activeTheme.secondaryButtonClass}`}>Ana Sayfaya Dön</Link>
          </div>
        </header>

        {message && <div className={`mb-6 rounded-2xl border p-4 ${activeTheme.secondaryCardClass} ${activeTheme.textClass}`}>{message}</div>}

        <section className={`mb-8 rounded-3xl border p-5 ${activeTheme.cardClass}`}>
          <p className={`text-sm font-bold uppercase tracking-widest ${activeTheme.mutedTextClass}`}>Aktif kimlik</p>
          <div className="mt-3 flex items-center gap-4">
            <Image src={activeTheme.emblem} alt={activeTheme.name} width={76} height={104} className="h-24 w-16 rounded-xl object-cover object-top" />
            <div><h2 className={`text-2xl font-black ${activeTheme.titleClass}`}>{activeTheme.name}</h2><p className={activeTheme.mutedTextClass}>{profile.username} için tüm sayfalarda kullanılıyor.</p></div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {appThemes.map((theme) => {
            const selected = profile.selectedTheme === theme.id;
            const saving = savingThemeId === theme.id;
            return (
              <article key={theme.id} className={`overflow-hidden rounded-3xl border p-4 transition duration-300 hover:-translate-y-2 ${theme.cardClass}`}>
                <div className={`relative overflow-hidden rounded-2xl border ${theme.previewClass}`}>
                  <Image src={theme.emblem} alt={`${theme.name} arması`} width={500} height={720} className="h-[300px] w-full object-cover object-top" priority={theme.id === "obsidyen"} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-16">
                    <p className="text-xs font-black uppercase tracking-[.22em] text-white/70">Has Gardaşlar</p>
                    <h2 className="mt-1 text-2xl font-black text-white">{theme.name}</h2>
                  </div>
                </div>
                <p className={`mt-4 min-h-12 text-sm leading-6 ${theme.mutedTextClass}`}>{theme.description}</p>
                <button type="button" onClick={() => handleSelectTheme(theme)} disabled={selected || saving} className={`mt-4 w-full rounded-xl px-4 py-3 font-black transition disabled:cursor-not-allowed ${selected ? theme.secondaryCardClass : theme.primaryButtonClass}`}>
                  {saving ? "Uygulanıyor..." : selected ? "Kullanılıyor" : "Temayı Kullan"}
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
