import { redirect } from "next/navigation";
import { GithubConnectBanner } from "./github-connect-banner";
import { VercelConnectBanner } from "./vercel-connect-banner";
import { ChatPanel } from "./chat-panel";
import { createClient } from "@/lib/supabase/server";

export default async function DiscussionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?next=/discussion");
  }

  const [{ data: githubConnection }, { data: vercelConnection }] = await Promise.all([
    supabase.from("github_connections").select("github_login").eq("user_id", user.id).maybeSingle(),
    supabase.from("vercel_connections").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <GithubConnectBanner githubLogin={githubConnection?.github_login ?? null} />
        <VercelConnectBanner connected={Boolean(vercelConnection)} />
      </div>
      <ChatPanel />
    </main>
  );
}
