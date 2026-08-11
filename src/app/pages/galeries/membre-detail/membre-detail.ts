import {
  Component,
  inject,
  signal,
  computed,
  effect,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { PhotoService } from '../../../services/photo.service';
import { ConfirmService } from '../../../services/confirm.service';
import { NotificationService } from '../../../services/notification.service';
import { ConfigService } from '../../../services/config.service';
import { Photo, PhotoCategorie } from '../../../models/photo.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { ImgRetryDirective } from '../../../directives/img-retry.directive';

@Component({
  selector: 'app-membre-detail',
  imports: [RouterLink, PhotoLightbox, ImgRetryDirective],
  templateUrl: './membre-detail.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './membre-detail.css',
})
export class MembreDetail {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private photoService = inject(PhotoService);
  private confirmService = inject(ConfirmService);
  private notifService = inject(NotificationService);
  private configService = inject(ConfigService);

  private readonly categoriesConfig = toSignal(this.configService.getCategories(), {
    initialValue: [],
  });

  profile = toSignal(this.authService.currentUserProfile$);
  private readonly loggedIn = computed(() => !!this.profile());

  membre = toSignal(
    this.route.paramMap.pipe(switchMap((p) => this.authService.getMemberProfile(p.get('uid')!))),
  );

  private visiblePhotosCount = signal(8);

  private photosSignal = signal<Photo[]>([]);
  photos = this.photosSignal.asReadonly();

  // Filters
  filterCategorie = signal<PhotoCategorie | null>(null);
  filterAppareils = signal<string[]>([]);
  filterObjectifs = signal<string[]>([]);
  openDropdown = signal<'appareil' | 'objectif' | null>(null);

  availableCategories = computed(() => {
    const cats = [
      ...new Set(
        this.photos()
          .map((p) => p.categorie)
          .filter((c): c is PhotoCategorie => !!c),
      ),
    ];
    return cats.length >= 2 ? cats : [];
  });

  availableAppareils = computed(() => {
    const apps = [
      ...new Set(
        this.photos()
          .map((p) => p.exif?.appareil)
          .filter((a): a is string => !!a),
      ),
    ];
    return apps.length >= 2 ? apps : [];
  });

  availableObjectifs = computed(() => {
    const objs = [
      ...new Set(
        this.photos()
          .map((p) => p.exif?.objectif)
          .filter((o): o is string => !!o),
      ),
    ];
    return objs.length >= 2 ? objs : [];
  });

  hasFilters = computed(
    () =>
      this.availableCategories().length > 0 ||
      this.availableAppareils().length > 0 ||
      this.availableObjectifs().length > 0,
  );

  filteredPhotos = computed(() => {
    let photos = this.photos();
    const cat = this.filterCategorie();
    if (cat) photos = photos.filter((p) => p.categorie === cat);
    const apps = this.filterAppareils();
    if (apps.length) photos = photos.filter((p) => apps.includes(p.exif?.appareil ?? ''));
    const objs = this.filterObjectifs();
    if (objs.length) photos = photos.filter((p) => objs.includes(p.exif?.objectif ?? ''));
    return photos;
  });

  photosVisible = computed(() => this.filteredPhotos().slice(0, this.visiblePhotosCount()));
  hasMorePhotos = computed(() => this.filteredPhotos().length > this.visiblePhotosCount());
  loadMorePhotos() {
    this.visiblePhotosCount.update((n) => n + 4);
  }

  toggleAppareil(val: string) {
    this.filterAppareils.update((arr) =>
      arr.includes(val) ? arr.filter((a) => a !== val) : [...arr, val],
    );
  }

  toggleObjectif(val: string) {
    this.filterObjectifs.update((arr) =>
      arr.includes(val) ? arr.filter((o) => o !== val) : [...arr, val],
    );
  }

  clearFilters() {
    this.filterCategorie.set(null);
    this.filterAppareils.set([]);
    this.filterObjectifs.set([]);
  }

  @HostListener('document:click')
  closeDropdown() {
    this.openDropdown.set(null);
  }

  lightboxIndex = signal<number | null>(null);

  private queryParams = toSignal(this.route.queryParamMap);
  private lightboxAutoOpened = signal(false);

  constructor() {
    combineLatest([this.route.paramMap, toObservable(this.loggedIn)])
      .pipe(
        tap(() => this.visiblePhotosCount.set(8)),
        switchMap(([params, loggedIn]) =>
          loggedIn
            ? this.photoService.getPhotosMembreOnce(params.get('uid')!)
            : this.photoService.getPhotosVisiteurOnce(params.get('uid')!),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((photos) => this.photosSignal.set(photos));

    effect(() => {
      const target = this.queryParams()?.get('photo');
      if (!target || this.lightboxAutoOpened()) return;
      const photos = this.filteredPhotos();
      if (photos.length === 0) return;
      const idx = photos.findIndex((p) => p.id === target);
      if (idx >= 0) {
        this.lightboxIndex.set(idx);
        this.lightboxAutoOpened.set(true);
      }
    });
  }

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

  getCategorieLabel(val?: PhotoCategorie): string {
    if (!val) return '';
    return this.categoriesConfig().find((c) => c.value === val)?.label ?? val;
  }

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.filteredPhotos().map((p) => ({
      id: p.id,
      url: p.url,
      titre: p.titre,
      description: p.description || undefined,
      nomAuteur: this.nomComplet(),
      uploaderUid: p.uid,
      likes: p.likes ?? [],
      uploadedAt: p.dateUpload,
      exif: p.exif,
    })),
  );

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const uid = this.profile()?.uid ?? '';
    const ownerUid = this.membre()?.uid ?? '';
    const ownerSubs = this.membre()?.subscriptions;
    return {
      toggleLike: (photoId, liked) => {
        const photo = this.photos().find((p) => p.id === photoId);
        this.applyLikeLocally(photoId, uid, liked);
        return this.photoService.toggleLikePhoto(
          photoId,
          uid,
          liked,
          uid
            ? {
                ownerUid,
                likerNom: `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim(),
                lien: `/galeries/membres/${ownerUid}?photo=${photoId}`,
                photoTitre: photo?.titre,
                ownerSubscriptions: ownerSubs,
              }
            : undefined,
        );
      },
      getComments: (photoId) => this.photoService.getCommentaires(photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) => {
        const photo = this.photos().find((p) => p.id === photoId);
        return this.photoService.addCommentaire(
          photoId,
          { texte, auteurUid, nomAuteur },
          uid
            ? {
                ownerUid,
                lien: `/galeries/membres/${ownerUid}?photo=${photoId}`,
                photoTitre: photo?.titre,
                ownerSubscriptions: ownerSubs,
              }
            : undefined,
        );
      },
      deleteComment: (photoId, commentId) =>
        this.photoService.deleteCommentaire(photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.photoService.toggleLikeCommentaire(photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.photoService.addReply(photoId, commentId, {
          texte,
          auteurUid,
          nomAuteur,
          createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.photoService.deleteReply(photoId, commentId, replyId, allReplies),
      deletePhoto: async (lbPhoto) => {
        const photo = this.photos().find((p) => p.id === lbPhoto.id);
        if (!photo) return;
        await this.photoService.deletePhoto(photo);
        const actor = this.profile();
        if (actor && photo.uid !== actor.uid) {
          const titre = lbPhoto.titre ? ` « ${lbPhoto.titre} »` : '';
          this.notifService
            .sendToUser(
              photo.uid,
              'admin',
              `L'admin ${this.userName()} a supprimé votre photo${titre} de votre portfolio`,
              { sourceNom: this.userName(), sourceUid: actor.uid },
            )
            .catch(() => {});
        }
      },
    };
  });

  isLiked(photo: Photo): boolean {
    const uid = this.profile()?.uid;
    return !!uid && (photo.likes ?? []).includes(uid);
  }

  async toggleLike(photo: Photo, event: Event) {
    event.stopPropagation();
    const uid = this.profile()?.uid;
    if (!uid) return;
    const liked = this.isLiked(photo);
    this.applyLikeLocally(photo.id, uid, liked);
    await this.photoService.toggleLikePhoto(photo.id, uid, liked);
  }

  private applyLikeLocally(photoId: string, uid: string, wasLiked: boolean) {
    this.photosSignal.update((list) =>
      list.map((p) =>
        p.id !== photoId
          ? p
          : {
              ...p,
              likes: wasLiked
                ? (p.likes ?? []).filter((l) => l !== uid)
                : [...(p.likes ?? []), uid],
            },
      ),
    );
  }

  openLightbox(index: number) {
    this.lightboxIndex.set(index);
  }
  closeLightbox() {
    this.lightboxIndex.set(null);
  }
}
