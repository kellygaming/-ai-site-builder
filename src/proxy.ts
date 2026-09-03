import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const AUTH_REFRESH_TIMEOUT_MS = 4000;

/**
 * Rafraîchit la session Supabase à chaque navigation (pattern standard
 * @supabase/ssr). Sans ça, un token expiré côté serveur ne serait jamais
 * renouvelé et déconnecterait silencieusement l'utilisateur.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await Promise.race([
    supabase.auth.getUser(),
    new Promise((resolve) => setTimeout(resolve, AUTH_REFRESH_TIMEOUT_MS)),
  ]);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
