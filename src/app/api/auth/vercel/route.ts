import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Démarre le flux d'installation de l'intégration Vercel.
 *
 * Contrairement à GitHub, l'URL d'autorisation Vercel ne prend pas de
 * client_id/redirect_uri/state en query params — ces valeurs sont
 * configurées une fois dans le dashboard de l'intégration. On se
 * contente donc de rediriger vers la page d'installation du slug, après
 * avoir vérifié que le client est bien connecté à notre app.
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

  return NextResponse.redirect(
    `https://vercel.com/integrations/${process.env.VERCEL_INTEGRATION_SLUG}/new`,
  );
}
