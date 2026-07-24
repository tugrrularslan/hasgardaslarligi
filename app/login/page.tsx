"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    if (!email || !password) { setMessage("E-posta ve şifre alanlarını doldurun."); return; }
    try { setLoading(true); await signInWithEmailAndPassword(auth, email, password); window.location.href = "/predictions"; }
    catch (error: any) {
      console.error(error);
      setMessage(error.code === "auth/invalid-credential" ? "E-posta veya şifre yanlış." : error.code === "auth/too-many-requests" ? "Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin." : "Giriş yapılırken bir hata oluştu.");
    } finally { setLoading(false); }
  }

  async function handlePasswordReset() {
    setMessage("");
    if (!email) { setMessage("Önce e-posta adresinizi yazın."); return; }
    try { setLoading(true); await sendPasswordResetEmail(auth, email); setMessage("Şifre değiştirme bağlantısı e-posta adresinize gönderildi."); }
    catch (error) { console.error(error); setMessage("Şifre sıfırlama e-postası gönderilemedi."); }
    finally { setLoading(false); }
  }

  return (
    <main className="hg-login-page">
      <section className="hg-login-card">
        <Image src="/themes/obsidyen.png" alt="Has Gardaşlar Obsidyen arması" width={160} height={220} className="hg-login-emblem" priority />
        <p className="text-center text-xs font-black uppercase tracking-[.28em] text-amber-300/70">Aslanlı Kapı’dan ilhamla</p>
        <h1 className="mt-2 text-center text-3xl font-black text-amber-200">Has Gardaşlar</h1>
        <SeasonLabel className="mt-2 text-center text-amber-100/60" />
        <p className="mb-6 mt-2 text-center text-sm text-zinc-400">Ligdeki yerini almak için giriş yap</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <label htmlFor="email" className="mt-1 font-bold text-amber-100">E-posta</label>
          <input id="email" type="email" placeholder="ornek@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <label htmlFor="password" className="mt-1 font-bold text-amber-100">Şifre</label>
          <input id="password" type="password" placeholder="Şifrenizi girin" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button type="submit" disabled={loading} className="mt-3 rounded-xl border border-amber-300/50 bg-gradient-to-r from-amber-500 to-yellow-300 px-4 py-3 font-black text-black disabled:opacity-60">{loading ? "İşlem yapılıyor..." : "Giriş Yap"}</button>
          <button type="button" onClick={handlePasswordReset} disabled={loading} className="rounded-xl px-4 py-2 font-bold text-amber-300 hover:bg-amber-400/10 disabled:opacity-60">Şifremi Unuttum</button>
        </form>
        {message && <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</p>}
      </section>
    </main>
  );
}
