/**
 * Compétence "animation au défilement" de l'agent.
 *
 * Deux choses indissociables : une recette qui marche vraiment (le modèle
 * n'improvise pas son IntersectionObserver à chaque site), et le jugement de
 * quand s'en servir. Sans le second, tous les sites finissent avec les mêmes
 * cartes qui montent une à une — le tic qui trahit un site généré.
 */
export const MOTION_REFERENCE = `
## Animations au défilement

### Décider AVANT de coder : ce site en a-t-il besoin ?

Le mouvement doit servir le métier du client, jamais te faire plaisir.

ANIMATIONS BIENVENUES (le site vend une expérience, une image, un savoir-faire) :
restaurant, hôtel, salle de sport, salon de beauté, photographe, agence créative,
architecte, marque de mode, événementiel, immobilier de standing, artisan d'art.
Ici une révélation douce donne le sentiment de qualité que le client vend.

ANIMATIONS À DOSE MINIMALE (le visiteur vient chercher une information, vite) :
cabinet médical, avocat, notaire, comptable, plombier ou serrurier d'urgence,
garage, administration, association, école. Un client pressé qui attend qu'un
texte apparaisse est un client agacé. Une seule révélation discrète par section,
et rien du tout sur les coordonnées ni les horaires.

AUCUNE ANIMATION : catalogue produit dense, tableau de tarifs, page de contact
seule, ou dès que le client demande "simple", "rapide", "sobre".

### La recette (à recopier telle quelle, elle est éprouvée)

Dans <head>, tout en haut :
\`<script>document.documentElement.classList.add('js')</script>\`

Ce marqueur n'est pas décoratif : sans lui, un visiteur dont le JavaScript
échoue verrait une page entièrement vide, puisque le contenu part masqué. Avec
lui, le masquage n'existe que si le JavaScript tourne.

Dans le CSS :
\`\`\`css
.js [data-reveal]{opacity:0;transform:translateY(24px);
  transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1);
  transition-delay:var(--d,0ms)}
.js [data-reveal].is-visible{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  .js [data-reveal]{opacity:1;transform:none;transition:none}}
\`\`\`

Avant </body> :
\`\`\`html
<script>
(function(){
  var els=document.querySelectorAll('[data-reveal]');
  function showAll(){for(var i=0;i<els.length;i++)els[i].classList.add('is-visible');}
  if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion:reduce)').matches){showAll();return;}
  var io=new IntersectionObserver(function(entries){
    for(var i=0;i<entries.length;i++){
      if(entries[i].isIntersecting){entries[i].target.classList.add('is-visible');io.unobserve(entries[i].target);}
    }
  },{rootMargin:'0px 0px -12% 0px',threshold:.15});
  for(var j=0;j<els.length;j++)io.observe(els[j]);
})();
</script>
\`\`\`

Usage : \`<div data-reveal>\` sur ce qui doit apparaître. Pour un décalage entre
éléments voisins, \`style="--d:120ms"\`, \`style="--d:240ms"\` — jamais plus de 4
paliers, au-delà le dernier élément se fait attendre.

### Les règles qui séparent le soigné du gadget

- LA HERO NE S'ANIME JAMAIS AU DÉFILEMENT. Elle est déjà visible à l'ouverture.
  Si tu veux l'animer, c'est une seule séquence au chargement, sans observateur.
- Une révélation par bloc de sens, pas par élément. Une grille de 6 cartes se
  révèle en une fois ou en 3 paliers — jamais 6 animations séparées.
- Toujours vers le haut, jamais depuis la gauche ou la droite : un décalage
  horizontal crée une barre de défilement sur mobile.
- Une seule fois. \`io.unobserve\` est là pour ça : un élément qui rejoue son
  animation à chaque passage donne le tournis.
- Amplitude courte (20 à 30px) et durée autour de 0,6-0,8s. Au-delà, le
  visiteur attend le texte au lieu de le lire.
- N'anime jamais un prix, un numéro de téléphone, une adresse ou un bouton
  d'action : ce sont les informations qu'on vient chercher.
- \`prefers-reduced-motion\` est respecté par la recette ci-dessus. Ne le
  contourne pas : certains visiteurs ont des vertiges avec le mouvement.

### Deux effets supplémentaires, à utiliser rarement

COMPTEUR CHIFFRÉ (pour une section de statistiques uniquement) : anime la valeur
de 0 à la cible sur ~1,2s quand la section devient visible, une seule fois. Ne
l'utilise que s'il y a 3 ou 4 chiffres qui font sens ensemble.

EN-TÊTE QUI SE COMPACTE : au-delà de 80px de défilement, ajoute une classe à
l'en-tête pour réduire son padding et poser un fond opaque. Discret, utile, et
ça ne coûte qu'un écouteur de scroll passif.
`;
