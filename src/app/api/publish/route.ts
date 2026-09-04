import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { createGithubRepo, commitFiles } from "@/lib/tools/github";
import { deployToVercel } from "@/lib/tools/vercel";

// Publication seulement : aucun appel Claude ici, donc rapide. La marge sert
// aux sites multi-fichiers, où GitHub et Vercel enchaînent plus de requêtes.
export const maxDuration = 120;

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

  const { conversationId }: { conversationId?: string } = await request.json();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation manquante." }, { status: 400 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("current_files, github_owner, github_repo, vercel_project_name")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  const files = (conversation.current_files as SiteFile[] | null) ?? [];
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Aucun site à publier — demandez d'abord une création à l'agent." },
      { status: 400 },
    );
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
    return NextResponse.json(
      {
        error:
          "Connectez GitHub et Vercel (bandeaux en haut de la page) avant de publier votre site.",
      },
      { status: 400 },
    );
  }

  const githubToken = decryptToken(githubConn.access_token_encrypted);
  const vercelToken = decryptToken(vercelConn.access_token_encrypted);
  const projectName = conversation.vercel_project_name ?? `site-${conversationId.slice(0, 8)}`;

  try {
    let owner = conversation.github_owner;
    let repo = conversation.github_repo;
    let repoUrl: string;

    if (owner && repo) {
      repoUrl = `https://github.com/${owner}/${repo}`;
    } else {
      const created = await createGithubRepo(
        githubToken,
        projectName,
        "Site créé avec AI Site Builder",
      );
      owner = created.owner;
      repo = created.repo;
      repoUrl = created.htmlUrl;
    }

    await commitFiles(githubToken, owner, repo, files, "Publie le site");

    const deployment = await deployToVercel(
      vercelToken,
      vercelConn.vercel_team_id,
      projectName,
      files,
    );

    await supabase
      .from("conversations")
      .update({ github_owner: owner, github_repo: repo, vercel_project_name: projectName })
      .eq("id", conversationId);

    return NextResponse.json({ repoUrl, deployUrl: deployment.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Échec de la publication." },
      { status: 500 },
    );
  }
}
