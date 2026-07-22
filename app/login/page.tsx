"use client";

import { FormEvent, useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import SeasonLabel from "@/components/SeasonLabel";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!email || !password) {
      setMessage("E-posta ve şifre alanlarını doldurun.");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(auth, email, password);

      setMessage("Giriş başarılı.");

      window.location.href = "/predictions";
    } catch (error: any) {
      console.error(error);

      if (error.code === "auth/invalid-credential") {
        setMessage("E-posta veya şifre yanlış.");
      } else if (error.code === "auth/too-many-requests") {
        setMessage("Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.");
      } else {
        setMessage("Giriş yapılırken bir hata oluştu.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setMessage("");

    if (!email) {
      setMessage(
        "Önce e-posta adresinizi yazın, sonra Şifremi Unuttum butonuna basın."
      );
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email);

      setMessage(
        "Şifre değiştirme bağlantısı e-posta adresinize gönderildi. Spam klasörünü de kontrol edin."
      );
    } catch (error: any) {
      console.error(error);

      if (error.code === "auth/invalid-email") {
        setMessage("Geçerli bir e-posta adresi girin.");
      } else if (error.code === "auth/too-many-requests") {
        setMessage("Çok fazla istek gönderildi. Bir süre sonra tekrar deneyin.");
      } else {
        setMessage("Şifre sıfırlama e-postası gönderilemedi.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Has Gardaşlar Ligi</h1>
        <SeasonLabel className="season-label" />
        <p className="login-description">Hesabınıza giriş yapın</p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">E-posta</label>

          <input
            id="email"
            type="email"
            placeholder="ornek@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />

          <label htmlFor="password">Şifre</label>

          <input
            id="password"
            type="password"
            placeholder="Şifrenizi girin"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          <button type="submit" disabled={loading}>
            {loading ? "İşlem yapılıyor..." : "Giriş Yap"}
          </button>

          <button
            type="button"
            className="forgot-password"
            onClick={handlePasswordReset}
            disabled={loading}
          >
            Şifremi Unuttum
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </section>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: linear-gradient(135deg, #071c13, #123c2b);
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 32px;
          border-radius: 20px;
          background: white;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        }

        h1 {
          margin: 0;
          text-align: center;
          color: #123c2b;
        }

        .season-label {
          margin: 8px 0 0;
          text-align: center;
          color: #146c43;
        }

        .login-description {
          margin: 8px 0 24px;
          text-align: center;
          color: #666;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        label {
          margin-top: 8px;
          font-weight: 600;
          color: #222;
        }

        input {
          width: 100%;
          padding: 13px 14px;
          border: 1px solid #ccc;
          border-radius: 10px;
          font-size: 16px;
          box-sizing: border-box;
        }

        input:focus {
          outline: 2px solid #1e7c55;
          border-color: transparent;
        }

        button {
          margin-top: 14px;
          padding: 13px;
          border: none;
          border-radius: 10px;
          background: #146c43;
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .forgot-password {
          margin-top: 2px;
          background: transparent;
          color: #146c43;
        }

        .message {
          margin-top: 20px;
          padding: 12px;
          border-radius: 10px;
          background: #eef7f2;
          color: #123c2b;
          text-align: center;
        }
      `}</style>
    </main>
  );
}