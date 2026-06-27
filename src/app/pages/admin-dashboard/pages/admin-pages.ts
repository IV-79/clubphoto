import { Component, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { Auth } from '@angular/fire/auth';
import { PageContentService, PageId } from '../../../services/page-content.service';

const PAGE_LABELS: Record<PageId, string> = {
  histoire:           'Histoire du club',
  bureau:             'Le Bureau',
  adhesion:           'Adhésion',
  contact:            'Contact',
  charte:             'Charte du site',
  'mentions-legales': 'Mentions légales',
  cgv:                'CGU',
  confidentialite:    'Confidentialité',
};

const DEFAULT_TEMPLATES: Partial<Record<PageId, string>> = {

  'mentions-legales': `# Mentions légales

## Éditeur du site

**Club Photo Tain-Tournon**
Association loi du 1er juillet 1901
Siège social : [adresse complète à compléter]
E-mail : [email du bureau à compléter]

## Directeur de la publication

[Prénom Nom du président]

## Hébergement

Ce site est hébergé par :

**Google Ireland Limited** — Firebase Hosting & Firestore
Gordon House, Barrow Street, Dublin 4, Irlande
[https://firebase.google.com](https://firebase.google.com)

Les données sont stockées sur des serveurs situés en Europe (région europe-west).

## Propriété intellectuelle

Le nom, le logo et les éléments graphiques du site sont la propriété du Club Photo Tain-Tournon.

Les photographies publiées par les membres restent la propriété exclusive de leurs auteurs. Aucune reproduction, diffusion ou utilisation à des fins commerciales n'est autorisée sans l'accord écrit préalable de l'auteur concerné.

## Documents légaux

- [Conditions Générales d'Utilisation](/cgv)
- [Politique de confidentialité](/confidentialite)
- [Contact](/contact)
`,

  cgv: `# Conditions Générales d'Utilisation

*Dernière mise à jour : [date]*

## 1. Objet

Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation du site web du **Club Photo Tain-Tournon**, association loi 1901 (ci-après « le Club »).

En cochant la case d'acceptation lors de votre connexion, vous reconnaissez avoir lu, compris et accepté les présentes CGU dans leur intégralité.

## 2. Accès au site

L'accès à l'espace membre est réservé aux membres à jour de leur cotisation annuelle. Toute nouvelle inscription est soumise à validation par le bureau.

Le Club se réserve le droit de suspendre ou supprimer un compte ne respectant pas les présentes CGU.

## 3. Propriété intellectuelle des photographies

Les photographies publiées sur ce site restent la propriété exclusive de leurs auteurs. En les publiant, le membre accorde au Club une licence non exclusive et gratuite pour les afficher sur ce site à des fins associatives (galeries, communication interne).

Toute reproduction, copie ou diffusion à des fins commerciales est strictement interdite sans accord écrit de l'auteur.

## 4. Droit à l'image

Les membres s'engagent à ne publier des photos représentant des personnes identifiables qu'avec leur accord explicite, conformément à l'article 9 du Code civil. Le Club décline toute responsabilité en cas de manquement par un membre à cette obligation.

## 5. Comportement et contenu

Les membres s'engagent à :
- Ne publier que des contenus respectueux et conformes à la législation française
- Ne pas diffuser de contenus illicites, diffamatoires, racistes, violents ou portant atteinte aux droits de tiers
- Ne pas usurper l'identité d'un autre membre
- Signaler au bureau tout contenu qui leur semblerait inapproprié

## 6. Responsabilité

Le Club s'efforce de maintenir le site accessible en permanence, mais ne peut garantir une disponibilité sans interruption. Le Club ne saurait être tenu responsable des dommages directs ou indirects résultant de l'utilisation du site ou de l'impossibilité d'y accéder.

Les membres sont seuls responsables des contenus qu'ils publient.

## 7. Modification des CGU

Le Club se réserve le droit de modifier les présentes CGU à tout moment. En cas de modification substantielle, les membres seront invités à accepter la nouvelle version lors de leur prochaine connexion.

## 8. Droit applicable

Les présentes CGU sont soumises au droit français. En cas de litige, les tribunaux compétents de [ville] seront seuls compétents.

## 9. Contact

Pour toute question relative aux présentes CGU, contactez le bureau via la page [Contact](/contact).
`,

  confidentialite: `# Politique de confidentialité

*Dernière mise à jour : [date]*

## 1. Responsable du traitement

**Club Photo Tain-Tournon**, association loi 1901
Siège social : [adresse complète à compléter]
Contact : [email du bureau à compléter] ou via la page [Contact](/contact)

## 2. Données collectées

Dans le cadre de votre adhésion et de l'utilisation du site, nous collectons les données suivantes :

| Catégorie | Données |
|---|---|
| **Identité** | Nom, prénom, adresse e-mail |
| **Profil** | Biographie, matériel photo, styles photographiques, liens réseaux sociaux (optionnels) |
| **Photos de profil** | Avatar et photo de bandeau (optionnels) |
| **Contenu** | Photographies publiées, commentaires, votes, participations aux activités |
| **Métadonnées photos** | EXIF (appareil, focale, exposition…) ; coordonnées GPS uniquement avec votre consentement explicite |
| **Données techniques** | Date de dernière connexion, espace de stockage utilisé |

## 3. Finalités du traitement

Vos données sont utilisées pour :
- Gérer votre compte membre et authentifier vos accès
- Afficher votre portfolio et vos participations dans les galeries du club
- Organiser les activités (thèmes mensuels, sorties, OneShoots)
- Vous envoyer des notifications liées aux activités du club (si vous y avez consenti dans vos préférences)

Vos données ne sont **jamais** vendues, cédées ou utilisées à des fins commerciales.

## 4. Base légale

| Traitement | Base légale |
|---|---|
| Gestion du compte membre | Intérêt légitime du Club (art. 6.1.f RGPD) |
| Affichage du profil public | Consentement (art. 6.1.a RGPD) — contrôlé via le réglage de visibilité de votre profil |
| Notifications | Consentement (art. 6.1.a RGPD) — géré dans vos préférences |
| Données GPS EXIF | Consentement explicite demandé à chaque upload |

## 5. Durée de conservation

Vos données sont conservées pendant toute la durée de votre adhésion au Club. Lors de la suppression de votre compte (à votre demande ou par décision du bureau), l'intégralité de vos données et photographies est effacée.

## 6. Hébergement et transferts

Le site est hébergé par **Google Firebase** (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande). Les données sont stockées en Europe (région europe-west).

Google est soumis aux clauses contractuelles types de la Commission européenne. Pour plus d'informations : [https://policies.google.com/privacy](https://policies.google.com/privacy).

Aucun autre transfert de données vers des pays tiers n'est effectué.

## 7. Vos droits

Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :

- **Accès** : obtenir une copie des données vous concernant
- **Rectification** : corriger vos informations directement dans votre profil
- **Suppression** : demander la suppression de votre compte et de vos données
- **Portabilité** : recevoir vos données dans un format structuré
- **Opposition** : vous opposer à certains traitements (notifications, visibilité publique)
- **Limitation** : demander la limitation du traitement dans certains cas

Pour exercer ces droits, contactez le bureau via la page [Contact](/contact). Nous nous engageons à répondre dans un délai de 30 jours.

En cas de désaccord, vous pouvez déposer une réclamation auprès de la **CNIL** : [https://www.cnil.fr/fr/plaintes](https://www.cnil.fr/fr/plaintes)

## 8. Données EXIF et GPS

Lors de l'upload d'une photographie, les métadonnées EXIF sont extraites automatiquement (modèle d'appareil, focale, vitesse, ISO…) et affichées sur votre portfolio à titre informatif.

Les **coordonnées GPS** éventuellement présentes dans vos photos ne sont partagées **que si vous y consentez explicitement** au moment de l'upload. Ce consentement peut être refusé sans conséquence sur la publication de la photo.

## 9. Cookies

Ce site n'utilise **pas** de cookies de traçage, de publicité ou d'analyse d'audience.

Les seuls cookies présents sont des cookies techniques de **Firebase Authentication**, strictement nécessaires au fonctionnement de l'authentification. Ils ne peuvent pas être refusés sans empêcher la connexion au site.
`,
};

@Component({
  selector: 'app-admin-pages',
  imports: [FormsModule],
  templateUrl: './admin-pages.html',
  styleUrl: './admin-pages.css',
})
export class AdminPages {
  private pageService = inject(PageContentService);
  private auth        = inject(Auth);

  // Ordre logique : pages club → règles → documents légaux
  readonly pages: PageId[] = [
    'histoire', 'bureau', 'adhesion', 'contact',
    'charte',
    'mentions-legales', 'cgv', 'confidentialite',
  ];
  readonly pageLabels = PAGE_LABELS;

  currentPage = signal<PageId>('histoire');
  pageLabel   = computed(() => PAGE_LABELS[this.currentPage()]);

  saving  = signal(false);
  saved   = signal(false);

  editorValue   = '';
  originalContent = '';
  forceReaccept = false;

  hasTemplate = computed(() => !!DEFAULT_TEMPLATES[this.currentPage()]);

  private isLegalPage = computed(() =>
    (['charte', 'cgv', 'confidentialite'] as PageId[]).includes(this.currentPage())
  );

  loaded = toSignal(
    toObservable(this.currentPage).pipe(
      switchMap(id => this.pageService.getContent(id))
    ),
    { initialValue: null as any }
  );

  constructor() {
    effect(() => {
      const c = this.loaded() as string | null;
      if (c !== null) {
        this.editorValue   = c;
        this.originalContent = c;
        this.forceReaccept = false;
      }
    });
  }

  selectPage(page: PageId) {
    if (page === this.currentPage()) return;
    this.currentPage.set(page);
    this.saved.set(false);
  }

  onEditorChange(value: string) {
    this.editorValue = value;
    if (this.isLegalPage()) {
      this.forceReaccept = value !== this.originalContent;
    }
  }

  loadTemplate() {
    this.editorValue = DEFAULT_TEMPLATES[this.currentPage()] ?? '';
    if (this.isLegalPage()) {
      this.forceReaccept = this.editorValue !== this.originalContent;
    }
  }

  async save() {
    this.saving.set(true);
    this.saved.set(false);
    try {
      const uid = this.auth.currentUser?.uid ?? '';
      await this.pageService.saveContent(this.currentPage(), this.editorValue, uid);
      if (this.forceReaccept) {
        if (this.currentPage() === 'charte') {
          await this.pageService.bumpCharteVersion();
        } else if (this.currentPage() === 'cgv' || this.currentPage() === 'confidentialite') {
          await this.pageService.bumpCguVersion();
        }
        this.forceReaccept = false;
      }
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } finally {
      this.saving.set(false);
    }
  }
}
