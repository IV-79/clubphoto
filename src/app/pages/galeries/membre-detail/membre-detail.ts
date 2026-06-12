import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { PhotoService } from '../../../services/photo.service';
import { Photo, PHOTO_CATEGORIES } from '../../../models/photo.model';
import { UserProfile } from '../../../models/user.model';

@Component({
  selector: 'app-membre-detail',
  imports: [RouterLink],
  templateUrl: './membre-detail.html',
  styleUrl: './membre-detail.css',
})
export class MembreDetail {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private photoService = inject(PhotoService);

  private readonly categoriesMap = new Map(PHOTO_CATEGORIES.map(c => [c.value, c.label]));

  membre = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.authService.getMemberProfile(p.get('uid')!))
    )
  );

  photos = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.photoService.getPublicPhotos(p.get('uid')!))
    ),
    { initialValue: [] as Photo[] }
  );

  lightboxIndex = signal(-1);
  lightboxPhoto = computed(() => {
    const i = this.lightboxIndex();
    return i >= 0 ? this.photos()[i] : null;
  });

  nomComplet(): string {
    const m = this.membre();
    if (!m) return '';
    return m.prenom ? `${m.prenom} ${m.nom}` : m.nom;
  }

  initiales(): string {
    const m = this.membre();
    if (!m) return '?';
    return ((m.prenom?.[0] ?? '') + (m.nom?.[0] ?? '')).toUpperCase() || '?';
  }

  getCategorieLabel(val?: Photo['categorie']): string {
    return val ? (this.categoriesMap.get(val) ?? val) : '';
  }

  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(-1); }
  prevPhoto() { const i = this.lightboxIndex(); if (i > 0) this.lightboxIndex.set(i - 1); }
  nextPhoto() { const i = this.lightboxIndex(); if (i < this.photos().length - 1) this.lightboxIndex.set(i + 1); }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (this.lightboxIndex() < 0) return;
    if (e.key === 'Escape') this.closeLightbox();
    else if (e.key === 'ArrowLeft') this.prevPhoto();
    else if (e.key === 'ArrowRight') this.nextPhoto();
  }
}
