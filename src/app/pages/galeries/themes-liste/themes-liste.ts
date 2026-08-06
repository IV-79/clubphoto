import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
import { QueryDocumentSnapshot, DocumentData } from '@angular/fire/firestore';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeMensuel, computeThemeStatut, getThemeDates } from '../../../models/theme.model';

@Component({
  selector: 'app-themes-liste',
  imports: [RouterLink],
  templateUrl: './themes-liste.html',
  styleUrl: './themes-liste.css',
})
export class ThemesListe {
  private themeService = inject(ThemeService);
  private authService  = inject(AuthService);
  private sanitizer    = inject(DomSanitizer);

  private themesActifs = toSignal(this.themeService.getThemesActifsOnce(), { initialValue: [] as ThemeMensuel[] });

  profile    = toSignal(this.authService.currentUserProfile$);
  isLoggedIn = computed(() => !!this.profile());
  isEditor   = computed(() => {
    const role = this.profile()?.role;
    return role === 'admin' || role === 'contributeur';
  });

  private readonly PAGE_SIZE    = 3;
  private terminesPagines       = signal<ThemeMensuel[]>([]);
  private terminesCursor        = signal<QueryDocumentSnapshot<DocumentData> | null>(null);
  private hasMoreFirestore      = signal(false);
  private visibleTermCount      = signal(3);

  constructor() {
    this.loadTerminesPage();
  }

  private loadTerminesPage(): void {
    this.themeService.getThemesTerminesPage(this.terminesCursor(), this.PAGE_SIZE)
      .subscribe(({ items, cursor, hasMore }) => {
        this.terminesPagines.update(prev => [...prev, ...items]);
        this.terminesCursor.set(cursor);
        this.hasMoreFirestore.set(hasMore);
      });
  }

  loadMore(): void {
    const next = this.visibleTermCount() + this.PAGE_SIZE;
    this.visibleTermCount.set(next);
    if (next >= this.themesTermines().length && this.hasMoreFirestore()) {
      this.loadTerminesPage();
    }
  }

  themeOuvert = computed(() =>
    this.themesActifs().find(t => computeThemeStatut(t) === 'ouvert') ?? null
  );

  themeVote = computed(() =>
    this.themesActifs().find(t => computeThemeStatut(t) === 'vote') ?? null
  );

  themeCompagnon = computed((): ThemeMensuel | null => this.themeVote() ?? null);

  themeResultats = computed(() => this.themesTermines()[0] ?? null);

  themesAVenir = computed(() =>
    this.themesActifs().filter(t => computeThemeStatut(t) === 'en_attente')
  );

  themesTermines = computed(() => [
    ...this.themesActifs().filter(t => computeThemeStatut(t) === 'resultats'),
    ...this.terminesPagines(),
  ]);

  themesTerminesVisible = computed(() =>
    this.themesTermines().slice(0, this.visibleTermCount())
  );

  hasMoreTermines = computed(() =>
    this.themesTermines().length > this.visibleTermCount() || this.hasMoreFirestore()
  );

  dates(theme: ThemeMensuel) { return getThemeDates(theme); }

  formatMois(mois: string): string {
    const [year, month] = mois.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  coverBgStyle(url: string | undefined): SafeStyle | null {
    if (!url) return null;
    return this.sanitizer.bypassSecurityTrustStyle(`url('${url}')`);
  }
}
