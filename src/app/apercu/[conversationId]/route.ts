import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SiteFile {
  path: string;
  content: string;
}

/**
 * Sert le site généré en pleine page, pour que le client puisse l'ouvrir dans
 * un vrai onglet : redimensionner, tester le mobile, montrer à un associé.
 *
 * Le HTML vient d'un modèle et peut contenir du JavaScript arbitraire. Servi
 * tel quel sur notre domaine, il pourrait lire les cookies de session du
 * client et appeler nos API en son nom. L'en-tête CSP "sandbox" sans
 * allow-same-origin place donc la page dans une origine opaque : le script du
 * site tourne, mais il est totalement coupé de notre domaine.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Base sur l'URL de la requête : le domaine varie (déploiement de
    // prévisualisation, domaine personnalisé) et aucune variable ne le fige.
    return NextResponse.redirect(
      new URL(`/connexion?next=/apercu/${conversationId}`, request.url),
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("current_files")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  const files = (conversation?.current_files as SiteFile[] | null) ?? [];
  const index = files.find((file) => file.path.endsWith("index.html"));

  if (!index) {
    return new NextResponse("Aucun aperçu disponible pour cette conversation.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(index.content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-popups",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
