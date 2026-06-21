# Journal des modifications — Club Photo

---

## En cours (alpha)

### Améliorations
- **Système de notifications** — infrastructure complète in-app (pas d'email pour l'instant) :
  - **Cloche 🔔** dans la barre de navigation (desktop) à gauche de "Mon espace", avec badge rouge pour les non-lus. Panel dropdown avec les 8 dernières notifications, bouton "Tout marquer lu", lien vers la page complète.
  - **`/membre/notifications`** — liste complète, tri par date, suppression unitaire ou globale, lien direct vers l'élément concerné, marquage lu au clic.
  - **`/membre/preferences`** — page de gestion des abonnements avec toggles individuels (oneshots, sorties, actualités, likes, commentaires). Sauvegarde immédiate sur le profil Firestore.
  - **Broadcasts** (un événement → tous les membres abonnés) :
    - OneShot : ouverture des inscriptions, passage au vote, publication des résultats
    - Nouvelle sortie photo créée
    - Nouvel article publié
  - **Notifications personnelles** :
    - Like sur une photo de portfolio
    - Commentaire sur une photo de portfolio
  - Firestore : collection `notifications/{uid}/items/{notifId}`. Règle : lecture/màj/suppression par le propriétaire, création par tout membre connecté (pour le broadcast client-side).
  - Les abonnements sont stockés sur le profil utilisateur (`subscriptions: { oneshots, sorties, articles, likes, comments }`). Tout activé par défaut.

### Corrections
- **OneShot — visibilité selon connexion** — mêmes règles que les Thèmes du mois appliquées aux pages OneShot :
  - `vote` : les visiteurs non connectés voient uniquement un message d'invitation à se connecter, sans accès aux photos. Les membres voient la grille de vote en mode anonyme.
  - `resultats` : les visiteurs voient uniquement le top 3 par thème (rang + photo + nom), sans décompte de votes ni likes, avec invitation à se connecter pour le classement complet. Les membres voient le classement intégral avec votes et likes.
  - `inscription` / `fermeture_inscriptions` : organisateur et participants masqués pour les visiteurs.
  - `oneshots-liste` : nom du créateur masqué pour les visiteurs.
  - La lightbox est restreinte selon le même principe que les thèmes du mois.
- **Thèmes du mois — visibilité selon connexion** — règles par phase :
  - `ouvert` / `vote` : les photos sont invisibles pour les visiteurs non connectés (uniquement les infos générales + invitation à se connecter). Les membres voient les photos en mode anonyme et peuvent soumettre / voter.
  - `resultats` : les visiteurs voient uniquement le podium (top 3, rang + photo + nom du photographe) avec invitation à se connecter pour le classement complet. Les membres voient le classement intégral avec le décompte des votes.
  - La lightbox est restreinte en conséquence (public : top 3 seulement en phase résultats, aucune photo en phases ouvert/vote).
- **Standard public/membre — convergence visibilité** — règle appliquée sur tout le site : les visiteurs non connectés ne voient pas les informations de lieu/localisation, ni l'organisateur des activités, ni les participants des sorties, ni les commentaires sur les photos. Détail des changements :
  - **Lieu** masqué pour public : sorties-liste, sortie-detail, calendrier (sorties + oneshots), article-lightbox
  - **Organisateur** masqué pour public : sorties-liste, sortie-detail, calendrier (sorties + oneshots)
  - **Participants** masqués pour public : sortie-detail (comptage + liste). Le chargement Firestore est aussi conditionnel (pas de requête si non connecté)
  - **Commentaires** masqués pour public : photo-lightbox — section commentaires conditionnée à `userUid()` au lieu de seulement `!anonyme()`
  - **Firestore rules** : `inscriptions` (sorties + oneshots) et tous les `commentaires` photo passés de `read: if true` à `read: if isLoggedIn()` ⚠️ Déployer : `firebase deploy --only firestore:rules`
- **Calendrier — réunions visibles membres seulement** — les réunions du club n'apparaissent dans le calendrier que pour les membres connectés. Pour les visiteurs : liste vide, filtre "Réunion" masqué, message "Connectez-vous pour voir les réunions". Règle Firestore `reunions` passée de `read: if true` à `read: if isLoggedIn()`. ⚠️ Déployer les règles : `firebase deploy --only firestore:rules`.
- **Suppression de couverture article — suppression différée** — cliquer sur la poubelle de la photo de couverture dans le formulaire d'édition ne supprimait immédiatement le fichier Storage et Firestore sans possibilité d'annulation. Désormais, le clic efface uniquement l'affichage local (soft-delete) ; la suppression réelle n'a lieu qu'à l'enregistrement. Si l'utilisateur annule ou navigue en arrière, la couverture est intacte. Si l'utilisateur avait juste sélectionné un nouveau fichier local (pas encore uploadé), cliquer retire la sélection locale et restaure l'image existante.
- **Suppression de photo OneShot — icône distincte** — le bouton de suppression utilisait `×`, identique au bouton d'annulation d'édition affiché au même endroit de la carte. Remplacé par 🗑 pour éviter toute confusion ; la confirmation `ConfirmService` est déjà en place pour toutes les suppressions de photos (OneShot et Sorties).
- **Menu desktop — refonte des dropdowns** — les menus déroulants utilisaient `MatMenu` (overlay CDK avec backdrop) qui bloquait toute interaction avec le reste de la nav tant qu'un menu était ouvert : impossible de naviguer vers un lien direct ou d'ouvrir un autre dropdown en un seul clic. Remplacement par des panels custom Angular (signal `openMenu` + `@HostListener('document:click')`), sans backdrop. Un clic sur n'importe quel élément de la nav ferme le menu ouvert et agit immédiatement. La nav mobile (accordion) est inchangée.
- **Carte Actualités — icône épinglé supprimée** — l'icône push_pin (en haut à droite) se superposait au bouton crayon d'édition. La fonctionnalité "épingler" étant encore en réflexion, l'icône est retirée provisoirement.
- **Documents — ordre du formulaire d'upload inversé** — la zone de dépôt est maintenant en premier. Déposer un fichier remplit automatiquement le nom (base sans extension) ; l'extension est extraite du fichier, affichée en suffixe verrouillé et non modifiable. Si le champ nom est déjà rempli, il n'est pas écrasé au drop.
- **Documents — changement de dossier sans re-upload** — le panneau "Modifier" permet maintenant de changer le nom et/ou le dossier d'un document sans avoir à re-déposer le fichier. Un nouveau fichier reste optionnel.
- **Calendrier déplacé dans "Activités"** — le lien Calendrier quitte le menu "Membres" (connectés uniquement) et rejoint le menu "Activités" (desktop + mobile). La route n'est plus protégée par `memberGuard` : tout visiteur peut consulter le calendrier. Les boutons d'inscription aux OneShots restent conditionnés à la connexion.
- **Actualités invisibles pour les membres** — la requête Firestore `/actualites` utilisait `getAllArticles()` sans filtre `where`, ce que les règles de sécurité Firestore rejettent pour les non-rédacteurs. Deux nouvelles méthodes (`getPublishedArticles` / `getPublicArticles`) avec les `where` appropriés, et deux index composites (`statut+dateCreation`, `statut+portee+dateCreation`) dans `firestore.indexes.json`. ⚠️ Déployer les index : `firebase deploy --only firestore:indexes`.
- **Boutons de cartes invisibles sur mobile** — les overlays et boutons d'action (crayon article, recalcul stockage, overlay photos portfolio/galerie/oneshot) étaient masqués par `opacity: 0` visible uniquement au survol. Ajout de `@media (hover: none)` sur les 5 fichiers concernés pour les afficher en permanence sur appareils tactiles.

### Améliorations
- **Guide du site mis à jour** — terminologie homogénéisée : "lightbox" remplacé par "fiche info" partout, références au "bouton ⓘ" supprimées, nouvelle carte "Vocabulaire du site" (Carte → Fiche info → Plein écran), note sur le crayon d'édition d'article mise à jour.
- **Guide du site mis à jour** — 3 nouvelles sections (Actualités, Calendrier, Documents) ; navigation rapide enrichie ; références au bouton ⓘ corrigées (clic sur la carte) ; "Galeries →" remplacé par "Activités →" dans tous les liens.
- **Refonte navigation** — "Galeries" renommé "Activités". "Portfolios des membres" déplacé en tête du menu "Le Club". "Config site" renommé "Catégories photos" dans le menu admin. Modifications appliquées desktop et mobile.
- **Partage de documents** — espace `/membre/documents` accessible à tous les membres connectés. Les dossiers sont définis par l'admin depuis `/admin/dossiers` (ordonnés, renommables, déplaçables). Les membres uploadent n'importe quel type de fichier (PDF, Word, Excel, images, archives…) avec glisser-déposer ; le fichier va directement en Firebase Storage. L'uploader peut remplacer son document (re-upload inline avec mise à jour du nom et du stockage) ; admin et uploader peuvent supprimer. Icônes et badges colorés par type d'extension. Filtre par dossier (chips). `storageUsed.documents` tracké sur le profil et visible dans le tooltip admin/membres. La suppression d'un membre efface aussi ses documents. Le bouton "Recalculer" en admin intègre les documents dans le total.

- **Système d'actualités complet** — nouveau modèle `Article` enrichi (type, couverture Storage, description, lien externe, date, lieu, portée public/membre, statut brouillon/publié/expiré, date d'expiration, épinglé, auteur). Page `/actualites` redessinée en grille responsive avec filtres par type (chips colorées), articles épinglés remontés en tête, ouverture au clic dans une lightbox. Rôle **rédacteur** ajouté : crée, modifie et supprime des articles. L'admin hérite des droits rédacteur. Règles Firestore et Storage mises à jour.
- **UX articles** — bouton "+ Nouvel article" visible uniquement pour admin/rédacteur sur la page `/actualites`. Icône crayon (survol de la carte) pour accès direct à l'édition. Retour intelligent après édition/suppression (`Location.back()`). Lieu cliquable → Google Maps (carte et lightbox). Datepicker Material pour les champs date. Zone couverture avec glisser-déposer. Cartes sans image affichent le badge type sans zone image cassée. `undefined` → `deleteField()` dans Firestore pour supprimer proprement les champs. Locale française (`registerLocaleData`) enregistrée globalement dans `app.config.ts`.
- **Suivi du stockage par membre** — à chaque upload (portfolio, thème du mois, OneShot), la taille du fichier compressé est enregistrée sur le doc photo (`fileSize`) et accumulée sur le profil Firestore (`storageUsed.portfolio / .themes / .oneshots`). Les suppressions décrément atomiquement ces compteurs. La colonne "Stockage" de la page admin/membres affiche le total avec un tooltip détaillant la répartition par catégorie au survol.
- **Dernière connexion** — la date de connexion est écrite dans Firestore à chaque login via le modal. Visible dans la colonne "Dernière co." de la page admin/membres.
- **Tableau membres triable** — toutes les colonnes sont triables (clic sur l'en-tête, bascule asc/desc) via MatSort. Table resserrée (police 12px, padding réduit, email tronqué).
- **Mot de passe oublié** — lien "Mot de passe oublié ?" sur la page de connexion `/login` et dans le modal de connexion. Déclenche l'email de réinitialisation Firebase. Si l'email n'est pas renseigné, un message guide l'utilisateur. Fonctionne dans les deux contextes (page et modal thème sombre).
- **Compte suspendu — modal** — la vérification de suspension était absente du modal de connexion. Désormais, si un membre suspendu se connecte via le modal, il est immédiatement déconnecté et voit le dialogue "Votre compte a été suspendu" (identique à la page `/login`).
- **Gestion des membres (admin)** — page refaite : liste avec rôle et statut, filtre texte en temps réel (nom ou email), invitation par email (lien magique Firebase), suspension de compte (accès bloqué au login avec message), suppression complète d'un membre (photos portfolio, soumissions thèmes, photos et inscriptions OneShots/Sorties, profil). Le compte Firebase Auth est conservé.
- **Invitation membre** — un admin peut inviter un nouvel utilisateur par email. L'invité reçoit un lien pour compléter son profil (nom, prénom, mot de passe) sans passer par la page d'inscription publique.
- **Consentement GPS à l'upload** — si une photo contient des coordonnées GPS dans ses EXIF, une fenêtre demande "Garder l'info GPS ?" (défaut : Oui). En cas de refus, les coordonnées ne sont pas enregistrées. Fonctionne dans tous les contextes : portfolio, sortie photo, thème du mois, OneShot.
- **Liste des sorties compacte** — les cartes sans photo de couverture n'affichent plus le placeholder 📷 (zone 16:9 vide). Le badge "À venir" / "Terminée" se place directement à côté du titre. Les cartes avec photo conservent leur mise en page actuelle.
- **Page "Gérer une sortie" lisible** — le formulaire de modification utilisait des couleurs sombres (`#1a1a2e`) incompatibles avec le fond blanc du layout membre. Refonte en thème clair cohérent avec les autres pages de l'espace membre.
- **Affichage participants unifié** — les sections inscription/participants de OneShot et Sortie photo utilisent maintenant le même layout et le même visuel : boîte sombre `#1a1a2e`, header "Participants N" + bouton sur la même ligne, chips noms complets, couleurs et boutons identiques entre les deux pages.
- **Auto-inscription à la création** — l'organisateur d'une sortie photo (si inscription obligatoire) et le créateur d'un OneShot sont automatiquement inscrits lors de la création. Ils peuvent se désinscrire depuis la page de l'événement comme n'importe quel participant.
- **Section "Réunions" (ex-Événements)** — modèle, service, page admin, route et collection Firestore tous renommés de `evenements` → `reunions`. Formulaire simplifié (sélecteur de type supprimé). Nav admin et header mis à jour.
- **Calendrier accordéon** — les événements s'affichent en vue compacte (chiffre du jour + badge type + titre). Un clic ouvre les détails (lieu, description, date complète, actions). Un seul item ouvert à la fois.

### Corrections
- **Stockage négatif dans admin/membres** — le compteur `storageUsed` pouvait devenir négatif si l'incrémentation échouait silencieusement à l'upload (réseau, permissions) mais que la décrémentation à la suppression réussissait. Le total est maintenant clampé à 0 dans l'affichage, et `formatStorage` traite les valeurs négatives comme zéro.
- **Crash suppression photo OneShot sans membre assigné** — `deletePhoto` tentait un `updateDoc(users/'')` avec un chemin vide quand `membreUid` était absent, provoquant une erreur Firestore. La mise à jour du stockage est maintenant conditionnée à `photo.membreUid` non vide.
- **Votes OneShot limités aux inscrits** — le vote était réservé aux membres ayant cliqué "Je participe". Tous les membres connectés peuvent maintenant voter. Un membre ayant une photo assignée à son nom reste bloqué sur cette photo (ne peut pas voter pour soi-même).
- **Création de sortie** — le champ Lieu est maintenant obligatoire (formulaire bloquant + indicateur `*`). Le champ "Nombre max de participants" n'apparaît que lorsque l'inscription est obligatoire. Correction d'une erreur Firebase qui rejetait les valeurs `undefined` pour les champs optionnels.

### Ajouts
- **Recalcul du stockage par membre (admin)** — un bouton ⟳ apparaît au survol de la colonne "Stockage" dans admin/membres. Il recalcule le stockage réel en parcourant toutes les photos portfolio, soumissions thèmes et photos OneShot assignées au membre, puis écrase le compteur Firestore. Utile pour corriger des données décalées (photos uploadées avant l'ajout du suivi, ou reassignations dans les OneShots).
- **Assignation photos OneShot et suivi stockage** — quand le créateur assigne une photo à un membre dans la page de gestion, la photo est liée au membre dans Firestore (`membreUid`). Le stockage du membre se met à jour via le bouton Recalculer en admin (les règles Firestore bloquent les mises à jour cross-user directes depuis le client).
- **Bordure rouge sur photos non assignées (OneShot)** — dans la page de gestion des photos d'un OneShot, les photos sans membre assigné affichent un contour rouge pour alerter le créateur.
- **Coordonnées GPS dans les EXIF** — si la photo contient des données GPS, un lien "Voir sur la carte" apparaît dans la fiche info (ouvre Google Maps au lieu de la prise de vue).
- **Description des photos** — les membres peuvent ajouter une description libre lors de l'upload ou de la modification d'une photo du portfolio. Elle s'affiche dans la fiche info.
- **Vue plein écran native** — dans la fiche info, cliquer sur la photo active le plein écran natif du navigateur (Fullscreen API : barre d'adresse et onglets disparaissent). Navigation entre photos avec ←→, clic pour revenir à la fiche info. Un message guide s'affiche brièvement à l'ouverture.
- **Clic sur carte = ouverture fiche info** — le bouton ⓘ est supprimé des cartes. Un simple clic sur n'importe quelle carte photo ouvre directement la fiche info. Dans les phases de vote (Thème du mois, OneShot), le vote se fait maintenant via un bouton explicite dans le bas de la carte.

### Améliorations
- **Expérience mobile** — le menu de navigation est maintenant toujours visible en haut de l'écran (fixe) et peut défiler verticalement si les entrées dépassent la hauteur de l'écran. Le bandeau des portfolios membres conserve son ratio 4:1 sur toutes les tailles d'écran.
- **Fiche info : scroll intelligent** — le titre reste fixe en haut, tout le reste (auteur, EXIF, commentaires) défile dans la colonne. Le champ de saisie reste ancré en bas pour rester accessible. Cliquer "Répondre" fait défiler automatiquement jusqu'au champ de réponse.
- **Navigation par swipe** — dans la fiche info et en plein écran, glisser horizontalement sur la photo passe à la photo suivante ou précédente (pratique sur mobile).
- **Anonymat des concours** — les boutons ♥ sont masqués sur les cartes photo pendant les phases *Ouvert* et *Vote* des Thèmes du mois et des OneShots, en plus des infos auteur déjà masquées.
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
