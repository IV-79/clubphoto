# Journal des modifications — Club Photo

---

## En cours (alpha)

### Consentement GPS par lot — OneShot (2026-06-28)

- Upload multiple photos dans OneShot : tous les EXIF sont lus en parallèle avant la boucle d'upload, le popup GPS n'apparaît plus qu'une seule fois si au moins une photo du lot contient des coordonnées, la réponse s'applique à l'ensemble du lot.

### Optimisation photos — resize par catégorie + WebP (2026-06-28)

- Refactorisation de `image-compress.ts` : fonction `compressImage(file, opts)` avec 8 presets nommés (`COMPRESS_PORTFOLIO`, `COMPRESS_EVENT`, `COMPRESS_THEME`, `COMPRESS_COUVERTURE`, `COMPRESS_ACTUALITE`, `COMPRESS_AVATAR`, `COMPRESS_BANDEAU`, `COMPRESS_HERO`).
- Sortie **WebP** pour tous les nouveaux uploads (−30 à 40 % de poids vs JPEG).
- Dimensions cibles : portfolio 3840 px, événements 2048 px, couvertures 1280×720, avatar 512×512, bandeau 1920×480, actualité 1200 px, hero 1920 px.
- 12 call sites mis à jour dans les pages et services.
- Chemins Storage mis à jour en `.webp` pour les nouveaux fichiers.
- Hints UI mis à jour sur toutes les zones d'upload : "Envoyez votre photo en pleine résolution · compressé automatiquement pour le site" pour les photos, dimensions recommandées pour les couvertures/avatars.

### Vote ouvert à tous les membres (2026-06-28)

- **Défi** : vote accessible à tous les membres connectés (plus uniquement aux inscrits) ; message "Seuls les participants inscrits peuvent voter" supprimé.
- **OneShot** : barre de progression admin corrigée — dénominateur = membres non suspendus (au lieu des inscrits seulement).

### Hero événement partagé — composant `event-hero` (2026-06-28)

- Nouveau composant standalone `app-event-hero` branché sur les 3 pages détail : `sortie-detail`, `defi-detail`, `oneshot-detail`.
- **Structure du hero** : haut-gauche lien retour, haut-droite boutons Modifier/Supprimer, bas : badge type + badge statut, titre, organisateur, date + lieu (lien Maps pour membres).
- **Badges frosted glass** : sur une photo de couverture sombre, les badges s'affichent en fond blanc semi-transparent + `backdrop-filter: blur`.
- **Description hors hero** : chaque page gère sa description dans son corps (encart `event-description` avec bordure gauche).
- **Défi** : thème (`d.theme`) affiché en italique dans `.defi-main` ; boutons modifier/supprimer retirés du panneau `.defi-aside`.
- **OneShot** : le bouton Modifier navigue vers `/membre/oneshots/{id}/gerer` via `goToGestion()`.
- Typo `claud` (artefact de code) supprimée dans `defi-detail.html`.

### Carte événement universelle — composant `activite-card` (2026-06-28)

- Nouveau composant standalone `app-activite-card` qui remplace les 6 blocs de carte répétés dans `sorties-liste` (3 types × 2 sections).
- Prend un `ActiviteItem` (`sortie | oneshot | defi`) + `loggedIn` + `isPast` en inputs.
- **Corrections OneShot** : lieu affiché avec lien Google Maps (comme Sortie), `nomCreateur` affiché (masqué invités).
- **Cover** : passage de `object-fit: contain` à `object-fit: cover` (fini les bandes noires).
- **Badges type** : vrais badges encadrés pour les 3 types — bleu ardoise (Sortie), vert (OneShot), orange (Défi).
- **Layout carte** : titre + organisateur sur la même ligne (space-between), date/lieu à gauche + badges inscrits/thèmes à droite alignés en bas, auto-wrap si manque de place.

### Alignement visuel des événements — héros, couvertures, formulaires (2026-06-27)

#### Héros photo de couverture — Sortie, OneShot, Défi

- **`galeries/sortie-detail`** — mode vue restructuré en héro pleine largeur : photo de couverture (`imageEvenementUrl`) en fond avec overlay sombre dégradé, titre/statut/meta/actions en surimpression. Sans photo : zone gris clair neutre. `object-fit: contain` pour afficher l'image entière sans rogner.
- **`galeries/oneshots/:id` (OneShotDetail)** — même héro pleine largeur avec `photoCouvertureUrl`. Héro sorti du conteneur `max-width: 860px` pour occuper toute la fenêtre, le contenu (gestion, inscriptions, thèmes, photos) reste centré à 860px.
- **`galeries/defi-detail`** — même correction `object-fit: contain`.
- **Badges de statut sur photo sombre** : fond blanc/verre dépoli (`backdrop-filter`) pour lisibilité maximale.

#### Photo de couverture dans les formulaires

- Renommé partout "Image de la carte" → **"Photo de couverture"** + conseil de format _16/9 — 1280×720 px (JPG ou PNG)_.
- **Formulaire "Organiser un événement"** (`sortie-creer`) — section couverture déplacée **en haut** du formulaire (avant Type/Titre), cohérent avec Défi.
- **Formulaire "Modifier l'événement"** (`sortie-detail` mode édition) — couverture déplacée en premier dans le formulaire.
- **Formulaire "Modifier le OneShot"** (`oneshot-gerer`) — couverture déplacée en premier (avant Date/Lieu/Thèmes).

#### Corrections UX formulaires admin

- **Alignement date-picker / mat-form-field** (`sortie-creer`, `sortie-detail`, `reunions`, `themes`) — `align-items: flex-end` sur les `.form-row` + `subscriptSizing="dynamic"` sur les mat-form-field côte à côte ; corrige le décalage vertical entre le champ date custom et les champs Material.
- **Admin Réunions & Thèmes du mois** — bouton "Annuler" rendu visible (bordure légère, couleur neutre). Clic sur l'en-tête d'une card en mode édition → annule l'édition (au lieu de ne rien faire) ; clic sur une autre card → flash rouge de la card en cours d'édition.

### Thèmes optionnels à la création d'un OneShot

- La section "Thèmes" apparaît dans le formulaire de création quand le type sélectionné est OneShot.
- L'utilisateur peut ajouter / supprimer des thèmes avant de valider ; ils sont écrits en Firestore juste après la création du doc OneShot.
- Entièrement optionnel : si aucun thème n'est saisi, le comportement existant est inchangé (ajout via "Modifier" après coup).

### Composant partagé `<app-vote-ranking>` — classement unifié (Défi, Thème du mois, OneShot)

- **Nouveau composant** `src/app/components/vote-ranking/` — carte de résultat unifiée : médaille 🥇🥈🥉 centrée au-dessus de la photo (rank ≤ 3), cercle numéroté `(N)` pour rank > 3, cadre coloré or/argent/bronze, photo carrée, nom + nombre de votes en dessous.
- **Classement dense** — ex-aequo gérés : 1-1-1-4, 1-1-3-3-5, etc. sur les 3 systèmes de vote.
- **Toggle "Voir la suite"** — photos rank > 3 cachées derrière un bouton ; les images ne sont pas dans le DOM avant le clic (économie de bande passante Firebase Storage).
- **`defi-detail`** — section résultats remplacée par `<app-vote-ranking>`.
- **`theme-detail`** — section résultats (membres et visiteurs) remplacée par `<app-vote-ranking>` ; likes retirés des cartes de résultats (accessibles via la lightbox).
- **`oneshot-detail`** — section résultats remplacée par `<app-vote-ranking>` par thème, état du toggle indépendant par thème ; visiteurs voient désormais toutes les photos (avec suite) sans les décomptes de votes.

### Optimisation lectures Firestore — pages publiques (visiteurs anonymes)

- **`home.ts`** — page d'accueil : 6 listeners temps-réel supprimés (articles, sorties, thèmes, photos, config hero, membres ×2) ; remplacés par des lectures ponctuelles `Once`. La liste membres est mutualisée via `shareReplay(1)` pour éviter deux lectures Firestore (`recentPhotos` et la section "Photographes" lisent le même snapshot sans double appel).
- **`membres-galerie.ts`** — galerie des membres publics : `getAllMembers()` (WebSocket persistant sur toute la collection `users`) → `getAllMembersOnce()`.
- **Services** — ajout des méthodes ponctuelles : `ArticleService.getPublicArticlesOnce()`, `ThemeService.getThemesOnce()` / `getSoumissionsOnce()` / `getTousVotesOnce()`, `PhotoService.getRecentPublicPhotosOnce()`, `ConfigService.getSiteConfigOnce()`.

### Optimisation lectures Firestore — passage aux lectures ponctuelles

- **Pattern « fetch + refresh »** — remplacement des abonnements temps-réel (`collectionData` / `docData`) par des lectures ponctuelles (`getDocs` / `getDoc`) sur toutes les pages événements et galeries, afin de limiter la consommation de quota Firestore (était à 26 % avec 2 testeurs).
- **`sortie-detail`** — `sortie`, `photos`, `inscriptions` convertis en `Once` + signal `refreshTick` ; `refresh()` appelé après chaque mutation (save, inscription, upload, like, couverture). Liste des membres (`allMembres`) chargée en une seule fois uniquement si l'utilisateur est organisateur ou admin.
- **`oneshot-detail`** — même traitement : `event`, `themes`, `photos`, `inscriptions`, `myVotes`, `allVotes` convertis en lectures ponctuelles avec `refreshTick`. `allVotes` ne charge les votes que si `statut === resultats` ou si créateur/admin. `allMembres` gardé derrière `canManage`.
- **Services** — ajout de `getSortieOnce`, `getPhotosOnce`, `getInscriptionsOnce` dans `SortieService` ; `getOneShotOnce`, `getThemesOnce`, `getPhotosOnce`, `getInscriptionsOnce`, `getMyVotesOnce`, `getAllVotesOnce` dans `OneShotService` ; `getAllMembersOnce` dans `AuthService`.
- **`sorties-liste`** — déjà converti lors de la session précédente ; `defi-detail` idem.

### Défi photo — visibilité soumissions phase de soumission

- **Organisateur traité comme un membre** — durant la phase de soumission, l'organisateur ne voit que ses propres photos (plus la vue « toutes les soumissions » réservée à l'admin).
- **Compteur total visible par tous** — le nombre total de soumissions s'affiche dans le sous-titre de phase pour tout le monde, pas seulement l'admin.
- **Accès zone upload** — l'organisateur doit s'inscrire au défi (comme n'importe quel membre) pour accéder à la zone d'upload ; l'admin conserve un accès direct.

### Sélecteur de date unifié

- **Composant `app-date-picker`** — composant standalone implémentant `ControlValueAccessor` ; remplace tous les `<input type="date">` et datepickers Angular Material dans l'application.
- **Semaine débutant le lundi** — colonnes Lun–Dim ; colonnes Sam/Dim en rouge pour distinction visuelle des week-ends.
- **Navigation 3 niveaux** — vue jours (grille 6×7) → clic sur le mois → vue mois (grille 4×3) → clic sur l'année → vue années (grille 4×3, 12 ans) ; flèches ‹ / › pour naviguer dans chaque vue.
- **Compatibilité double** — `formControlName` (ReactiveFormsModule), `[(ngModel)]` (NgModel), ou `[value]`/`(valueChange)` pour les filtres à signal.
- **Mise en page compacte** — classe CSS sur l'hôte (ex. `.filter-date-picker`) permet de surcharger la hauteur pour une barre de filtres compacte (38px).
- **Pages mises à jour** — `admin-dashboard/reunions`, `sortie-creer`, `sortie-detail`, `defi-creer`, `defi-detail`, `oneshot-gerer`, `sorties-liste`.

### Défi Photo dans le flux de création d'événement

- **Type "Défi Photo" intégré à `sortie-creer`** — plus besoin d'un bouton séparé ; le formulaire unique "Organiser un événement" propose Sortie Photo, Sortie Club, Défi Photo, Atelier et OneShot. Les champs spécifiques au défi (thème, 3 dates, quotas, visibilité) s'affichent dynamiquement.
- **Bouton "Créer un défi" supprimé** — retiré du header (desktop + mobile) et de la page Événements.
- **Guide du site mis à jour** — nouvelle section "Défi Photo" avec les 4 phases et les étapes de création/participation.

### Défi Photo — nouveau type d'événement

- **Modèle `Defi`** — statut calculé à la volée (`getDefiStatut()`) en 4 phases : `a_venir` → `soumission` → `vote` → `resultats`. Pas de statut stocké en Firestore.
- **Page détail `/galeries/defis/:id`** — 4 affichages selon la phase : à venir (dates + inscription), soumissions (upload photo, quota par membre), vote (photos anonymes, compteur de votes restants), résultats (classement + podium top 3).
- **Règles de confidentialité soumission** — pendant la phase de soumission, chaque inscrit ne voit que ses propres photos. L'organisateur et l'admin voient toutes les soumissions.
- **Création `/membre/defis/creer`** — formulaire avec titre, thème (sujet à photographier), description, 3 dates (début/fin soumission, clôture votes), quota photos/votes, visibilité (public/membres). Validation croisée des dates.
- **Inscription obligatoire** — seuls les inscrits peuvent soumettre et voter.
- **Extension des votes** — l'organisateur peut prolonger la date de clôture des votes depuis la page détail.
- **Intégration sorties-liste** — les défis apparaissent dans la page Événements avec filtre "Défi Photo" dans le dropdown type. Cartes en orange/ambre.
- **Bouton "Créer un défi"** — ajouté dans la page Événements et dans le menu Activités du header (desktop + mobile).
- **Préférences notifications** — nouvelle préférence "Défis photo" pour recevoir les annonces de nouveaux défis.
- **Règles Firestore** — accès lecture selon visibilité (`public`/`membre`), écriture organisateur/admin, votes strictement par l'auteur du vote.



### RGPD — CGU, Confidentialité, Mentions légales

- **3 nouvelles pages éditables** — `/cgv` (Conditions Générales d'Utilisation), `/confidentialite` (Politique de confidentialité), `/mentions-legales` — même pattern Markdown que Histoire/Bureau, éditables dans Admin → Pages du site.
- **Templates par défaut** — bouton "Charger le modèle" dans l'admin pour CGU, Confidentialité et Mentions légales ; modèles pré-rédigés adaptés au contexte d'un club photo (association loi 1901, Firebase, données membres, droits RGPD).
- **Modale d'acceptation unifiée** — remplace l'ancienne modale charte-seule. Affiche 1 ou 2 sections selon ce qui doit être accepté : section "Documents légaux" (liens vers CGU + Confidentialité, checkbox) et/ou section "Charte du club" (texte scrollable, checkbox). Bouton "Continuer" activé uniquement quand toutes les cases requises sont cochées.
- **Gestion des versions** — `cguVersion` dans `pages/cgv` (analogue à `charteVersion`), stockée sur le profil membre via `cguAccepteeVersion`. L'admin peut forcer une re-acceptation depuis Admin → Pages pour CGU ou Confidentialité.
- **Footer** — liens "CGU" et "Confidentialité" ajoutés au footer (en plus du lien "Mentions légales" existant).

### OneShot — flux complet vote

- **Gestion — section compacte** — la boîte "Gestion" dans la page OneShot est redessinée en deux colonnes côte à côte : avancement à gauche, lien vers les photos à droite (visible uniquement pendant les phases inscription/fermeture). "Fermer les inscriptions" devient le bouton rouge principal ; "Passer directement au vote" passe en fantôme à droite.
- **Droits d'inscription** — les membres peuvent s'inscrire/se désinscrire uniquement pendant la phase `inscription`. L'organisateur et l'admin gardent la main sur la liste jusqu'à l'ouverture des votes (`fermeture_inscriptions` inclus).
- **Page gestion des photos (`membre/oneshots/:id/photos`) — refonte complète** — photos regroupées par thème (non-assignées en tête), drag & drop entre sections pour changer le thème, selects membre/thème directement sur chaque carte (sauvegarde immédiate), nom de fichier affiché sous la vignette. En statut `vote` ou `resultats`, toutes les opérations sont bloquées (drag, selects, suppression).
- **Barre de progression des soumissions** — objectif 1 photo par membre par thème, visible dans la gestion et sur la page photos. Couleurs : vert = complet, orange = partiel, gris = vide, rouge = dépassement (un membre a plusieurs photos dans le même thème).
- **Détection des doublons membre/thème** — si un membre a plusieurs photos dans un même thème : avertissement ⚠ orange sur chaque carte concernée + bannière en haut de la page photos + message dans la gestion.
- **Blocage passage au vote** — les boutons "Passer directement au vote" et "Ouvrir les votes" sont désactivés si des photos ne sont pas entièrement assignées (membre + thème manquants). Message 🚫 rouge bloquant + ⚠ orange pour les doublons (informatif, non bloquant).
- **Barre de progression des votes** — pendant la phase `vote`, la barre de soumissions est remplacée par une barre de votes (X/Y votes par thème), visible par l'organisateur et l'admin. Aide à décider quand publier les résultats.
- **Organisateur inscrit — peut voter** — si l'organisateur est inscrit à son propre OneShot, il vote comme un membre (vue anonyme, boutons Voter). S'il n'est pas inscrit, il garde la vue admin (compteurs, noms visibles).
- **Vote — zone cliquable élargie** — toute la box blanche du bas de chaque carte est cliquable pour voter ou retirer un vote (plus seulement le texte du bouton).
- **Vote — retirer un vote** — cliquer sur une carte déjà votée retire le vote (`deleteDoc` Firestore). Règle Firestore `allow delete` ajoutée pour `oneshots/{id}/votes`.
- **Top 3 visiteurs — gestion des égalités** — en cas d'ex-æquo, tous les concernés sont affichés (ex : 1er-1er-3e-3e-3e = 5 photos affichées, pas de 2e place).
- **Liste des participants — toujours visible** — en phase vote et résultats, la liste des membres inscrits reste affichée pour les connectés (auparavant masquée).
- **Informations visiteurs — lieu et description masqués** — le lieu et la description des OneShots, événements et sorties ne sont plus visibles par les visiteurs non connectés (pages liste, détail, calendrier). Le bouton "Connexion pour s'inscrire" sur les OneShots du calendrier est supprimé.
- **Gestion — masquée en résultats** — la boîte Gestion disparaît une fois les résultats publiés (plus d'actions possibles à ce stade).
- **Guide du site — section OneShot mise à jour** — nouvelles cartes "Voter dans un OneShot" et "Gérer les photos", précisions sur les droits par phase, barre de progression et messages de blocage documentés.
- **Build — budgets Angular ajustés** — seuils JS (3 MB) et CSS (20 kB) mis à jour dans `angular.json` pour refléter la réalité de la stack (Angular + Material + PrimeNG + AngularFire). Zéro warning en build.

### Améliorations
- **Types d'événements mis à jour** — la liste passe à : Sortie Photo, Sortie Club, Atelier (suppression de "Repas"). Le filtre, les formulaires création/édition et le guide membre sont mis à jour en conséquence.
- **Photo de couverture — proportions respectées** — sur les cartes événements et OneShots, la photo s'affiche désormais en entier (`object-fit: contain`) avec fond sombre, sans recadrage.
- **Galerie accueil — sélection aléatoire** — les photos affichées sur la page d'accueil sont tirées aléatoirement parmi les photos publiques de membres à profil public (double condition membre public + photo publique), avec un pool de 60 photos renouvelé à chaque visite.
- **Galerie accueil — proportions respectées** — la mosaïque passe en colonnes CSS : chaque photo s'affiche à son ratio naturel, sans recadrage. 4 colonnes desktop, 2 sur mobile.
- **Nav dots accueil — stabilisée** — la section Galerie n'est plus pincée par GSAP (hauteur variable selon les photos). Les positions des dots sont recalculées depuis le DOM après chargement des photos pour rester précises.
- **CI/CD — faux échec déploiement corrigé** — le workflow GitHub Actions traite désormais l'erreur Firebase "already current active version" comme un succès, évitant le pipeline rouge quand aucun fichier n'a changé depuis le dernier déploiement.
- **Pages du site éditables (Markdown)** — Histoire, Le Bureau, Adhésion, Charte du site et Contact sont désormais éditables par les admins via Admin → Pages du site. Chaque page est rédigée en Markdown (titres, listes, liens, tableaux) et rendue automatiquement sur le site. Un lien "Aide Markdown ↗" est disponible dans l'éditeur.
- **Charte du site — validation obligatoire** — après connexion, si un membre n'a pas encore accepté la version courante de la charte, un modal plein écran non-dismissable lui présente le texte et l'oblige à accepter ou à se déconnecter. En refusant, il est déconnecté immédiatement. L'admin peut cocher "Obliger tous les membres à accepter la nouvelle version" lors de la sauvegarde de la charte pour déclencher une nouvelle vague d'acceptation.
- **Page Contact éditable** — la page `/contact` utilise le même système Markdown que les autres pages du site ; le comité peut y mettre à jour coordonnées, adresse et horaires sans intervention technique.
- **Image hero — source configurable** — dans Admin → Configuration du site, l'admin peut choisir entre une image uploadée manuellement (drag & drop) ou utiliser automatiquement la photo gagnante du dernier Thème du mois comme fond de la page d'accueil.
- **Admin → Pages du site** — renommage de "Pages du club" en "Pages du site" dans le menu admin (desktop + mobile) et dans le titre de la page, maintenant que la section inclut aussi Contact.

### Améliorations
- **Lightbox — fullscreen direct en mode vote** — dans les contextes à votation (OneShot en phase vote, Thème du mois en phase soumission/vote), cliquer sur une photo déclenche directement le fullscreen natif du navigateur (barre du browser masquée, plein écran OS) sans passer par le panneau lightbox. Un bouton × ferme la lightbox depuis le fullscreen. Le système `anonyme`/`hideLikes` reste actif si l'utilisateur revient au panneau via ESC.
- **Notifications — documents** — les membres abonnés reçoivent une notification `📁` lors du dépôt d'un nouveau document et lors du remplacement d'un fichier existant (pas lors d'un simple renommage). Une nouvelle préférence "Documents" est disponible dans `/membre/preferences` ; activée par défaut.
- **Suspension en temps réel** — un membre suspendu par un admin est déconnecté automatiquement sans attendre sa prochaine reconnexion. Un watcher Firestore sur le profil détecte le passage `isSuspended: false → true` et appelle `logout()` immédiatement.
- **Image de la carte (événements et OneShots)** — les organisateurs peuvent uploader une image illustrative pour chaque événement ou OneShot, visible sur la carte dans la liste `/galeries/sorties`. Upload via drag & drop ou "parcourir" dans le formulaire "Organiser un événement" (à la création), dans le formulaire "Modifier l'événement" (inline dans la page détail) et dans la page "Modifier le OneShot" (`/membre/oneshots/:id/gerer`). Les images se stockent dans Firebase Storage (`sorties/{id}/evenement-cover` et `oneshots/{id}/couverture`) et sont supprimées automatiquement à la suppression de l'événement. Pour les sorties passées, la logique de couverture automatique (photo avec le plus de likes) est conservée.
- **Notifications — suppression d'événement/OneShot** — quand un organisateur ou un admin supprime un événement ou un OneShot, tous les membres inscrits reçoivent une notification `sendToUser` (ignores les préférences d'abonnement) les informant de la suppression.
- **Suppression des messages "Connectez-vous"** — les invitations à se connecter visibles par les visiteurs non connectés sont supprimées (9 occurrences dans 6 fichiers : `photo-lightbox`, `calendrier`, `sortie-detail`, `theme-detail`, `oneshot-detail`). Les fonctionnalités restent simplement masquées.
- **Thème clair — login modal et pages galeries** — `login-modal`, `sortie-detail`, `oneshot-detail` passent entièrement en thème clair (fond blanc, bordures légères, bouton rouge `#cc0000`).
- **Articles — images non recadrées** — les images des articles utilisent `object-fit: contain` dans les cards (pas de rognage) et s'affichent à leur hauteur naturelle dans la lightbox (plus de ratio 16/9 forcé).

- **Bug fix — Boutons créateur invisibles sur `/galeries/oneshots/:id`** — le créateur (non admin) ne voyait pas les boutons ✏ Modifier, 🗑 Supprimer ni les contrôles de participants. Cause : la règle Firestore exige un token pour lire un OneShot en `preparation`, mais l'observable se créait avant que l'auth soit initialisée, échouait silencieusement et `event()` restait `undefined` → `isCreator()` = false. Correction : `event` est maintenant réactif sur `profile` via `toObservable + map(uid) + distinctUntilChanged + switchMap`, ce qui resoumet la lecture Firestore dès que l'UID est disponible.
- **Bug fix — Règles Firestore OneShot** — ajout de `allow delete` (créateur ou admin), ajout d'admin dans `allow update` (statut, titre, lieu…), règle étroite `hasOnly(['nbInscrits','nbThemes'])` pour les membres lors des inscriptions, admin autorisé sur la sous-collection `themes`.
- **Bug fix — Bouton d'avancement bloqué** — `avancer()` et `fermerInscriptions()` entourent l'`await` d'un `try/finally` : `transitioning` est toujours remis à false même en cas d'erreur Firestore, évitant que le bouton reste figé à "En cours…".
- **Bug fix — OneShot en préparation invisible dans Événements** — dans `/galeries/sorties`, le créateur d'un OneShot en statut `preparation` (brouillon) ne le voyait pas dans la liste. Correction : `sorties-liste` charge maintenant en parallèle les OneSHots publics et les OneSHots du membre connecté, et fusionne les brouillons sans doublons. Les autres membres ne voient toujours pas les brouillons des autres créateurs.
- **Participants OneShot — pouvoirs admin** — dans `/galeries/oneshots/:id`, l'admin peut désormais ajouter ou désinscrire des participants (bouton ×  sur les chips, zone "+ Inscrire un membre") au même titre que le créateur, pendant que les inscriptions sont ouvertes. Les notifications de désinscription mentionnent le rôle (`L'admin` ou `Le créateur`).
- **Création OneShot unifiée** — le bouton "+ Organiser un OneShot" disparaît de la liste Événements. La création passe désormais par le formulaire "+ Organiser un événement" avec un nouveau type "🏆 OneShot". Quand ce type est sélectionné, la date devient optionnelle, les champs "Inscription obligatoire" et "Max participants" sont masqués, et la soumission appelle `OneShotService.create()` puis redirige vers `/galeries/oneshots/:id`. Le formulaire supporte aussi le query param `?type=oneshot` pour un preselect direct. Le guide membre est mis à jour en conséquence (création, participation et gestion via Activités → Événements, plus de référence à `/galeries/oneshots`).
- **Notifications — suppression de photo par un privilégié** — quand un admin, un organisateur ou le créateur d'un OneShot supprime la photo d'un autre membre, ce membre reçoit automatiquement une notification de type `admin` (icône 🛡️) indiquant le rôle de l'auteur de l'action (`L'admin`, `L'organisateur` ou `Le créateur`), le titre de la photo quand il existe, et le contexte (portfolio, nom de l'événement, thème, ou OneShot). Couvre : portfolio (`galeries/membres`), événements (`galeries/sorties`), thème du mois (`galeries/themesdumois`), et OneShots (`galeries/oneshots`). Cliquer sur ce type de notification la marque comme lue sans déclencher de redirection.
- **Filtre Événements global** — dans `/galeries/sorties`, le filtre (texte, type, dates) s'applique désormais simultanément aux sections "À venir" et "Passés". Le compteur `X / Y` n'apparaît que si le filtre réduit effectivement le nombre de résultats.
- **Alignement OneShot ↔ Événement** — les pages OneShot sont harmonisées avec les pages Événement : boutons Modifier/Supprimer visibles au créateur et à l'admin, affichage de la date et du lieu, section Gestion (Avancement + Photos) intégrée directement dans la vue détail (`galeries/oneshots/:id`) plutôt que sur une page séparée. La page de modification OneShot (`membre/oneshots/:id/gerer`) est redessinée en formulaire épuré (même style que la modification d'événement). Nouveau champ `lieu` sur les OneShotS.
- **Événements — likes photos** — les ♥ sont restaurés sur les photos d'événements (`galeries/sorties/:id`), à la fois en overlay sur les cartes photos et dans la lightbox. Ces événements n'ayant pas de système de vote, les likes n'y sont pas ambigus.
- **OneShots dans la liste Événements** — les OneShots publics (statuts `inscription`, `fermeture_inscriptions`, `vote`) apparaissent désormais dans la section "À venir" de `/galeries/sorties`, et les OneShots en `resultats` dans "Passés". Carte distincte avec fond violet foncé, badge type "🏆 OneShot", badge statut coloré (vert=inscriptions, ambre=fermées, violet=vote, gris=résultats), nombre de thèmes et d'inscrits. Clic → `/galeries/oneshots/:id`. `nbInscrits` et `nbThemes` sont désormais dénormalisés sur le doc OneShot (incrémentés atomiquement à chaque inscription/désinscription et ajout/suppression de thème). Suppression du ternissage `opacity: 0.8` sur les événements passés.
- **Visibilité du portfolio membre** — chaque membre peut choisir dans son profil si son portfolio est `Public` (visible par tous, y compris visiteurs non connectés) ou `Membres` (connectés uniquement). Nouveau champ `visibilite` sur le doc user, sauvegardé depuis la page Profil (section avec deux cartes radio). La grille galerie membres masque les profils `membre` aux visiteurs non connectés, et masque les membres sans photo (`photoCount = 0`). La page portfolio public bloque l'affichage si le profil est `membre` et le visiteur non connecté. `photoCount` est incrémenté/décrémenté atomiquement à chaque upload/suppression photo portfolio, et recalculé par `recalculateStorage()` dans AuthService (à lancer une fois en admin pour les membres existants).
- **Thèmes du mois — dates calculées automatiquement** — les champs `Ouverture`, `Clôture` et `Fin du vote` sont supprimés du formulaire admin. Remplacés par un seul champ `Jours de vote` (défaut 15). Les dates sont calculées à la volée depuis le mois/année : ouverture = 1er du mois, clôture = dernier jour du mois, fin vote = clôture + N jours. L'affichage (cartes admin, galerie publique, page détail thème) reste identique. Le champ `mois/année` reste verrouillé dès que le thème est `ouvert` ; `jours de vote` est éditable jusqu'au début du vote. `getThemeDates()` centralisé dans `theme.model.ts`. Compatibilité ascendante : anciens docs sans `joursVotation` reçoivent un fallback de 15 jours.
- **Admin — Réunions : blocage flash édition** — même comportement que les thèmes : cliquer sur une autre réunion pendant qu'une édition est en cours bloque l'ouverture et fait clignoter le formulaire en rouge au lieu de fermer silencieusement la carte éditée.
- **Bug fix — Réunions : champs optionnels non effaçables** — modifier une réunion en vidant le champ `lieu` ou `description` ne supprimait pas la valeur Firestore (updateDoc ignorait les champs absents). Correction via `deleteField()` dans `ReunionService.modifier()` pour les champs vides.
- **Admin — Thèmes du mois (liste style calendrier)** — refonte complète de la page admin/thèmes : vue liste groupée par année avec cards dépliables (colonne colorée par statut — gris=à venir, vert=ouvert, bleu=vote en cours, gris pâle=terminé, badge statut, titre, flèche). Sélection du mois via deux `mat-select` (Mois + Année) avec remplissage automatique des dates (1er du mois → dernier jour → 15 du mois suivant). Logique de verrouillage : thème `en_attente` = tous les champs éditables ; thème `ouvert` = titre/description/maxPhotos/maxVotes éditables, mois et dates verrouillés ; thème `vote` ou `resultats` = lecture seule (pas de bouton Modifier). Avertissement orange si dateCloture est dans le passé ou aujourd'hui. Blocage des doublons mois/année à la création et à l'édition avec message d'erreur. Toggle "Afficher les terminés" pour les thèmes en résultats. Formulaire de création en panneau au-dessus de la liste. Ajout de `modifierTheme()` dans `ThemeService`.
- **Notifications — changement de date** — quand un organisateur modifie la date d'un événement (Sortie/Événement, Réunion, OneShot), tous les membres abonnés reçoivent une notification "La date de X a changé : lundi 15 juillet 2026". Implémenté via un `notifCtx` optionnel sur `updateSortie`, `modifier` (réunion) et `updateDate` (oneshot) ; la notification n'est envoyée que si la date a effectivement changé.
- **Événements (ex-Sorties Photo)** — renommage complet "Sortie Photo" → "Événement" dans le header desktop et mobile, le sous-titre des listes, et la page de création. Sélecteur de type `mat-select` compact (📸 Sortie Photo / 🎨 Atelier / 🍽️ Repas) dans les formulaires création et gestion. Badge type dynamique (emoji + label) sur chaque carte. Compteur d'inscrits `nbInscrits` affiché sur les cartes liste et dans les cards du calendrier quand `inscriptionObligatoire`. Fix Firestore : `updateSortie` filtre les `undefined` avant l'envoi pour éviter l'erreur "Unsupported field value: undefined".
- **Admin — Réunions (liste style calendrier)** — refonte de la page admin/réunions en vue liste groupée par mois, identique à la page Calendrier membre : cards dépliables (date col bleue, badge "Réunion", titre, flèche), formulaire d'édition inline dans la card, boutons Modifier/Supprimer, toggle "Afficher les passées", pagination "Voir plus". Formulaire de création en panneau au-dessus de la liste.
- **Calendrier** — les cards Événement affichent maintenant le vrai type de sortie (emoji + label dynamique) au lieu du texte fixe "Sortie photo". Informations d'inscription (`N inscrit(s) / max`) visibles dans le panneau déroulant.
- **Page d'accueil — animations d'entrée de section** — les cartes (À la une, Activités, Photographes) et les cellules (Galerie) arrivent toutes simultanément depuis des directions différentes (gauche, droite, haut) pendant que la section scrolle naturellement dans le viewport (`top 80%` → `top top`, scrub 0.8 sans pin). Chaque section se verrouille brièvement à l'écran une fois installée (`+=30%`). Navigation via les dots ou la flèche bas : vitesse proportionnelle à la distance (500 px/s, ease linéaire) pour que toutes les sections défilent au même rythme quel que soit le saut.
- **Page d'accueil — navigation verticale & flèche de scroll** — pilule de dots cliquables sur le côté droit (masquée sur mobile) : chaque dot correspond à une section, s'active en rouge avec la position de scroll, et un clic saute directement à la fin des animations de la section ciblée. "Accueil" remonte en haut de page ; "Rejoignez-nous" descend jusqu'au CTA. Les positions sont lues dans un `requestAnimationFrame` post-`ScrollTrigger.refresh()` pour tenir compte des spacers GSAP. Flèche rebondissante `position: fixed` en bas de l'écran : progresse de section en section selon la position courante, disparaît sur la dernière section.
- **Page d'accueil — séparateurs pellicule cinéma** — bande noire 56px avec perforations (repeating-linear-gradient) et ligne rouge centrale entre chaque section GSAP, renforçant l'identité photo du club.
- **Header — cloche de notifications sur mobile** — la cloche apparaît à gauche du burger ; elle ouvre/ferme le même panneau de notifications que le desktop (badge rouge si non-lus), avec largeur adaptée à l'écran.
- **Page d'accueil — animations GSAP pin+scrub** — les sections À la une, Activités, Galerie et Photographes utilisent désormais GSAP ScrollTrigger avec effet pin : chaque section se fige et les cartes/photos glissent en place une par une au rythme exact du scroll (scrub 0.8). Les photos de la galerie arrivent en grand depuis un côté alterné (gauche/droite), se réduisent et s'ajustent dans leur cellule de mosaïque. Les CSS Scroll-Driven Animations remplacent l'IntersectionObserver pour les éléments non-GSAP (directive `RevealDirective`).
- **Header fixe sur tous les écrans** — le header passe de `position: sticky` (desktop) à `position: fixed` partout, comme il l'était déjà sur mobile. Le layout public ajoute `padding-top: 122px` globalement ; la home compense avec `margin-top: -122px` pour que le hero reste plein écran derrière le header.
- **Documents — filtre texte** — champ de recherche par nom de fichier (case-insensitive, combinable avec les filtres dossier, "Mes documents" et tri date). Bouton ✕ pour effacer rapidement.
- **Header fixe — pages membres** — `MemberLayout` reçoit aussi `padding-top: 122px` global (idem `PublicLayout`) suite au passage du header en `position: fixed` sur tous les écrans.
- **Accueil — accès anonyme corrigé** — `getPublicArticles()` filtre explicitement `statut = publié` et `portee = public` pour respecter les règles Firestore qui bloquaient la requête sans `WHERE` pour les visiteurs non connectés (observable sur Edge). Index composite `statut + portee + dateCreation` ajouté dans `firestore.indexes.json`. ⚠️ Déployer les index : `firebase deploy --only firestore:indexes`.

- **Notifications — réunions** — la création d'une réunion envoie maintenant une notification broadcast à tous les membres abonnés (lien direct vers le calendrier avec la réunion déjà ouverte). Toggle "Réunions" ajouté dans `/membre/preferences`.
- **Notifications — like/commentaire** — le message indique désormais le titre de la photo (ex : "X a commenté votre photo «Coucher de soleil»"). Le lien ouvre le portfolio du membre ET déclenche automatiquement la lightbox de la photo concernée.
- **Notifications — lien avec deep-link** — clic sur une notification navigue avec `navigateByUrl` pour préserver les query params (`?photo=id`, `?reunion=id`). Le calendrier et le portfolio détectent ces paramètres au chargement et ouvrent automatiquement l'élément ciblé.
- **OneShot & Sorties photo — suppression des likes photos** — le bouton ♥ est retiré des cartes et de la lightbox dans ces deux sections pour éviter la confusion avec le système de vote. Nouveau input `hideLikes` sur `app-photo-lightbox` (distinct de `anonyme` qui masque aussi auteur et commentaires).
- **Documents — filtre "Mes documents"** — chip toggle pour n'afficher que les documents uploadés par le membre connecté, combinable avec le filtre dossier.
- **Documents — tri date** — bouton ↑/↓ pour basculer entre date croissante et décroissante (tri par date effective : date de mise à jour si elle existe, sinon date de création).
- **Documents — date effective** — la date affichée est celle du dernier upload du fichier (`dateMiseAJour` si présente, sinon `dateCreation`). Un ✎ orange indique les documents mis à jour.
- **Documents — ordre des actions** — réordonné : Modifier → Supprimer → Télécharger.
- **Documents — nom de fichier au téléchargement** — le fichier téléchargé porte maintenant le vrai nom (ex : `Statuts 2024.pdf`) grâce au header `Content-Disposition` injecté dans les métadonnées Firebase Storage à l'upload. Un renommage sans re-upload met aussi à jour les métadonnées.
- **EXIF — Définition** — ajout de la résolution originale de la photo (ex : `6 000 × 4 000 px · 24 Mpx`) dans les infos EXIF de la lightbox. La valeur est lue sur le fichier brut avant compression, ce qui reflète la définition exploitable pour l'impression ou le magazine.
- **Portfolio membre — "Thèmes de prédilection"** — renommage de "Styles photographiques" sur la page de profil et sur le portfolio public. Libellés explicites ajoutés dans la section méta (Matériel · … et Thèmes de prédilection).
- **Page d'accueil — refonte complète** — hero plein écran parallaxe (CSS `background-attachment: fixed`, image configurable dans admin/config), sections reveal au scroll (IntersectionObserver via directive `RevealDirective`), enchaînement : À la une (articles épinglés/récents) → Activités (dernière sortie + thème du mois en alternance gauche/droite) → Galerie récente (photos publiques) → Les photographes (cartes membres en slide alterné) → CTA "Rejoindre". Suppression des anciens boutons hero (Rejoindre, Voir galeries).
- **Admin / Config — image hero** — nouvelle section "Apparence" : upload/prévisualisation/suppression de l'image de fond de la page d'accueil. Stockée dans Firebase Storage `config/hero.jpg`, URL dans Firestore `config/siteConfig`.
- **Page d'accueil — scroll-snap & animations renforcées** — chaque section fait 100vh avec `scroll-snap-type: y proximity` (actif uniquement sur la home, retiré sur les autres pages via ngOnDestroy). Les éléments entrent en scène avec un éasing expo (`cubic-bezier(0.16, 1, 0.3, 1)`) et des amplitudes augmentées (±100px horizontal, 64px vertical) pour un effet "qui s'installe" plus marqué. Pattern 3 directions : 1er élément depuis la gauche, 2e depuis la droite, 3e par le bas — avec décalage 350 ms entre cartes.
- **Portfolio membre — filtres photos** — barre de filtres sur la page portfolio public : chips par catégorie, menus multi-sélection Appareil/Objectif (visibles uniquement si ≥ 2 valeurs distinctes), chips de filtres actifs avec suppression individuelle et bouton "Tout effacer". La lightbox reste synchronisée sur les photos filtrées.
- **PhotoService — `getRecentPublicPhotos`** — nouvelle méthode pour requêter les N dernières photos publiques toutes sections confondues (index Firestore `visibilite + dateUpload` ajouté dans `firestore.indexes.json`).
- **Portfolio membre — filtres photos** — barre de filtres conditionnelle (n'apparaît que si ≥ 2 valeurs distinctes pour une catégorie) : chips de catégorie, dropdowns multi-sélection avec chips pour Appareil et Objectif. La lightbox suit l'index des photos filtrées. Titre de section passé de "Photos publiques" à "Photos".

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
claudes
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
