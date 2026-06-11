import { Component, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { ThemeService } from '../../../services/theme.service';
import { ThemeStatut } from '../../../models/theme.model';

@Component({
  selector: 'app-admin-themes',
  imports: [
    AsyncPipe, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDividerModule,
  ],
  templateUrl: './themes.html',
  styleUrl: './themes.css',
})
export class AdminThemes {
  private themeService = inject(ThemeService);

  showForm = signal(false);
  saving = signal(false);
  confirmDeleteId = signal<string | null>(null);

  themes$ = this.themeService.getThemes();

  form = new FormGroup({
    titre: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    moisAnnee: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });

  async creer() {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const { titre, moisAnnee, description } = this.form.getRawValue();
      await this.themeService.creerTheme({ titre: titre.trim(), moisAnnee, description: description.trim() });
      this.annuler();
    } finally {
      this.saving.set(false);
    }
  }

  annuler() {
    this.form.reset();
    this.showForm.set(false);
  }

  async ouvrir(id: string) {
    await this.themeService.ouvrirTheme(id);
  }

  async fermer(id: string) {
    await this.themeService.fermerTheme(id);
  }

  async supprimer(id: string) {
    await this.themeService.supprimerTheme(id);
    this.confirmDeleteId.set(null);
  }

  formatMois(moisAnnee: string): string {
    const [year, month] = moisAnnee.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  labelStatut(statut: ThemeStatut): string {
    const labels: Record<ThemeStatut, string> = { brouillon: 'Brouillon', ouvert: 'Ouvert', ferme: 'Fermé' };
    return labels[statut];
  }
}
