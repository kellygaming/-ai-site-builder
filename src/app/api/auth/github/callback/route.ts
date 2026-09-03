import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken } from "@/lib/crypto";

interface GitHubTokenResponse {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  login: string;
}

/**
 * Reçoit le retour de GitHub, échange le code contre un token, et stocke
 * ce token chiffré côté serveur (service_role — le client n'a pas le
 * droit d'écrire dans github_connections, voir la migration RLS).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith("github_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(`${origin}/discussion?github=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/connexion?next=/discussion`);
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`,
    }),
  });

  const tokenData: GitHubTokenResponse = await tokenResponse.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(`${origin}/discussion?github=error`);
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const githubUser: GitHubUserResponse = await userResponse.json();

  const serviceClient = createServiceClient();
  const { error: upsertError } = await serviceClient.from("github_connections").upsert(
    {
      user_id: user.id,
      github_login: githubUser.login,
      access_token_encrypted: encryptToken(tokenData.access_token),
      scope: tokenData.scope ?? null,
    },
    { onConflict: "user_id" },
  );

  const response = NextResponse.redirect(
    `${origin}/discussion?github=${upsertError ? "error" : "connected"}`,
  );
  response.cookies.delete("github_oauth_state");
  return response;
}
