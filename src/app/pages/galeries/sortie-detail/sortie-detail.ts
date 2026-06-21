import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { startWith, switchMap, of } from 'rxjs';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Sortie, SortieImage } from '../../../models/sortie.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { compressToJpeg } from '../../../utils/image-compress';
import { readExifWithConsent } from '../../../utils/exif-reader';
import { GpsConsentService } from '../../../services/gps-consent.service';

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  done: boolean;
  error?: string;
}

@Component({
  selector: 'app-sortie-detail',
  imports: [RouterLink, PhotoLightbox],
  templateUrl: './sortie-detail.html',
  styleUrl: './sortie-detail.css',
})
export class SortieDetail {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;

  private route = inject(ActivatedRoute);
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private gpsConsentService = inject(GpsConsentService);

  sortieId = this.route.snapshot.paramMap.get('id')!;
  profile = toSignal(this.authService.currentUserProfile$);

  sortie = toSignal(this.sortieService.getSortie(this.sortieId).pipe(startWith(null as Sortie | null)));
  photos = toSignal(this.sortieService.getPhotos(this.sortieId), { initialValue: [] as SortieImage[] });
  inscriptions = toSignal(
    toObservable(this.profile).pipe(
      switchMap(p => p ? this.sortieService.getInscriptions(this.sortieId) : of([]))
    ),
    { initialValue: [] }
  );

  lightboxIndex = signal<number | null>(null);
  uploads = signal<UploadTask[]>([]);
  inscribing = signal(false);

  isAVenir = computed(() => {
    const s = this.sortie();
    if (!s) return true;
    return new Date(s.date + 'T00:00:00') > new Date();
  });

  isOrganisateur = computed(() => {
    const s = this.sortie();
    const p = this.profile();
    return !!s && !!p && s.organisateurUid === p.uid;
  });

  isAdmin = computed(() => this.profile()?.role === 'admin');

  isInscrit = computed(() => {
    const uid = this.profile()?.uid;
    if (!uid) return false;
    return this.inscriptions().some(i => i.uid === uid);
  });

  canInscrire = computed(() => {
    const s = this.sortie();
    const p = this.profile();
    if (!s || !p || !s.inscriptionObligatoire) return false;
    if (this.isInscrit()) return false;
    if (s.maxParticipants && this.inscriptions().length >= s.maxParticipants) return false;
    return true;
  });

  canUpload = computed(() => {
    const s = this.sortie();
    const p = this.profile();
    if (!s || !p || this.isAVenir()) return false;
    if (!s.uploadParticipantsOnly) return true;
    return this.isInscrit() || this.isOrganisateur() || this.isAdmin();
  });

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  // Lightbox
  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.photos().map(p => ({
      id: p.id,
      url: p.url,
      nomAuteur: p.nomUploader,
      uploaderUid: p.uploaderUid,
      likes: p.likes,
      uploadedAt: p.uploadedAt,
      exif: p.exif,
    }))
  );

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const sortieId = this.sortieId;
    const uid = this.profile()?.uid ?? '';
    const canDel = (_photo: LightboxPhoto) => this.isAdmin();
    return {
      toggleLike: (photoId, liked) =>
        this.sortieService.toggleLikePhoto(sortieId, photoId, uid, liked),
      getComments: (photoId) =>
        this.sortieService.getCommentaires(sortieId, photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) =>
        this.sortieService.addCommentaire(sortieId, photoId, { texte, auteurUid, nomAuteur }),
      deleteComment: (photoId, commentId) =>
        this.sortieService.deleteCommentaire(sortieId, photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.sortieService.toggleLikeCommentaire(sortieId, photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.sortieService.addReply(sortieId, photoId, commentId, {
          texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.sortieService.deleteReply(sortieId, photoId, commentId, replyId, allReplies),
      canDeletePhoto: canDel,
      deletePhoto: (photo) => {
        const img = this.photos().find(p => p.id === photo.id)!;
        return this.sortieService.deletePhoto(sortieId, img, this.sortie()?.photoCouvertureUrl);
      },
    };
  });

  isLiked(photo: SortieImage): boolean {
    const uid = this.profile()?.uid;
    return !!uid && photo.likes.includes(uid);
  }

  async toggleLike(photo: SortieImage, event: Event) {
    event.stopPropagation();
    const uid = this.profile()?.uid;
    if (!uid) return;
    await this.sortieService.toggleLikePhoto(this.sortieId, photo.id, uid, this.isLiked(photo));
  }

  async toggleInscription() {
    const p = this.profile();
    const s = this.sortie();
    if (!p || !s || this.inscribing()) return;
    this.inscribing.set(true);
    try {
      if (this.isInscrit()) {
        await this.sortieService.desinscrire(this.sortieId, p.uid);
      } else {
        await this.sortieService.inscrire(this.sortieId, p.uid, this.userName());
      }
    } finally {
      this.inscribing.set(false);
    }
  }

  async onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const p = this.profile();
    if (!p || !files.length) return;

    for (const file of files) {
      const id = Math.random().toString(36).slice(2);
      this.uploads.update(u => [...u, { id, name: file.name, progress: 0, done: false }]);

      try {
        const [exif, compressed] = await Promise.all([readExifWithConsent(file, this.gpsConsentService), compressToJpeg(file)]);
        this.sortieService.uploadPhoto(compressed, this.sortieId, {
          uploaderUid: p.uid,
          nomUploader: this.userName(),
          exif,
        }).subscribe({
          next: state => {
            this.uploads.update(u =>
              u.map(item => item.id === id ? { ...item, progress: state.progress, done: state.done } : item)
            );
          },
          error: () => {
            this.uploads.update(u =>
              u.map(item => item.id === id ? { ...item, error: 'Erreur lors de l\'upload' } : item)
            );
          },
        });
      } catch {
        this.uploads.update(u =>
          u.map(item => item.id === id ? { ...item, error: 'Erreur de compression' } : item)
        );
      }
    }
  }

  clearDoneUploads() {
    this.uploads.update(u => u.filter(item => !item.done && !item.error));
  }

  async supprimerPhoto(photo: SortieImage) {
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (!ok) return;
    await this.sortieService.deletePhoto(this.sortieId, photo, this.sortie()?.photoCouvertureUrl);
  }

  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(null); }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  mapsUrl(lieu: string): string {
    return `https://maps.google.com/?q=${encodeURIComponent(lieu)}`;
  }
}
