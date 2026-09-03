import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Client Supabase pour Server Components / Route Handlers, authentifié
 * comme l'utilisateur courant (respecte les policies RLS).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appelé depuis un Server Component : les cookies sont
            // rafraîchis par le middleware, on peut ignorer l'échec ici.
          }
        },
      },
    },
  );
}
