import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { Overview } from './pages/admin-dashboard/overview/overview';
import { Membres } from './pages/admin-dashboard/membres/membres';
import { Evenements } from './pages/admin-dashboard/evenements/evenements';
import { AdminConfig } from './pages/admin-dashboard/config/config';
import { AdminArticles } from './pages/admin-dashboard/articles/articles';
import { AdminThemes } from './pages/admin-dashboard/themes/themes';
import { authGuard, memberGuard, loginGuard } from './guards/auth.guard';
import { PublicLayout } from './layouts/public-layout/public-layout';
import { MemberLayout } from './layouts/member-layout/member-layout';
import { Home } from './pages/home/home';
import { Actualites } from './pages/actualites/actualites';
import { LeClub, Histoire, Bureau, Adhesion } from './pages/le-club/le-club';
import { Calendrier } from './pages/calendrier/calendrier';
import { Contact } from './pages/contact/contact';
import { MembrePortfolio } from './pages/membre/portfolio/portfolio';
import { MembreProfil } from './pages/membre/profil/profil';
import { OneShotsListe } from './pages/membre/oneshots/oneshots-liste/oneshots-liste';
import { OneShotCreer } from './pages/membre/oneshots/oneshot-creer/oneshot-creer';
import { OneShotGerer } from './pages/membre/oneshots/oneshot-gerer/oneshot-gerer';
import { OneShotDetail } from './pages/membre/oneshots/oneshot-detail/oneshot-detail';
import { OneShotPhotos } from './pages/membre/oneshots/oneshot-photos/oneshot-photos';
import { MembresGalerie } from './pages/galeries/membres-galerie/membres-galerie';
import { MembreDetail } from './pages/galeries/membre-detail/membre-detail';
import { ThemesListe } from './pages/galeries/themes-liste/themes-liste';
import { ThemeDetail } from './pages/galeries/theme-detail/theme-detail';
import { MembresGuide } from './pages/membres/guide/guide';

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
      { path: 'galeries/oneshots', component: OneShotsListe },
      { path: 'galeries/oneshots/:id', component: OneShotDetail },
      { path: 'calendrier', component: Calendrier },
      { path: 'membres/guide', component: MembresGuide, canActivate: [memberGuard] },
      { path: 'contact', component: Contact },
      {
        path: 'admin',
        canActivate: [authGuard],
        children: [
          { path: '', component: Overview },
          { path: 'articles', component: AdminArticles },
          { path: 'membres', component: Membres },
          { path: 'evenements', component: Evenements },
          { path: 'themes', component: AdminThemes },
          { path: 'config', component: AdminConfig },
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
      { path: 'oneshots/creer', component: OneShotCreer },
      { path: 'oneshots/:id/gerer', component: OneShotGerer },
      { path: 'oneshots/:id/photos', component: OneShotPhotos },
      { path: '', redirectTo: 'portfolio', pathMatch: 'full' }
    ]
  },
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [loginGuard] },
  { path: '**', redirectTo: '' }
];
