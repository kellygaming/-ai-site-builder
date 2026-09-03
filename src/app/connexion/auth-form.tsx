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

  async function handleGoogleSignIn() {
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (signInError) {
      setError(signInError.message);
    }
    // Sinon : redirection immédiate vers Google, rien d'autre à faire ici.
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-text-secondary">
        Un lien de connexion vient d&apos;être envoyé à {email}. Ouvrez-le pour continuer.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="flex items-center justify-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-6 py-3 text-sm font-semibold text-text hover:bg-surface-2 transition-colors"
      >
        <GoogleIcon className="h-4 w-4" />
        Continuer avec Google
      </button>

      <div className="flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

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
            "rounded-[10px] bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60",
          )}
        >
          {loading ? "Un instant…" : "Recevoir le lien de connexion"}
        </button>
      </form>
    </div>
  );
}

/** Logo "G" officiel Google — absent de lucide-react (pas d'icônes de marques). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a12 12 0 0 0 0 10.8l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.6l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
