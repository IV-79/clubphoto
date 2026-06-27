import { Injectable, inject } from '@angular/core';
import { combineLatest, map, distinctUntilChanged, shareReplay } from 'rxjs';
import { AuthService } from './auth.service';
import { PageContentService } from './page-content.service';

@Injectable({ providedIn: 'root' })
export class CharteService {
  private authService = inject(AuthService);
  private pageService = inject(PageContentService);

  private charteDoc$ = this.pageService.getCharteDoc().pipe(shareReplay(1));
  private cguDoc$    = this.pageService.getCguDoc().pipe(shareReplay(1));

  charteContent$ = this.charteDoc$.pipe(map(d => d.contenu));

  mustAcceptCharte$ = combineLatest([
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

  mustAcceptCgu$ = combineLatest([
    this.authService.currentUserProfile$,
    this.cguDoc$,
  ]).pipe(
    map(([user, cgu]) => {
      if (!user || cgu.cguVersion < 1) return false;
      return (user.cguAccepteeVersion ?? 0) < cgu.cguVersion;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  mustAccept$ = combineLatest([this.mustAcceptCharte$, this.mustAcceptCgu$]).pipe(
    map(([charte, cgu]) => charte || cgu),
    distinctUntilChanged(),
    shareReplay(1)
  );

  getCharteDoc() { return this.charteDoc$; }
  getCguDoc()    { return this.cguDoc$; }

  async acceptCharte(version: number): Promise<void> {
    await this.authService.acceptCharte(version);
  }

  async acceptCgu(version: number): Promise<void> {
    await this.authService.acceptCgu(version);
  }

  refuse(): void {
    this.authService.logout();
  }
}
