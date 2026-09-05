/**
 * Normalise les images du client AVANT de les envoyer.
 *
 * Trois problèmes réels que ce module règle :
 *
 * 1. Un iPhone livre ses photos en HEIC. Ce format n'était pas dans la liste
 *    des types acceptés : la photo tombait dans la branche "fichier texte",
 *    dépassait la limite de taille, et disparaissait sans un mot. Le client
 *    envoyait ses images et rien ne se passait.
 * 2. Une fonction Vercel refuse un corps de requête au-delà de ~4,5 Mo. Deux
 *    photos de téléphone en base64 suffisent à le dépasser, et l'envoi échoue
 *    en bloc.
 * 3. L'API n'accepte que JPEG, PNG, GIF et WebP.
 *
 * En redimensionnant et réencodant dans le navigateur, on résout les trois :
 * le format devient standard quel qu'il soit à l'entrée, et une photo de 4 Mo
 * tombe autour de 300 Ko sans perte visible à l'écran.
 */

export interface PreparedImage {
  mediaType: "image/jpeg" | "image/png";
  data: string;
  name: string;
}

export interface PreparationResult {
  images: PreparedImage[];
  /** Fichiers écartés, pour le dire au client au lieu de les perdre en silence. */
  rejected: { name: string; reason: string }[];
}

/** Au-delà, on ne gagne plus rien de visible : un site s'affiche sur 1600px de large. */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
/** Marge sous la limite de Vercel, le reste de la requête comptant aussi. */
const TOTAL_BASE64_BUDGET = 3_000_000;
const MAX_IMAGES = 6;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function encode(
  bitmap: ImageBitmap,
  mediaType: "image/jpeg" | "image/png",
): Promise<Blob | null> {
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), mediaType, JPEG_QUALITY),
  );
}

export async function prepareImages(files: File[]): Promise<PreparationResult> {
  const images: PreparedImage[] = [];
  const rejected: { name: string; reason: string }[] = [];
  let used = 0;

  for (const file of files) {
    if (images.length >= MAX_IMAGES) {
      rejected.push({ name: file.name, reason: `au-delà de ${MAX_IMAGES} images` });
      continue;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      // Format que ce navigateur ne sait pas décoder (HEIC hors Safari, RAW…).
      rejected.push({ name: file.name, reason: "format d'image non reconnu" });
      continue;
    }

    // Un PNG porte souvent de la transparence — typiquement un logo. Le passer
    // en JPEG lui collerait un fond noir dans l'en-tête du site.
    const mediaType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await encode(bitmap, mediaType);
    bitmap.close();

    if (!blob) {
      rejected.push({ name: file.name, reason: "conversion impossible" });
      continue;
    }

    const data = await blobToBase64(blob);
    if (used + data.length > TOTAL_BASE64_BUDGET) {
      rejected.push({ name: file.name, reason: "trop lourd pour cet envoi" });
      continue;
    }

    used += data.length;
    images.push({ mediaType, data, name: file.name });
  }

  return { images, rejected };
}
