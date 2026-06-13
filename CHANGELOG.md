# Journal des modifications — Club Photo

---

## En cours (alpha)

### Ajouts
- **Coordonnées GPS dans les EXIF** — si la photo contient des données GPS, un lien "Voir sur la carte" apparaît dans la fiche info (ouvre Google Maps au lieu de la prise de vue).
- **Description des photos** — les membres peuvent ajouter une description libre lors de l'upload ou de la modification d'une photo du portfolio. Elle s'affiche dans la fiche info.
- **Vue plein écran native** — dans la fiche info, cliquer sur la photo active le plein écran natif du navigateur (Fullscreen API : barre d'adresse et onglets disparaissent). Navigation entre photos avec ←→, clic pour revenir à la fiche info. Un message guide s'affiche brièvement à l'ouverture.
- **Clic sur carte = ouverture fiche info** — le bouton ⓘ est supprimé des cartes. Un simple clic sur n'importe quelle carte photo ouvre directement la fiche info. Dans les phases de vote (Thème du mois, OneShot), le vote se fait maintenant via un bouton explicite dans le bas de la carte.

### Améliorations
- **Refonte de la fiche info (lightbox)** — nouvelle mise en page en deux colonnes : photo à gauche, informations à droite (titre centré, auteur, description, likes, EXIF, commentaires). Les actions de suppression (admin) sont intégrées à la colonne infos.
- **Icône ⓘ** — l'ancien bouton ⤢ devient ⓘ sur toutes les pages ; terminologie "infobox" adoptée dans le guide des membres.
- **Boutons de suppression dans les grilles** — les admins peuvent supprimer une photo directement depuis la grille sans ouvrir la fiche info (Thèmes du mois toutes phases, Sorties Photo). Guide des membres mis à jour.
- **Mode anonyme dans les phases de vote** — en phases *Ouvert* et *Vote* des Thèmes du mois, la fiche info masque l'auteur, les likes et les commentaires pour préserver l'anonymat du concours.


- **Système de cartes universel** — toutes les pages de photos (portfolios membres, sorties, thèmes du mois, OneShots) utilisent désormais un système unifié : bouton cœur ♥ toujours visible sur la carte pour liker directement, bouton ⤢ pour ouvrir en plein écran, lightbox complète avec likes, commentaires et réponses. Le mode édition du portfolio garde son interface originale.
- **EXIF dans la lightbox** — la lightbox affiche les infos EXIF de la photo (appareil, objectif, focale, ouverture, vitesse, ISO, date de prise de vue) au-dessus des commentaires, quand ces données sont disponibles.
- **Photo de couverture des sorties** — la couverture affichée sur la carte d'une sortie est désormais la photo qui a reçu le plus de ♥ (ex-æquo : la plus ancienne). Elle se met à jour automatiquement à chaque like.
- **Réunions (admin)** — la section admin « Événements » est renommée en « Réunions ». Le sélecteur de type est retiré des formulaires de création/modification (type unique : réunion).
- **Sorties photo dans le calendrier** — les sorties photo apparaissent maintenant dans le calendrier aux côtés des réunions et des OneShots. Un filtre « Sortie photo » permet de les afficher seules.
- **Informations EXIF** — les photos uploadées conservent automatiquement les métadonnées de la prise de vue (appareil, objectif, focale, ouverture, vitesse, ISO, date). Ces infos sont affichées dans la lightbox au-dessus des commentaires.
- **Sorties Photo** — nouvelle section communautaire pour organiser des sorties avec les membres. Les organisateurs créent une sortie (date, lieu, description, options d'inscription), les membres peuvent s'inscrire et uploader leurs photos. Chaque photo peut recevoir des likes et des commentaires avec réponses. Lightbox dédiée avec navigation clavier.
- **Modal de confirmation** — tous les boutons "Supprimer" du site affichent désormais une fenêtre de confirmation avant d'effacer définitivement un élément.
- **Visibilité des photos en 2 niveaux** — chaque photo du portfolio peut être réglée sur *Public* (visible par tout le monde) ou *Membres* (visible uniquement par les membres connectés). Réglable photo par photo depuis le portfolio.
- **Connexion via modal** — le bouton "Connexion" ouvre une fenêtre modale sur toutes les pages, sans quitter la page en cours.

### Améliorations
- **EXIF préservé à l'upload** — les métadonnées EXIF sont maintenant correctement lues avant la compression JPEG (qui les supprime via canvas). Corrige les uploads dans Thème du mois, Sortie photo et OneShot où les EXIF n'étaient pas enregistrés.
- **Bouton ⓘ supprimé des cartes photo** — les infos EXIF étant désormais visibles directement dans la lightbox, le bouton ⓘ sur les cartes photo est retiré.
- **Règles Firestore** — correction des permissions : le propriétaire peut toujours lire ses propres photos (fix du portfolio sans filtre de visibilité) ; règles manquantes ajoutées pour les sous-collections de commentaires (photos, soumissions de thème, photos OneShot).
- Menu mobile : bouton de connexion repositionné et stylisé de façon cohérente avec le menu desktop.
- Portfolio : suppression du bouton étoile (photo de couverture de carte) — simplification de l'interface.

---

## Précédent

- **Photo de profil et bandeau** — les membres peuvent uploader une photo de profil et une photo de bandeau visible sur leur page publique.
- **Portfolios publics** — galerie publique listant tous les membres avec accès à leurs photos publiques.
- **Section Membre** — espace personnel accessible après connexion (portfolio, gestion des OneShots, sorties).
- **OneShot** — événements photo communautaires avec inscriptions, thèmes, upload de photos, système de votes et publication des résultats.
- **Thèmes du mois** — soumission de photos sur un thème mensuel, votes entre membres, publication du palmarès.
- **Calendrier** — vue calendrier des événements du club (réunions, etc.).
- **Catégories de photos** — l'admin peut gérer les catégories disponibles à l'upload.
- **Compression automatique** — les photos sont compressées côté client avant upload.
- **Déploiement Firebase** — hébergement, Firestore, Storage et règles de sécurité configurés.
