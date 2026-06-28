import { Component, inject, computed, signal, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { DefiService } from '../../../services/defi.service';
import { AuthService } from '../../../services/auth.service';
import { NotificationService } from '../../../services/notification.service';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { VoteRankingComponent, RankingItem } from '../../../components/vote-ranking/vote-ranking';
import { Defi, DefiPhoto, DefiPhotoResult, DefiStatut, DEFI_STATUT_LABELS, getDefiStatut } from '../../../models/defi.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { ImgRetryDirective } from '../../../directives/img-retry.directive';
import { EventHero, HeroBadge } from '../../../components/event-hero/event-hero';

@Component({
  selector: 'app-defi-detail',
  imports: [FormsModule, DatePickerComponent, PhotoLightbox, ImgRetryDirective, VoteRankingComponent, EventHero],
  templateUrl: './defi-detail.html',
  styleUrl: './defi-detail.css',
})
export class DefiDetail {
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private defiService  = inject(DefiService);
  private authService  = inject(AuthService);
  private notifService = inject(NotificationService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  profile = toSignal(this.authService.currentUserProfile$);

  private refreshTick = signal(0);
  private refresh() { this.refreshTick.update(n => n + 1); }

  private inscriptionsTrigger = computed(() => ({ profile: this.profile(), tick: this.refreshTick() }));
  private monVoteTrigger      = computed(() => ({ profile: this.profile(), tick: this.refreshTick() }));

  defi = toSignal(
    toObservable(this.refreshTick).pipe(switchMap(() => this.defiService.getDefiOnce(this.id))),
    { initialValue: null as Defi | null }
  );

  inscriptions = toSignal(
    toObservable(this.inscriptionsTrigger).pipe(
      switchMap(({ profile }) => !profile ? of([]) :
        this.defiService.getInscriptionsOnce(this.id)
      )
    ),
    { initialValue: [] }
  );

  photos = toSignal(
    toObservable(this.refreshTick).pipe(switchMap(() => this.defiService.getPhotosOnce(this.id))),
    { initialValue: [] }
  );

  votes = toSignal(
    toObservable(this.refreshTick).pipe(switchMap(() => this.defiService.getVotesOnce(this.id))),
    { initialValue: [] }
  );

  monVote = toSignal(
    toObservable(this.monVoteTrigger).pipe(
      switchMap(({ profile }) => !profile ? of(null) :
        this.defiService.getMonVoteOnce(this.id, profile.uid)
      )
    ),
    { initialValue: null }
  );

  statut            = computed((): DefiStatut => this.defi() ? getDefiStatut(this.defi()!) : 'a_venir');
  totalVotesDeposes = computed(() => this.votes().reduce((acc, v) => acc + v.photoIds.length, 0));

  typeBadgeHero = computed((): HeroBadge => ({ text: '🏅 Défi Photo', css: 'event-type-badge badge-defi-type' }));
  statusHero = computed((): HeroBadge => {
    const s = this.statut();
    const css: Record<string, string> = {
      a_venir:    'hero-status status-defi-avenir',
      soumission: 'hero-status status-defi-soumission',
      vote:       'hero-status status-defi-vote',
      resultats:  'hero-status status-passee',
    };
    return { text: DEFI_STATUT_LABELS[s], css: css[s] ?? 'hero-status' };
  });
  isAdmin    = computed(() => this.profile()?.role === 'admin');
  isOrg      = computed(() => !!this.profile() && this.defi()?.organisateurUid === this.profile()!.uid);
  canManage  = computed(() => this.isOrg() || this.isAdmin());
  isInscrit  = computed(() => {
    const uid = this.profile()?.uid;
    return uid ? this.inscriptions().some(i => i.uid === uid) : false;
  });
  userName = computed(() => {
    const p = this.profile();
    return p ? `${p.prenom ?? ''} ${p.nom}`.trim() : '';
  });

  // ── Lightbox ─────────────────────────────────────────────────────────
  lightboxIndex = signal<number | null>(null);

  private toLb = (p: DefiPhoto): LightboxPhoto => ({
    id: p.id, url: p.url, nomAuteur: p.membreNom,
    likes: [], uploadedAt: p.uploadedAt, exif: p.exif,
  });

  private votePhotosLb   = computed<LightboxPhoto[]>(() => this.photosVisibles().map(p => this.toLb(p)));
  private resultPhotosLb = computed<LightboxPhoto[]>(() => this.photosRanked().map(p => this.toLb(p)));
  lightboxPhotos         = computed<LightboxPhoto[]>(() =>
    this.statut() === 'vote' ? this.votePhotosLb() : this.resultPhotosLb()
  );

  readonly lightboxCallbacks: PhotoLightboxCallbacks = {
    toggleLike:        async () => {},
    getComments:       ()     => of([]),
    addComment:        async () => {},
    deleteComment:     async () => {},
    toggleCommentLike: async () => {},
    addReply:          async () => {},
    deleteReply:       async () => {},
  };

  openLightbox(photo: { id: string }): void {
    const idx = this.lightboxPhotos().findIndex(p => p.id === photo.id);
    if (idx !== -1) this.lightboxIndex.set(idx);
  }

  closeLightbox(): void { this.lightboxIndex.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeLightbox(); }

  mesPhotos = computed(() => {
    const uid = this.profile()?.uid;
    return uid ? this.photos().filter(p => p.membreUid === uid) : [];
  });

  uniqueSubmitters = computed(() => {
    const seen = new Set<string>();
    const result: { uid: string; nom: string }[] = [];
    for (const p of this.photos()) {
      if (!seen.has(p.membreUid)) {
        seen.add(p.membreUid);
        result.push({ uid: p.membreUid, nom: p.membreNom });
      }
    }
    return result;
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
    !!this.profile() &&
    this.mesPhotos().length < (this.defi()?.maxPhotos ?? 1) &&
    (!(this.defi()?.inscriptionObligatoire ?? true) || this.isInscrit())
  );

  photosRanked = computed((): DefiPhotoResult[] => {
    const counts = new Map<string, number>();
    for (const vote of this.votes()) {
      for (const photoId of vote.photoIds) {
        counts.set(photoId, (counts.get(photoId) ?? 0) + 1);
      }
    }
    const sorted = [...this.photos()]
      .map(p => ({ ...p, voteCount: counts.get(p.id) ?? 0, rank: 0 }))
      .sort((a, b) => b.voteCount - a.voteCount);
    let rank = 1;
    return sorted.map((p, i) => {
      if (i > 0 && p.voteCount < sorted[i - 1].voteCount) rank = i + 1;
      return { ...p, rank };
    });
  });

  rankingItems = computed((): RankingItem[] =>
    this.photosRanked().map(p => ({
      id: p.id,
      url: p.url,
      authorName: p.membreNom,
      votes: p.voteCount,
    }))
  );

  onRankingClick(id: string): void {
    const photo = this.photosRanked().find(p => p.id === id);
    if (photo) this.openLightbox(photo);
  }

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
    this.refresh();
  }

  async deletePhoto(photo: DefiPhoto) {
    await this.defiService.deletePhoto(this.id, photo);
    this.refresh();
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
    this.refresh();
  }

  // ── Inscription ───────────────────────────────────────────────────────

  inscribing = signal(false);

  async inscrire() {
    const profile = this.profile();
    if (!profile || this.inscribing()) return;
    this.inscribing.set(true);
    try { await this.defiService.inscrire(this.id, profile); this.refresh(); }
    finally { this.inscribing.set(false); }
  }

  async desinscrire() {
    const uid = this.profile()?.uid;
    if (!uid || !confirm('Se désinscrire ? Vos photos soumises seront supprimées.')) return;
    await this.defiService.desinscrire(this.id, uid);
    this.refresh();
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
  editInscriptionObligatoire = true;

  enterEdit() {
    const d = this.defi();
    if (!d) return;
    this.editTitre       = d.titre;
    this.editTheme       = d.theme;
    this.editDesc        = d.description;
    this.editDebut       = d.dateDebutSoumission;
    this.editFin         = d.dateFinSoumission;
    this.editVotes       = d.dateCloturVotes;
    this.editMaxPhotos              = d.maxPhotos;
    this.editMaxVotes               = d.maxVotes;
    this.editVisibilite             = d.visibilite;
    this.editInscriptionObligatoire = d.inscriptionObligatoire ?? true;
    this.editMode.set(true);
  }

  async saveEdit() {
    if (this.saving()) return;
    const d = this.defi()!;
    const finChanged   = this.editFin   !== d.dateFinSoumission;
    const votesChanged = this.editVotes !== d.dateCloturVotes;

    this.saving.set(true);
    try {
      await this.defiService.updateDefi(this.id, {
        titre:                  this.editTitre,
        theme:                  this.editTheme,
        description:            this.editDesc,
        dateDebutSoumission:    this.editDebut,
        dateFinSoumission:      this.editFin,
        dateCloturVotes:        this.editVotes,
        maxPhotos:              this.editMaxPhotos,
        maxVotes:               this.editMaxVotes,
        visibilite:             this.editVisibilite,
        inscriptionObligatoire: this.editInscriptionObligatoire,
      });

      if (finChanged || votesChanged) {
        const editorUid = this.profile()!.uid;
        const editorNom = this.userName();
        const lien      = `/galeries/defis/${this.id}`;
        const parts: string[] = [];
        if (finChanged)   parts.push(`fin de soumission le ${this.formatDate(this.editFin)}`);
        if (votesChanged) parts.push(`clôture des votes le ${this.formatDate(this.editVotes)}`);
        const msg = `🏅 Défi "${this.editTitre}" · Dates modifiées : ${parts.join(', ')}`;
        this.notifService.broadcast('defi', msg, { lien, sourceNom: editorNom, excludeUid: editorUid }).catch(() => {});
      }

      this.refresh();
      this.editMode.set(false);
    } finally { this.saving.set(false); }
  }

  async deleteDefi() {
    if (!confirm('Supprimer ce défi définitivement ? Toutes les photos seront perdues.')) return;
    await this.defiService.deleteDefi(this.id);
    this.router.navigate(['/galeries/sorties']);
  }

  // ── Cover (dans le formulaire d'édition) ─────────────────────────────

  pendingCover   = signal<File | null>(null);
  coverPreview   = signal<string | null>(null);
  uploadingCover = signal(false);

  onCoverSelected(event: Event) {
    const f = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (f) this.setCover(f);
  }

  clearCoverPreview() {
    const prev = this.coverPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.pendingCover.set(null);
    this.coverPreview.set(null);
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
      this.clearCoverPreview();
      this.refresh();
    } finally { this.uploadingCover.set(false); }
  }

  async removeCouverture() {
    const path = this.defi()?.photoCouverturePath;
    if (!path) return;
    await this.defiService.removeCouverture(this.id, path);
    this.refresh();
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  get today(): string { return new Date().toISOString().slice(0, 10); }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

}
