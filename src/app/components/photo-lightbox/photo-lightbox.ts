import {
  Component,
  signal,
  computed,
  effect,
  input,
  output,
  HostListener,
  OnInit,
  OnDestroy,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { LightboxPhoto, Commentaire, PhotoLightboxCallbacks } from '../../models/commentaire.model';
import { ConfirmService } from '../../services/confirm.service';
import { ImgRetryDirective } from '../../directives/img-retry.directive';

@Component({
  selector: 'app-photo-lightbox',
  imports: [FormsModule, ImgRetryDirective],
  templateUrl: './photo-lightbox.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './photo-lightbox.css',
})
export class PhotoLightbox implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private confirmService = inject(ConfirmService);
  photos = input.required<LightboxPhoto[]>();
  startIndex = input<number>(0);
  userUid = input<string | null>(null);
  userName = input<string>('');
  canInteract = input<boolean>(false);
  isAdmin = input<boolean>(false);
  anonyme = input<boolean>(false);
  hideLikes = input<boolean>(false);
  callbacks = input.required<PhotoLightboxCallbacks>();

  closed = output<void>();

  currentIdx = signal(0);
  fullscreen = signal(false);
  imgLoading = signal(false);

  ngOnInit() {
    this.currentIdx.set(this.startIndex());
    document.body.style.overflow = 'hidden';
    if (this.anonyme()) {
      this.fullscreen.set(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  constructor() {
    effect(() => {
      const len = this.photos().length;
      if (len === 0) {
        this.closed.emit();
      } else if (this.currentIdx() >= len) {
        this.currentIdx.set(len - 1);
      }
    });
  }

  currentPhoto = computed(() => this.photos()[this.currentIdx()] ?? null);
  private currentPhotoId = computed(() => this.currentPhoto()?.id ?? null);
  private commentRefresh = signal(0);

  commentaires = toSignal(
    toObservable(
      computed(() => ({ photoId: this.currentPhotoId(), r: this.commentRefresh() })),
    ).pipe(
      switchMap(({ photoId }) => {
        if (!photoId) return of([] as Commentaire[]);
        return this.callbacks().getComments(photoId);
      }),
    ),
    { initialValue: [] as Commentaire[] },
  );

  newComment = '';
  newReply = '';
  submitting = signal(false);
  replyingTo = signal<string | null>(null);

  prev() {
    const len = this.photos().length;
    this.imgLoading.set(true);
    this.currentIdx.set((this.currentIdx() - 1 + len) % len);
    this.replyingTo.set(null);
  }

  next() {
    const len = this.photos().length;
    this.imgLoading.set(true);
    this.currentIdx.set((this.currentIdx() + 1) % len);
    this.replyingTo.set(null);
  }

  openFullscreen() {
    this.fullscreen.set(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  closeFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (this.anonyme()) {
      this.closed.emit();
      return;
    }
    this.fullscreen.set(false);
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    if (!document.fullscreenElement && this.fullscreen()) {
      if (this.anonyme()) {
        this.closed.emit();
        return;
      }
      this.fullscreen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      if (this.fullscreen()) {
        this.closeFullscreen();
        return;
      }
      this.closed.emit();
    }
    if (e.key === 'ArrowLeft') this.prev();
    if (e.key === 'ArrowRight') this.next();
  }

  isLikedPhoto(): boolean {
    const uid = this.userUid();
    const photo = this.currentPhoto();
    return !!uid && !!photo && photo.likes.includes(uid);
  }

  async toggleLikePhoto() {
    const uid = this.userUid();
    const photo = this.currentPhoto();
    if (!uid || !photo) return;
    await this.callbacks().toggleLike(photo.id, this.isLikedPhoto());
  }

  async submitComment() {
    const texte = this.newComment.trim();
    const uid = this.userUid();
    const photo = this.currentPhoto();
    if (!texte || !uid || !photo || this.submitting()) return;
    this.submitting.set(true);
    try {
      await this.callbacks().addComment(photo.id, texte, uid, this.userName() || 'Membre');
      this.newComment = '';
      this.commentRefresh.update((n) => n + 1);
    } finally {
      this.submitting.set(false);
    }
  }

  async deleteComment(commentId: string) {
    const photo = this.currentPhoto();
    if (!photo) return;
    const ok = await this.confirmService.confirm('Supprimer ce commentaire ?');
    if (!ok) return;
    await this.callbacks().deleteComment(photo.id, commentId);
    this.commentRefresh.update((n) => n + 1);
  }

  isLikedComment(c: Commentaire): boolean {
    const uid = this.userUid();
    return !!uid && c.likes.includes(uid);
  }

  async toggleLikeComment(c: Commentaire) {
    const uid = this.userUid();
    const photo = this.currentPhoto();
    if (!uid || !photo) return;
    await this.callbacks().toggleCommentLike(photo.id, c.id, uid, this.isLikedComment(c));
    this.commentRefresh.update((n) => n + 1);
  }

  private touchStartX = 0;

  onTouchStart(e: TouchEvent) {
    this.touchStartX = e.touches[0].clientX;
  }

  onTouchEnd(e: TouchEvent) {
    const delta = e.changedTouches[0].clientX - this.touchStartX;
    if (Math.abs(delta) > 50) delta < 0 ? this.next() : this.prev();
  }

  startReply(commentId: string) {
    this.replyingTo.set(this.replyingTo() === commentId ? null : commentId);
    this.newReply = '';
    if (this.replyingTo() === commentId) {
      setTimeout(() => {
        const form = this.el.nativeElement.querySelector('.lb-reply-form');
        form?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
  }

  async submitReply(c: Commentaire) {
    const texte = this.newReply.trim();
    const uid = this.userUid();
    const photo = this.currentPhoto();
    if (!texte || !uid || !photo) return;
    await this.callbacks().addReply(photo.id, c.id, texte, uid, this.userName() || 'Membre');
    this.replyingTo.set(null);
    this.newReply = '';
    this.commentRefresh.update((n) => n + 1);
  }

  async deleteReply(c: Commentaire, replyId: string) {
    const photo = this.currentPhoto();
    if (!photo) return;
    const ok = await this.confirmService.confirm('Supprimer cette réponse ?');
    if (!ok) return;
    await this.callbacks().deleteReply(photo.id, c.id, replyId, c.replies);
    this.commentRefresh.update((n) => n + 1);
  }

  canDeleteComment(auteurUid: string): boolean {
    const uid = this.userUid();
    const photoOwnerUid = this.currentPhoto()?.uploaderUid;
    return uid === auteurUid || uid === photoOwnerUid || this.isAdmin();
  }

  canDeletePhoto(): boolean {
    return this.isAdmin() && !!this.callbacks().deletePhoto;
  }

  async deleteCurrentPhoto() {
    const photo = this.currentPhoto();
    const cb = this.callbacks();
    if (!photo || !cb.deletePhoto) return;
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (!ok) return;
    await cb.deletePhoto(photo);
  }

  initiales(nom: string): string {
    return nom
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  hasExifData = computed((): boolean => {
    const exif = this.currentPhoto()?.exif;
    if (!exif) return false;
    return !!(
      exif.appareil ||
      exif.objectif ||
      exif.focale ||
      exif.ouverture ||
      exif.vitesse ||
      exif.iso ||
      exif.dateCapture ||
      exif.gps ||
      exif.largeur
    );
  });

  formatDefinition(largeur: number, hauteur: number): string {
    const mpx = (largeur * hauteur) / 1_000_000;
    const mpxStr = mpx >= 1 ? ` · ${mpx % 1 === 0 ? mpx : mpx.toFixed(1)} Mpx` : '';
    return `${largeur.toLocaleString('fr-FR')} × ${hauteur.toLocaleString('fr-FR')} px${mpxStr}`;
  }

  gpsMapUrl(): string {
    const gps = this.currentPhoto()?.exif?.gps;
    if (!gps) return '';
    return `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
  }

  formatDateExif(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  formatTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h}h`;
    return `il y a ${Math.floor(h / 24)}j`;
  }
}
