import "server-only";

export interface StockPhoto {
  url: string;
  alt: string;
  photographer: string;
}

const ENDPOINT = "https://api.pexels.com/v1/search";

/** L'outil n'est proposé à l'agent que si la clé existe : sans elle, le site
 *  se génère toujours, simplement sans photo, au lieu de planter. */
export function hasPexels(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

/**
 * Cherche des photos libres de droits (licence Pexels : usage commercial
 * autorisé, attribution non obligatoire).
 *
 * On renvoie la variante "large" (~1880px) plutôt que l'original : suffisant
 * pour une hero en plein écran, sans imposer un fichier de plusieurs Mo au
 * visiteur. L'URL est servie par le CDN de Pexels, rien à héberger.
 */
export async function searchPhotos(query: string, count = 3): Promise<StockPhoto[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 10)}&orientation=landscape`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: key },
      // Les photos d'une même requête ne changent pas : on laisse le cache
      // Next.js absorber les recherches répétées et économiser le quota.
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      console.error(`[pexels] "${query}" → ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      photos?: { src?: { large?: string }; alt?: string; photographer?: string }[];
    };

    return (data.photos ?? [])
      .filter((photo) => typeof photo.src?.large === "string")
      .map((photo) => ({
        url: photo.src!.large!,
        alt: photo.alt?.trim() || query,
        photographer: photo.photographer ?? "Pexels",
      }));
  } catch (error) {
    // Une panne de Pexels ne doit jamais empêcher la génération du site.
    console.error(`[pexels] recherche "${query}" échouée`, error);
    return [];
  }
}
