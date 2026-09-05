import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_REFERENCE, FRONTEND_DESIGN_GUIDANCE } from "@/lib/design-reference";
import { ARCHITECTURE_REFERENCE } from "@/lib/architecture-reference";
import { MOTION_REFERENCE } from "@/lib/motion-reference";
import { hasPexels, searchPhotos } from "@/lib/tools/pexels";
import { uploadClientImage } from "@/lib/tools/storage";
import { canRender, captureHtml } from "@/lib/tools/screenshot";
import type { Json } from "@/lib/supabase/types";

// Plan Vercel Pro : plafond de fonction à 300s (contre 60s en Hobby). C'est
// ce budget qui permet de générer une page complète sans la tronquer.
export const maxDuration = 300;

/**
 * Une clé API "identity-linked" (liée à un utilisateur plutôt qu'à un
 * workspace) exige le header anthropic-workspace-id sur chaque requête, sinon
 * l'API répond 400. On l'ajoute quand ANTHROPIC_WORKSPACE_ID est défini ; une
 * clé classique liée à un workspace fonctionne sans.
 */
const client = new Anthropic(
  process.env.ANTHROPIC_WORKSPACE_ID
    ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
    : {},
);

const BASE_SYSTEM_PROMPT = `Tu es l'agent de construction de sites d'AI Site Builder. Le
client te décrit en langage courant le site qu'il veut, ou te demande de modifier le site
en cours. Tu conçois un site statique (HTML/CSS/JS, sans framework ni étape de build) et tu
le renvoies avec l'outil preview_site.

Le site n'est PAS publié à ce stade : le client voit un aperçu immédiat dans la
conversation, vous en discutez, tu ajustes autant de fois qu'il veut. C'est lui qui
cliquera sur "Publier" quand il sera satisfait — ne propose pas de publier toi-même, ne
prétends jamais que le site est "en ligne".

Tu vouvoies le client, toujours. Ton ton est simple, chaleureux et rassurant : en face de
toi il y a un commerçant ou un artisan, pas un développeur. Aucun jargon technique.

DÉROULÉ DE LA CONVERSATION

1. PREMIÈRE demande d'un nouveau site : ne génère rien tout de suite. Un site construit
   sans connaître la marque du client sera générique, et un site générique ne se vend pas.
   Écris deux phrases : tu confirmes avec enthousiasme ce que tu as compris de sa demande,
   puis tu annonces que quelques questions rapides permettront de coller à son style. Puis
   appelle l'outil ask_brief — et RIEN d'autre dans ce tour.

   N'écris jamais la liste des questions toi-même : le formulaire s'en charge, à cocher, et
   c'est bien plus rapide pour le client que de rédiger des réponses. Ne demande pas non
   plus le logo par écrit, le formulaire a son bouton d'envoi.

2. DÈS LA RÉPONSE au formulaire — même partielle, même si le client l'a passé — tu
   construis le site. Tu ne redemandes JAMAIS ces informations : ce qui manque, tu le
   décides toi-même et tu le signales en une phrase après coup. N'appelle plus jamais
   ask_brief dans cette conversation.

3. PASSE DIRECTEMENT à la construction, sans formulaire, quand :
   - le client demande une modification d'un site déjà affiché ;
   - il a joint une image de référence ou du code ;
   - il a déjà décrit sa marque, ses couleurs ou son activité en détail ;
   - il demande explicitement d'aller vite.

4. APRÈS avoir montré un site pour la première fois seulement, ajoute cette proposition en
   une ou deux phrases, avec tes mots, sans majuscules criardes : si une section ne lui
   plaît pas et qu'il n'est pas designer, il peut aller sur 21st.dev, y prendre ce qui lui
   plaît, vous envoyer le code, et vous l'adaptez à son site — c'est gratuit. Ne le répète
   plus ensuite.

Règles :
- Chaque image envoyée par le client est suivie de son adresse web. Utilise CETTE adresse,
  telle quelle, pour l'afficher dans le site. Un logo va dans l'en-tête (hauteur fixe,
  largeur automatique, attribut alt avec le nom de la marque), et ses couleurs dominantes
  deviennent la palette du site. Une photo de produit ou de lieu va dans la section qui lui
  correspond. N'invente jamais d'adresse : n'utilise que celles qu'on t'a données.
- DESIGN FOURNI PAR LE CLIENT (prompt copié sur 21st.dev, ou code React/Tailwind) : c'est
  ta référence principale, elle prime sur les palettes et sur tes habitudes de mise en page.
  Reprends-en fidèlement la STRUCTURE et le PARTI PRIS visuel — proportions, hiérarchie
  typographique, façon d'occuper l'espace, rythme des sections.
  Trois règles absolues :
  1. Tu ne renvoies JAMAIS de React, de JSX ni de classes Tailwind. Tu traduis en HTML et
     CSS ordinaires. Un aperçu contenant du JSX serait vide chez le client.
  2. Les dépendances du composant (framer-motion, lucide-react, radix...) n'existent pas :
     remplace les animations par du CSS et les icônes par des SVG inline dessinés à la main.
  3. Tu ADAPTES au métier et à la marque du client : ses couleurs, son logo, ses textes, ses
     photos. Tu ne recopies pas le contenu d'exemple du composant. Le design est la forme,
     le client est le fond.
- Si le client joint une IMAGE d'un site qui lui plaît, c'est la même chose : tu t'en
  inspires pour la mise en page et l'ambiance, et tu l'adaptes à SON activité. Dis-lui
  explicitement que tu t'en es inspiré sans le copier, et que le site reste le sien.
- Si le client joint du code existant, pars de ce code pour l'améliorer plutôt que de tout
  réécrire, sauf s'il demande explicitement une refonte.
- Livre un SEUL fichier "index.html" autonome, CSS et JS inline dedans (l'aperçu s'affiche
  dans une iframe : des fichiers séparés ne se chargeraient pas). N'ajoute d'autres fichiers
  que si le client demande explicitement plusieurs pages.
- Sur une demande de modification, renvoie l'index.html COMPLET modifié, pas un extrait.
- OSSATURE : commence par choisir l'ossature de page adaptée au métier du client, dans la
  section dédiée plus bas, et annonce ton choix en une phrase. N'enchaîne JAMAIS par défaut
  bannière / grille de cartes / galerie / "notre histoire" / témoignages / contact : c'est
  la séquence que produisent tous les générateurs, et elle se reconnaît au premier coup
  d'œil. Termine toujours ce que tu commences — une page tronquée en plein milieu ne vaut
  rien. Pas de commentaires dans le code, du CSS ramassé (variables CSS, pas de répétitions).
- Design soigné, moderne, responsive, en français, cohérent avec ce que le client décrit.
- Pas de bibliothèque JS ni de framework externe. Ressources externes autorisées : les
  polices Google Fonts, et les photos renvoyées par l'outil search_photos.
- PHOTOS : appelle search_photos AVANT de rédiger le site (une seule fois, avec toutes les
  recherches dont tu as besoin) dès que le sujet gagne à être illustré — restaurant, hôtel,
  salon, boutique, artisan, sport, immobilier, voyage... Requêtes en anglais, précises et
  concrètes ("grilled steak dark plate" et non "food"). N'utilise QUE les URLs renvoyées :
  n'invente jamais une adresse d'image, elle serait cassée. Chaque image porte un attribut
  alt descriptif, l'attribut loading="lazy" sauf celle de la hero, et une hauteur/largeur maîtrisée
  (object-fit: cover) pour éviter que la page saute au chargement. Si l'outil ne renvoie
  rien, compose sans photo plutôt que d'inventer un lien.
- ANIMATIONS : décide pour CHAQUE projet si le site en mérite, selon le métier du client
  (voir la section dédiée plus bas). Quand tu en mets, recopie la recette fournie telle
  quelle plutôt que d'improviser. Quand tu n'en mets pas, dis-le au client en une phrase :
  il doit comprendre que c'est un choix, pas un oubli.
- CONTENU D'EXEMPLE : les avis clients et les textes que tu inventes sont des exemples
  destinés à montrer le rendu, et tu DOIS le dire au client dans ta réponse, en une phrase
  claire du genre "les avis affichés sont des exemples, envoyez-moi les vrais et je les
  remplace". En revanche, n'invente JAMAIS un chiffre à fausse précision qui se lit comme
  un fait vérifiable : "98 % de patients satisfaits", "4 800 clients", "certifié ISO",
  un prix ou un horaire non fournis. Un faux avis se corrige, un faux chiffre engage la
  responsabilité de ton client. Si le client ne t'a pas donné le chiffre, écris la section
  sans chiffre.
- Accompagne toujours ton appel d'outil d'une phrase courte en français : ce que tu as fait
  et ce que le client peut te demander d'ajuster.

${FRONTEND_DESIGN_GUIDANCE}
Utilise la référence ci-dessous comme point de départ (palette + police adaptées au type de
site demandé, règles UX toujours respectées) plutôt que d'improviser à l'aveugle — adapte
les couleurs/polices exactes si le client a une préférence explicite, et laisse toujours les
principes de design ci-dessus primer sur le tableau si les deux se contredisent.
${DESIGN_REFERENCE}
${ARCHITECTURE_REFERENCE}
${MOTION_REFERENCE}`;

const PREVIEW_TOOL: Anthropic.Tool = {
  name: "preview_site",
  description:
    "Renvoie la version courante du site pour l'afficher en aperçu au client. À appeler à chaque création ou modification. Ne publie rien : la mise en ligne est déclenchée séparément par le client.",
  input_schema: {
    type: "object",
    properties: {
      site_name: {
        type: "string",
        description: "Nom du site en kebab-case, servira de nom de dépôt à la publication",
      },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    },
    required: ["site_name", "files"],
  },
};

const ASK_BRIEF_TOOL: Anthropic.Tool = {
  name: "ask_brief",
  description:
    "Affiche au client un petit formulaire à cocher (logo, couleurs, photos, contact) au lieu de lui poser les questions en texte. À appeler une seule fois, au tout début d'un nouveau site, accompagné d'une phrase d'introduction chaleureuse. Le client peut le remplir, le passer, ou répondre en texte libre.",
  input_schema: { type: "object", properties: {} },
};

const SEARCH_PHOTOS_TOOL: Anthropic.Tool = {
  name: "search_photos",
  description:
    "Cherche des photos libres de droits (Pexels) à intégrer dans le site. Renvoie des URLs réelles et utilisables. Groupe toutes tes recherches en un seul appel.",
  input_schema: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        description:
          "Recherches en anglais, 1 à 5, précises et concrètes (ex: \"grilled steak dark plate\").",
        items: { type: "string" },
      },
      per_query: {
        type: "integer",
        description: "Nombre de photos par recherche, 1 à 5. Défaut 3.",
      },
    },
    required: ["queries"],
  },
};

interface SiteFile {
  path: string;
  content: string;
}

/**
 * Le modèle peut atteindre le plafond de tokens en plein milieu du JSON de
 * l'outil : l'API livre alors un bloc tool_use dont l'input est incomplet
 * (`files` absent, tronqué, ou dernier fichier coupé au milieu du HTML).
 * On valide donc au lieu de faire confiance au typage.
 */
function parseSiteFiles(raw: unknown): SiteFile[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const files: SiteFile[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { path, content } = entry as Record<string, unknown>;
    if (typeof path !== "string" || !path.trim()) return null;
    if (typeof content !== "string" || !content.trim()) return null;
    files.push({ path: path.trim(), content });
  }
  return files;
}

/** Assez pour une recherche de photos puis la rédaction, sans boucle infinie. */
const MAX_TOOL_ROUNDS = 3;

const TRUNCATED_REPLY =
  "Le site que vous demandez est trop long : la génération a été coupée avant la fin, je préfère ne rien vous montrer d'incomplet. Redemandez-le en plus simple (3 sections maximum, par exemple « accueil, services, contact »), ou demandez-moi de le construire section par section — je commence par l'accueil et on ajoute le reste ensuite.";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const {
    message,
    conversationId: incomingConversationId,
    images,
    textFiles,
  }: {
    message: string;
    conversationId?: string;
    images?: { mediaType: string; data: string }[];
    textFiles?: { name: string; content: string }[];
  } = await request.json();

  const hasAttachments = (images?.length ?? 0) > 0 || (textFiles?.length ?? 0) > 0;
  if (typeof message !== "string" || (!message.trim() && !hasAttachments)) {
    return NextResponse.json({ error: "Message vide." }, { status: 400 });
  }

  let conversationId = incomingConversationId;
  let currentFiles: SiteFile[] = [];
  let history: Anthropic.MessageParam[] = [];

  if (conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("current_files")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
    }
    currentFiles = (conversation.current_files as SiteFile[] | null) ?? [];

    const { data: pastMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    history = (pastMessages ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: JSON.parse(m.content),
    }));
  } else {
    const { data: newConversation, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: (message.trim() || "Nouveau site").slice(0, 80) })
      .select("id")
      .single();

    if (error || !newConversation) {
      return NextResponse.json({ error: "Impossible de créer la conversation." }, { status: 500 });
    }
    conversationId = newConversation.id;
  }

  async function persist(role: "user" | "assistant", content: Anthropic.MessageParam["content"]) {
    await supabase.from("messages").insert({
      conversation_id: conversationId!,
      role,
      content: JSON.stringify(content),
    });
  }

  const userContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [];
  if (message.trim()) userContent.push({ type: "text", text: message.trim() });
  for (const file of textFiles ?? []) {
    userContent.push({
      type: "text",
      text: `Fichier joint "${file.name}" :\n\`\`\`\n${file.content}\n\`\`\``,
    });
  }
  // Chaque image est jointe deux fois : en base64 pour que le modèle la VOIE,
  // et sous forme d'URL publique pour qu'il puisse l'AFFICHER sur le site. Sans
  // l'URL, un logo restait un simple sujet de conversation, jamais un élément
  // de la page.
  for (const image of images ?? []) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: image.data,
      },
    });

    const url = await uploadClientImage(user.id, image.mediaType, image.data);
    if (url) {
      userContent.push({
        type: "text",
        text: `Adresse de l'image ci-dessus, utilisable telle quelle dans le site : ${url}`,
      });
    }
  }
  if (userContent.length === 0) userContent.push({ type: "text", text: "(message vide)" });

  await persist("user", userContent);
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: userContent }];

  // search_photos n'est proposé que si la clé Pexels est configurée : sans elle
  // l'agent ne peut pas chercher d'images, mais il génère toujours le site.
  const tools = hasPexels()
    ? [ASK_BRIEF_TOOL, SEARCH_PHOTOS_TOOL, PREVIEW_TOOL]
    : [ASK_BRIEF_TOOL, PREVIEW_TOOL];

  // Boucle d'outils : l'agent peut chercher ses photos puis rédiger le site
  // dans le même tour. La borne évite qu'il boucle indéfiniment sur des
  // recherches sans jamais livrer de page.
  let response!: Anthropic.Message;
  let text: Anthropic.TextBlock | undefined;
  let toolUse: Anthropic.ToolUseBlock | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Concevoir un site est la tâche où l'écart entre modèles se voit le plus :
    // composition, hiérarchie typographique, choix qui sortent de l'ordinaire.
    // Sonnet était un choix de latence imposé par les 60s du plan Hobby, pas un
    // choix de qualité — sur Pro, la génération passe sur le modèle le plus
    // capable. Le raisonnement est actif par défaut sur Opus 5 : on ne le
    // configure pas, c'est justement ce qu'on veut ici.
    try {
      response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 16000,
        // Le prompt système (règles + guide de design + palettes) est
        // volumineux et strictement identique à chaque tour : mis en cache, il
        // est facturé ~10 % sur toutes les relectures des 5 minutes suivantes.
        // Il doit rester en tête et byte-à-byte identique, sinon le cache saute.
        system: [
          {
            type: "text",
            text: BASE_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        messages,
      });
    } catch (error) {
      // Sans ce filet, une erreur de l'API remonte en 500 sans corps JSON : le
      // client affichait alors "Connexion impossible", message trompeur qui
      // masquait la vraie cause. On renvoie une erreur lisible et traçable.
      console.error("[chat] appel Anthropic échoué", error);
      return NextResponse.json(
        {
          conversationId,
          error:
            "L'agent n'a pas pu répondre (service de génération indisponible). Réessayez dans un instant.",
        },
        { status: 502 },
      );
    }

    // Un classificateur de sécurité peut décliner une demande : la réponse
    // arrive en 200 avec stop_reason "refusal" et un contenu vide. Sans ce
    // filet le client verrait un aperçu blanc sans explication.
    if (response.stop_reason === "refusal") {
      const refusal =
        "Je ne peux pas construire ce site en l'état. Reformulez votre demande, ou dites-moi autrement ce que propose votre activité.";
      await persist("assistant", [{ type: "text", text: refusal }]);
      return NextResponse.json({ conversationId, reply: refusal });
    }

    text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "preview_site",
    );
    if (toolUse) break;

    // Demande de brief : le formulaire est rendu côté client, le tour s'arrête
    // là et reprendra quand le client aura répondu.
    const briefCall = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "ask_brief",
    );
    if (briefCall) {
      await persist("assistant", response.content);
      await persist("user", [
        {
          type: "tool_result",
          tool_use_id: briefCall.id,
          content: JSON.stringify({ status: "formulaire_affiche_au_client" }),
        },
      ]);
      return NextResponse.json({
        conversationId,
        reply: text?.text ?? "Quelques questions rapides pour coller à votre style :",
        brief: true,
      });
    }

    const photoCalls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "search_photos",
    );
    // Ni site, ni recherche : c'est une réponse purement conversationnelle.
    if (photoCalls.length === 0) break;

    await persist("assistant", response.content);
    messages.push({ role: "assistant", content: response.content });

    const results = await Promise.all(
      photoCalls.map(async (call) => {
        const args = call.input as { queries?: unknown; per_query?: unknown };
        const queries = Array.isArray(args.queries)
          ? args.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
          : [];
        const perQuery =
          typeof args.per_query === "number" ? Math.min(Math.max(args.per_query, 1), 5) : 3;

        const photos = Object.fromEntries(
          await Promise.all(
            queries.slice(0, 5).map(async (q) => [q, await searchPhotos(q, perQuery)] as const),
          ),
        );
        return {
          type: "tool_result" as const,
          tool_use_id: call.id,
          content: JSON.stringify(photos),
        };
      }),
    );

    await persist("user", results);
    messages.push({ role: "user", content: results });
  }

  // stop_reason "max_tokens" = la réponse a été coupée net. Si elle contenait un
  // appel d'outil, son JSON est forcément incomplet (même quand il se trouve
  // être encore parsable) : le dernier fichier serait du HTML tranché au milieu.
  const input = (toolUse?.input ?? {}) as Record<string, unknown>;
  const files =
    toolUse && response.stop_reason !== "max_tokens" ? parseSiteFiles(input.files) : null;

  if (toolUse && !files) {
    // Un tool_use inexploitable ne doit JAMAIS entrer dans l'historique :
    // l'API exige un tool_result pour chaque tool_use, et on n'a rien de valide
    // à lui associer — le tour suivant partirait en 400. On ne garde que du texte.
    await persist("assistant", [{ type: "text", text: TRUNCATED_REPLY }]);
    return NextResponse.json({ conversationId, reply: TRUNCATED_REPLY });
  }

  await persist("assistant", response.content);

  if (!toolUse || !files) {
    return NextResponse.json({
      conversationId,
      reply:
        text?.text ||
        (response.stop_reason === "max_tokens"
          ? TRUNCATED_REPLY
          : "Je n'ai pas réussi à traiter cette demande. Reformulez-la en quelques mots."),
    });
  }

  // ---- Relecture visuelle -------------------------------------------------
  // L'agent écrit son site à l'aveugle : il ne l'a jamais vu. On le lui montre
  // rendu, en desktop et en mobile, et il corrige avant que le client découvre
  // la page. Uniquement à la première version : sur un simple ajustement
  // demandé par le client, ce tour supplémentaire coûterait une minute pour
  // rien.
  async function runVisualReview(
    call: Anthropic.ToolUseBlock,
    draft: SiteFile[],
  ): Promise<{ files: SiteFile[]; reply: string } | null> {
    const index = draft.find((file) => file.path.endsWith("index.html"));
    if (!index) return null;

    const shots = await captureHtml(index.content);
    if (!shots) return null;

    const review: Anthropic.ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: call.id,
      content: [
        {
          type: "text",
          text: [
            "Voici ton site tel qu'il s'affiche vraiment, en grand écran puis sur téléphone.",
            "",
            shots.findings.length > 0
              ? `Un contrôle automatique a relevé ceci — ce sont des faits mesurés dans la page, pas des avis :\n${shots.findings
                  .map((f) => `- [${f.severity}] ${f.message}`)
                  .join("\n")}\n\nCorrige au moins tous les constats de gravité haute.`
              : "Le contrôle automatique n'a rien relevé.",
            "",
            "Regarde aussi les captures comme le ferait le client : texte tronqué, éléments qui se chevauchent, images étirées ou vides, section vide, mise en page cassée sur mobile.",
            "S'il y a quoi que ce soit à reprendre, renvoie la page corrigée avec preview_site et dis en une phrase ce que tu as repris. Si tout est bon, réponds simplement au client sans rappeler d'outil.",
          ].join("\n"),
        },
        { type: "image", source: { type: "base64", media_type: "image/png", data: shots.desktop } },
        { type: "image", source: { type: "base64", media_type: "image/png", data: shots.mobile } },
      ],
    };

    await persist("user", [review]);
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: [review] });

    let second: Anthropic.Message;
    try {
      // La relecture ne conçoit rien : elle regarde deux captures, lit des
      // constats mesurés et corrige. C'est de l'exécution, Sonnet la fait très
      // bien — inutile de doubler la facture du tour de vérification.
      second = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        system: [
          { type: "text", text: BASE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        tools,
        messages,
      });
    } catch (error) {
      // La relecture est un bonus : en cas d'échec on livre la première
      // version. Retour non nul car le tool_use a déjà été refermé par le
      // résultat contenant les captures — le refermer deux fois casserait
      // l'historique au tour suivant.
      console.error("[chat] relecture visuelle échouée", error);
      return { files: draft, reply: "" };
    }

    await persist("assistant", second.content);
    const secondText = second.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const revision = second.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "preview_site",
    );

    if (!revision || second.stop_reason === "max_tokens") {
      return { files: draft, reply: secondText?.text ?? "" };
    }

    const revised = parseSiteFiles((revision.input as Record<string, unknown>).files);
    if (!revised) return { files: draft, reply: secondText?.text ?? "" };

    await persist("user", [
      {
        type: "tool_result",
        tool_use_id: revision.id,
        content: JSON.stringify({ status: "preview_shown_to_client" }),
      },
    ]);

    const merged = new Map(draft.map((file) => [file.path, file]));
    for (const file of revised) merged.set(file.path, file);
    return { files: Array.from(merged.values()), reply: secondText?.text ?? "" };
  }

  const siteName =
    typeof input.site_name === "string" && input.site_name.trim()
      ? input.site_name.trim()
      : `site-${conversationId!.slice(0, 8)}`;

  // Fusionne avec la version précédente : le modèle peut ne renvoyer que les
  // fichiers touchés, on garde les autres tels quels.
  const merged = new Map(currentFiles.map((f) => [f.path, f]));
  for (const file of files) merged.set(file.path, file);
  const fullFileSet = Array.from(merged.values());

  // Un retour non nul signifie que la relecture a refermé elle-même l'appel
  // d'outil ; un retour nul veut dire qu'elle n'a pas démarré et qu'il reste à
  // le faire ici.
  const reviewed =
    currentFiles.length === 0 && canRender()
      ? await runVisualReview(toolUse, fullFileSet)
      : null;

  const deliveredFiles = reviewed?.files ?? fullFileSet;
  const deliveredReply =
    reviewed?.reply?.trim() ||
    text?.text ||
    "Voici votre site. Dites-moi ce que vous voulez ajuster.";

  await supabase
    .from("conversations")
    .update({
      current_files: deliveredFiles as unknown as Json,
      vercel_project_name: siteName,
    })
    .eq("id", conversationId!);

  if (!reviewed) {
    // L'outil ne publie rien : on renvoie juste un résultat neutre pour garder
    // un historique cohérent côté API (chaque tool_use doit avoir son
    // tool_result).
    await persist("user", [
      {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify({ status: "preview_shown_to_client" }),
      },
    ]);
  }

  return NextResponse.json({
    conversationId,
    reply: deliveredReply,
    files: deliveredFiles,
  });
}
