import { Component, inject, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { DefiService } from '../../../services/defi.service';
import { AuthService } from '../../../services/auth.service';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { Defi, DefiPhoto, DefiPhotoResult, DefiStatut, DEFI_STATUT_LABELS, getDefiStatut } from '../../../models/defi.model';
import { ImgRetryDirective } from '../../../directives/img-retry.directive';

@Component({
  selector: 'app-defi-detail',
  imports: [RouterLink, FormsModule, DatePickerComponent, ImgRetryDirective],
  templateUrl: './defi-detail.html',
  styleUrl: './defi-detail.css',
})
export class DefiDetail {
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private defiService = inject(DefiService);
  private authService = inject(AuthService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  profile = toSignal(this.authService.currentUserProfile$);

  defi         = toSignal(this.defiService.getDefi(this.id),           { initialValue: null as Defi | null });
  inscriptions = toSignal(
    toObservable(this.profile).pipe(
      switchMap(p => p ? this.defiService.getInscriptions(this.id) : of([]))
    ),
    { initialValue: [] }
  );
  photos = toSignal(this.defiService.getPhotos(this.id), { initialValue: [] });
  votes  = toSignal(this.defiService.getVotes(this.id),  { initialValue: [] });

  monVote = toSignal(
    toObservable(this.profile).pipe(
      switchMap(p => p ? this.defiService.getMonVote(this.id, p.uid) : of(null))
    ),
    { initialValue: null }
  );

  statut     = computed((): DefiStatut => this.defi() ? getDefiStatut(this.defi()!) : 'a_venir');
  isAdmin    = computed(() => this.profile()?.role === 'admin');
  isOrg      = computed(() => !!this.profile() && this.defi()?.organisateurUid === this.profile()!.uid);
  canManage  = computed(() => this.isOrg() || this.isAdmin());
  isInscrit  = computed(() => {
    const uid = this.profile()?.uid;
    return uid ? this.inscriptions().some(i => i.uid === uid) : false;
  });
  canParticiper = computed(() => this.isInscrit() || this.canManage());

  mesPhotos = computed(() => {
    const uid = this.profile()?.uid;
    return uid ? this.photos().filter(p => p.membreUid === uid) : [];
  });

  photosVisibles = computed((): DefiPhoto[] => {
    const s = this.statut();
    const uid = this.profile()?.uid;
    const photos = this.photos();
    if (s === 'a_venir') return [];
    if (s === 'soumission') {
      if (!uid) return [];
      return photos.filter(p => p.membreUid === uid);
    }
    return photos;
  });

  mesVotesIds   = computed(() => this.monVote()?.photoIds ?? []);
  votesRestants = computed(() => (this.defi()?.maxVotes ?? 0) - this.mesVotesIds().length);

  canUpload = computed(() =>
    this.statut() === 'soumission' &&
    this.isInscrit() &&
    this.mesPhotos().length < (this.defi()?.maxPhotos ?? 1)
  );

  photosRanked = computed((): DefiPhotoResult[] => {
    const counts = new Map<string, number>();
    for (const vote of this.votes()) {
      for (const photoId of vote.photoIds) {
        counts.set(photoId, (counts.get(photoId) ?? 0) + 1);
      }
    }
    return [...this.photos()]
      .map(p => ({ ...p, voteCount: counts.get(p.id) ?? 0, rank: 0 }))
      .sort((a, b) => b.voteCount - a.voteCount)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  });

  // ── Upload ────────────────────────────────────────────────────────────

  uploadProgress  = signal<number | null>(null);
  uploadCurrent   = signal(0);
  uploadBatchSize = signal(0);
  uploadError     = signal<string | null>(null);
  photoDragOver   = signal(false);

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    input.value = '';
    if (files.length) this.doUploadMultiple(files);
  }

  onPhotoDrop(event: DragEvent) {
    event.preventDefault();
    this.photoDragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length) this.doUploadMultiple(files);
  }

  private async doUploadMultiple(files: File[]): Promise<void> {
    const profile = this.profile();
    if (!profile) return;

    const maxPhotos = this.defi()?.maxPhotos ?? 1;
    const remaining = maxPhotos - this.mesPhotos().length;
    if (remaining <= 0) return;

    const toUpload = files.slice(0, remaining);
    const skipped  = files.length - toUpload.length;

    this.uploadError.set(
      skipped > 0 ? `${skipped} photo(s) ignorée(s) : limite de ${maxPhotos} par participant atteinte.` : null
    );
    this.uploadCurrent.set(0);
    this.uploadBatchSize.set(toUpload.length);

    for (let i = 0; i < toUpload.length; i++) {
      this.uploadCurrent.set(i + 1);
      this.uploadProgress.set(0);
      try {
        await new Promise<void>((resolve, reject) => {
          this.defiService.uploadPhoto(this.id, toUpload[i], profile).subscribe({
            next: state => { if (!state.done) this.uploadProgress.set(state.progress); },
            complete: resolve,
            error: reject,
          });
        });
      } catch {
        this.uploadError.set('Erreur lors de l\'upload.');
        break;
      }
    }

    this.uploadProgress.set(null);
    this.uploadCurrent.set(0);
    this.uploadBatchSize.set(0);
  }

  async deletePhoto(photo: DefiPhoto) {
    await this.defiService.deletePhoto(this.id, photo);
  }

  // ── Votes ─────────────────────────────────────────────────────────────

  async toggleVote(photoId: string) {
    const uid = this.profile()?.uid;
    if (!uid) return;
    if (this.mesVotesIds().includes(photoId)) {
      await this.defiService.desvote(this.id, uid, photoId);
    } else {
      if (this.votesRestants() <= 0) return;
      await this.defiService.voter(this.id, uid, photoId);
    }
  }

  // ── Inscription ───────────────────────────────────────────────────────

  inscribing = signal(false);

  async inscrire() {
    const profile = this.profile();
    if (!profile || this.inscribing()) return;
    this.inscribing.set(true);
    try { await this.defiService.inscrire(this.id, profile); }
    finally { this.inscribing.set(false); }
  }

  async desinscrire() {
    const uid = this.profile()?.uid;
    if (!uid || !confirm('Se désinscrire ? Vos photos soumises seront supprimées.')) return;
    await this.defiService.desinscrire(this.id, uid);
  }

  // ── Edit mode ─────────────────────────────────────────────────────────

  editMode    = signal(false);
  saving      = signal(false);
  editTitre   = '';
  editTheme   = '';
  editDesc    = '';
  editDebut   = '';
  editFin     = '';
  editVotes   = '';
  editMaxPhotos = 2;
  editMaxVotes  = 3;
  editVisibilite: 'public' | 'membre' = 'public';

  enterEdit() {
    const d = this.defi();
    if (!d) return;
    this.editTitre       = d.titre;
    this.editTheme       = d.theme;
    this.editDesc        = d.description;
    this.editDebut       = d.dateDebutSoumission;
    this.editFin         = d.dateFinSoumission;
    this.editVotes       = d.dateCloturVotes;
    this.editMaxPhotos   = d.maxPhotos;
    this.editMaxVotes    = d.maxVotes;
    this.editVisibilite  = d.visibilite;
    this.editMode.set(true);
  }

  async saveEdit() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.defiService.updateDefi(this.id, {
        titre: this.editTitre,
        theme: this.editTheme,
        description: this.editDesc,
        dateDebutSoumission: this.editDebut,
        dateFinSoumission:   this.editFin,
        dateCloturVotes:     this.editVotes,
        maxPhotos:           this.editMaxPhotos,
        maxVotes:            this.editMaxVotes,
        visibilite:          this.editVisibilite,
      });
      this.editMode.set(false);
    } finally { this.saving.set(false); }
  }

  async deleteDefi() {
    if (!confirm('Supprimer ce défi définitivement ? Toutes les photos seront perdues.')) return;
    await this.defiService.deleteDefi(this.id);
    this.router.navigate(['/galeries/sorties']);
  }

  // ── Extension votes ───────────────────────────────────────────────────

  extensionDate   = '';
  extendingVotes  = signal(false);

  async extendVotes() {
    if (!this.extensionDate || this.extendingVotes()) return;
    this.extendingVotes.set(true);
    try {
      await this.defiService.extendVotes(this.id, this.extensionDate);
      this.extensionDate = '';
    } finally { this.extendingVotes.set(false); }
  }

  // ── Cover ─────────────────────────────────────────────────────────────

  pendingCover   = signal<File | null>(null);
  coverPreview   = signal<string | null>(null);
  coverDragOver  = signal(false);
  uploadingCover = signal(false);

  onCoverDrop(event: DragEvent) {
    event.preventDefault();
    this.coverDragOver.set(false);
    const f = event.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) this.setCover(f);
  }

  onCoverSelected(event: Event) {
    const f = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (f) this.setCover(f);
  }

  private setCover(file: File) {
    const prev = this.coverPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.pendingCover.set(file);
    this.coverPreview.set(URL.createObjectURL(file));
  }

  async uploadCover() {
    const file = this.pendingCover();
    if (!file || this.uploadingCover()) return;
    this.uploadingCover.set(true);
    try {
      await this.defiService.setCouverture(this.id, file);
      URL.revokeObjectURL(this.coverPreview()!);
      this.pendingCover.set(null);
      this.coverPreview.set(null);
    } finally { this.uploadingCover.set(false); }
  }

  async removeCouverture() {
    const path = this.defi()?.photoCouverturePath;
    if (!path) return;
    await this.defiService.removeCouverture(this.id, path);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  get today(): string { return new Date().toISOString().slice(0, 10); }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  statutLabel(s: DefiStatut): string { return DEFI_STATUT_LABELS[s]; }

  statutClass(s: DefiStatut): string {
    return { a_venir: 'badge-avenir', soumission: 'badge-soumission', vote: 'badge-vote', resultats: 'badge-resultats' }[s];
  }
}
