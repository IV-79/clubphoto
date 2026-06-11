import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ThemeService } from '../../../services/theme.service';
import { SoumissionService } from '../../../services/soumission.service';
import { Soumission } from '../../../models/soumission.model';

@Component({
  selector: 'app-theme-detail',
  imports: [RouterLink],
  templateUrl: './theme-detail.html',
  styleUrl: './theme-detail.css',
})
export class ThemeDetail {
  private route = inject(ActivatedRoute);
  private themeService = inject(ThemeService);
  private soumissionService = inject(SoumissionService);

  theme = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.themeService.getTheme(p.get('id')!))
    )
  );

  soumissions = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.soumissionService.getSoumissionsTheme(p.get('id')!))
    ),
    { initialValue: [] as Soumission[] }
  );

  formatMois(moisAnnee: string): string {
    const [year, month] = moisAnnee.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
}
