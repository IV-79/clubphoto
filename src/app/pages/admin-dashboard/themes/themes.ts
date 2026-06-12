import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeMensuel, computeThemeStatut, THEME_STATUT_LABELS } from '../../../models/theme.model';

@Component({
  selector: 'app-admin-themes',
  imports: [
    ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule,
  ],
  templateUrl: './themes.html',
  styleUrl: './themes.css',
})
export class AdminThemes {
  private themeService = inject(ThemeService);
  private authService  = inject(AuthService);

  showForm       = signal(false);
  saving         = signal(false);
  confirmDeleteId = signal<string | null>(null);

  profile = toSignal(this.authService.currentUserProfile$);
  themes  = toSignal(this.themeService.getThemes(), { initialValue: [] as ThemeMensuel[] });

  form = new FormGroup({
    titre:        new FormControl('', { validators: [Validators.required], nonNullable: true }),
    description:  new FormControl('', { nonNullable: true }),
    mois:         new FormControl('', { validators: [Validators.required], nonNullable: true }),
    dateOuverture: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    dateCloture:   new FormControl('', { validators: [Validators.required], nonNullable: true }),
    dateFinVote:   new FormControl('', { validators: [Validators.required], nonNullable: true }),
    maxPhotos:    new FormControl(1, { validators: [Validators.required, Validators.min(1)], nonNullable: true }),
    maxVotes:     new FormControl(3, { validators: [Validators.required, Validators.min(1)], nonNullable: true }),
  });

  onMoisChange() {
    const mois = this.form.controls.mois.value;
    if (!mois) return;
    const [year, month] = mois.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const nextDate = new Date(year, month, 15);
    const ny = nextDate.getFullYear();
    const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
    this.form.controls.dateOuverture.setValue(`${mois}-01`);
    this.form.controls.dateCloture.setValue(`${year}-${String(month).padStart(2, '0')}-${lastDay}`);
    this.form.controls.dateFinVote.setValue(`${ny}-${nm}-15`);
  }

  async creer() {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      await this.themeService.creerTheme({
        titre:         v.titre.trim(),
        description:   v.description.trim(),
        mois:          v.mois,
        dateOuverture: v.dateOuverture,
        dateCloture:   v.dateCloture,
        dateFinVote:   v.dateFinVote,
        maxPhotos:     Number(v.maxPhotos),
        maxVotes:      Number(v.maxVotes),
        createdBy:     this.profile()?.uid ?? '',
      });
      this.annuler();
    } finally {
      this.saving.set(false);
    }
  }

  annuler() {
    this.form.reset({ maxPhotos: 1, maxVotes: 3 });
    this.showForm.set(false);
  }

  async supprimer(id: string) {
    await this.themeService.supprimerTheme(id);
    this.confirmDeleteId.set(null);
  }

  statut(theme: ThemeMensuel) { return computeThemeStatut(theme); }
  statutLabel(theme: ThemeMensuel) { return THEME_STATUT_LABELS[computeThemeStatut(theme)]; }

  formatMois(mois: string): string {
    const [year, month] = mois.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }
}
