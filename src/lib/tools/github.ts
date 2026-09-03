import "server-only";

interface CreateRepoResult {
  owner: string;
  repo: string;
  htmlUrl: string;
}

/** Crée un repo privé sous le compte GitHub du client connecté. */
export async function createGithubRepo(
  token: string,
  name: string,
  description: string,
): Promise<CreateRepoResult> {
  const response = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description, private: true, auto_init: false }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Échec de création du repo GitHub (${response.status}) : ${body}`);
  }

  const data = await response.json();
  return { owner: data.owner.login, repo: data.name, htmlUrl: data.html_url };
}

/** Crée ou met à jour un fichier dans le repo (API Contents, un fichier à la fois). */
export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Échec d'écriture de ${path} (${response.status}) : ${body}`);
  }
}
