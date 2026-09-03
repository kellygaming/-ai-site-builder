import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Client "service role" : contourne RLS. Réservé au code serveur qui doit
 * écrire sans policy explicite — ex. stocker le token GitHub d'un
 * utilisateur après l'échange OAuth (les clients n'ont qu'une policy de
 * lecture sur github_connections, jamais d'écriture).
 * Ne JAMAIS importer ce module depuis un composant client ou l'exposer
 * au navigateur.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante : requise côté serveur pour les écritures qui contournent RLS.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
