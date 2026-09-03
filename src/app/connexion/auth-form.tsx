"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Connexion par lien magique (pas de mot de passe) : plus simple pour un
 * MVP, et évite de gérer le stockage de mots de passe dès le départ.
 */
export function AuthForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-text-secondary">
        Un lien de connexion vient d&apos;être envoyé à {email}. Ouvrez-le pour continuer.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5 text-[13px] text-text-secondary">
        E-mail
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className="rounded-[10px] border border-border-strong bg-surface px-3.5 py-2.5 text-[15px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </label>

      {error ? <p className="text-[13px] text-text-secondary">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          "mt-1.5 rounded-[10px] bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60",
        )}
      >
        {loading ? "Un instant…" : "Recevoir le lien de connexion"}
      </button>
    </form>
  );
}
