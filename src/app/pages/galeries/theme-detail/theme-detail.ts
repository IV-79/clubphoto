import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { compressToJpeg } from '../../../utils/image-compress';
import {
  ThemeMensuel, ThemeSoumission, ThemeVote,
  computeThemeStatut, THEME_STATUT_LABELS,
} from '../../../models/theme.model';

@Component({
  selector: 'app-theme-detail',
  imports: [RouterLink],
  templateUrl: './theme-detail.html',
  styleUrl: './theme-detail.css',
})
export class ThemeDetail {
  private route        = inject(ActivatedRoute);
  private themeService = inject(ThemeService);
  private authService  = inject(AuthService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  theme       = toSignal(this.themeService.getTheme(this.id));
  soumissions = toSignal(this.themeService.getSoumissions(this.id), { initialValue: [] as ThemeSoumission[] });
  profile     = toSignal(this.authService.currentUserProfile$);

  statut = computed(() => {
    const t = this.theme();
    return t ? computeThemeStatut(t) : null;
  });

  authReady  = computed(() => this.profile() !== undefined);
  isLoggedIn = computed(() => !!this.profile());

  mesSoumissions = computed(() =>
    this.soumissions().filter(s => s.membreUid === this.profile()?.uid)
  );

  peutSoumettre = computed(() =>
    this.statut() === 'ouvert' &&
    this.isLoggedIn() &&
    this.mesSoumissions().length < (this.theme()?.maxPhotos ?? 1)
  );

  // Mes votes
  private mesVotes$ = toObservable(this.profile).pipe(
    switchMap(p => p
      ? this.themeService.getMesVotes(this.id, p.uid)
      : of([] as ThemeVote[])
    )
  );
  mesVotes = toSignal(this.mesVotes$, { initialValue: [] as ThemeVote[] });

  mesVotesIds    = computed(() => new Set(this.mesVotes().map(v => v.soumissionId)));
  nbVotesRestants = computed(() => (this.theme()?.maxVotes ?? 3) - this.mesVotes().length);

  // Tous les votes (résultats uniquement)
  private tousVotes$ = toObservable(this.statut).pipe(
    switchMap(s => s === 'resultats'
      ? this.themeService.getTousVotes(this.id)
      : of([] as ThemeVote[])
    )
  );
  tousVotes = toSignal(this.tousVotes$, { initialValue: [] as ThemeVote[] });

  votesParSoumission = computed((): Record<string, number | undefined> => {
    const counts: Record<string, number | undefined> = {};
    for (const v of this.tousVotes()) {
      counts[v.soumissionId] = (counts[v.soumissionId] ?? 0) + 1;
    }
    return counts;
  });

  resultats = computed(() =>
    [...this.soumissions()].sort((a, b) =>
      (this.votesParSoumission()[b.id] ?? 0) - (this.votesParSoumission()[a.id] ?? 0)
    )
  );

  computeRank(soumissions: ThemeSoumission[], index: number): number {
    const currentVotes = this.votesParSoumission()[soumissions[index].id] ?? 0;
    return soumissions.filter(s => (this.votesParSoumission()[s.id] ?? 0) > currentVotes).length + 1;
  }

  statutLabel(theme: ThemeMensuel): string {
    return THEME_STATUT_LABELS[computeThemeStatut(theme)];
  }

  // Lightbox
  lightboxIndex = signal(-1);

  lightboxPhotos = computed(() =>
    this.statut() === 'resultats' ? this.resultats() : this.soumissions()
  );

  lightboxPhoto = computed(() => {
    const i = this.lightboxIndex(), photos = this.lightboxPhotos();
    return i >= 0 && i < photos.length ? photos[i] : null;
  });

  openLightbox(soum: ThemeSoumission, $event?: MouseEvent) {
    $event?.stopPropagation();
    const idx = this.lightboxPhotos().findIndex(s => s.id === soum.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  closeLightbox() { this.lightboxIndex.set(-1); }
  prevPhoto() { const i = this.lightboxIndex(); if (i > 0) this.lightboxIndex.set(i - 1); }
  nextPhoto() {
    const i = this.lightboxIndex();
    if (i < this.lightboxPhotos().length - 1) this.lightboxIndex.set(i + 1);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (this.lightboxIndex() < 0) return;
    if (e.key === 'Escape') this.closeLightbox();
    else if (e.key === 'ArrowLeft') this.prevPhoto();
    else if (e.key === 'ArrowRight') this.nextPhoto();
  }

  // Upload
  uploading     = signal(false);
  uploadProgress = signal(0);
  dragOver      = signal(false);
  uploadError   = signal('');

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      await this.upload(file);
      (event.target as HTMLInputElement).value = '';
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.upload(file);
  }

  async upload(file: File) {
    const profile = this.profile();
    if (!profile || !this.peutSoumettre()) return;
    if (!file.type.startsWith('image/')) {
      this.uploadError.set('Format non valide (JPEG, PNG attendu).');
      return;
    }
    this.uploading.set(true);
    this.uploadError.set('');
    try {
      const compressed = await compressToJpeg(file);
      await this.themeService.uploadSoumission(
        this.id,
        profile.uid,
        `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        compressed,
        pct => this.uploadProgress.set(pct)
      );
      this.uploadProgress.set(0);
    } catch {
      this.uploadError.set('Erreur lors de l\'envoi. Réessayez.');
    } finally {
      this.uploading.set(false);
    }
  }

  async supprimerMaSoumission(soum: ThemeSoumission) {
    await this.themeService.deleteSoumission(this.id, soum.id, soum.storagePath);
  }

  // Vote
  voting = signal(false);

  async toggleVote(soumissionId: string) {
    const profile = this.profile();
    if (!profile || this.voting()) return;
    this.voting.set(true);
    try {
      if (this.mesVotesIds().has(soumissionId)) {
        await this.themeService.deVoter(this.id, profile.uid, soumissionId);
      } else {
        if (this.nbVotesRestants() <= 0) return;
        await this.themeService.voter(this.id, profile.uid, soumissionId);
      }
    } finally {
      this.voting.set(false);
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  formatMois(mois: string): string {
    const [year, month] = mois.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
}
