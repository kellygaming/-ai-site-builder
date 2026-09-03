import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { createGithubRepo, commitFile } from "@/lib/tools/github";
import { deployToVercel } from "@/lib/tools/vercel";
import { DESIGN_REFERENCE, FRONTEND_DESIGN_GUIDANCE } from "@/lib/design-reference";
import type { Json } from "@/lib/supabase/types";

const client = new Anthropic();

const BASE_SYSTEM_PROMPT = `Tu es l'agent de construction de sites d'AI Site Builder. Le
client te décrit en langage courant le site qu'il veut, ou te demande de modifier un site
déjà créé dans cette conversation. Tu conçois/modifies un site statique (HTML/CSS/JS, sans
framework ni étape de build).

Règles :
- Toujours au moins un fichier "index.html" autonome, avec le CSS et le JS inline ou en
  fichiers séparés (style.css, script.js) référencés depuis index.html.
- Design soigné, moderne, responsive, en français, cohérent avec ce que le client décrit.
- Pas de dépendances externes (pas de CDN obligatoire) sauf polices Google Fonts si besoin.
- Une fois l'outil appelé et son résultat reçu, réponds au client en français, brièvement,
  en confirmant que le site est en ligne/à jour et en donnant le lien.

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

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { message, conversationId: incomingConversationId } = await request.json();
  if (typeof message !== "string" || !message.trim()) {
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

  // Charge ou crée la conversation, et son historique déjà persisté.
  let conversationId = incomingConversationId as string | undefined;
  let siteState: {
    githubOwner: string | null;
    githubRepo: string | null;
    vercelProjectName: string | null;
    currentFiles: SiteFile[] | null;
  } = { githubOwner: null, githubRepo: null, vercelProjectName: null, currentFiles: null };

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
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select("id")
      .single();

    if (error || !newConversation) {
      return NextResponse.json({ error: "Impossible de créer la conversation." }, { status: 500 });
    }
    conversationId = newConversation.id;
  }

  const hasSite = Boolean(siteState.githubOwner && siteState.githubRepo);
  const tools: Anthropic.Tool[] = hasSite ? [UPDATE_TOOL] : [CREATE_TOOL];

  async function persist(role: "user" | "assistant", content: Anthropic.MessageParam["content"]) {
    await supabase.from("messages").insert({
      conversation_id: conversationId!,
      role,
      content: JSON.stringify(content),
    });
  }

  const userTurn: Anthropic.MessageParam = { role: "user", content: message };
  await persist("user", userTurn.content);
  const messages: Anthropic.MessageParam[] = [...history, userTurn];

  const first = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    system: BASE_SYSTEM_PROMPT,
    tools,
    messages,
  });
  await persist("assistant", first.content);

  const toolUse = first.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    const text = first.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return NextResponse.json({ conversationId, reply: text?.text ?? "" });
  }

  let repoUrl: string | undefined;
  let deployUrl: string | undefined;
  let toolResultContent: string;

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

      await supabase
        .from("conversations")
        .update({
          github_owner: repo.owner,
          github_repo: repo.repo,
          vercel_project_name: input.repo_name,
          current_files: input.files as unknown as Json,
        })
        .eq("id", conversationId);

      toolResultContent = JSON.stringify({ repoUrl, deployUrl, status: "success" });
    } else {
      // update_site
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

      await supabase
        .from("conversations")
        .update({ current_files: fullFileSet as unknown as Json })
        .eq("id", conversationId);

      toolResultContent = JSON.stringify({ repoUrl, deployUrl, status: "success" });
    }
  } catch (error) {
    toolResultContent = JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }

  const toolResultTurn: Anthropic.MessageParam = {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUse.id, content: toolResultContent }],
  };
  await persist("user", toolResultTurn.content);
  messages.push({ role: "assistant", content: first.content }, toolResultTurn);

  const final = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: BASE_SYSTEM_PROMPT,
    tools,
    messages,
  });
  await persist("assistant", final.content);

  const finalText = final.content.find((b): b is Anthropic.TextBlock => b.type === "text");

  return NextResponse.json({ conversationId, reply: finalText?.text ?? "", repoUrl, deployUrl });
}
