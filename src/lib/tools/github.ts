import "server-only";

interface CreateRepoResult {
  owner: string;
  repo: string;
  htmlUrl: string;
}

interface SiteFile {
  path: string;
  content: string;
}

const API = "https://api.github.com";
const BRANCH = "main";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function githubFetch(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, { ...init, headers: headers(token) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} → ${response.status} : ${body}`);
  }
  return response.json();
}

/** Crée un repo privé sous le compte GitHub du client connecté. */
export async function createGithubRepo(
  token: string,
  name: string,
  description: string,
): Promise<CreateRepoResult> {
  const data = await githubFetch(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, description, private: true, auto_init: false }),
  });
  return { owner: data.owner.login, repo: data.name, htmlUrl: data.html_url };
}

/**
 * Écrit tous les fichiers en UN SEUL commit via l'API Git Data.
 *
 * L'API Contents (un PUT par fichier, séquentiel car chaque commit dépend du
 * précédent) coûtait plusieurs secondes par fichier et faisait dépasser le
 * budget de 60s de la fonction. Ici les blobs partent en parallèle (contenu
 * adressé par hash, aucun conflit de ref possible) et il ne reste que 3
 * requêtes séquentielles quel que soit le nombre de fichiers.
 */
export async function commitFiles(
  token: string,
  owner: string,
  repo: string,
  files: SiteFile[],
  message: string,
): Promise<void> {
  const base = `/repos/${owner}/${repo}`;

  // Un repo fraîchement créé (auto_init: false) n'a aucune ref : premier commit sans parent.
  let parentCommitSha: string | null = null;
  let baseTreeSha: string | null = null;

  const refResponse = await fetch(`${API}${base}/git/ref/heads/${BRANCH}`, {
    headers: headers(token),
  });
  if (refResponse.ok) {
    const ref = await refResponse.json();
    parentCommitSha = ref.object.sha;
    const commit = await githubFetch(token, `${base}/git/commits/${parentCommitSha}`);
    baseTreeSha = commit.tree.sha;
  }

  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await githubFetch(token, `${base}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(file.content, "utf-8").toString("base64"),
          encoding: "base64",
        }),
      });
      return { path: file.path, sha: blob.sha as string };
    }),
  );

  const tree = await githubFetch(token, `${base}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
      tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });

  const commit = await githubFetch(token, `${base}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    }),
  });

  if (parentCommitSha) {
    await githubFetch(token, `${base}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
  } else {
    await githubFetch(token, `${base}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
    });
  }
}
