import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { LoginModalService } from '../../../services/login-modal.service';
import { ConfirmService } from '../../../services/confirm.service';
import { NotificationService } from '../../../services/notification.service';
import { compressImage, COMPRESS_THEME } from '../../../utils/image-compress';
import { readExifWithConsent } from '../../../utils/exif-reader';
import { GpsConsentService } from '../../../services/gps-consent.service';
import {
  ThemeMensuel,
  ThemeSoumission,
  ThemeVote,
  computeThemeStatut,
  getThemeDates,
  THEME_STATUT_LABELS,
} from '../../../models/theme.model';
import { UserProfile } from '../../../models/user.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { VoteRankingComponent, RankingItem } from '../../../components/vote-ranking/vote-ranking';
import { ImgRetryDirective } from '../../../directives/img-retry.directive';
import { of } from 'rxjs';

@Component({
  selector: 'app-theme-detail',
  imports: [RouterLink, PhotoLightbox, ImgRetryDirective, VoteRankingComponent],
  templateUrl: './theme-detail.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './theme-detail.css',
})
export class ThemeDetail {
  private route = inject(ActivatedRoute);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private notifService = inject(NotificationService);
  private gpsConsentService = inject(GpsConsentService);
  readonly loginModal = inject(LoginModalService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  profile = toSignal(this.authService.currentUserProfile$);

  private loaded = signal(false);

  // ── Data signals ────────────────────────────────────────────────
  theme = signal<ThemeMensuel | null>(null);
  soumissions = signal<ThemeSoumission[]>([]);
  mesVotes = signal<ThemeVote[]>([]);
  tousVotes = signal<ThemeVote[]>([]);

  constructor() {
    effect(() => {
      const p = this.profile();
      if (p === undefined) return;
      if (this.loaded()) return;
      untracked(() => {
        this.loaded.set(true);
        this.charger(p);
      });
    });
  }

  private async charger(profile: UserProfile | null) {
    const uid = profile?.uid ?? null;
    const t = await firstValueFrom(this.themeService.getThemeOnce(this.id));
    this.theme.set(t ?? null);
    if (!t) return;

    const s = computeThemeStatut(t);
    const loads: Promise<void>[] = [];

    loads.push(
      firstValueFrom(this.themeService.getSoumissionsOnce(this.id))
        .then((ss) => this.soumissions.set(ss))
        .catch(() => {}),
    );

    if (uid && (s === 'vote' || s === 'resultats')) {
      loads.push(
        firstValueFrom(this.themeService.getMesVotesOnce(this.id, uid))
          .then((mv) => this.mesVotes.set(mv))
          .catch(() => {}),
      );
    }

    if (s === 'resultats') {
      loads.push(
        firstValueFrom(this.themeService.getTousVotesOnce(this.id))
          .then((tv) => this.tousVotes.set(tv))
          .catch(() => {}),
      );
    }

    await Promise.all(loads);
  }

  statut = computed(() => {
    const t = this.theme();
    return t ? computeThemeStatut(t) : null;
  });

  authReady = computed(() => this.profile() !== undefined);
  isLoggedIn = computed(() => !!this.profile());
  isAdmin = computed(() => this.profile()?.role === 'admin');

  mesSoumissions = computed(() =>
    this.soumissions().filter((s) => s.membreUid === this.profile()?.uid),
  );

  peutSoumettre = computed(
    () =>
      this.statut() === 'ouvert' &&
      this.isLoggedIn() &&
      this.mesSoumissions().length < (this.theme()?.maxPhotos ?? 1),
  );

  mesVotesIds = computed(() => new Set(this.mesVotes().map((v) => v.soumissionId)));
  nbVotesRestants = computed(() => (this.theme()?.maxVotes ?? 3) - this.mesVotes().length);

  votesParSoumission = computed((): Record<string, number | undefined> => {
    const counts: Record<string, number | undefined> = {};
    for (const v of this.tousVotes()) {
      counts[v.soumissionId] = (counts[v.soumissionId] ?? 0) + 1;
    }
    return counts;
  });

  resultats = computed(() =>
    [...this.soumissions()].sort(
      (a, b) => (this.votesParSoumission()[b.id] ?? 0) - (this.votesParSoumission()[a.id] ?? 0),
    ),
  );

  allRankingItems = computed((): RankingItem[] =>
    this.resultats().map((s) => ({
      id: s.id,
      url: s.url,
      authorName: s.nomMembre,
      votes: this.votesParSoumission()[s.id] ?? 0,
    })),
  );

  onRankingClick(id: string): void {
    const soum = this.resultats().find((s) => s.id === id);
    if (soum) this.openLightbox(soum);
  }

  statutLabel(theme: ThemeMensuel): string {
    return THEME_STATUT_LABELS[computeThemeStatut(theme)];
  }

  // ── Lightbox ──────────────────────────────────────────────────
  lightboxIndex = signal<number | null>(null);

  lightboxSoumissions = computed(() =>
    this.statut() === 'resultats' ? this.resultats() : this.soumissions(),
  );

  lightboxPhotos = computed((): LightboxPhoto[] => {
    const showAuteur = this.statut() === 'resultats';
    const uid = this.profile()?.uid;
    return this.lightboxSoumissions().map((s) => ({
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
      toggleLike: async (soumId, liked) => {
        await this.themeService.toggleLikePhoto(themeId, soumId, uid, liked);
        this.soumissions.update((ss) =>
          ss.map((s) =>
            s.id === soumId
              ? {
                  ...s,
                  likes: liked
                    ? (s.likes ?? []).filter((l) => l !== uid)
                    : [...(s.likes ?? []), uid],
                }
              : s,
          ),
        );
      },
      getComments: (soumId) => this.themeService.getCommentaires(themeId, soumId),
      addComment: (soumId, texte, auteurUid, nomAuteur) =>
        this.themeService.addCommentaire(themeId, soumId, { texte, auteurUid, nomAuteur }),
      deleteComment: (soumId, commentId) =>
        this.themeService.deleteCommentaire(themeId, soumId, commentId),
      toggleCommentLike: (soumId, commentId, cUid, liked) =>
        this.themeService.toggleLikeCommentaire(themeId, soumId, commentId, cUid, liked),
      addReply: (soumId, commentId, texte, auteurUid, nomAuteur) =>
        this.themeService.addReply(themeId, soumId, commentId, {
          texte,
          auteurUid,
          nomAuteur,
          createdAt: new Date().toISOString(),
        }),
      deleteReply: (soumId, commentId, replyId, allReplies) =>
        this.themeService.deleteReply(themeId, soumId, commentId, replyId, allReplies),
      deletePhoto: async (lbPhoto) => {
        const soum = this.soumissions().find((s) => s.id === lbPhoto.id);
        if (!soum) return;
        await this.themeService.deleteSoumission(
          themeId,
          soum.id,
          soum.storagePath,
          soum.membreUid,
          soum.fileSize,
          soum.thumbnailPath,
        );
        this.soumissions.update((ss) => ss.filter((s) => s.id !== soum.id));
        const actor = this.profile();
        if (actor && soum.membreUid !== actor.uid) {
          const titre = lbPhoto.titre ? ` « ${lbPhoto.titre} »` : '';
          this.notifService
            .sendToUser(
              soum.membreUid,
              'admin',
              `L'admin ${this.userName()} a supprimé votre soumission${titre} au thème « ${this.theme()?.titre ?? ''} »`,
              { sourceNom: this.userName(), sourceUid: actor.uid },
            )
            .catch(() => {});
        }
      },
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
    const liked = this.isLiked(soum);
    await this.themeService.toggleLikePhoto(this.id, soum.id, uid, liked);
    this.soumissions.update((ss) =>
      ss.map((s) =>
        s.id === soum.id
          ? {
              ...s,
              likes: liked
                ? (s.likes ?? []).filter((l) => l !== uid)
                : [...(s.likes ?? []), uid],
            }
          : s,
      ),
    );
  }

  openLightbox(soum: ThemeSoumission, $event?: MouseEvent) {
    $event?.stopPropagation();
    const idx = this.lightboxSoumissions().findIndex((s) => s.id === soum.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  closeLightbox() {
    this.lightboxIndex.set(null);
  }

  // ── Upload ────────────────────────────────────────────────────
  uploading = signal(false);
  uploadProgress = signal(0);
  dragOver = signal(false);
  uploadError = signal('');

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
      const [exif, compressed] = await Promise.all([
        readExifWithConsent(file, this.gpsConsentService),
        compressImage(file, COMPRESS_THEME),
      ]);
      await this.themeService.uploadSoumission(
        this.id,
        profile.uid,
        `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        compressed,
        exif,
        (pct) => this.uploadProgress.set(pct),
      );
      this.uploadProgress.set(0);
      // background sync — uploadSoumission ne retourne pas la soumission créée
      firstValueFrom(this.themeService.getSoumissionsOnce(this.id))
        .then((ss) => this.soumissions.set(ss))
        .catch(() => {});
    } catch {
      this.uploadError.set("Erreur lors de l'envoi. Réessayez.");
    } finally {
      this.uploading.set(false);
    }
  }

  async supprimerSoumission(soum: ThemeSoumission) {
    const ok = await this.confirmService.confirm('Supprimer cette photo du thème définitivement ?');
    if (!ok) return;
    await this.themeService.deleteSoumission(
      this.id,
      soum.id,
      soum.storagePath,
      soum.membreUid,
      soum.fileSize,
      soum.thumbnailPath,
    );
    this.soumissions.update((ss) => ss.filter((s) => s.id !== soum.id));
  }

  // ── Vote ──────────────────────────────────────────────────────
  voting = signal(false);

  async toggleVote(soumissionId: string) {
    const profile = this.profile();
    if (!profile || this.voting()) return;
    this.voting.set(true);
    try {
      if (this.mesVotesIds().has(soumissionId)) {
        await this.themeService.deVoter(this.id, profile.uid, soumissionId);
        this.mesVotes.update((mv) => mv.filter((v) => v.soumissionId !== soumissionId));
      } else {
        if (this.nbVotesRestants() <= 0) return;
        await this.themeService.voter(this.id, profile.uid, soumissionId);
        this.mesVotes.update((mv) => [
          ...mv,
          { voterUid: profile.uid, soumissionId, votedAt: new Date().toISOString() },
        ]);
      }
    } finally {
      this.voting.set(false);
    }
  }

  dates(theme: ThemeMensuel) {
    return getThemeDates(theme);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  formatMois(mois: string): string {
    const [year, month] = mois.split('-');
    const label = new Date(+year, +month - 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
}
