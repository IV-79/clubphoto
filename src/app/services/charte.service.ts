import { Injectable, inject } from '@angular/core';
import { combineLatest, map, distinctUntilChanged, shareReplay } from 'rxjs';
import { AuthService } from './auth.service';
import { PageContentService } from './page-content.service';

@Injectable({ providedIn: 'root' })
export class CharteService {
  private authService = inject(AuthService);
  private pageService = inject(PageContentService);

  private charteDoc$ = this.pageService.getCharteDoc().pipe(shareReplay(1));

  charteContent$ = this.charteDoc$.pipe(map(d => d.contenu));

  mustAccept$ = combineLatest([
    this.authService.currentUserProfile$,
    this.charteDoc$,
  ]).pipe(
    map(([user, charte]) => {
      if (!user || charte.charteVersion < 1) return false;
      return (user.charteAccepteeVersion ?? 0) < charte.charteVersion;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  async accept(version: number): Promise<void> {
    await this.authService.acceptCharte(version);
  }

  refuse(): void {
    this.authService.logout();
  }
}
