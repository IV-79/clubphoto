import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { Header } from '../../components/header/header';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, Header],
  template: `
    <app-header />
    <main class="page-content">
      <router-outlet />
    </main>
    <footer class="site-footer">
      <p>
        © {{ year }} Club Photo Tain-Tournon &nbsp;|&nbsp;
        <a routerLink="/contact">Contact</a>
        <a routerLink="/le-club/adhesion">Adhésion</a>
        <a routerLink="/mentions-legales">Mentions légales</a>
        <a routerLink="/cgv">CGU</a>
        <a routerLink="/confidentialite">Confidentialité</a>
      </p>
    </footer>
  `,
  styles: [`
    .page-content { min-height: calc(100vh - 122px); padding-top: 122px; background: var(--bg-page); }
    .site-footer {
      background: #1a1a1a;
      color: rgba(255,255,255,0.65);
      text-align: center;
      padding: 24px;
      font-size: 0.8rem;
      letter-spacing: 0.5px;
      border-top: 3px solid #cc0000;
    }
    .site-footer a {
      color: rgba(255,255,255,0.85);
      text-decoration: underline;
      margin: 0 8px;
    }
    .site-footer a:hover { color: white; text-decoration: none; }
  `]
})
export class PublicLayout {
  year = new Date().getFullYear();
}
