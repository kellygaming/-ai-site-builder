import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cible du lien magique envoyé par e-mail : échange le code PKCE renvoyé
 * par Supabase contre une session, puis redirige.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const redirectTo = next && next.startsWith("/") ? next : "/discussion";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=confirmation`);
}
