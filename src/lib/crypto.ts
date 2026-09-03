import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des tokens tiers (GitHub, Vercel...) avant
 * stockage en base. La clé de chiffrement (TOKEN_ENCRYPTION_KEY) ne
 * quitte jamais le serveur — sans elle, un dump de la base ne révèle
 * aucun token utilisable.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY manquante : requise pour chiffrer/déchiffrer les tokens tiers.",
    );
  }
  // Dérive une clé 256 bits stable à partir du secret, quelle que soit sa longueur.
  return scryptSync(secret, "token-encryption", 32);
}

/** Retourne "iv:authTag:ciphertext" en base64, chaque partie séparée par ":". */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptToken(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Format de token chiffré invalide.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
