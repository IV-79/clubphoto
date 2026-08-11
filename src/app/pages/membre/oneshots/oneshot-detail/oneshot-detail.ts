import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, of, switchMap } from 'rxjs';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { NotificationService } from '../../../../services/notification.service';
import { LoginModalService } from '../../../../services/login-modal.service';
import {
  OneShot,
  OneShotInscription,
  OneShotPhoto,
  OneShotTheme,
  OneShotVote,
  OneShotStatut,
  ONESHOT_STATUT_LABELS,
} from '../../../../models/oneshot.model';
import { UserProfile } from '../../../../models/user.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../../models/commentaire.model';
import { PhotoLightbox } from '../../../../components/photo-lightbox/photo-lightbox';
import {
  VoteRankingComponent,
  RankingItem,
} from '../../../../components/vote-ranking/vote-ranking';
import { ImgRetryDirective } from '../../../../directives/img-retry.directive';
import { EventHero, HeroBadge } from '../../../../components/event-hero/event-hero';
import { DatePickerComponent } from '../../../../components/date-picker/date-picker';
import { compressImage, COMPRESS_COUVERTURE } from '../../../../utils/image-compress';

@Component({
  selector: 'app-oneshot-detail',
  imports: [
    RouterLink,
    FormsModule,
    PhotoLightbox,
    ImgRetryDirective,
    VoteRankingComponent,
    EventHero,
    DatePickerComponent,
  ],
  templateUrl: './oneshot-detail.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './oneshot-detail.css',
})
export class OneShotDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private notifService = inject(NotificationService);
  readonly loginModal = inject(LoginModalService);
  private elRef = inject(ElementRef);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  profile = toSignal(this.authService.currentUserProfile$);

  private refreshTick = signal(0);
  private refresh() {
    this.refreshTick.update((n) => n + 1);
  }

  private inscriptionsTrigger = computed(() => ({
    profile: this.profile(),
    tick: this.refreshTick(),
  }));
  private myVotesTrigger = computed(() => ({ profile: this.profile(), tick: this.refreshTick() }));

  event = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() => this.oneShotService.getOneShotOnce(this.id)),
    ),
    { initialValue: undefined as OneShot | undefined },
  );

  themes = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() => this.oneShotService.getThemesOnce(this.id)),
    ),
    { initialValue: [] as OneShotTheme[] },
  );

  photos = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() => this.oneShotService.getPhotosOnce(this.id)),
    ),
    { initialValue: [] as OneShotPhoto[] },
  );

  inscriptions = toSignal(
    toObservable(this.inscriptionsTrigger).pipe(
      switchMap(({ profile }) =>
        !profile
          ? of([] as OneShotInscription[])
          : this.oneShotService.getInscriptionsOnce(this.id),
      ),
    ),
    { initialValue: [] as OneShotInscription[] },
  );

  isLoggedIn = computed(() => !!this.profile());
  authReady = computed(() => this.profile() !== undefined);

  typeBadgeHero = computed((): HeroBadge => ({
    text: '🏆 OneShot',
    css: 'event-type-badge badge-oneshot-type',
  }));
  statusHero = computed((): HeroBadge => {
    const e = this.event();
    if (!e) return { text: '', css: 'hero-status' };
    const cssMap: Record<string, string> = {
      preparation: 'hero-status',
      inscription: 'hero-status status-avenir',
      fermeture_inscriptions: 'hero-status status-oneshot-fermee',
      vote: 'hero-status status-oneshot-vote',
      resultats: 'hero-status status-passee',
    };
    return { text: ONESHOT_STATUT_LABELS[e.statut], css: cssMap[e.statut] ?? 'hero-status' };
  });

  isCreator = computed(() => this.event()?.creatorUid === this.profile()?.uid);
  isAdmin = computed(() => this.profile()?.role === 'admin');
  canManage = computed(() => this.isCreator() || this.isAdmin());
  isInscrit = computed(() => this.inscriptions().some((i) => i.uid === this.profile()?.uid));
  viewAsAdmin = computed(() => this.isCreator() && !this.isInscrit());

  private allMembres$ = toObservable(this.canManage).pipe(
    switchMap((can) => (can ? this.authService.getAllMembersOnce() : of([] as UserProfile[]))),
  );
  allMembres = toSignal(this.allMembres$, { initialValue: [] as UserProfile[] });

  membresDisponibles = computed(() => {
    const inscritUids = new Set(this.inscriptions().map((i) => i.uid));
    return this.allMembres()
      .filter((m) => !inscritUids.has(m.uid) && !m.isSuspended)
      .sort((a, b) => `${a.prenom ?? ''} ${a.nom}`.localeCompare(`${b.prenom ?? ''} ${b.nom}`));
  });

  myVotes = toSignal(
    toObservable(this.myVotesTrigger).pipe(
      switchMap(({ profile }) =>
        !profile
          ? of([] as OneShotVote[])
          : this.oneShotService.getMyVotesOnce(this.id, profile.uid),
      ),
    ),
    { initialValue: [] as OneShotVote[] },
  );

  private allVotes$ = combineLatest([
    toObservable(this.profile),
    toObservable(this.event),
    toObservable(this.refreshTick),
  ]).pipe(
    switchMap(([profile, event]) => {
      if (!event) return of([] as OneShotVote[]);
      if (event.statut === 'resultats') return this.oneShotService.getAllVotesOnce(this.id);
      if (!profile) return of([] as OneShotVote[]);
      const canSeeVotes = event.creatorUid === profile.uid || profile.role === 'admin';
      return canSeeVotes ? this.oneShotService.getAllVotesOnce(this.id) : of([] as OneShotVote[]);
    }),
  );
  allVotes = toSignal(this.allVotes$, { initialValue: [] as OneShotVote[] });

  // ── Avancement ──────────────────────────────────────────────────────

  nextStatut = computed<OneShotStatut | null>(() => {
    switch (this.event()?.statut) {
      case 'preparation':
        return 'inscription';
      case 'inscription':
        return 'vote';
      case 'fermeture_inscriptions':
        return 'vote';
      case 'vote':
        return 'resultats';
      default:
        return null;
    }
  });

  nextStatutLabel = computed(() => {
    switch (this.event()?.statut) {
      case 'preparation':
        return 'Ouvrir les inscriptions';
      case 'inscription':
        return 'Passer directement au vote';
      case 'fermeture_inscriptions':
        return 'Ouvrir les votes';
      case 'vote':
        return 'Publier les résultats';
      default:
        return '';
    }
  });

  peutFermerInscriptions = computed(() => this.event()?.statut === 'inscription');

  transitioning = signal(false);
  confirmTransition = signal(false);

  async avancer() {
    const next = this.nextStatut();
    if (!next || this.transitioning()) return;
    this.transitioning.set(true);
    this.confirmTransition.set(false);
    try {
      const ev = this.event();
      await this.oneShotService.updateStatut(
        this.id,
        next,
        ev
          ? {
              titre: ev.titre,
              nomCreateur: ev.nomCreateur,
              creatorUid: ev.creatorUid,
            }
          : undefined,
      );
      this.refresh();
    } finally {
      this.transitioning.set(false);
    }
  }

  async fermerInscriptions() {
    if (this.transitioning()) return;
    this.transitioning.set(true);
    try {
      await this.oneShotService.updateStatut(this.id, 'fermeture_inscriptions');
      this.refresh();
    } finally {
      this.transitioning.set(false);
    }
  }

  statutLabel = computed(() => ONESHOT_STATUT_LABELS[this.event()?.statut ?? 'preparation']);
  inscriptionOuverte = computed(() => this.event()?.statut === 'inscription');
  canManageInscriptions = computed(() =>
    ['inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? ''),
  );

  hasUnassignedPhotos = computed(() => this.photos().some((p) => !p.membreUid || !p.themeId));

  dupeCount = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.photos()) {
      if (p.membreUid && p.themeId) {
        const key = `${p.membreUid}:${p.themeId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.values()].filter((n) => n > 1).length;
  });

  submissionProgress = computed(() => {
    const themes = this.themes();
    const inscrits = this.inscriptions();
    const photos = this.photos();
    if (!themes.length || !inscrits.length) return null;

    const total = themes.length * inscrits.length;
    const covered = new Set(
      photos.filter((p) => p.membreUid && p.themeId).map((p) => `${p.membreUid}:${p.themeId}`),
    ).size;

    const byTheme = themes.map((t) => ({
      theme: t,
      submitted: photos.filter((p) => p.themeId === t.id && p.membreUid).length,
    }));

    return {
      covered,
      total,
      pct: Math.round((covered / total) * 100),
      byTheme,
      nbMembers: inscrits.length,
    };
  });

  voteProgress = computed(() => {
    const themes = this.themes();
    const membres = this.allMembres().filter((m) => !m.isSuspended);
    const votes = this.allVotes();
    if (!themes.length || !membres.length) return null;

    const total = themes.length * membres.length;
    const cast = votes.length;

    const byTheme = themes.map((t) => ({
      theme: t,
      votes: votes.filter((v) => v.themeId === t.id).length,
    }));

    return {
      cast,
      total,
      pct: Math.round((cast / total) * 100),
      byTheme,
      nbMembers: membres.length,
    };
  });

  addingMembre = signal(false);
  selectedMembreUid = signal('');

  voteCountByPhoto = computed((): Record<string, number | undefined> => {
    const counts: Record<string, number> = {};
    for (const v of this.allVotes()) {
      counts[v.photoId] = (counts[v.photoId] ?? 0) + 1;
    }
    return counts;
  });

  voteCountByTheme = computed((): Record<string, number | undefined> => {
    const counts: Record<string, number> = {};
    for (const v of this.allVotes()) {
      counts[v.themeId] = (counts[v.themeId] ?? 0) + 1;
    }
    return counts;
  });

  myVoteByTheme = computed((): Record<string, string> =>
    Object.fromEntries(this.myVotes().map((v) => [v.themeId, v.photoId])),
  );

  themesVoted = computed(() => new Set(this.myVotes().map((v) => v.themeId)));

  photosByTheme = computed(() =>
    this.themes()
      .map((t) => ({ theme: t, photos: this.photos().filter((p) => p.themeId === t.id) }))
      .filter((g) => g.photos.length > 0),
  );

  resultsByTheme = computed(() =>
    this.themes()
      .map((t) => ({
        theme: t,
        photos: [...this.photos().filter((p) => p.themeId === t.id)].sort(
          (a, b) => (this.voteCountByPhoto()[b.id] ?? 0) - (this.voteCountByPhoto()[a.id] ?? 0),
        ),
      }))
      .filter((g) => g.photos.length > 0),
  );

  memberRankingByTheme = computed(() =>
    this.resultsByTheme().map((g) => ({
      theme: g.theme,
      voteCount: this.voteCountByTheme()[g.theme.id] ?? 0,
      items: g.photos.map((p) => ({
        id: p.id,
        url: p.url,
        authorName: p.nomMembre,
        votes: this.voteCountByPhoto()[p.id] ?? 0,
      })) as RankingItem[],
    })),
  );

  visitorRankingByTheme = computed(() =>
    this.resultsByTheme().map((g) => ({
      theme: g.theme,
      items: g.photos.map((p) => ({
        id: p.id,
        url: p.url,
        authorName: p.nomMembre,
        votes: this.voteCountByPhoto()[p.id] ?? 0,
      })) as RankingItem[],
    })),
  );

  onRankingClick(id: string): void {
    for (const g of this.resultsByTheme()) {
      const photo = g.photos.find((p) => p.id === id);
      if (photo) {
        this.openLightbox(photo);
        return;
      }
    }
  }

  lightboxIndex = signal<number | null>(null);

  lightboxPhotoList = computed(() => {
    if (this.event()?.statut === 'resultats') return this.resultsByTheme().flatMap((g) => g.photos);
    return this.photosByTheme().flatMap((g) => g.photos);
  });

  lightboxPhotos = computed((): LightboxPhoto[] => {
    const isVote = this.event()?.statut === 'vote';
    const uid = this.profile()?.uid;
    return this.lightboxPhotoList().map((p) => ({
      id: p.id,
      url: p.url,
      nomAuteur: isVote && !this.viewAsAdmin() && p.membreUid !== uid ? '' : p.nomMembre,
      uploaderUid: p.membreUid,
      likes: p.likes ?? [],
      uploadedAt: p.uploadedAt,
      exif: p.exif,
    }));
  });

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const oneShotId = this.id;
    const uid = this.profile()?.uid ?? '';
    return {
      toggleLike: (photoId, liked) =>
        this.oneShotService.toggleLikePhoto(oneShotId, photoId, uid, liked),
      getComments: (photoId) => this.oneShotService.getCommentaires(oneShotId, photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) =>
        this.oneShotService.addCommentaire(oneShotId, photoId, { texte, auteurUid, nomAuteur }),
      deleteComment: (photoId, commentId) =>
        this.oneShotService.deleteCommentaire(oneShotId, photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.oneShotService.toggleLikeCommentaire(oneShotId, photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.oneShotService.addReply(oneShotId, photoId, commentId, {
          texte,
          auteurUid,
          nomAuteur,
          createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.oneShotService.deleteReply(oneShotId, photoId, commentId, replyId, allReplies),
      canDeletePhoto: (photo) => this.isCreator() || photo.uploaderUid === uid,
      deletePhoto: async (photo) => {
        const p = this.photos().find((p) => p.id === photo.id)!;
        await this.oneShotService.deletePhoto(oneShotId, p);
        const actor = this.profile();
        if (actor && photo.uploaderUid && photo.uploaderUid !== actor.uid) {
          const role = this.isAdmin() ? "L'admin" : 'Le créateur';
          const titre = photo.titre ? ` « ${photo.titre} »` : '';
          this.notifService
            .sendToUser(
              photo.uploaderUid,
              'admin',
              `${role} ${this.userName()} a supprimé votre photo${titre} dans le OneShot « ${this.event()?.titre ?? ''} »`,
              { sourceNom: this.userName(), sourceUid: actor.uid },
            )
            .catch(() => {});
        }
        this.refresh();
      },
    };
  });

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  openLightbox(photo: OneShotPhoto, $event?: MouseEvent) {
    $event?.stopPropagation();
    const idx = this.lightboxPhotoList().findIndex((p) => p.id === photo.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  closeLightbox() {
    this.lightboxIndex.set(null);
  }

  async deleteOneShot() {
    const e = this.event();
    const ok = await this.confirmService.confirm(
      `Supprimer « ${e?.titre ?? 'ce OneShot'} » et toutes ses photos définitivement ?`,
    );
    if (!ok) return;
    await this.oneShotService.deleteOneShot(
      this.id,
      e
        ? {
            titre: e.titre,
            nomCreateur: e.nomCreateur,
            creatorUid: e.creatorUid,
            photoCouverturePath: e.photoCouverturePath,
          }
        : undefined,
    );
    this.router.navigate(['/galeries/sorties']);
  }

  voting = signal<string | null>(null);

  async castVote(themeId: string, photoId: string) {
    const profile = this.profile();
    if (!profile || this.voting()) return;
    const photo = this.photos().find((p) => p.id === photoId);
    if (photo?.membreUid === profile.uid) return;
    this.voting.set(themeId);
    if (this.myVoteByTheme()[themeId] === photoId) {
      await this.oneShotService.unvote(this.id, profile.uid, themeId);
    } else {
      await this.oneShotService.vote(this.id, profile.uid, themeId, photoId);
    }
    this.voting.set(null);
    this.refresh();
  }

  onFooterClick(event: Event, themeId: string, photo: OneShotPhoto) {
    const profile = this.profile();
    if (!profile || this.viewAsAdmin()) return;
    if (photo.membreUid === profile.uid) return;
    event.stopPropagation();
    if (this.voting()) return;
    this.castVote(themeId, photo.id);
  }

  async retirerInscrit(targetUid: string, targetNom: string) {
    const e = this.event();
    const p = this.profile();
    if (!e || !p) return;
    const ok = await this.confirmService.confirm(`Désinscrire ${targetNom} de ce OneShot ?`);
    if (!ok) return;
    await this.oneShotService.desinscrire(this.id, targetUid);
    if (targetUid !== p.uid) {
      this.notifService
        .sendToUser(
          targetUid,
          'oneshot',
          `${this.userName()} vous a désinscrit(e) du OneShot « ${e.titre} »`,
          { lien: `/galeries/oneshots/${this.id}`, sourceNom: this.userName(), sourceUid: p.uid },
        )
        .catch(() => {});
    }
    this.refresh();
  }

  async inscrireSelected() {
    const uid = this.selectedMembreUid();
    if (!uid) return;
    if (this.inscriptions().some((i) => i.uid === uid)) return;
    const e = this.event();
    const p = this.profile();
    if (!e || !p) return;
    const membre = this.allMembres().find((m) => m.uid === uid);
    if (!membre) return;
    const nom = `${membre.prenom ?? ''} ${membre.nom}`.trim();
    await this.oneShotService.inscrire(this.id, uid, nom);
    this.notifService
      .sendToUser(
        uid,
        'oneshot',
        `${this.userName()} vous a inscrit(e) au OneShot « ${e.titre} »`,
        { lien: `/galeries/oneshots/${this.id}`, sourceNom: this.userName(), sourceUid: p.uid },
      )
      .catch(() => {});
    this.selectedMembreUid.set('');
    this.addingMembre.set(false);
    this.refresh();
  }

  saving = signal(false);

  async inscrire() {
    const profile = this.profile();
    if (!profile || this.saving()) return;
    this.saving.set(true);
    try {
      await this.oneShotService.inscrire(
        this.id,
        profile.uid,
        `${profile.prenom ?? ''} ${profile.nom}`.trim(),
      );
      this.refresh();
    } finally {
      this.saving.set(false);
    }
  }

  async desinscrire() {
    const profile = this.profile();
    if (!profile || this.saving()) return;
    this.saving.set(true);
    try {
      await this.oneShotService.desinscrire(this.id, profile.uid);
      this.refresh();
    } finally {
      this.saving.set(false);
    }
  }

  // ── Édition inline ──────────────────────────────────────────────────

  editMode = signal(false);
  coverUploading = signal(false);
  coverDragOver = signal(false);

  titreValue = '';
  descriptionValue = '';
  dateValue = '';
  lieuValue = '';
  visibiliteValue: 'public' | 'membre' = 'public';

  peutEditerDetails = computed(() =>
    ['preparation', 'inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? ''),
  );

  startEdit() {
    const e = this.event();
    if (!e) return;
    this.titreValue = e.titre;
    this.descriptionValue = e.description ?? '';
    this.dateValue = e.date ?? '';
    this.lieuValue = e.lieu ?? '';
    this.visibiliteValue = e.visibilite ?? 'public';
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
  }

  async saveEvent() {
    if (this.saving()) return;
    if (!this.titreValue.trim()) {
      setTimeout(() => {
        const el = this.elRef.nativeElement.querySelector('.edit-input') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    this.saving.set(true);
    const e = this.event()!;
    try {
      await Promise.all([
        this.oneShotService.updateTitre(this.id, this.titreValue.trim()),
        this.oneShotService.updateDescription(this.id, this.descriptionValue),
        this.oneShotService.updateLieu(this.id, this.lieuValue.trim()),
        this.oneShotService.updateVisibilite(this.id, this.visibiliteValue),
        this.oneShotService.updateDate(this.id, this.dateValue, {
          oldDate: e.date ?? '',
          titre: e.titre,
          nomCreateur: e.nomCreateur,
          creatorUid: e.creatorUid,
        }),
      ]);
      this.editMode.set(false);
      this.refresh();
    } finally {
      this.saving.set(false);
    }
  }

  // Cover

  onCoverDrop(event: DragEvent) {
    event.preventDefault();
    this.coverDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.uploadCoverFile(file);
  }

  async onCoverSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (file) this.uploadCoverFile(file);
  }

  async removeCover() {
    const path = this.event()?.photoCouverturePath;
    if (!path) return;
    this.coverUploading.set(true);
    try {
      await this.oneShotService.removeCouverture(this.id, path);
      this.refresh();
    } finally {
      this.coverUploading.set(false);
    }
  }

  private async uploadCoverFile(file: File) {
    this.coverUploading.set(true);
    try {
      const compressed = await compressImage(file, COMPRESS_COUVERTURE);
      await this.oneShotService.setCouverture(this.id, compressed);
      this.refresh();
    } finally {
      this.coverUploading.set(false);
    }
  }

  // Thèmes (CRUD)

  newThemeNom = '';
  editingThemeId = signal<string | null>(null);
  editingThemeNom = '';
  savingTheme = signal(false);

  async addTheme() {
    const nom = this.newThemeNom.trim();
    if (!nom || this.savingTheme()) return;
    this.savingTheme.set(true);
    try {
      await this.oneShotService.addTheme(this.id, nom, this.themes().length);
      this.newThemeNom = '';
      this.refresh();
    } finally {
      this.savingTheme.set(false);
    }
  }

  startThemeEdit(theme: OneShotTheme) {
    this.editingThemeId.set(theme.id);
    this.editingThemeNom = theme.nom;
  }

  cancelThemeEdit() {
    this.editingThemeId.set(null);
  }

  async saveThemeEdit(themeId: string) {
    const nom = this.editingThemeNom.trim();
    if (!nom || this.savingTheme()) return;
    this.savingTheme.set(true);
    try {
      await this.oneShotService.updateTheme(this.id, themeId, nom);
      this.editingThemeId.set(null);
      this.refresh();
    } finally {
      this.savingTheme.set(false);
    }
  }

  async deleteTheme(theme: OneShotTheme) {
    const ok = await this.confirmService.confirm(
      `Supprimer le thème « ${theme.nom} » définitivement ?`,
    );
    if (!ok) return;
    await this.oneShotService.deleteTheme(this.id, theme.id);
    this.refresh();
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
