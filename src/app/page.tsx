import { ArrowRight, GitFork } from "lucide-react";
import { DecryptText } from "@/components/ui/decrypt-text";
import { EclipseButton } from "@/components/ui/eclipse-button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <span className="rounded-full border border-border px-3 py-1 font-mono-ui text-xs uppercase tracking-widest text-text-secondary">
        Propulsé par Claude
      </span>

      <DecryptText
        as="h1"
        text="Créez votre site, sans écrire une ligne de code"
        variant="display"
        trigger="mount"
        stagger={38}
        retriggerOnHover
        className="max-w-3xl text-text"
      />

      <p className="max-w-xl text-balance text-text-secondary">
        Décrivez le site que vous voulez, l&apos;agent le construit pour vous,
        le pousse sur GitHub et le déploie sur Vercel — en quelques minutes.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <EclipseButton
          variant="primary"
          text="Créer mon site"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        />
        <EclipseButton
          variant="outline"
          text="Voir sur GitHub"
          leftIcon={<GitFork className="h-4 w-4" />}
        />
      </div>

      <DecryptText
        text="npx site-builder créer --et-déployer"
        variant="terminal"
        trigger="mount"
        startDelay={600}
        loop={5200}
        className="w-full max-w-xl"
      />
    </main>
  );
}
