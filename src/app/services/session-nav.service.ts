import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, take } from 'rxjs';
import { AuthService } from './auth.service';

const LAST_ROUTE_KEY = 'cpLastRoute';
const SESSION_KEY = 'cpSession';
const FALLBACK = '/galeries/sorties';
const SKIP = new Set(['/', '/cgv', '/confidentialite', '/mentions-legales']);

@Injectable({ providedIn: 'root' })
export class SessionNavService {
  private router = inject(Router);
  private auth = inject(AuthService);

  constructor() {
    const isFreshSession = !sessionStorage.getItem(SESSION_KEY);
    sessionStorage.setItem(SESSION_KEY, '1');

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(e => {
      const url = (e as NavigationEnd).urlAfterRedirects;
      if (!SKIP.has(url)) {
        localStorage.setItem(LAST_ROUTE_KEY, url);
      }
    });

    if (isFreshSession) {
      this.router.events.pipe(
        filter(e => e instanceof NavigationEnd),
        take(1)
      ).subscribe(e => {
        if ((e as NavigationEnd).urlAfterRedirects === '/') {
          this.auth.user$.pipe(take(1)).subscribe(user => {
            if (user) {
              const last = localStorage.getItem(LAST_ROUTE_KEY) ?? FALLBACK;
              this.router.navigateByUrl(last, { replaceUrl: true });
            }
          });
        }
      });
    }
  }
}
