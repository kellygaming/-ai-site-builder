import "server-only";

interface SiteFile {
  path: string;
  content: string;
  /** "base64" pour un binaire (logo, photo) ; absent pour du texte. */
  encoding?: "base64";
}

interface DeployResult {
  url: string;
  deploymentId: string;
}

/**
 * Déploie un jeu de fichiers statiques directement sur Vercel (pas de
 * lien Git — l'API Deployments accepte les fichiers en ligne). Crée le
 * projet automatiquement au premier déploiement sous ce nom.
 */
export async function deployToVercel(
  token: string,
  teamId: string | null,
  projectName: string,
  files: SiteFile[],
): Promise<DeployResult> {
  const url = new URL("https://api.vercel.com/v13/deployments");
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      target: "production",
      files: files.map((f) => ({
        file: f.path,
        data: f.content,
        ...(f.encoding ? { encoding: f.encoding } : {}),
      })),
      projectSettings: { framework: null },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Échec de déploiement Vercel (${response.status}) : ${body}`);
  }

  const data = await response.json();
  return { url: `https://${data.url}`, deploymentId: data.id };
}
