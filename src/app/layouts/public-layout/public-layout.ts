import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { Header } from '../../components/header/header';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, Header],
  template: `
    <app-header />
    <main class="page-content" [class.has-test-banner]="isTestEnv">
      <router-outlet />
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <p class="footer-links">
          © {{ year }} Club Photo Tain-Tournon &nbsp;|&nbsp;
          <a routerLink="/contact">Contact</a>
          <a routerLink="/le-club/adhesion">Adhésion</a>
          <a routerLink="/mentions-legales">Mentions légales</a>
          <a routerLink="/cgv">CGU</a>
          <a routerLink="/confidentialite">Confidentialité</a>
        </p>
        <a class="footer-dev" href="https://www.linkedin.com/in/yves-pralong/" target="_blank" rel="noopener">
          <svg class="footer-li-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Développé par Yves Pralong
        </a>
      </div>
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .page-content {
        min-height: calc(100vh - 122px);
        padding-top: 122px;
        background: var(--bg-page);
      }
      .page-content.has-test-banner {
        padding-top: 150px;
        min-height: calc(100vh - 150px);
      }
      .site-footer {
        background: #1a1a1a;
        color: rgba(255, 255, 255, 0.65);
        padding: 24px;
        font-size: 0.8rem;
        letter-spacing: 0.5px;
        border-top: 3px solid #cc0000;
      }
      .footer-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .footer-links { margin: 0; }
      .site-footer a {
        color: rgba(255, 255, 255, 0.85);
        text-decoration: underline;
        margin: 0 8px;
      }
      .site-footer a:hover {
        color: white;
        text-decoration: none;
      }
      .footer-dev {
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(255,255,255,0.4) !important;
        text-decoration: none !important;
        font-size: 0.75rem;
        margin: 0 !important;
        transition: color 0.2s;
      }
      .footer-dev:hover { color: rgba(255,255,255,0.75) !important; }
      .footer-li-icon { width: 14px; height: 14px; flex-shrink: 0; }
    `,
  ],
})
export class PublicLayout {
  year = new Date().getFullYear();
  readonly isTestEnv = !environment.production;
}
