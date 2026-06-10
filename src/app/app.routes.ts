import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { Overview } from './pages/admin-dashboard/overview/overview';
import { Membres } from './pages/admin-dashboard/membres/membres';
import { Galeries } from './pages/admin-dashboard/galeries/galeries';
import { Evenements } from './pages/admin-dashboard/evenements/evenements';
import { AdminArticles } from './pages/admin-dashboard/articles/articles';
import { authGuard, loginGuard } from './guards/auth.guard';
import { PublicLayout } from './layouts/public-layout/public-layout';
import { Home } from './pages/home/home';
import { Actualites } from './pages/actualites/actualites';
import { LeClub, Histoire, Bureau, Adhesion } from './pages/le-club/le-club';
import { Calendrier } from './pages/calendrier/calendrier';
import { Contact } from './pages/contact/contact';

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
      { path: 'galeries', component: Galeries },
      { path: 'calendrier', component: Calendrier },
      { path: 'contact', component: Contact },
      {
        path: 'admin',
        canActivate: [authGuard],
        children: [
          { path: '', component: Overview },
          { path: 'articles', component: AdminArticles },
          { path: 'membres', component: Membres },
          { path: 'galeries', component: Galeries },
          { path: 'evenements', component: Evenements },
        ]
      },
    ]
  },
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [loginGuard] },
  { path: '**', redirectTo: '' }
];
