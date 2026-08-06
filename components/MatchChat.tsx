"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ProfileAvatar from "@/components/ProfileAvatar";
import HittiteIcon from "@/components/HittiteIcon";
import { auth } from "@/lib/firebase";
import type { AppTheme } from "@/lib/themes";

type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  createdAt: number;
  canDelete: boolean;
};

type MatchChatProps = {
  matchId: string;
  matchLabel: string;
  theme: AppTheme;
};

export default function MatchChat({
  matchId,
  matchLabel,
  theme,
}: MatchChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const requestInFlight = useRef(false);

  const loadMessages = useCallback(
    async (showLoading = false) => {
      const user = auth.currentUser;
      if (!user) {
        if (showLoading) setLoading(false);
        return;
      }

      if (requestInFlight.current) return;

      requestInFlight.current = true;

      if (showLoading) setLoading(true);

      try {
        const idToken = await user.getIdToken();
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(
          `/api/match-chat?matchId=${encodeURIComponent(matchId)}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
            cache: "no-store",
            signal: controller.signal,
          },
        );
        window.clearTimeout(timeout);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Mesajlar alınamadı.");
        }

        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setErrorMessage("");
      } catch (error) {
        console.error(error);
        setErrorMessage(
          error instanceof DOMException && error.name === "AbortError"
            ? "Sohbet zamanında yanıt vermedi. Tekrar deneyebilirsin."
            : error instanceof Error
              ? error.message
              : "Mesajlar alınamadı.",
        );
      } finally {
        requestInFlight.current = false;
        if (showLoading) setLoading(false);
      }
    },
    [matchId],
  );

  useEffect(() => {
    if (!open) return;

    void loadMessages(true);

    const refreshTimer = window.setInterval(() => {
      void loadMessages(false);
    }, 15_000);

    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [loadMessages, open]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const user = auth.currentUser;
    const cleanText = text.replace(/\s+/g, " ").trim();

    if (!user || !cleanText || sending) return;

    setSending(true);
    setErrorMessage("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/match-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          matchId,
          text: cleanText,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Mesaj gönderilemedi.");
      }

      setText("");
      await loadMessages(false);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Mesaj gönderilemedi.",
      );
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/match-chat", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ messageId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Mesaj silinemedi.");
      }

      setMessages((current) =>
        current.filter((message) => message.id !== messageId),
      );
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Mesaj silinemedi.",
      );
    }
  }

  return (
    <div
      className={`mt-5 overflow-hidden rounded-2xl border ${theme.secondaryCardClass}`}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-black transition ${theme.textClass}`}
      >
        <span className="hg-icon-label">
          <HittiteIcon name="group" size="sm" />
          Maç Muhabbeti
          {messages.length > 0 && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${theme.badgeClass}`}
            >
              {messages.length}
            </span>
          )}
        </span>

        <span
          className={`text-lg transition-transform ${
            open ? "rotate-180" : ""
          } ${theme.mutedTextClass}`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      {open && (
        <div className={`border-t p-3 sm:p-4 ${theme.borderClass}`}>
          <p className={`mb-3 text-xs ${theme.mutedTextClass}`}>
            {matchLabel} hakkında gardaşça konuş. Son 40 mesaj gösterilir.
          </p>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <p className={`py-6 text-center text-sm ${theme.mutedTextClass}`}>
                Muhabbet yükleniyor...
              </p>
            ) : errorMessage ? (
              <div className={`rounded-xl border p-4 text-center text-sm ${theme.cardClass}`}>
                <p className="text-red-400">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => void loadMessages(true)}
                  className={`mt-3 rounded-lg px-3 py-2 text-xs font-black ${theme.secondaryButtonClass}`}
                >
                  Tekrar Dene
                </button>
              </div>
            ) : messages.length === 0 ? (
              <p className={`py-6 text-center text-sm ${theme.mutedTextClass}`}>
                İlk sözü sen söyle.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${theme.cardClass}`}
                >
                  <ProfileAvatar
                    avatar={message.avatar}
                    alt={message.username}
                    className="h-9 w-9 rounded-full"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`break-words text-sm font-black ${theme.textClass}`}
                      >
                        {message.username}
                      </span>
                      <time
                        className={`text-[11px] ${theme.mutedTextClass}`}
                      >
                        {formatMessageTime(message.createdAt)}
                      </time>
                    </div>

                    <p
                      className={`mt-1 break-words text-sm leading-relaxed ${theme.textClass}`}
                    >
                      {message.text}
                    </p>
                  </div>

                  {message.canDelete && (
                    <button
                      type="button"
                      onClick={() => deleteMessage(message.id)}
                      title="Mesajı sil"
                      aria-label={`${message.username} kullanıcısının mesajını sil`}
                      className={`rounded-lg px-2 py-1 text-xs font-black transition ${theme.secondaryButtonClass}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <form onSubmit={sendMessage} className="mt-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={240}
                placeholder="Bu maç için ne diyorsun?"
                aria-label="Maç muhabbeti mesajı"
                className={`min-w-0 flex-1 rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition focus:ring-2 ${theme.borderClass} ${theme.textClass}`}
              />

              <button
                type="submit"
                disabled={!text.trim() || sending}
                className={`rounded-xl px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${theme.primaryButtonClass}`}
              >
                {sending ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-red-400">
                {errorMessage}
              </span>
              <span className={`text-xs ${theme.mutedTextClass}`}>
                {text.length}/240
              </span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function formatMessageTime(timestamp: number) {
  if (!timestamp) return "şimdi";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
