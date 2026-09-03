/** Triangle Vercel — pas d'icône de marque dans lucide-react, dessinée en inline SVG. */
function VercelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2 22 20H2Z" fill="currentColor" />
    </svg>
  );
}

export function VercelConnectBanner({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-text-secondary">
        <VercelMark className="h-3 w-3 text-text" />
        Vercel connecté
      </div>
    );
  }

  return (
    <a
      href="/api/auth/vercel"
      className="flex items-center gap-2 rounded-full border border-dashed border-border hover:border-border-strong hover:bg-surface-2 px-4 py-1.5 text-xs text-text-secondary hover:text-text transition-colors"
    >
      <VercelMark className="h-3 w-3" />
      Connecter Vercel pour déployer votre site
    </a>
  );
}
