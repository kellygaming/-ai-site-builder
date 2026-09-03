import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken } from "@/lib/crypto";

interface VercelTokenResponse {
  access_token?: string;
  token_type?: string;
  user_id?: string;
  team_id?: string | null;
  error?: string;
  error_description?: string;
}

/**
 * Reçoit le retour de Vercel après installation, échange le code contre
 * un token, et le stocke chiffré via un client service_role — même
 * logique que pour GitHub (voir src/app/api/auth/github/callback).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/discussion?vercel=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/connexion?next=/discussion`);
  }

  const tokenResponse = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.VERCEL_CLIENT_ID!,
      client_secret: process.env.VERCEL_CLIENT_SECRET!,
      code,
      redirect_uri: `${origin}/api/auth/vercel/callback`,
    }),
  });

  const tokenData: VercelTokenResponse = await tokenResponse.json();

  if (!tokenData.access_token || !tokenData.user_id) {
    return NextResponse.redirect(`${origin}/discussion?vercel=error`);
  }

  const serviceClient = createServiceClient();
  const { error: upsertError } = await serviceClient.from("vercel_connections").upsert(
    {
      user_id: user.id,
      vercel_user_id: tokenData.user_id,
      vercel_team_id: tokenData.team_id ?? null,
      access_token_encrypted: encryptToken(tokenData.access_token),
    },
    { onConflict: "user_id" },
  );

  return NextResponse.redirect(
    `${origin}/discussion?vercel=${upsertError ? "error" : "connected"}`,
  );
}
