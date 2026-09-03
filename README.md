# AI Site Builder

Site propulsé par Claude : les clients décrivent le site qu'ils veulent,
l'agent le construit, le pousse sur GitHub et le déploie sur Vercel — sans
écrire une ligne de code.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS v4, structure de
composants shadcn (`src/components/ui`), polices Space Grotesk (titres) et
JetBrains Mono (labels/terminal) via `next/font` — même typographie que
Compte.shop.

## Démarrer

```bash
npm install
npm run dev
```

## Structure

```
src/
  app/
    page.tsx        accueil (hero)
    layout.tsx       polices + metadata
    globals.css       tokens de design (@theme)
  components/
    ui/
      decrypt-text.tsx  composant hero (scramble → texte), adapté de Motiq
  lib/
    utils.ts          helper cn() (clsx + tailwind-merge)
```
