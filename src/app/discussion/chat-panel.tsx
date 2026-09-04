"use client";

import { useState } from "react";
import { ExternalLink, GitFork, Loader2, Rocket } from "lucide-react";
import { SiteBuilderChat } from "@/components/ui/chat-input";

interface SiteFile {
  path: string;
  content: string;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_TEXT_FILE_BYTES = 200_000;

/**
 * L'aperçu est rendu via srcDoc : l'iframe n'a pas d'URL propre, donc un lien
 * relatif du site généré ("/reserver") se résout contre NOTRE domaine. Cliquer
 * dessus faisait naviguer l'iframe vers l'application et remplaçait l'aperçu
 * par notre page de connexion. On neutralise donc toute navigation à
 * l'intérieur de l'aperçu, en laissant vivre les ancres internes (#contact)
 * pour que le défilement et le menu du site restent démontrables au client.
 */
const PREVIEW_NAVIGATION_GUARD = `<script>
(function () {
  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest("a");
    if (!link) return;
    var href = link.getAttribute("href") || "";
    if (href.charAt(0) === "#") return;
    event.preventDefault();
  }, true);
  document.addEventListener("submit", function (event) {
    event.preventDefault();
  }, true);
})();
</script>`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ repoUrl: string; deployUrl: string } | null>(null);

  async function handleSubmit(value: string, files: File[]) {
    if (!value.trim() && files.length === 0) return;

    const images: { mediaType: string; data: string }[] = [];
    const textFiles: { name: string; content: string }[] = [];

    for (const file of files) {
      if (SUPPORTED_IMAGE_TYPES.has(file.type)) {
        images.push({ mediaType: file.type, data: await fileToBase64(file) });
      } else if (file.size <= MAX_TEXT_FILE_BYTES) {
        textFiles.push({ name: file.name, content: await file.text() });
      }
    }

    const label = value.trim() || `📎 ${files.length} fichier(s) joint(s)`;
    setTurns((t) => [...t, { role: "user", text: label }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, conversationId, images, textFiles }),
      });

      // Un timeout de fonction renvoie une page d'erreur HTML, pas du JSON :
      // on le distingue pour donner une consigne utile plutôt qu'un message
      // générique de panne réseau.
      const raw = await res.text();
      let data: { conversationId?: string; reply?: string; error?: string; files?: SiteFile[] };
      try {
        data = JSON.parse(raw);
      } catch {
        setTurns((t) => [
          ...t,
          {
            role: "assistant",
            text:
              res.status === 504 || raw.includes("TIMEOUT")
                ? "La génération a pris trop de temps et a été interrompue. Demandez un site plus simple (moins de sections), ou réessayez."
                : "Le serveur a renvoyé une réponse inattendue. Réessayez dans un instant.",
          },
        ]);
        return;
      }

      if (data.conversationId) setConversationId(data.conversationId);

      if (!res.ok) {
        setTurns((t) => [...t, { role: "assistant", text: data.error ?? "Une erreur est survenue." }]);
        return;
      }

      setTurns((t) => [...t, { role: "assistant", text: data.reply ?? "" }]);

      const indexFile = (data.files as SiteFile[] | undefined)?.find((f) =>
        f.path.endsWith("index.html"),
      );
      if (indexFile) {
        setPreviewHtml(indexFile.content);
        // Le site a changé : la version publiée n'est plus à jour.
        setPublished(null);
      }
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: "Connexion impossible. Réessayez dans un instant." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    if (!conversationId) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setTurns((t) => [...t, { role: "assistant", text: data.error ?? "Échec de la publication." }]);
        return;
      }

      setPublished({ repoUrl: data.repoUrl, deployUrl: data.deployUrl });
      setTurns((t) => [
        ...t,
        { role: "assistant", text: `Votre site est en ligne : ${data.deployUrl}` },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: "Publication impossible. Réessayez dans un instant." },
      ]);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
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
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 self-start text-xs text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              L&apos;agent conçoit votre site…
            </div>
          )}
        </div>
      )}

      {previewHtml && (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <span className="font-mono-ui text-xs text-text-secondary">
              Aperçu — pas encore publié
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {published && (
                <>
                  <a
                    href={published.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text hover:border-accent transition-colors"
                  >
                    <GitFork className="h-3.5 w-3.5" />
                    Code
                  </a>
                  <a
                    href={published.deployUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text hover:border-accent transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Site en ligne
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || loading}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60 transition-colors"
              >
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                {published ? "Republier" : "Publier mon site"}
              </button>
            </div>
          </div>
          <iframe
            title="Aperçu du site"
            srcDoc={previewHtml + PREVIEW_NAVIGATION_GUARD}
            sandbox="allow-scripts"
            className="h-[600px] w-full bg-white"
          />
        </div>
      )}

      <SiteBuilderChat
        onSubmit={(value, files) => handleSubmit(value, files)}
        disabled={loading}
        hideTitle={turns.length > 0}
      />
    </div>
  );
}
