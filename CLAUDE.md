# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # dev server → http://localhost:4200
npm run build      # production build → dist/club-photo/browser
npm run watch      # incremental build (watch mode)
npm run test       # unit tests via Vitest
```

> After every change, run `npm run build` and fix all errors before declaring done.

## Stack

- **Angular 21** — fully standalone components (no NgModules), strict TypeScript 5.9
- **AngularFire 21 + Firebase 12** — Auth, Firestore, Storage, Hosting
- **Angular Material 21 + PrimeNG 21** — UI components
- **Vitest 4 + jsdom** — unit tests

Firebase project: `clubphotopj` (single project for dev & prod).

## Architecture

### Layouts & Routing (`src/app/app.routes.ts`)

Two layout wrappers:
- **PublicLayout** — public site (header + footer)
- **MemberLayout** — member-only area (white background, no dark override)

Route guards:
- `authGuard` — admin only; redirects to home otherwise
- `memberGuard` — any logged-in user; opens login modal if anonymous
- `loginGuard` — blocks already-logged-in users (registration page)

Main route groups:
- `/` `/actualites` `/le-club/*` `/contact` — public info pages
- `/galeries/membres` `/galeries/themesdumois` `/galeries/sorties` `/galeries/oneshots` — public galleries with detail routes
- `/membre/*` — portfolio, profile, outing/oneshot creation & management (memberGuard)
- `/admin/**` — article/member/theme/reunion/config management (authGuard)
- `/calendrier` — club calendar (memberGuard)

### Services (`src/app/services/`)

| Service | Responsibility |
|---|---|
| `AuthService` | Auth state, user profile CRUD, role & suspension management, storageUsed tracking |
| `PhotoService` | Portfolio photo CRUD, visibility (public/membre), likes, comments/replies |
| `ThemeService` | Monthly theme CRUD, submissions, 1-vote-per-member voting, comments |
| `OneShotService` | Event lifecycle (5-status machine), themes, inscriptions, photo upload, voting |
| `SortieService` | Outing CRUD, inscriptions, photo upload, like-based cover rotation |
| `ReunionService` | Calendar meeting dates |
| `ArticleService` | News article CRUD with publish status |
| `ConfigService` | Site-wide admin-editable config |
| `LoginModalService` | Global signal to open/close the login modal |
| `ConfirmService` | Reusable confirmation dialog |
| `GpsConsentService` | User consent for GPS EXIF exposure |

All Firestore/Storage calls are wrapped in `runInInjectionContext` when called outside an injection context.

### Firestore Collections

```
users/           uid, nom, prenom, role (admin|membre), isSuspended,
                 storageUsed { portfolio, themes, oneshots },
                 derniereConnexion, photoProfilUrl, photoBandeauUrl,
                 visibilite ('public'|'membre'), photoCount

photos/          uid, url, storagePath, fileSize, visibilite (public|membre),
                 categorie, exif, likes[]
  └ commentaires/  with embedded replies[] and likes[]

themes/          titre, mois (YYYY-MM), joursVotation (default 15),
                 maxPhotos, maxVotes
                 — dates calculées à la volée via getThemeDates() dans theme.model.ts :
                   ouverture=1er du mois, clôture=dernier jour, finVote=clôture+joursVotation
  ├ soumissions/   photo submissions with exif, likes[]
  ├ commentaires/  with replies[] and likes[]
  └ votes/         one doc per member per theme

oneshots/        titre, creatorUid, nbInscrits, nbThemes,
                 statut: preparation|inscription|fermeture_inscriptions|vote|resultats
  ├ themes/        competition themes with ordre
  ├ inscriptions/  member registrations
  ├ photos/        submissions with themeId, likes[]
  ├ commentaires/  with replies[] and likes[]
  └ votes/         one doc per voter per theme

sorties/         titre, date, lieu, organisateurUid, inscriptionObligatoire,
                 uploadParticipantsOnly, photoCouvertureUrl
  ├ inscriptions/
  ├ photos/        with likes[]
  └ commentaires/  with replies[] and likes[]

reunions/        titre, type, date, lieu, description
articles/        titre, contenu, extrait, imageUrl, datePublication,
                 publie, categorie (actualite|evenement|galerie|divers)
config/          site-wide settings (admin only)
```

### Key Patterns

- **Likes** — `arrayUnion` / `arrayRemove` for atomic add/remove without transactions
- **Storage tracking** — `storageUsed.portfolio / .themes / .oneshots` on user doc, incremented atomically on upload and decremented on delete; `fileSize` stored on the photo doc
- **Comments** — replies embedded inside the `commentaires` doc (no separate collection)
- **Photo visibility** — two tiers: `public` (everyone) and `membre` (logged-in only)
- **Profile visibility** — `visibilite: 'public'|'membre'` on user doc; `membres-galerie` filters out `membre` profiles for anonymous visitors; `membre-detail` blocks direct URL access; `photoCount` (int64) tracks number of portfolio photos and is required to appear in the gallery (`photoCount > 0`)
- **Denormalized counts** — `photoCount` on user (updated by `PhotoService` ±1 on upload/delete), `nbInscrits` and `nbThemes` on oneshot doc (updated by `OneShotService` ±1 on inscription/theme add-remove); `recalculateStorage()` in `AuthService` resets all three
- **Theme dates computed** — `getThemeDates(theme)` in `theme.model.ts` derives `dateOuverture / dateCloture / dateFinVote` from `mois` + `joursVotation`; no date fields stored in Firestore
- **OneShot status machine** — explicit `statut` enum drives what UI actions are available
- **Discriminated union listing** — `sorties-liste` merges `Sortie[]` and `OneShot[]` into `ActiviteItem = { kind: 'sortie'|'oneshot'; data: Sortie|OneShot }` for a unified events page; `asSortie()` / `asOneShot()` helpers cast for template type narrowing
- **EXIF** — `exifr` extracts metadata on upload; GPS requires explicit user consent (`GpsConsentService`)
- **Auth** — email/password + invitation via sign-in link; user Firestore doc auto-created on first login

### New Pages — Background Rule

New pages under `MemberLayout` inherit a white background from the layout. Do **not** add a dark `:host` override or a background style on the component itself.
