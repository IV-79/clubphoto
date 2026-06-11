import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ThemeService } from '../../../services/theme.service';
import { SoumissionService } from '../../../services/soumission.service';
import { ThemeStatut } from '../../../models/theme.model';

@Component({
  selector: 'app-themes-liste',
  imports: [RouterLink],
  templateUrl: './themes-liste.html',
  styleUrl: './themes-liste.css',
})
export class ThemesListe {
  private themeService = inject(ThemeService);
  private soumissionService = inject(SoumissionService);

  themes = toSignal(
    this.themeService.getThemes().pipe(
      map(themes => themes.filter(t => t.statut !== 'brouillon'))
    ),
    { initialValue: [] }
  );

  soumissions = toSignal(this.soumissionService.getAllSoumissions(), { initialValue: [] });

  thumbnailsPour(themeId: string): string[] {
    return this.soumissions()
      .filter(s => s.themeId === themeId)
      .slice(0, 4)
      .map(s => s.photoUrl);
  }

  countPour(themeId: string): number {
    return this.soumissions().filter(s => s.themeId === themeId).length;
  }

  formatMois(moisAnnee: string): string {
    const [year, month] = moisAnnee.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  labelStatut(statut: ThemeStatut): string {
    return statut === 'ouvert' ? 'En cours' : 'Terminé';
  }
}
