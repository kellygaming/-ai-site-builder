import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { createGithubRepo, commitFiles } from "@/lib/tools/github";
import { deployToVercel } from "@/lib/tools/vercel";
import { assetRepoPath, findStoredAssetUrls } from "@/lib/tools/storage";

// Publication seulement : aucun appel Claude ici, donc rapide. La marge sert
// aux sites multi-fichiers, où GitHub et Vercel enchaînent plus de requêtes.
export const maxDuration = 120;

interface SiteFile {
  path: string;
  content: string;
  /** "base64" pour un binaire (logo, photo) ; absent pour du texte. */
  encoding?: "base64";
}

/**
 * Rapatrie les images hébergées chez nous dans le dépôt du client et remplace
 * leurs adresses par des chemins relatifs.
 *
 * Sans cette étape, le site publié resterait accroché à notre stockage : nous
 * paierions sa bande passante à vie, et le jour où le client part — ou bien où
 * ce projet s'arrête — son logo disparaîtrait de son propre site. Après
 * recopie, le site qu'il possède est autonome.
 */
async function inlineStoredAssets(files: SiteFile[]): Promise<SiteFile[]> {
  const urls = Array.from(new Set(files.flatMap((file) => findStoredAssetUrls(file.content))));
  if (urls.length === 0) return files;

  const downloaded = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
          url,
          file: {
            path: assetRepoPath(url),
            content: buffer.toString("base64"),
            encoding: "base64" as const,
          },
        };
      } catch (error) {
        console.error(`[publish] asset non rapatrié : ${url}`, error);
        return null;
      }
    }),
  );

  const assets = downloaded.filter((entry) => entry !== null);
  if (assets.length === 0) return files;

  const rewritten = files.map((file) => ({
    ...file,
    content: assets.reduce(
      (content, asset) => content.split(asset.url).join(asset.file.path),
      file.content,
    ),
  }));

  return [...rewritten, ...assets.map((asset) => asset.file)];
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

  // Les images du client rejoignent son dépôt avant tout envoi, pour que son
  // site ne dépende plus de notre stockage une fois en ligne.
  const publishableFiles = await inlineStoredAssets(files);

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

    await commitFiles(githubToken, owner, repo, publishableFiles, "Publie le site");

    const deployment = await deployToVercel(
      vercelToken,
      vercelConn.vercel_team_id,
      projectName,
      publishableFiles,
    );

    await supabase
      .from("conversations")
      .update({ github_owner: owner, github_repo: repo, vercel_project_name: projectName })
      .eq("id", conversationId);

    return NextResponse.json({ repoUrl, deployUrl: deployment.url });
  } catch (error) {
    // Le détail technique va dans les logs ; le client, lui, reçoit une phrase
    // qu'il peut comprendre et sur laquelle il peut agir. Renvoyer le corps
    // brut de l'API GitHub dans le chat n'aide personne.
    console.error("[publish] échec", error);
    const detail = error instanceof Error ? error.message : "";
    const message = detail.includes("401") || detail.includes("403")
      ? "Votre connexion GitHub ou Vercel a expiré. Reconnectez-la depuis les bandeaux en haut de la page, puis réessayez."
      : "La publication a échoué. Réessayez dans un instant — si le problème persiste, dites-le moi et je regarde.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
