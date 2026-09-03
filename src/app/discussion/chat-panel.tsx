"use client";

import { useState } from "react";
import { ExternalLink, GitFork, Loader2 } from "lucide-react";
import { SiteBuilderChat } from "@/components/ui/chat-input";

interface Turn {
  role: "user" | "assistant";
  text: string;
  repoUrl?: string;
  deployUrl?: string;
}

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function handleSubmit(value: string) {
    if (!value.trim()) return;
    setTurns((t) => [...t, { role: "user", text: value }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, conversationId }),
      });
      const data = await res.json();

      if (data.conversationId) setConversationId(data.conversationId);

      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", text: data.error ?? "Une erreur est survenue." },
        ]);
        return;
      }

      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: data.reply ?? "",
          repoUrl: data.repoUrl,
          deployUrl: data.deployUrl,
        },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: "Connexion impossible. Réessayez dans un instant." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      {turns.length > 0 && (
        <div className="flex flex-col gap-4">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={
                turn.role === "user"
                  ? "self-end max-w-[80%] rounded-2xl bg-accent px-4 py-2.5 text-sm text-white"
                  : "self-start max-w-[80%] rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-text"
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
              {(turn.repoUrl || turn.deployUrl) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {turn.repoUrl && (
                    <a
                      href={turn.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-xs text-text hover:border-accent transition-colors"
                    >
                      <GitFork className="h-3.5 w-3.5" />
                      Voir le code
                    </a>
                  )}
                  {turn.deployUrl && (
                    <a
                      href={turn.deployUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Voir le site en ligne
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 self-start text-xs text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              L&apos;agent conçoit et déploie votre site…
            </div>
          )}
        </div>
      )}

      <SiteBuilderChat
        onSubmit={(value) => handleSubmit(value)}
        disabled={loading}
        hideTitle={turns.length > 0}
      />
    </div>
  );
}
