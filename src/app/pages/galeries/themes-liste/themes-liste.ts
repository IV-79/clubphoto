import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
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

  private allThemes = toSignal(this.themeService.getThemes(), { initialValue: [] as ThemeMensuel[] });
  profile    = toSignal(this.authService.currentUserProfile$);
  isLoggedIn = computed(() => !!this.profile());

  themeOuvert = computed(() =>
    this.allThemes().find(t => computeThemeStatut(t) === 'ouvert') ?? null
  );

  themeVote = computed(() =>
    this.allThemes().find(t => computeThemeStatut(t) === 'vote') ?? null
  );

  themeCompagnon = computed((): ThemeMensuel | null =>
    this.themeVote() ?? null
  );

  themesAVenir = computed(() =>
    this.allThemes().filter(t => computeThemeStatut(t) === 'en_attente')
  );

  themesTermines = computed(() =>
    this.allThemes().filter(t => computeThemeStatut(t) === 'resultats')
  );

  closedShown = signal(3);

  themesTerminesVisible = computed(() =>
    this.themesTermines().slice(0, this.closedShown())
  );

  hasMoreTermines = computed(() =>
    this.themesTermines().length > this.closedShown()
  );

  loadMore() { this.closedShown.update(n => n + 3); }

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
