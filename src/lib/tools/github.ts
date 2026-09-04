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

/**
 * Crée un repo privé sous le compte GitHub du client connecté.
 *
 * auto_init crée un commit initial (un README). Ce n'est pas cosmétique :
 * l'API Git Data refuse d'écrire le moindre blob dans un dépôt sans aucun
 * commit et répond 409 "Git Repository is empty".
 */
export async function createGithubRepo(
  token: string,
  name: string,
  description: string,
): Promise<CreateRepoResult> {
  const response = await fetch(`${API}/user/repos`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ name, description, private: true, auto_init: true }),
  });

  if (response.ok) {
    const data = await response.json();
    return { owner: data.owner.login, repo: data.name, htmlUrl: data.html_url };
  }

  // 422 = le nom est déjà pris. C'est le cas quand une publication précédente
  // a créé le dépôt puis échoué plus loin : on le réutilise au lieu de bloquer
  // le client sur un dépôt fantôme qu'il devrait supprimer à la main.
  if (response.status === 422) {
    const me = await githubFetch(token, "/user");
    const existing = await githubFetch(token, `/repos/${me.login}/${name}`);
    return { owner: existing.owner.login, repo: existing.name, htmlUrl: existing.html_url };
  }

  throw new Error(`GitHub POST /user/repos → ${response.status} : ${await response.text()}`);
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

  let parentCommitSha: string | null = null;
  let baseTreeSha: string | null = null;

  const readHead = async () => {
    const response = await fetch(`${API}${base}/git/ref/heads/${BRANCH}`, {
      headers: headers(token),
    });
    return response.ok ? await response.json() : null;
  };

  let ref = await readHead();

  // Dépôt sans aucun commit (créé avant auto_init, ou branche par défaut
  // différente) : l'API Git Data y répond 409. L'API Contents, elle, accepte
  // d'écrire dans le vide — on l'utilise juste pour poser le commit initial,
  // puis on repasse sur Git Data pour le vrai commit en une seule requête.
  if (!ref) {
    await githubFetch(token, `${base}/contents/README.md`, {
      method: "PUT",
      body: JSON.stringify({
        message: "Initialise le dépôt",
        content: Buffer.from("# Site créé avec AI Site Builder\n", "utf-8").toString("base64"),
        branch: BRANCH,
      }),
    });
    ref = await readHead();
  }

  if (ref) {
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
