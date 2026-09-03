import { redirect } from "next/navigation";
import { SiteBuilderChat } from "@/components/ui/chat-input";
import { GithubConnectBanner } from "./github-connect-banner";
import { createClient } from "@/lib/supabase/server";

export default async function DiscussionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion?next=/discussion");
  }

  const { data: githubConnection } = await supabase
    .from("github_connections")
    .select("github_login")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <GithubConnectBanner githubLogin={githubConnection?.github_login ?? null} />
      <SiteBuilderChat />
    </main>
  );
}
