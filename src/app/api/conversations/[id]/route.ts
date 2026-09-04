import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SiteFile {
  path: string;
  content: string;
}

interface StoredBlock {
  type: string;
  text?: string;
}

/**
 * Textes que l'on ajoute nous-mêmes au message du client (adresse d'une image
 * envoyée, contenu d'un fichier joint) : utiles au modèle, parasites à l'écran.
 */
function isInternalText(text: string): boolean {
  return text.startsWith("Adresse de l'image ci-dessus") || text.startsWith('Fichier joint "');
}

/** Reconstruit les bulles affichables à partir des messages stockés. */
function toTurns(
  messages: { role: string; content: string }[],
): { role: "user" | "assistant"; text: string }[] {
  const turns: { role: "user" | "assistant"; text: string }[] = [];

  for (const message of messages) {
    let blocks: StoredBlock[];
    try {
      blocks = JSON.parse(message.content);
    } catch {
      continue;
    }
    if (!Array.isArray(blocks)) continue;

    // Un tour ne contenant qu'un tool_result est de la plomberie d'API.
    if (blocks.some((block) => block.type === "tool_result")) continue;

    const text = blocks
      .filter((block) => block.type === "text" && block.text && !isInternalText(block.text))
      .map((block) => block.text!.trim())
      .join("\n\n");

    const hasImage = blocks.some((block) => block.type === "image");

    if (text) {
      turns.push({ role: message.role as "user" | "assistant", text });
    } else if (hasImage) {
      turns.push({ role: "user", text: "📎 Image jointe" });
    }
  }

  return turns;
}

/**
 * Restaure une conversation : l'onglet du client peut être déchargé à tout
 * moment (changement d'application sur mobile, rechargement), et il ne doit
 * jamais perdre le site qu'il est en train de construire.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, current_files")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    conversationId: conversation.id,
    turns: toTurns(messages ?? []),
    files: (conversation.current_files as SiteFile[] | null) ?? [],
  });
}
