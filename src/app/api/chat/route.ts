import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_REFERENCE, FRONTEND_DESIGN_GUIDANCE } from "@/lib/design-reference";
import type { Json } from "@/lib/supabase/types";

// Un seul appel Claude par tour désormais (plus de push GitHub ni de
// déploiement dans ce chemin), mais générer une page complète reste long.
export const maxDuration = 60;

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

Règles :
- Si le client joint une image, c'est une référence visuelle directe (site à reproduire,
  design qu'il aime, logo, charte de couleurs...) — ancre ta conception dessus.
- Si le client joint du code existant, pars de ce code pour l'améliorer plutôt que de tout
  réécrire, sauf s'il demande explicitement une refonte.
- Livre un SEUL fichier "index.html" autonome, CSS et JS inline dedans (l'aperçu s'affiche
  dans une iframe : des fichiers séparés ne se chargeraient pas). N'ajoute d'autres fichiers
  que si le client demande explicitement plusieurs pages.
- Sur une demande de modification, renvoie l'index.html COMPLET modifié, pas un extrait.
- CONTRAINTE DURE : le fichier doit rester compact (environ 200 lignes de HTML, 10 Ko max).
  Le serveur coupe la génération au-delà. Une page courte, dense et finie vaut infiniment
  mieux qu'une page ambitieuse tronquée en plein milieu. Concentre-toi sur 3-4 sections
  essentielles, du CSS ramassé (variables, pas de répétitions), zéro commentaire.
- Design soigné, moderne, responsive, en français, cohérent avec ce que le client décrit.
- Pas de dépendances externes sauf polices Google Fonts si besoin.
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

interface SiteFile {
  path: string;
  content: string;
}

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
  for (const image of images ?? []) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: image.data,
      },
    });
  }
  if (userContent.length === 0) userContent.push({ type: "text", text: "(message vide)" });

  await persist("user", userContent);
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: userContent }];

  // Contraintes de latence, pas de préférence esthétique : la fonction meurt à
  // 60s (plafond du plan Hobby) et écrire du HTML est lent (~60-100 tokens/s).
  // Raisonnement désactivé + effort bas + plafond de sortie serré = la seule
  // façon de tenir. Sur un plan Vercel Pro (300s), on peut tout relâcher.
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3500,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system: BASE_SYSTEM_PROMPT,
    tools: [PREVIEW_TOOL],
    messages,
  });
  await persist("assistant", response.content);

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolUse) {
    return NextResponse.json({ conversationId, reply: text?.text ?? "" });
  }

  const input = toolUse.input as { site_name: string; files: SiteFile[] };

  // Fusionne avec la version précédente : le modèle peut ne renvoyer que les
  // fichiers touchés, on garde les autres tels quels.
  const merged = new Map(currentFiles.map((f) => [f.path, f]));
  for (const file of input.files) merged.set(file.path, file);
  const fullFileSet = Array.from(merged.values());

  await supabase
    .from("conversations")
    .update({
      current_files: fullFileSet as unknown as Json,
      vercel_project_name: input.site_name,
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
