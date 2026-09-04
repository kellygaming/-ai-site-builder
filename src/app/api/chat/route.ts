import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_REFERENCE, FRONTEND_DESIGN_GUIDANCE } from "@/lib/design-reference";
import { hasPexels, searchPhotos } from "@/lib/tools/pexels";
import { uploadClientImage } from "@/lib/tools/storage";
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
   Pose UNE SEULE série de questions courtes — 4 maximum — en un seul message, puis
   arrête-toi et attends la réponse. N'appelle aucun outil dans ce message.

   Choisis les 4 questions les plus utiles pour CE projet parmi :
   - Avez-vous un logo ? (précise qu'il suffit de le joindre avec le trombone, et qu'il
     sera intégré directement sur le site)
   - Avez-vous des photos à intégrer ? (sinon tu en choisis toi-même, dis-le)
   - Une préférence de couleurs, ou vous partez sur celles de votre logo ?
   - Par où doit-on vous contacter : WhatsApp, téléphone, e-mail ?
   - Le nom exact de l'établissement et ce qu'il propose, si tu ne le sais pas encore.

   Ne pose jamais une question dont le client t'a déjà donné la réponse. Termine toujours
   par une porte de sortie du genre : "Et si vous préférez, dites-moi simplement « allez-y »
   et je me lance avec mes propres choix — on ajustera ensuite."

2. DÈS LA RÉPONSE du client — même partielle, même "je ne sais pas", même "allez-y" — tu
   construis le site. Tu ne poses JAMAIS une deuxième série de questions : ce qui manque,
   tu le décides toi-même et tu le signales en une phrase après coup.

3. PASSE DIRECTEMENT à la construction, sans aucune question, quand :
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
- Si le client joint une image, c'est une référence visuelle directe (site à reproduire,
  design qu'il aime, logo, charte de couleurs...) — ancre ta conception dessus.
- Si le client joint du code existant, pars de ce code pour l'améliorer plutôt que de tout
  réécrire, sauf s'il demande explicitement une refonte.
- Livre un SEUL fichier "index.html" autonome, CSS et JS inline dedans (l'aperçu s'affiche
  dans une iframe : des fichiers séparés ne se chargeraient pas). N'ajoute d'autres fichiers
  que si le client demande explicitement plusieurs pages.
- Sur une demande de modification, renvoie l'index.html COMPLET modifié, pas un extrait.
- Vise une page complète et finie : 4 à 6 sections réelles (hero, offre/services, preuve
  sociale ou galerie, à-propos, contact). Termine toujours ce que tu commences — une page
  tronquée en plein milieu ne vaut rien. Pas de commentaires dans le code, du CSS ramassé
  (variables CSS, pas de répétitions).
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
- Accompagne toujours ton appel d'outil d'une phrase courte en français : ce que tu as fait
  et ce que le client peut te demander d'ajuster.

${FRONTEND_DESIGN_GUIDANCE}
Utilise la référence ci-dessous comme point de départ (palette + police adaptées au type de
site demandé, règles UX toujours respectées) plutôt que d'improviser à l'aveugle — adapte
les couleurs/polices exactes si le client a une préférence explicite, et laisse toujours les
principes de design ci-dessus primer sur le tableau si les deux se contredisent.
${DESIGN_REFERENCE}`;

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
  const tools = hasPexels() ? [SEARCH_PHOTOS_TOOL, PREVIEW_TOOL] : [PREVIEW_TOOL];

  // Boucle d'outils : l'agent peut chercher ses photos puis rédiger le site
  // dans le même tour. La borne évite qu'il boucle indéfiniment sur des
  // recherches sans jamais livrer de page.
  let response!: Anthropic.Message;
  let text: Anthropic.TextBlock | undefined;
  let toolUse: Anthropic.ToolUseBlock | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Le plan Pro (300s) laisse enfin la place de générer une page entière :
    // plus de raisonnement désactivé ni d'effort bridé, c'était uniquement pour
    // tenir dans les 60s du plan Hobby et ça coûtait cher en qualité de design.
    try {
      response = await client.messages.create({
        model: "claude-sonnet-5",
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

    text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "preview_site",
    );
    if (toolUse) break;

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

  const siteName =
    typeof input.site_name === "string" && input.site_name.trim()
      ? input.site_name.trim()
      : `site-${conversationId!.slice(0, 8)}`;

  // Fusionne avec la version précédente : le modèle peut ne renvoyer que les
  // fichiers touchés, on garde les autres tels quels.
  const merged = new Map(currentFiles.map((f) => [f.path, f]));
  for (const file of files) merged.set(file.path, file);
  const fullFileSet = Array.from(merged.values());

  await supabase
    .from("conversations")
    .update({
      current_files: fullFileSet as unknown as Json,
      vercel_project_name: siteName,
    })
    .eq("id", conversationId!);

  // L'outil ne publie rien : on renvoie juste un résultat neutre pour garder un
  // historique cohérent côté API (chaque tool_use doit avoir son tool_result).
  await persist("user", [
    {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify({ status: "preview_shown_to_client" }),
    },
  ]);

  return NextResponse.json({
    conversationId,
    reply: text?.text ?? "Voici votre site. Dites-moi ce que vous voulez ajuster.",
    files: fullFileSet,
  });
}
