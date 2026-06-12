import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, of, switchMap } from 'rxjs';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import {
  OneShotInscription, OneShotPhoto, OneShotTheme, OneShotVote,
  ONESHOT_STATUT_LABELS
} from '../../../../models/oneshot.model';

@Component({
  selector: 'app-oneshot-detail',
  imports: [RouterLink],
  templateUrl: './oneshot-detail.html',
  styleUrl: './oneshot-detail.css',
})
export class OneShotDetail {
  private route = inject(ActivatedRoute);
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  event        = toSignal(this.oneShotService.getOneShot(this.id));
  themes       = toSignal(this.oneShotService.getThemes(this.id),       { initialValue: [] as OneShotTheme[] });
  photos       = toSignal(this.oneShotService.getPhotos(this.id),       { initialValue: [] as OneShotPhoto[] });
  inscriptions = toSignal(this.oneShotService.getInscriptions(this.id), { initialValue: [] as OneShotInscription[] });
  profile      = toSignal(this.authService.currentUserProfile$);

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

  // Tous les votes — créateur pendant le vote, tout le monde pendant les résultats
  private allVotes$ = combineLatest([
    this.authService.currentUserProfile$,
    toObservable(this.event),
  ]).pipe(
    switchMap(([profile, event]) => {
      if (!event || !profile) return of([] as OneShotVote[]);
      const canSeeAll = event.creatorUid === profile.uid || event.statut === 'resultats';
      return canSeeAll ? this.oneShotService.getAllVotes(this.id) : of([] as OneShotVote[]);
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

  // Lightbox
  lightboxIndex = signal(-1);

  lightboxPhotos = computed(() => {
    const statut = this.event()?.statut;
    if (statut === 'resultats') {
      return this.resultsByTheme().flatMap(g => g.photos);
    }
    return this.photosByTheme().flatMap(g => g.photos);
  });

  lightboxPhoto = computed(() => {
    const i = this.lightboxIndex();
    const photos = this.lightboxPhotos();
    return i >= 0 && i < photos.length ? photos[i] : null;
  });

  lightboxTheme = computed(() => {
    const p = this.lightboxPhoto();
    return p ? (this.themes().find(t => t.id === p.themeId) ?? null) : null;
  });

  openLightbox(photo: OneShotPhoto, $event?: MouseEvent) {
    $event?.stopPropagation();
    const idx = this.lightboxPhotos().findIndex(p => p.id === photo.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  computeRank(photos: OneShotPhoto[], index: number): number {
    const currentVotes = this.voteCountByPhoto()[photos[index].id] ?? 0;
    return photos.filter(p => (this.voteCountByPhoto()[p.id] ?? 0) > currentVotes).length + 1;
  }

  closeLightbox() { this.lightboxIndex.set(-1); }
  prevPhoto() { const i = this.lightboxIndex(); if (i > 0) this.lightboxIndex.set(i - 1); }
  nextPhoto() { const i = this.lightboxIndex(); if (i < this.lightboxPhotos().length - 1) this.lightboxIndex.set(i + 1); }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (this.lightboxIndex() < 0) return;
    if (e.key === 'Escape') this.closeLightbox();
    else if (e.key === 'ArrowLeft') this.prevPhoto();
    else if (e.key === 'ArrowRight') this.nextPhoto();
  }

  // Vote
  voting = signal<string | null>(null);

  async castVote(themeId: string, photoId: string) {
    const profile = this.profile();
    if (!profile || !this.isInscrit() || this.voting()) return;
    if (this.myVoteByTheme()[themeId] === photoId) return;
    const photo = this.photos().find(p => p.id === photoId);
    if (photo?.membreUid === profile.uid) return; // pas de vote pour sa propre photo
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
