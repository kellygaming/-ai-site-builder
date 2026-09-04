import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "site-assets";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Stocke une image envoyée par le client et renvoie son URL publique.
 *
 * Sans ça, un logo joint dans la conversation n'a aucune adresse web :
 * l'agent le "voit" mais ne peut pas l'afficher sur le site. Le nom de
 * fichier est un UUID — le bucket est en lecture publique (le logo finira
 * de toute façon sur un site public), donc l'URL ne doit pas être devinable
 * à partir de l'identité du client.
 *
 * Renvoie null en cas d'échec : une image non stockée ne doit pas empêcher
 * la conversation de continuer.
 */
export async function uploadClientImage(
  userId: string,
  mediaType: string,
  base64Data: string,
): Promise<string | null> {
  const extension = EXTENSIONS[mediaType];
  if (!extension) return null;

  try {
    const supabase = createServiceClient();
    const path = `${userId}/${randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(base64Data, "base64"), {
        contentType: mediaType,
        cacheControl: "31536000",
      });

    if (error) {
      console.error("[storage] envoi échoué", error);
      return null;
    }

    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    console.error("[storage] envoi échoué", error);
    return null;
  }
}

/**
 * Extrait toutes nos URLs de stockage présentes dans un contenu HTML.
 *
 * Sert à la publication : ces fichiers doivent être copiés dans le dépôt du
 * client pour que son site ne dépende plus de notre infrastructure.
 */
export function findStoredAssetUrls(html: string): string[] {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return [];

  const prefix = `${base}/storage/v1/object/public/${BUCKET}/`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // S'arrête aux délimiteurs qui entourent une URL en HTML/CSS : guillemets,
  // espaces, et la parenthèse fermante d'un url(...).
  const pattern = new RegExp(`${escaped}[^"'\\s)]+`, "g");

  return Array.from(new Set(html.match(pattern) ?? []));
}

/** Chemin sous lequel l'asset est écrit dans le dépôt du client. */
export function assetRepoPath(url: string): string {
  const name = url.split("/").pop() ?? "asset";
  return `assets/${name}`;
}
