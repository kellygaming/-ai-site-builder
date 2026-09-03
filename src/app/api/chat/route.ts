import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { createGithubRepo, commitFile } from "@/lib/tools/github";
import { deployToVercel } from "@/lib/tools/vercel";
import { DESIGN_REFERENCE } from "@/lib/design-reference";

const client = new Anthropic();

const SYSTEM_PROMPT = `Tu es l'agent de construction de sites d'AI Site Builder. Le client
te décrit en langage courant le site qu'il veut ; tu conçois un site statique complet
(HTML/CSS/JS, sans framework ni étape de build) et tu l'expédies avec l'outil
create_and_deploy_site — une seule fois, avec tous les fichiers finis.

Règles :
- Toujours au moins un fichier "index.html" autonome, avec le CSS et le JS inline ou en
  fichiers séparés (style.css, script.js) référencés depuis index.html.
- Design soigné, moderne, responsive, en français, cohérent avec ce que le client décrit.
- Pas de dépendances externes (pas de CDN obligatoire) sauf polices Google Fonts si besoin.
- repo_name en kebab-case, dérivé du nom du site.
- Une fois l'outil appelé et son résultat reçu, réponds au client en français, brièvement,
  en confirmant que le site est en ligne et en donnant le lien.

Utilise la référence design ci-dessous comme point de départ (palette + police adaptées au
type de site demandé, règles UX toujours respectées) plutôt que d'improviser à l'aveugle —
adapte les couleurs/polices exactes si le client a une préférence explicite.
${DESIGN_REFERENCE}`;

const CREATE_AND_DEPLOY_TOOL: Anthropic.Tool = {
  name: "create_and_deploy_site",
  description:
    "Crée un dépôt GitHub avec les fichiers du site, les commite, puis déploie le site sur Vercel. À appeler une seule fois, une fois le site entièrement conçu.",
  input_schema: {
    type: "object",
    properties: {
      repo_name: {
        type: "string",
        description: "Nom du dépôt en kebab-case, ex: mon-site-vitrine",
      },
      description: { type: "string", description: "Courte description du site" },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
    required: ["repo_name", "files"],
  },
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { message } = await request.json();
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

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];

  const first = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [CREATE_AND_DEPLOY_TOOL],
    messages,
  });

  const toolUse = first.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    const text = first.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return NextResponse.json({ reply: text?.text ?? "" });
  }

  const input = toolUse.input as {
    repo_name: string;
    description?: string;
    files: { path: string; content: string }[];
  };

  let repoUrl: string | undefined;
  let deployUrl: string | undefined;
  let toolResultContent: string;

  try {
    const repo = await createGithubRepo(
      githubToken,
      input.repo_name,
      input.description ?? "Site généré par AI Site Builder",
    );
    repoUrl = repo.htmlUrl;

    for (const file of input.files) {
      await commitFile(
        githubToken,
        repo.owner,
        repo.repo,
        file.path,
        file.content,
        `Ajoute ${file.path}`,
      );
    }

    const deployment = await deployToVercel(
      vercelToken,
      vercelTeamId,
      input.repo_name,
      input.files,
    );
    deployUrl = deployment.url;

    toolResultContent = JSON.stringify({ repoUrl, deployUrl, status: "success" });
  } catch (error) {
    toolResultContent = JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }

  messages.push({ role: "assistant", content: first.content });
  messages.push({
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: toolUse.id, content: toolResultContent },
    ],
  });

  const final = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [CREATE_AND_DEPLOY_TOOL],
    messages,
  });

  const finalText = final.content.find((b): b is Anthropic.TextBlock => b.type === "text");

  return NextResponse.json({ reply: finalText?.text ?? "", repoUrl, deployUrl });
}
