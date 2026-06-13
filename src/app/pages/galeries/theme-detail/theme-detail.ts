import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { compressToJpeg } from '../../../utils/image-compress';
import { readExif } from '../../../utils/exif-reader';
import {
  ThemeMensuel, ThemeSoumission, ThemeVote,
  computeThemeStatut, THEME_STATUT_LABELS,
} from '../../../models/theme.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';

@Component({
  selector: 'app-theme-detail',
  imports: [RouterLink, PhotoLightbox],
  templateUrl: './theme-detail.html',
  styleUrl: './theme-detail.css',
})
export class ThemeDetail {
  private route          = inject(ActivatedRoute);
  private themeService   = inject(ThemeService);
  private authService    = inject(AuthService);
  private confirmService = inject(ConfirmService);

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
  isAdmin    = computed(() => this.profile()?.role === 'admin');

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

  mesVotesIds     = computed(() => new Set(this.mesVotes().map(v => v.soumissionId)));
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
  lightboxIndex = signal<number | null>(null);

  lightboxSoumissions = computed(() =>
    this.statut() === 'resultats' ? this.resultats() : this.soumissions()
  );

  lightboxPhotos = computed((): LightboxPhoto[] => {
    const showAuteur = this.statut() === 'resultats';
    const uid = this.profile()?.uid;
    return this.lightboxSoumissions().map(s => ({
      id: s.id,
      url: s.url,
      nomAuteur: showAuteur || s.membreUid === uid ? s.nomMembre : '',
      uploaderUid: s.membreUid,
      likes: s.likes ?? [],
      uploadedAt: s.uploadedAt,
      exif: s.exif,
    }));
  });

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const themeId = this.id;
    const uid = this.profile()?.uid ?? '';
    return {
      toggleLike: (soumId, liked) =>
        this.themeService.toggleLikePhoto(themeId, soumId, uid, liked),
      getComments: (soumId) =>
        this.themeService.getCommentaires(themeId, soumId),
      addComment: (soumId, texte, auteurUid, nomAuteur) =>
        this.themeService.addCommentaire(themeId, soumId, { texte, auteurUid, nomAuteur }),
      deleteComment: (soumId, commentId) =>
        this.themeService.deleteCommentaire(themeId, soumId, commentId),
      toggleCommentLike: (soumId, commentId, cUid, liked) =>
        this.themeService.toggleLikeCommentaire(themeId, soumId, commentId, cUid, liked),
      addReply: (soumId, commentId, texte, auteurUid, nomAuteur) =>
        this.themeService.addReply(themeId, soumId, commentId, {
          texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
        }),
      deleteReply: (soumId, commentId, replyId, allReplies) =>
        this.themeService.deleteReply(themeId, soumId, commentId, replyId, allReplies),
    };
  });

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  isLiked(soum: ThemeSoumission): boolean {
    const uid = this.profile()?.uid;
    return !!uid && (soum.likes ?? []).includes(uid);
  }

  async toggleLike(soum: ThemeSoumission, event: Event) {
    event.stopPropagation();
    const uid = this.profile()?.uid;
    if (!uid) return;
    await this.themeService.toggleLikePhoto(this.id, soum.id, uid, this.isLiked(soum));
  }

  openLightbox(soum: ThemeSoumission, $event?: MouseEvent) {
    $event?.stopPropagation();
    const idx = this.lightboxSoumissions().findIndex(s => s.id === soum.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  closeLightbox() { this.lightboxIndex.set(null); }

  // Upload
  uploading      = signal(false);
  uploadProgress = signal(0);
  dragOver       = signal(false);
  uploadError    = signal('');

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
      const [exif, compressed] = await Promise.all([readExif(file), compressToJpeg(file)]);
      await this.themeService.uploadSoumission(
        this.id,
        profile.uid,
        `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        compressed,
        exif,
        pct => this.uploadProgress.set(pct)
      );
      this.uploadProgress.set(0);
    } catch {
      this.uploadError.set('Erreur lors de l\'envoi. Réessayez.');
    } finally {
      this.uploading.set(false);
    }
  }

  async supprimerSoumission(soum: ThemeSoumission) {
    const ok = await this.confirmService.confirm('Supprimer cette photo du thème définitivement ?');
    if (!ok) return;
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
