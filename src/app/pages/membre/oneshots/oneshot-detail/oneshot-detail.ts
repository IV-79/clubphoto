import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, of, switchMap, map, distinctUntilChanged, catchError } from 'rxjs';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { NotificationService } from '../../../../services/notification.service';
import { LoginModalService } from '../../../../services/login-modal.service';
import {
  OneShotInscription, OneShotPhoto, OneShotTheme, OneShotVote,
  OneShotStatut, ONESHOT_STATUT_LABELS
} from '../../../../models/oneshot.model';
import { UserProfile } from '../../../../models/user.model';
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
  private router = inject(Router);
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private notifService = inject(NotificationService);
  readonly loginModal = inject(LoginModalService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  profile = toSignal(this.authService.currentUserProfile$);

  // Re-souscrit quand l'auth change : évite que la lecture du doc "preparation"
  // échoue si Firestore évalue la règle avant que le token soit disponible
  private event$ = toObservable(this.profile).pipe(
    map(p => p?.uid ?? null),
    distinctUntilChanged(),
    switchMap(() => this.oneShotService.getOneShot(this.id).pipe(catchError(() => of(undefined))))
  );
  event   = toSignal(this.event$);
  themes  = toSignal(this.oneShotService.getThemes(this.id),  { initialValue: [] as OneShotTheme[] });
  photos  = toSignal(this.oneShotService.getPhotos(this.id),  { initialValue: [] as OneShotPhoto[] });

  isLoggedIn = computed(() => !!this.profile());
  authReady  = computed(() => this.profile() !== undefined);

  private inscriptions$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.oneShotService.getInscriptions(this.id) : of([] as OneShotInscription[]))
  );
  inscriptions = toSignal(this.inscriptions$, { initialValue: [] as OneShotInscription[] });

  isCreator          = computed(() => this.event()?.creatorUid === this.profile()?.uid);
  isAdmin            = computed(() => this.profile()?.role === 'admin');
  canManage          = computed(() => this.isCreator() || this.isAdmin());
  isInscrit          = computed(() => this.inscriptions().some(i => i.uid === this.profile()?.uid));

  // Avancement (gestion)
  nextStatut = computed<OneShotStatut | null>(() => {
    switch (this.event()?.statut) {
      case 'preparation':            return 'inscription';
      case 'inscription':            return 'vote';
      case 'fermeture_inscriptions': return 'vote';
      case 'vote':                   return 'resultats';
      default:                       return null;
    }
  });

  nextStatutLabel = computed(() => {
    switch (this.event()?.statut) {
      case 'preparation':            return 'Ouvrir les inscriptions';
      case 'inscription':            return 'Passer directement au vote';
      case 'fermeture_inscriptions': return 'Ouvrir les votes';
      case 'vote':                   return 'Publier les résultats';
      default:                       return '';
    }
  });

  peutFermerInscriptions = computed(() => this.event()?.statut === 'inscription');

  transitioning   = signal(false);
  confirmTransition = signal(false);

  async avancer() {
    const next = this.nextStatut();
    if (!next || this.transitioning()) return;
    this.transitioning.set(true);
    this.confirmTransition.set(false);
    try {
      const ev = this.event();
      await this.oneShotService.updateStatut(this.id, next, ev ? {
        titre: ev.titre, nomCreateur: ev.nomCreateur, creatorUid: ev.creatorUid,
      } : undefined);
    } finally {
      this.transitioning.set(false);
    }
  }

  async fermerInscriptions() {
    if (this.transitioning()) return;
    this.transitioning.set(true);
    try {
      await this.oneShotService.updateStatut(this.id, 'fermeture_inscriptions');
    } finally {
      this.transitioning.set(false);
    }
  }
  statutLabel        = computed(() => ONESHOT_STATUT_LABELS[this.event()?.statut ?? 'preparation']);
  inscriptionOuverte = computed(() => this.event()?.statut === 'inscription');

  addingMembre      = signal(false);
  selectedMembreUid = signal('');

  allMembres = toSignal(this.authService.getAllMembers(), { initialValue: [] as UserProfile[] });

  membresDisponibles = computed(() => {
    const inscritUids = new Set(this.inscriptions().map(i => i.uid));
    return this.allMembres()
      .filter(m => !inscritUids.has(m.uid) && !m.isSuspended)
      .sort((a, b) => `${a.prenom ?? ''} ${a.nom}`.localeCompare(`${b.prenom ?? ''} ${b.nom}`));
  });

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
      deletePhoto: async (photo) => {
        const p = this.photos().find(p => p.id === photo.id)!;
        await this.oneShotService.deletePhoto(oneShotId, p);
        const actor = this.profile();
        if (actor && photo.uploaderUid && photo.uploaderUid !== actor.uid) {
          const role = this.isAdmin() ? "L'admin" : 'Le créateur';
          const titre = photo.titre ? ` « ${photo.titre} »` : '';
          this.notifService.sendToUser(
            photo.uploaderUid, 'admin',
            `${role} ${this.userName()} a supprimé votre photo${titre} dans le OneShot « ${this.event()?.titre ?? ''} »`,
            { sourceNom: this.userName(), sourceUid: actor.uid }
          ).catch(() => {});
        }
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
    const idx = this.lightboxPhotoList().findIndex(p => p.id === photo.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  closeLightbox() { this.lightboxIndex.set(null); }

  computeRank(photos: OneShotPhoto[], index: number): number {
    const currentVotes = this.voteCountByPhoto()[photos[index].id] ?? 0;
    return photos.filter(p => (this.voteCountByPhoto()[p.id] ?? 0) > currentVotes).length + 1;
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  async deleteOneShot() {
    const e = this.event();
    const ok = await this.confirmService.confirm(
      `Supprimer « ${e?.titre ?? 'ce OneShot'} » et toutes ses photos définitivement ?`
    );
    if (!ok) return;
    await this.oneShotService.deleteOneShot(this.id, e ? {
      titre: e.titre,
      nomCreateur: e.nomCreateur,
      creatorUid: e.creatorUid,
      photoCouverturePath: e.photoCouverturePath,
    } : undefined);
    this.router.navigate(['/galeries/sorties']);
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

  async retirerInscrit(targetUid: string, targetNom: string) {
    const e = this.event(); const p = this.profile();
    if (!e || !p) return;
    const ok = await this.confirmService.confirm(`Désinscrire ${targetNom} de ce OneShot ?`);
    if (!ok) return;
    await this.oneShotService.desinscrire(this.id, targetUid);
    if (targetUid !== p.uid) {
      this.notifService.sendToUser(
        targetUid, 'oneshot',
        `${this.userName()} vous a désinscrit(e) du OneShot « ${e.titre} »`,
        { lien: `/galeries/oneshots/${this.id}`, sourceNom: this.userName(), sourceUid: p.uid }
      ).catch(() => {});
    }
  }

  async inscrireSelected() {
    const uid = this.selectedMembreUid();
    if (!uid) return;
    if (this.inscriptions().some(i => i.uid === uid)) return;
    const e = this.event(); const p = this.profile();
    if (!e || !p) return;
    const membre = this.allMembres().find(m => m.uid === uid);
    if (!membre) return;
    const nom = `${membre.prenom ?? ''} ${membre.nom}`.trim();
    await this.oneShotService.inscrire(this.id, uid, nom);
    this.notifService.sendToUser(
      uid, 'oneshot',
      `${this.userName()} vous a inscrit(e) au OneShot « ${e.titre} »`,
      { lien: `/galeries/oneshots/${this.id}`, sourceNom: this.userName(), sourceUid: p.uid }
    ).catch(() => {});
    this.selectedMembreUid.set('');
    this.addingMembre.set(false);
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
