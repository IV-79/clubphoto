import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, of, switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../../services/theme.service';
import { PhotoService } from '../../../services/photo.service';
import { SoumissionService } from '../../../services/soumission.service';
import { AuthService } from '../../../services/auth.service';
import { Photo } from '../../../models/photo.model';

@Component({
  selector: 'app-membre-soumettre',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './soumettre.html',
  styleUrl: './soumettre.css',
})
export class MembreSoumettre {
  private themeService = inject(ThemeService);
  private photoService = inject(PhotoService);
  private soumissionService = inject(SoumissionService);
  private authService = inject(AuthService);

  submitting = signal(false);

  private profile$ = this.authService.currentUserProfile$;
  profile = toSignal(this.profile$);
  themeOuvert = toSignal(this.themeService.getThemeOuvert());

  mesPhotos = toSignal(
    this.profile$.pipe(switchMap(p => p ? this.photoService.getMyPhotos(p.uid) : of([]))),
    { initialValue: [] as Photo[] }
  );

  maSoumission = toSignal(
    combineLatest([this.profile$, this.themeService.getThemeOuvert()]).pipe(
      switchMap(([profile, theme]) =>
        profile && theme ? this.soumissionService.getMaSoumission(profile.uid, theme.id) : of(null)
      )
    ),
    { initialValue: null }
  );

  async soumettre(photo: Photo) {
    const profile = this.profile();
    const theme = this.themeOuvert();
    if (!profile || !theme || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.soumissionService.soumettre({
        uid: profile.uid,
        themeId: theme.id,
        photoId: photo.id,
        photoUrl: photo.url,
        photoTitre: photo.titre,
        nomMembre: profile.nom,
      });
    } finally {
      this.submitting.set(false);
    }
  }

  async retirer() {
    const profile = this.profile();
    const theme = this.themeOuvert();
    if (!profile || !theme) return;
    await this.soumissionService.retirer(profile.uid, theme.id);
  }

  estSoumise(photo: Photo): boolean {
    return this.maSoumission()?.photoId === photo.id;
  }

  formatMois(moisAnnee: string): string {
    const [year, month] = moisAnnee.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }
}
