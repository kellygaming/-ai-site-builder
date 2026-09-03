import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { createGithubRepo, commitFile } from "@/lib/tools/github";
import { deployToVercel } from "@/lib/tools/vercel";
import { captureScreenshot } from "@/lib/tools/screenshot";
import { DESIGN_REFERENCE, FRONTEND_DESIGN_GUIDANCE } from "@/lib/design-reference";
import type { Json } from "@/lib/supabase/types";

// Génération + push GitHub + déploiement Vercel + capture d'écran (x2 avec la
// passe d'auto-critique) dépasse largement les 10s par défaut. 60s est le
// maximum autorisé sur le plan Hobby — un plan Pro (300s+) serait plus sûr
// pour ce genre de flux agentique multi-étapes.
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

/**
 * Budget avant de renoncer à la passe d'auto-critique visuelle : capture +
 * second appel Claude coûtent ~15-25s, impossibles à tenir si la génération a
 * déjà mangé l'essentiel des 60s du plan Hobby. Au-delà, on livre directement
 * le site avec ses liens plutôt que de laisser la fonction expirer.
 */
const VISUAL_REVIEW_BUDGET_MS = 30_000;

const BASE_SYSTEM_PROMPT = `Tu es l'agent de construction de sites d'AI Site Builder. Le
client te décrit en langage courant le site qu'il veut, ou te demande de modifier un site
déjà créé dans cette conversation. Tu conçois/modifies un site statique (HTML/CSS/JS, sans
framework ni étape de build).

Règles :
- Si le client joint une image, c'est une référence visuelle directe (site existant à
  reproduire/inspirer, capture d'un design qu'il aime, logo, charte de couleurs...) — ancre
  ta conception dessus : reprends la palette, l'ambiance, la structure qu'elle montre.
- Si le client joint du code existant, pars de ce code pour l'améliorer plutôt que de tout
  réécrire à zéro, sauf s'il demande explicitement une refonte complète.
- Toujours au moins un fichier "index.html" autonome, avec le CSS et le JS inline ou en
  fichiers séparés (style.css, script.js) référencés depuis index.html.
- Design soigné, moderne, responsive, en français, cohérent avec ce que le client décrit.
- Pas de dépendances externes (pas de CDN obligatoire) sauf polices Google Fonts si besoin.
- Une capture d'écran du site réellement déployé t'est montrée après chaque outil : si
  quelque chose est manifestement cassé (texte illisible, éléments qui se chevauchent,
  mise en page qui déborde), corrige-le immédiatement avec update_site — une seule fois,
  ne boucle pas indéfiniment. Sinon, confirme juste que c'est prêt.
- Une fois satisfait du résultat, réponds au client en français, brièvement, en confirmant
  que le site est en ligne/à jour et en donnant le lien.

${FRONTEND_DESIGN_GUIDANCE}
Utilise la référence ci-dessous comme point de départ (palette + police adaptées au type de
site demandé, règles UX toujours respectées) plutôt que d'improviser à l'aveugle — adapte
les couleurs/polices exactes si le client a une préférence explicite, et laisse toujours les
principes de design ci-dessus primer sur le tableau si les deux se contredisent.
${DESIGN_REFERENCE}`;

const CREATE_TOOL: Anthropic.Tool = {
  name: "create_and_deploy_site",
  description:
    "Crée un dépôt GitHub avec les fichiers du site, les commite, puis déploie le site sur Vercel. Réservé à la toute première création du site dans une conversation — pour une modification ultérieure, utilise update_site.",
  input_schema: {
    type: "object",
    properties: {
      repo_name: { type: "string", description: "Nom du dépôt en kebab-case" },
      description: { type: "string" },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    },
    required: ["repo_name", "files"],
  },
};

const UPDATE_TOOL: Anthropic.Tool = {
  name: "update_site",
  description:
    "Modifie le site déjà créé dans cette conversation : ne passe que les fichiers nouveaux ou changés (pas besoin de renvoyer les fichiers inchangés), commite chacun sur GitHub puis redéploie le site complet sur Vercel.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    },
    required: ["files"],
  },
};

interface SiteFile {
  path: string;
  content: string;
}

interface SiteState {
  githubOwner: string | null;
  githubRepo: string | null;
  vercelProjectName: string | null;
  currentFiles: SiteFile[] | null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
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

  const [{ data: githubConn }, { data: vercelConn }] = await Promise.all([
    supabase
      .from("github_connections")
      .select("access_token_encrypted")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("vercel_connections")
      .select("access_token_encrypted, vercel_team_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!githubConn || !vercelConn) {
    return NextResponse.json({
      reply:
        "Il me faut d'abord GitHub et Vercel connectés pour pouvoir créer et déployer votre site — cliquez sur les deux bandeaux au-dessus du chat, puis revenez me parler.",
    });
  }

  const githubToken = decryptToken(githubConn.access_token_encrypted);
  const vercelToken = decryptToken(vercelConn.access_token_encrypted);
  const vercelTeamId = vercelConn.vercel_team_id;

  let conversationId = incomingConversationId as string | undefined;
  let siteState: SiteState = {
    githubOwner: null,
    githubRepo: null,
    vercelProjectName: null,
    currentFiles: null,
  };
  let history: Anthropic.MessageParam[] = [];

  if (conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("github_owner, github_repo, vercel_project_name, current_files")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
    }

    siteState = {
      githubOwner: conversation.github_owner,
      githubRepo: conversation.github_repo,
      vercelProjectName: conversation.vercel_project_name,
      currentFiles: (conversation.current_files as SiteFile[] | null) ?? null,
    };

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

  /** Exécute create_and_deploy_site / update_site, prend une capture du résultat, met Supabase à jour. */
  async function runTool(
    toolUse: Anthropic.ToolUseBlock,
    withNote: boolean,
    withScreenshot: boolean,
  ) {
    let repoUrl: string | undefined;
    let deployUrl: string | undefined;
    let statusPayload: Record<string, unknown>;

    try {
      if (toolUse.name === "create_and_deploy_site") {
        const input = toolUse.input as { repo_name: string; description?: string; files: SiteFile[] };

        const repo = await createGithubRepo(
          githubToken,
          input.repo_name,
          input.description ?? "Site généré par AI Site Builder",
        );
        repoUrl = repo.htmlUrl;

        for (const file of input.files) {
          await commitFile(githubToken, repo.owner, repo.repo, file.path, file.content, `Ajoute ${file.path}`);
        }

        const deployment = await deployToVercel(vercelToken, vercelTeamId, input.repo_name, input.files);
        deployUrl = deployment.url;

        siteState = {
          githubOwner: repo.owner,
          githubRepo: repo.repo,
          vercelProjectName: input.repo_name,
          currentFiles: input.files,
        };

        await supabase
          .from("conversations")
          .update({
            github_owner: repo.owner,
            github_repo: repo.repo,
            vercel_project_name: input.repo_name,
            current_files: input.files as unknown as Json,
          })
          .eq("id", conversationId!);

        statusPayload = { repoUrl, deployUrl, status: "success" };
      } else {
        const input = toolUse.input as { files: SiteFile[] };
        if (!siteState.githubOwner || !siteState.githubRepo || !siteState.vercelProjectName) {
          throw new Error("Aucun site existant à modifier dans cette conversation.");
        }

        for (const file of input.files) {
          await commitFile(
            githubToken,
            siteState.githubOwner,
            siteState.githubRepo,
            file.path,
            file.content,
            `Modifie ${file.path}`,
          );
        }

        const mergedFiles = new Map((siteState.currentFiles ?? []).map((f) => [f.path, f]));
        for (const file of input.files) mergedFiles.set(file.path, file);
        const fullFileSet = Array.from(mergedFiles.values());

        const deployment = await deployToVercel(
          vercelToken,
          vercelTeamId,
          siteState.vercelProjectName,
          fullFileSet,
        );
        deployUrl = deployment.url;
        repoUrl = `https://github.com/${siteState.githubOwner}/${siteState.githubRepo}`;

        siteState = { ...siteState, currentFiles: fullFileSet };

        await supabase
          .from("conversations")
          .update({ current_files: fullFileSet as unknown as Json })
          .eq("id", conversationId!);

        statusPayload = { repoUrl, deployUrl, status: "success" };
      }
    } catch (error) {
      statusPayload = {
        status: "error",
        message: error instanceof Error ? error.message : "Erreur inconnue",
      };
    }

    const resultBlocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [
      {
        type: "text",
        text: JSON.stringify(
          withNote
            ? {
                ...statusPayload,
                note: "Capture d'écran du site réellement déployé jointe ci-dessous. Si quelque chose est manifestement cassé, corrige avec update_site (une seule fois). Sinon confirme juste que c'est prêt.",
              }
            : statusPayload,
        ),
      },
    ];

    let screenshotTaken = false;
    if (deployUrl && withScreenshot) {
      const screenshot = await captureScreenshot(deployUrl);
      if (screenshot) {
        screenshotTaken = true;
        resultBlocks.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: screenshot },
        });
      }
    }

    return {
      repoUrl,
      deployUrl,
      resultBlocks,
      screenshotTaken,
      ok: statusPayload.status === "success",
    };
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
  if (userContent.length === 0) {
    userContent.push({ type: "text", text: "(message vide)" });
  }

  const userTurn: Anthropic.MessageParam = { role: "user", content: userContent };
  await persist("user", userTurn.content);
  const messages: Anthropic.MessageParam[] = [...history, userTurn];

  const hasSite = Boolean(siteState.githubOwner && siteState.githubRepo);
  const tools: Anthropic.Tool[] = hasSite ? [UPDATE_TOOL] : [CREATE_TOOL];

  const first = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    system: BASE_SYSTEM_PROMPT,
    tools,
    messages,
  });
  await persist("assistant", first.content);

  const firstToolUse = first.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!firstToolUse) {
    const text = first.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return NextResponse.json({ conversationId, reply: text?.text ?? "" });
  }

  // Tour 1 : construit/modifie le site. La capture d'écran (et donc la passe
  // d'auto-critique) n'est tentée que s'il reste assez de budget temps.
  const budgetLeft = Date.now() - startedAt < VISUAL_REVIEW_BUDGET_MS;
  const result1 = await runTool(firstToolUse, budgetLeft, budgetLeft);
  const toolResultTurn1: Anthropic.MessageParam = {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: firstToolUse.id, content: result1.resultBlocks }],
  };
  await persist("user", toolResultTurn1.content);
  messages.push({ role: "assistant", content: first.content }, toolResultTurn1);

  // Sans capture (budget épuisé, échec, ou déploiement raté), la relecture
  // visuelle n'a plus d'objet : on répond directement plutôt que de brûler
  // 15-20s de plus et risquer le timeout.
  if (!result1.screenshotTaken) {
    const reply = result1.ok
      ? `Votre site est en ligne : ${result1.deployUrl}`
      : "Le site n'a pas pu être déployé. Reformulez votre demande et réessayez.";
    await persist("assistant", [{ type: "text", text: reply }]);
    return NextResponse.json({
      conversationId,
      reply,
      repoUrl: result1.repoUrl,
      deployUrl: result1.deployUrl,
    });
  }

  const review = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    system: BASE_SYSTEM_PROMPT,
    tools: result1.ok ? [UPDATE_TOOL] : tools,
    messages,
  });
  await persist("assistant", review.content);

  const correctionToolUse = review.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  let repoUrl = result1.repoUrl;
  let deployUrl = result1.deployUrl;

  if (!correctionToolUse) {
    const text = review.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return NextResponse.json({ conversationId, reply: text?.text ?? "", repoUrl, deployUrl });
  }

  // Tour 2 (borné) : une correction visuelle max, sans nouvelle capture (le
  // budget est déjà bien entamé), puis réponse finale forcée sans outil.
  const result2 = await runTool(correctionToolUse, false, false);
  repoUrl = result2.repoUrl ?? repoUrl;
  deployUrl = result2.deployUrl ?? deployUrl;

  const toolResultTurn2: Anthropic.MessageParam = {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: correctionToolUse.id, content: result2.resultBlocks }],
  };
  await persist("user", toolResultTurn2.content);
  messages.push({ role: "assistant", content: review.content }, toolResultTurn2);

  const final = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: BASE_SYSTEM_PROMPT,
    messages,
  });
  await persist("assistant", final.content);

  const finalText = final.content.find((b): b is Anthropic.TextBlock => b.type === "text");

  return NextResponse.json({ conversationId, reply: finalText?.text ?? "", repoUrl, deployUrl });
}
