/**
 * Référence design condensée pour guider l'agent de génération de sites.
 *
 * Adaptée (curatée manuellement, pas copiée telle quelle) du dataset
 * ui-ux-pro-max (github.com/nextlevelbuilder/ui-ux-pro-max-skill, MIT) —
 * un skill Claude Code qui, lui, s'appuie sur des scripts Python et un
 * CLI locaux, inutilisables depuis une route API serverless. On en a
 * gardé la substance portable : palettes de couleurs par type de site,
 * paires de polices Google Fonts, et les règles UX à sévérité haute —
 * injectée telle quelle dans le system prompt de l'agent pour qu'il
 * parte de choix éprouvés plutôt que d'improviser.
 */
export const DESIGN_REFERENCE = `
## Palettes de couleurs par type de site (choisis la plus proche du besoin du client)

| Type | Primary | Accent | Background | Foreground | Card | Border |
|---|---|---|---|---|---|---|
| SaaS (General) | #2563EB | #EA580C | #F8FAFC | #1E293B | #FFFFFF | #E2E8F0 |
| E-commerce | #059669 | #EA580C | #ECFDF5 | #064E3B | #FFFFFF | #A7F3D0 |
| E-commerce Luxury | #1C1917 | #A16207 | #FAFAF9 | #0C0A09 | #FFFFFF | #D6D3D1 |
| Creative Agency | #EC4899 | #0891B2 | #FDF2F8 | #831843 | #FFFFFF | #FBCFE8 |
| Portfolio/Personal | #18181B | #2563EB | #FAFAFA | #09090B | #FFFFFF | #E4E4E7 |
| Beauty/Spa/Wellness | #EC4899 | #8B5CF6 | #FDF2F8 | #831843 | #FFFFFF | #FBCFE8 |
| Restaurant/Food Service | #DC2626 | #A16207 | #FEF2F2 | #450A0A | #FFFFFF | #FECACA |
| Fitness/Gym | #F97316 | #22C55E | #1F2937 | #F8FAFC | #313742 | #374151 |
| Real Estate/Property | #0F766E | #0369A1 | #F0FDFA | #134E4A | #FFFFFF | #99F6E4 |
| Hotel/Hospitality | #1E3A8A | #A16207 | #F8FAFC | #1E40AF | #FFFFFF | #BFDBFE |
| Legal Services | #1E3A8A | #B45309 | #F8FAFC | #0F172A | #FFFFFF | #CBD5E1 |
| Non-profit/Charité | #0891B2 | #EA580C | #ECFEFF | #164E63 | #FFFFFF | #A5F3FC |
| Photography Studio | #18181B | #F8FAFC | #000000 | #FAFAFA | #0C0C0C | #3F3F46 |
| Services à domicile (plombier, électricien...) | #1E40AF | #EA580C | #EFF6FF | #1E3A8A | #FFFFFF | #BFDBFE |
| Clinique médicale | #0891B2 | #16A34A | #F0FDFA | #134E4A | #FFFFFF | #CCFBF1 |
| Boulangerie/Café | #92400E | #92400E | #FEF3C7 | #78350F | #FFFFFF | #FDE68A |
| Agence marketing | #EC4899 | #0891B2 | #FDF2F8 | #831843 | #FFFFFF | #FBCFE8 |
| Réservation/Rendez-vous | #0284C7 | #059669 | #F0F9FF | #0F172A | #FFFFFF | #E0F0F8 |

## Paires de polices (Google Fonts)

| Nom | Heading | Body | Ambiance | Idéal pour |
|---|---|---|---|---|
| Classic Elegant | Playfair Display | Inter | élégant, luxe, sophistiqué | Marques de luxe, mode, spa, beauté, e-commerce haut de gamme |
| Modern Professional | Poppins | Open Sans | moderne, pro, chaleureux | SaaS, sites corporate, services professionnels |
| Tech Startup | Space Grotesk | DM Sans | tech, innovant, futuriste | Startups tech, SaaS, outils dev |
| Editorial Classic | Cormorant Garamond | Libre Baskerville | éditorial, classique, littéraire | Publications, blogs, magazines |
| Minimal Swiss | Inter | Inter | minimal, propre, neutre | Dashboards, docs, apps entreprise |
| Playful Creative | Fredoka | Nunito | ludique, chaleureux | Éducatif, enfants, divertissement |
| Bold Statement | Bebas Neue | Source Sans 3 | fort, impactant | Marketing, portfolios, agences, événementiel |
| Wellness Calm | Lora | Raleway | calme, naturel | Santé, spa, méditation, yoga, bio |
| Retro Vintage | Abril Fatface | Merriweather | rétro, nostalgique | Brasseries, restaurants, portfolios créatifs |
| Geometric Modern | Outfit | Work Sans | géométrique, polyvalent | Portfolios, agences, landing pages |
| Luxury Serif | Cormorant | Montserrat | luxe, raffiné | Mode, joaillerie, services haut de gamme |
| Friendly SaaS | Plus Jakarta Sans | Plus Jakarta Sans | amical, moderne | Produits SaaS, apps web, B2B |

## Règles UX à toujours respecter

- Scroll fluide vers les ancres (\`scroll-behavior: smooth\`).
- Une nav fixe/sticky ne doit jamais recouvrir le contenu (padding-top compensatoire).
- Animer 1-2 éléments clés maximum par écran, jamais tout ce qui bouge.
- Respecter \`prefers-reduced-motion\`.
- États de chargement visibles (spinner/skeleton), jamais d'UI figée sans retour.
- Cibles tactiles d'au moins 44px, jamais plus petites.
- Focus visible sur tout élément interactif (ne jamais retirer l'outline sans le remplacer).
- Contraste texte/fond minimum 4.5:1.
- Ne jamais coder une information uniquement par la couleur (ajouter icône/texte).
- Attribut \`alt\` descriptif sur toute image porteuse de sens.
- Labels de formulaire réels (pas seulement des placeholders).
- Confirmer avant toute action destructive/irréversible.
`;
