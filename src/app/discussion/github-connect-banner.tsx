import { GitFork } from "lucide-react";

export function GithubConnectBanner({ githubLogin }: { githubLogin: string | null }) {
  if (githubLogin) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-text-secondary">
        <GitFork className="h-3.5 w-3.5" />
        GitHub connecté — <span className="text-text">@{githubLogin}</span>
      </div>
    );
  }

  return (
    <a
      href="/api/auth/github"
      className="flex items-center gap-2 rounded-full border border-dashed border-border hover:border-border-strong hover:bg-surface-2 px-4 py-1.5 text-xs text-text-secondary hover:text-text transition-colors"
    >
      <GitFork className="h-3.5 w-3.5" />
      Connecter GitHub pour pousser et déployer votre site
    </a>
  );
}
