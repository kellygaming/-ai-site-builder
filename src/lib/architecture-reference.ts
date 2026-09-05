/**
 * Architectures de page de l'agent.
 *
 * Constat mesuré sur les sites produits : un restaurant africain, un cabinet
 * dentaire, un studio de yoga et une plateforme e-sport sortaient tous avec la
 * MÊME séquence — bannière, grille de cartes, galerie, "notre histoire",
 * témoignages, contact. Le contenu était juste, le rythme identique. C'est ce
 * que l'œil reconnaît comme "site généré", avant même de lire.
 *
 * La cause n'était pas le modèle mais la consigne : le prompt prescrivait
 * littéralement cette séquence. On lui donne désormais un choix d'ossatures
 * réellement différentes, et l'obligation d'en choisir une selon le métier.
 */
export const ARCHITECTURE_REFERENCE = `
## Choisir l'ossature de la page

AVANT d'écrire une ligne, choisis l'ossature qui correspond au métier du client parmi les
huit ci-dessous, et annonce ton choix au client en une phrase ("pour un restaurant, je
mets la carte au centre plutôt qu'une page de présentation classique").

Ces ossatures sont réellement différentes : elles ne se distinguent pas par l'ordre des
mêmes blocs, mais par ce qu'on met au centre, par la place de l'action, et par la forme
des listes. Ne fabrique pas une neuvième ossature en mélangeant tout.

1. LA CARTE — restaurant, boulangerie, traiteur, bar, food truck.
   Le menu EST la page. Bannière courte (pas plein écran), puis la carte en LISTE avec les
   prix alignés — jamais une grille de cartes à ombres. Une seule grande photo d'ambiance
   pleine largeur. Fin : horaires, adresse, téléphone. Pas de section "notre histoire"
   séparée, pas de témoignages : on vient pour manger, pas pour lire.

2. LE CATALOGUE — boutique, mode, artisan qui vend des objets, électronique.
   La grille de produits domine et arrive haut. Bannière avec UN produit phare en grand,
   puis la grille dense (photo, nom, prix), puis trois arguments courts (livraison,
   garantie, paiement), puis contact. Le texte est minimal partout.

3. LE RENDEZ-VOUS — médecin, dentiste, avocat, notaire, coiffeur, garage, comptable.
   L'action est de prendre rendez-vous : le téléphone, les horaires et le bouton sont
   VISIBLES DÈS LE HAUT, pas relégués en bas. Ensuite les prestations en liste sobre, puis
   le praticien ou l'équipe, puis l'accès (adresse, transports, parking). Aucune fioriture,
   aucune animation : le visiteur est pressé ou inquiet.

4. LE PORTFOLIO — photographe, architecte, décorateur, designer, artisan d'art.
   Les images SONT le contenu. Bannière image plein écran sans texte ou presque, puis une
   galerie en grand format qui occupe l'essentiel de la page, très peu de mots. Une seule
   phrase de positionnement. Contact minimal. Surtout pas de grille de cartes descriptives.

5. LE RÉCIT — hôtel, maison d'hôtes, spa, domaine, table gastronomique, voyagiste.
   On raconte une expérience. Alternance de blocs texte/image pleine largeur, larges
   respirations, phrases écrites. Peu de listes, aucune grille. La réservation revient
   discrètement entre les blocs plutôt qu'une seule fois à la fin.

6. L'URGENCE — plombier, serrurier, dépannage, remorquage, taxi, électricien.
   Le numéro de téléphone est énorme et en premier. Puis : zone d'intervention, délai
   d'arrivée, tarifs annoncés clairement, disponibilité. Page très courte, une seule idée
   par écran, zéro animation. Un client qui a une fuite d'eau ne fait pas défiler.

7. LE PROGRAMME — salle de sport, école, association, salle de tournoi, centre de formation.
   Ce qu'on propose, quand, et comment s'inscrire. Bannière avec l'inscription, puis les
   activités ou dates en liste chronologique, puis les étapes pour participer, puis le lieu.
   La notion de calendrier ou de cycle doit se sentir.

8. LA PAGE DE CONVERSION — un seul produit, un seul service, un lancement.
   Un seul message, martelé. Bannière forte, la promesse, la preuve, la levée d'objection,
   et le même bouton d'action répété trois ou quatre fois le long de la page. Pas de
   navigation vers d'autres sections : il n'y a qu'une chose à faire.

RÈGLES COMMUNES

- Aucune de ces ossatures n'impose une section "témoignages" ni une section "notre
  histoire". Ne les ajoute que si elles servent VRAIMENT ce métier.
- Varie la forme des listes selon le sens : une carte de restaurant est une liste avec des
  prix, un catalogue est une grille, des étapes sont numérotées, une équipe est une
  rangée de portraits. Ne mets pas tout en cartes rectangulaires à coins arrondis.
- La place du contact change selon l'ossature. Il n'est pas toujours en bas.
- Longueur : entre 3 et 7 sections selon l'ossature. Une page d'urgence à 3 sections vaut
  mieux qu'une page à 6 sections dont 3 ne servent à rien.
- Si le client a fourni un design (21st.dev) ou une image de référence, cette référence
  prime sur l'ossature : tu suis sa structure et tu ne gardes de l'ossature que ce qui ne
  la contredit pas.
`;
