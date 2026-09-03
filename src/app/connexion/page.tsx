import { AuthForm } from "./auth-form";

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = next && next.startsWith("/") ? next : "/discussion";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-2xl font-bold text-text">
          Connexion
        </h1>
        <AuthForm next={redirectTo} />
      </div>
    </main>
  );
}
