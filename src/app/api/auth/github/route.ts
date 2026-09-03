import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * Démarre le flux OAuth GitHub : vérifie que le client est connecté à
 * notre app, pose un cookie "state" anti-CSRF, puis redirige vers
 * l'écran d'autorisation GitHub.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { origin } = new URL(request.url);
    return NextResponse.redirect(`${origin}/connexion?next=/discussion`);
  }

  const state = randomBytes(16).toString("hex");
  const { origin } = new URL(request.url);

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set("github_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
