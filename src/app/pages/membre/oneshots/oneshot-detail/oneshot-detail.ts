import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, of, switchMap } from 'rxjs';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { LoginModalService } from '../../../../services/login-modal.service';
import {
  OneShotInscription, OneShotPhoto, OneShotTheme, OneShotVote,
  ONESHOT_STATUT_LABELS
} from '../../../../models/oneshot.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../../models/commentaire.model';
import { PhotoLightbox } from '../../../../components/photo-lightbox/photo-lightbox';

@Component({
  selector: 'app-oneshot-detail',
  imports: [RouterLink, PhotoLightbox],
  templateUrl: './oneshot-detail.html',
  styleUrl: './oneshot-detail.css',
})
export class OneShotDetail {
  private route = inject(ActivatedRoute);
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);
  readonly loginModal = inject(LoginModalService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  event   = toSignal(this.oneShotService.getOneShot(this.id));
  themes  = toSignal(this.oneShotService.getThemes(this.id),  { initialValue: [] as OneShotTheme[] });
  photos  = toSignal(this.oneShotService.getPhotos(this.id),  { initialValue: [] as OneShotPhoto[] });
  profile = toSignal(this.authService.currentUserProfile$);

  isLoggedIn = computed(() => !!this.profile());
  authReady  = computed(() => this.profile() !== undefined);

  private inscriptions$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.oneShotService.getInscriptions(this.id) : of([] as OneShotInscription[]))
  );
  inscriptions = toSignal(this.inscriptions$, { initialValue: [] as OneShotInscription[] });

  isCreator          = computed(() => this.event()?.creatorUid === this.profile()?.uid);
  isInscrit          = computed(() => this.inscriptions().some(i => i.uid === this.profile()?.uid));
  statutLabel        = computed(() => ONESHOT_STATUT_LABELS[this.event()?.statut ?? 'preparation']);
  inscriptionOuverte = computed(() => this.event()?.statut === 'inscription');

  // Photos groupées par thème (uniquement les thèmes qui ont des photos)
  photosByTheme = computed(() =>
    this.themes()
      .map(t => ({ theme: t, photos: this.photos().filter(p => p.themeId === t.id) }))
      .filter(g => g.photos.length > 0)
  );

  // Mes votes (réactif sur le profil)
  private myVotes$ = this.authService.currentUserProfile$.pipe(
    switchMap(p => p
      ? this.oneShotService.getMyVotes(this.id, p.uid)
      : of([] as OneShotVote[])
    )
  );
  myVotes = toSignal(this.myVotes$, { initialValue: [] as OneShotVote[] });

  myVoteByTheme = computed((): Record<string, string> =>
    Object.fromEntries(this.myVotes().map(v => [v.themeId, v.photoId]))
  );

  // Tous les votes — public en resultats, créateur pendant vote, sinon vide
  private allVotes$ = combineLatest([
    this.authService.currentUserProfile$,
    toObservable(this.event),
  ]).pipe(
    switchMap(([profile, event]) => {
      if (!event) return of([] as OneShotVote[]);
      if (event.statut === 'resultats') return this.oneShotService.getAllVotes(this.id);
      if (!profile) return of([] as OneShotVote[]);
      return event.creatorUid === profile.uid ? this.oneShotService.getAllVotes(this.id) : of([] as OneShotVote[]);
    })
  );
  allVotes = toSignal(this.allVotes$, { initialValue: [] as OneShotVote[] });

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

  themesVoted = computed(() =>
    new Set(this.myVotes().map(v => v.themeId))
  );

  // Résultats : photos triées par votes décroissants par thème
  resultsByTheme = computed(() =>
    this.themes()
      .map(t => ({
        theme: t,
        photos: [...this.photos().filter(p => p.themeId === t.id)]
          .sort((a, b) => (this.voteCountByPhoto()[b.id] ?? 0) - (this.voteCountByPhoto()[a.id] ?? 0)),
      }))
      .filter(g => g.photos.length > 0)
  );

  top3ResultsByTheme = computed(() =>
    this.resultsByTheme().map(g => ({ ...g, photos: g.photos.slice(0, 3) }))
  );

  // Lightbox
  lightboxIndex = signal<number | null>(null);

  lightboxPhotoList = computed(() => {
    const statut = this.event()?.statut;
    if (statut === 'resultats') {
      const groups = this.isLoggedIn() ? this.resultsByTheme() : this.top3ResultsByTheme();
      return groups.flatMap(g => g.photos);
    }
    return this.photosByTheme().flatMap(g => g.photos);
  });

  lightboxPhotos = computed((): LightboxPhoto[] => {
    const isVote = this.event()?.statut === 'vote';
    const uid = this.profile()?.uid;
    return this.lightboxPhotoList().map(p => ({
      id: p.id,
      url: p.url,
      nomAuteur: isVote && !this.isCreator() && p.membreUid !== uid ? '' : p.nomMembre,
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
      getComments: (photoId) =>
        this.oneShotService.getCommentaires(oneShotId, photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) =>
        this.oneShotService.addCommentaire(oneShotId, photoId, { texte, auteurUid, nomAuteur }),
      deleteComment: (photoId, commentId) =>
        this.oneShotService.deleteCommentaire(oneShotId, photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.oneShotService.toggleLikeCommentaire(oneShotId, photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.oneShotService.addReply(oneShotId, photoId, commentId, {
          texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.oneShotService.deleteReply(oneShotId, photoId, commentId, replyId, allReplies),
      canDeletePhoto: (photo) =>
        this.isCreator() || photo.uploaderUid === uid,
      deletePhoto: (photo) => {
        const p = this.photos().find(p => p.id === photo.id)!;
        return this.oneShotService.deletePhoto(oneShotId, p);
      },
    };
  });

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  isLiked(photo: OneShotPhoto): boolean {
    const uid = this.profile()?.uid;
    return !!uid && (photo.likes ?? []).includes(uid);
  }

  async toggleLike(photo: OneShotPhoto, event: Event) {
    event.stopPropagation();
    const uid = this.profile()?.uid;
    if (!uid) return;
    await this.oneShotService.toggleLikePhoto(this.id, photo.id, uid, this.isLiked(photo));
  }

  openLightbox(photo: OneShotPhoto, $event?: MouseEvent) {
    $event?.stopPropagation();
    const idx = this.lightboxPhotoList().findIndex(p => p.id === photo.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  closeLightbox() { this.lightboxIndex.set(null); }

  computeRank(photos: OneShotPhoto[], index: number): number {
    const currentVotes = this.voteCountByPhoto()[photos[index].id] ?? 0;
    return photos.filter(p => (this.voteCountByPhoto()[p.id] ?? 0) > currentVotes).length + 1;
  }

  // Vote
  voting = signal<string | null>(null);

  async castVote(themeId: string, photoId: string) {
    const profile = this.profile();
    if (!profile || this.voting()) return;
    if (this.myVoteByTheme()[themeId] === photoId) return;
    const photo = this.photos().find(p => p.id === photoId);
    if (photo?.membreUid === profile.uid) return;
    this.voting.set(themeId);
    await this.oneShotService.vote(this.id, profile.uid, themeId, photoId);
    this.voting.set(null);
  }

  // Inscription
  saving = signal(false);

  async inscrire() {
    const profile = this.profile();
    if (!profile || this.saving()) return;
    this.saving.set(true);
    await this.oneShotService.inscrire(this.id, profile.uid, `${profile.prenom ?? ''} ${profile.nom}`.trim());
    this.saving.set(false);
  }

  async desinscrire() {
    const profile = this.profile();
    if (!profile || this.saving()) return;
    this.saving.set(true);
    await this.oneShotService.desinscrire(this.id, profile.uid);
    this.saving.set(false);
  }
}
