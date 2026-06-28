import { Routes } from '@angular/router';
import { RegisterComponent } from './pages/register/register.component';
import { Overview } from './pages/admin-dashboard/overview/overview';
import { Membres } from './pages/admin-dashboard/membres/membres';
import { Reunions } from './pages/admin-dashboard/reunions/reunions';
import { AdminConfig } from './pages/admin-dashboard/config/config';
import { AdminThemes } from './pages/admin-dashboard/themes/themes';
import { AdminPages } from './pages/admin-dashboard/pages/admin-pages';
import { authGuard, memberGuard, loginGuard, editorGuard } from './guards/auth.guard';
import { PublicLayout } from './layouts/public-layout/public-layout';
import { MemberLayout } from './layouts/member-layout/member-layout';
import { Home } from './pages/home/home';
import { Actualites } from './pages/actualites/actualites';
import { LeClub, Histoire, Bureau, Adhesion } from './pages/le-club/le-club';
import { MentionsLegales } from './pages/mentions-legales/mentions-legales';
import { CGU } from './pages/mentions-legales/cgu/cgu';
import { Confidentialite } from './pages/mentions-legales/confidentialite/confidentialite';
import { Calendrier } from './pages/calendrier/calendrier';
import { Contact } from './pages/contact/contact';
import { MembrePortfolio } from './pages/membre/portfolio/portfolio';
import { MembreProfil } from './pages/membre/profil/profil';
import { ArticleForm } from './pages/membre/articles/article-form';
import { OneShotGerer } from './pages/membre/oneshots/oneshot-gerer/oneshot-gerer';
import { OneShotDetail } from './pages/membre/oneshots/oneshot-detail/oneshot-detail';
import { OneShotPhotos } from './pages/membre/oneshots/oneshot-photos/oneshot-photos';
import { MembresGalerie } from './pages/galeries/membres-galerie/membres-galerie';
import { MembreDetail } from './pages/galeries/membre-detail/membre-detail';
import { ThemesListe } from './pages/galeries/themes-liste/themes-liste';
import { ThemeDetail } from './pages/galeries/theme-detail/theme-detail';
import { SortiesListe } from './pages/galeries/sorties-liste/sorties-liste';
import { SortieDetail } from './pages/galeries/sortie-detail/sortie-detail';
import { SortieCreer } from './pages/membre/sorties/sortie-creer/sortie-creer';
import { DefiCreer } from './pages/membre/defis/defi-creer/defi-creer';
import { DefiDetail } from './pages/galeries/defi-detail/defi-detail';
import { MembresGuide } from './pages/membres/guide/guide';
import { Charte } from './pages/membres/charte/charte';
import { CompleterProfilComponent } from './pages/completer-profil/completer-profil.component';
import { Documents } from './pages/membre/documents/documents';
import { DocumentDossiers } from './pages/admin-dashboard/document-dossiers/document-dossiers';
import { Notifications } from './pages/membre/notifications/notifications';
import { Preferences } from './pages/membre/preferences/preferences';

export const routes: Routes = [
  {
    path: '',
    component: PublicLayout,
    children: [
      { path: '', component: Home },
      { path: 'actualites', component: Actualites },
      {
        path: 'le-club',
        component: LeClub,
        children: [
          { path: 'histoire', component: Histoire },
          { path: 'bureau', component: Bureau },
          { path: 'adhesion', component: Adhesion },
          { path: '', redirectTo: 'histoire', pathMatch: 'full' }
        ]
      },
      { path: 'galeries', redirectTo: 'galeries/membres', pathMatch: 'full' },
      { path: 'galeries/membres', component: MembresGalerie },
      { path: 'galeries/membres/:uid', component: MembreDetail },
      { path: 'galeries/themesdumois', component: ThemesListe },
      { path: 'galeries/themesdumois/:id', component: ThemeDetail },
      { path: 'galeries/oneshots', redirectTo: 'galeries/sorties', pathMatch: 'full' },
      { path: 'galeries/oneshots/:id', component: OneShotDetail },
      { path: 'galeries/sorties', component: SortiesListe },
      { path: 'galeries/sorties/:id', component: SortieDetail },
      { path: 'galeries/defis/:id', component: DefiDetail },
      { path: 'calendrier', component: Calendrier },
      { path: 'membres/guide', component: MembresGuide, canActivate: [memberGuard] },
      { path: 'membres/charte', component: Charte, canActivate: [memberGuard] },
      { path: 'contact', component: Contact },
      { path: 'mentions-legales', component: MentionsLegales },
      { path: 'cgv', component: CGU },
      { path: 'confidentialite', component: Confidentialite },
      {
        path: 'admin',
        canActivate: [authGuard],
        children: [
          { path: '', component: Overview },
          { path: 'membres', component: Membres },
          { path: 'reunions', component: Reunions },
          { path: 'themes', component: AdminThemes },
          { path: 'config', component: AdminConfig },
          { path: 'dossiers', component: DocumentDossiers },
          { path: 'pages', component: AdminPages },
        ]
      },
    ]
  },
  {
    path: 'membre',
    component: MemberLayout,
    canActivate: [memberGuard],
    children: [
      { path: 'portfolio', component: MembrePortfolio },
      { path: 'profil', component: MembreProfil },
      { path: 'articles/creer', component: ArticleForm, canActivate: [editorGuard] },
      { path: 'articles/:id/editer', component: ArticleForm, canActivate: [editorGuard] },
      { path: 'oneshots/:id/gerer', component: OneShotGerer },
      { path: 'oneshots/:id/photos', component: OneShotPhotos },
      { path: 'documents', component: Documents },
      { path: 'notifications', component: Notifications },
      { path: 'preferences', component: Preferences },
      { path: 'sorties/creer', component: SortieCreer, canActivate: [editorGuard] },
      { path: 'defis/creer', component: DefiCreer, canActivate: [editorGuard] },
      { path: '', redirectTo: 'portfolio', pathMatch: 'full' }
    ]
  },
  { path: 'register', component: RegisterComponent, canActivate: [loginGuard] },
  { path: 'completer-profil', component: CompleterProfilComponent },
  { path: '**', redirectTo: '' }
];
