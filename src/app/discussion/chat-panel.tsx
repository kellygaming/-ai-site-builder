"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GitFork, Loader2, MessageSquare, Monitor, Plus, Rocket } from "lucide-react";
import { SiteBuilderChat } from "@/components/ui/chat-input";
import { BriefForm, type BriefAnswers } from "@/components/ui/brief-form";
import { cn } from "@/lib/utils";

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
 * dessus faisait naviguer l'iframe vers l'application, et le client voyait
 * notre page d'accueil à la place de son site.
 *
 * Ce script est la deuxième barrière (la première neutralise les attributs
 * href, voir buildPreviewDocument) : il couvre les liens ajoutés par le
 * JavaScript du site après coup. Il remonte les parents à la main plutôt que
 * d'utiliser closest(), absent des éléments SVG sur certains navigateurs — un
 * lien habillé d'une icône SVG serait alors passé au travers.
 */
const PREVIEW_NAVIGATION_GUARD = `(function () {
  function findLink(node) {
    while (node) {
      if (node.tagName && String(node.tagName).toLowerCase() === "a") return node;
      node = node.parentNode;
    }
    return null;
  }
  document.addEventListener("click", function (event) {
    var link = findLink(event.target);
    if (!link) return;
    var href = link.getAttribute("href") || "";
    if (href.charAt(0) === "#") return;
    event.preventDefault();
  }, true);
  document.addEventListener("submit", function (event) {
    event.preventDefault();
  }, true);
})();`;

/**
 * Première barrière : on réécrit le document avant de l'injecter. Tout lien qui
 * n'est pas une ancre interne devient inerte, et les formulaires perdent leur
 * destination. C'est déterministe — contrairement à un gestionnaire
 * d'événements, ça ne dépend ni du navigateur ni de l'ordre d'exécution.
 */
function buildPreviewDocument(html: string): string {
  const fallback = `${html}<script>${PREVIEW_NAVIGATION_GUARD}<\/script>`;
  if (typeof window === "undefined") return fallback;

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.body) return fallback;

    for (const link of Array.from(doc.querySelectorAll("a[href]"))) {
      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("#")) link.setAttribute("href", "#");
      link.removeAttribute("target");
    }
    for (const form of Array.from(doc.querySelectorAll("form"))) {
      form.removeAttribute("action");
      form.removeAttribute("target");
    }

    const guard = doc.createElement("script");
    guard.textContent = PREVIEW_NAVIGATION_GUARD;
    doc.body.appendChild(guard);

    return `<!doctype html>${doc.documentElement.outerHTML}`;
  } catch {
    return fallback;
  }
}

/**
 * L'onglet d'un client peut être déchargé à tout moment (bascule d'application
 * sur mobile, rechargement) : sans cette clé, il retrouvait l'écran d'accueil
 * et croyait son site perdu.
 */
const ACTIVE_CONVERSATION_KEY = "ai-site-builder:conversation";

function rememberConversation(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    else localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  } catch {
    // Navigation privée ou stockage refusé : on continue sans mémoire.
  }
}

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
  const [previewVersion, setPreviewVersion] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ repoUrl: string; deployUrl: string } | null>(null);
  // Sur mobile les deux panneaux ne tiennent pas côte à côte : on bascule.
  const [mobileTab, setMobileTab] = useState<"conversation" | "apercu">("conversation");
  const [restoring, setRestoring] = useState(true);
  // Incrémenté quand l'iframe a quand même réussi à naviguer : force un
  // remontage sur le HTML d'origine plutôt que de laisser le client devant une
  // page qui n'est pas son site.
  const [frameNonce, setFrameNonce] = useState(0);
  const [showBrief, setShowBrief] = useState(false);

  const turnsEndRef = useRef<HTMLDivElement>(null);
  const frameLoadsRef = useRef(0);
  const started = turns.length > 0;

  const previewDocument = useMemo(
    () => (previewHtml ? buildPreviewDocument(previewHtml) : null),
    [previewHtml],
  );

  // Restaure la conversation en cours au chargement de la page. Sans ça, un
  // client qui bascule sur une autre application et revient perd tout.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
      } catch {
        stored = null;
      }

      if (!stored) {
        if (!cancelled) setRestoring(false);
        return;
      }

      try {
        const res = await fetch(`/api/conversations/${stored}`);
        if (!res.ok) {
          // Conversation supprimée ou session expirée : on repart proprement.
          if (res.status === 404) rememberConversation(null);
          return;
        }
        const data: { conversationId: string; turns: Turn[]; files: SiteFile[] } = await res.json();
        if (cancelled) return;

        setConversationId(data.conversationId);
        setTurns(data.turns);
        const index = data.files.find((file) => file.path.endsWith("index.html"));
        if (index) {
          setPreviewHtml(index.content);
          setPreviewVersion((v) => v + 1);
        }
      } catch {
        // Hors ligne : on laisse l'écran d'accueil plutôt que de bloquer.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Chaque nouvelle version repart d'un compteur neuf de chargements d'iframe.
  useEffect(() => {
    frameLoadsRef.current = 0;
  }, [previewVersion, frameNonce]);

  // Le dernier message doit rester visible sans que le client ait à faire
  // défiler lui-même — sinon la réponse de l'agent passe inaperçue.
  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading]);

  function startNewSite() {
    rememberConversation(null);
    setShowBrief(false);
    setTurns([]);
    setConversationId(null);
    setPreviewHtml(null);
    setPublished(null);
    setMobileTab("conversation");
  }

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

    setShowBrief(false);
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
      let data: {
        conversationId?: string;
        reply?: string;
        error?: string;
        files?: SiteFile[];
        brief?: boolean;
      };
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

      if (data.conversationId) {
        setConversationId(data.conversationId);
        rememberConversation(data.conversationId);
      }

      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", text: data.error ?? "Une erreur est survenue." },
        ]);
        return;
      }

      setTurns((t) => [...t, { role: "assistant", text: data.reply ?? "" }]);

      setShowBrief(Boolean(data.brief));

      const indexFile = data.files?.find((f) => f.path.endsWith("index.html"));
      if (indexFile) {
        setPreviewHtml(indexFile.content);
        setPreviewVersion((v) => v + 1);
        setMobileTab("apercu");
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

  /**
   * Le formulaire est une commodité d'interface : l'agent, lui, reçoit une
   * réponse en français, exactement comme si le client l'avait rédigée. Rien
   * de nouveau à lui apprendre, et l'historique reste lisible à la relecture.
   */
  function handleBriefSubmit(answers: BriefAnswers) {
    const lines: string[] = [];

    if (answers.businessName) lines.push(`L'établissement s'appelle ${answers.businessName}.`);
    lines.push(
      answers.hasLogo
        ? "Voici mon logo, mettez-le sur le site."
        : "Je n'ai pas encore de logo, écrivez joliment le nom à la place.",
    );

    if (answers.colorChoice === "logo") lines.push("Reprenez les couleurs de mon logo.");
    else if (answers.colorChoice === "custom" && answers.customColors)
      lines.push(`Pour les couleurs, je veux : ${answers.customColors}.`);
    else lines.push("Je vous laisse choisir les couleurs.");

    lines.push(
      answers.photoChoice === "mine"
        ? "J'ai joint mes propres photos, servez-vous-en."
        : "Choisissez vous-même de belles photos.",
    );

    const contacts = [
      answers.whatsapp && `WhatsApp / téléphone : ${answers.whatsapp}`,
      answers.email && `E-mail : ${answers.email}`,
    ].filter(Boolean);
    if (contacts.length > 0) lines.push(`On me joint ici — ${contacts.join(", ")}.`);

    if (answers.extra) lines.push(answers.extra);

    handleSubmit(lines.join("\n"), answers.files);
  }

  function handleBriefSkip() {
    setShowBrief(false);
    handleSubmit("Allez-y directement avec vos propres choix, on ajustera ensuite.", []);
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
        setTurns((t) => [
          ...t,
          { role: "assistant", text: data.error ?? "Échec de la publication." },
        ]);
        setMobileTab("conversation");
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
      setMobileTab("conversation");
    } finally {
      setPublishing(false);
    }
  }

  // Pendant la restauration, surtout ne pas afficher "Quel site voulez-vous
  // créer ?" : le client croirait son travail perdu.
  if (restoring && !started) {
    return (
      <div className="flex w-full flex-1 items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de votre site…
      </div>
    );
  }

  // Écran d'accueil : rien d'autre que l'invitation à décrire son site.
  if (!started) {
    return (
      <div className="flex w-full flex-1 items-center justify-center px-4">
        <SiteBuilderChat onSubmit={handleSubmit} disabled={loading} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={startNewSite}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau site
        </button>

        {/* Bascule mobile : les deux panneaux ne tiennent pas côte à côte. */}
        <div className="flex rounded-lg border border-border p-0.5 lg:hidden">
          <TabButton
            active={mobileTab === "conversation"}
            onClick={() => setMobileTab("conversation")}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="Discussion"
          />
          <TabButton
            active={mobileTab === "apercu"}
            onClick={() => setMobileTab("apercu")}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Aperçu"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <section
          className={cn(
            "min-h-0 flex-col gap-3 lg:flex lg:w-[400px] lg:shrink-0",
            mobileTab === "conversation" ? "flex flex-1" : "hidden",
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={
                    turn.role === "user"
                      ? "max-w-[85%] self-end rounded-2xl bg-accent px-4 py-2.5 text-sm text-white"
                      : "max-w-[85%] self-start rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-text"
                  }
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))}
              {showBrief && !loading && (
                <BriefForm
                  onSubmit={handleBriefSubmit}
                  onSkip={handleBriefSkip}
                  disabled={loading}
                />
              )}
              {loading && (
                <div className="flex items-center gap-2 self-start text-xs text-text-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  L&apos;agent travaille sur votre site…
                </div>
              )}
              <div ref={turnsEndRef} />
            </div>
          </div>

          <SiteBuilderChat onSubmit={handleSubmit} disabled={loading} compact />
        </section>

        <section
          className={cn(
            "min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:flex",
            mobileTab === "apercu" ? "flex" : "hidden",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <span className="font-mono-ui text-xs text-text-secondary">
              {published ? "Aperçu — publié" : "Aperçu — pas encore publié"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {conversationId && previewHtml && (
                <a
                  href={`/apercu/${conversationId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text transition-colors hover:border-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir en grand
                </a>
              )}
              {published && (
                <>
                  <a
                    href={published.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text transition-colors hover:border-accent"
                  >
                    <GitFork className="h-3.5 w-3.5" />
                    Code
                  </a>
                  <a
                    href={published.deployUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text transition-colors hover:border-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Site en ligne
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || loading || !previewHtml}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
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

          {previewDocument ? (
            <iframe
              // Remonter l'iframe à chaque version garantit un rendu propre,
              // sans état JavaScript ni position de défilement hérités.
              key={`${previewVersion}-${frameNonce}`}
              title="Aperçu du site"
              srcDoc={previewDocument}
              sandbox="allow-scripts"
              className="min-h-0 w-full flex-1 bg-white"
              onLoad={() => {
                // Troisième barrière. Le premier chargement est notre document ;
                // un second signifie que l'iframe a navigué malgré tout, et on
                // la ramène immédiatement sur le site du client.
                frameLoadsRef.current += 1;
                if (frameLoadsRef.current > 1) setFrameNonce((nonce) => nonce + 1);
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
              {loading
                ? "L'agent dessine votre site…"
                : "Votre site apparaîtra ici dès que l'agent l'aura construit."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
        active ? "bg-surface-2 text-text" : "text-text-secondary hover:text-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
