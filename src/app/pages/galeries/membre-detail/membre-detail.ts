import { Component, inject, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, switchMap, startWith } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { PhotoService } from '../../../services/photo.service';
import { Photo, PHOTO_CATEGORIES } from '../../../models/photo.model';
import { UserProfile } from '../../../models/user.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';

@Component({
  selector: 'app-membre-detail',
  imports: [RouterLink, PhotoLightbox],
  templateUrl: './membre-detail.html',
  styleUrl: './membre-detail.css',
})
export class MembreDetail {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private photoService = inject(PhotoService);

  private readonly categoriesMap = new Map(PHOTO_CATEGORIES.map(c => [c.value, c.label]));

  profile = toSignal(this.authService.currentUserProfile$.pipe(startWith(null as UserProfile | null)));

  membre = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.authService.getMemberProfile(p.get('uid')!))
    )
  );

  photos = toSignal(
    combineLatest([
      this.route.paramMap,
      this.authService.currentUserProfile$.pipe(startWith(null as UserProfile | null)),
    ]).pipe(
      switchMap(([params, profile]) => profile
        ? this.photoService.getPhotosMembre(params.get('uid')!)
        : this.photoService.getPhotosVisiteur(params.get('uid')!)
      )
    ),
    { initialValue: [] as Photo[] }
  );

  lightboxIndex = signal<number | null>(null);

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

  getCategorieLabel(val?: Photo['categorie']): string {
    return val ? (this.categoriesMap.get(val) ?? val) : '';
  }

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.photos().map(p => ({
      id: p.id,
      url: p.url,
      titre: p.titre,
      nomAuteur: this.nomComplet(),
      uploaderUid: p.uid,
      likes: p.likes ?? [],
      uploadedAt: p.dateUpload,
      exif: p.exif,
    }))
  );

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const uid = this.profile()?.uid ?? '';
    return {
      toggleLike: (photoId, liked) =>
        this.photoService.toggleLikePhoto(photoId, uid, liked),
      getComments: (photoId) =>
        this.photoService.getCommentaires(photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) =>
        this.photoService.addCommentaire(photoId, { texte, auteurUid, nomAuteur }),
      deleteComment: (photoId, commentId) =>
        this.photoService.deleteCommentaire(photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.photoService.toggleLikeCommentaire(photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.photoService.addReply(photoId, commentId, {
          texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.photoService.deleteReply(photoId, commentId, replyId, allReplies),
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
    await this.photoService.toggleLikePhoto(photo.id, uid, this.isLiked(photo));
  }

  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(null); }
}
