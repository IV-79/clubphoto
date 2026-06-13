import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PhotoService } from '../../../services/photo.service';
import { AuthService } from '../../../services/auth.service';
import { ConfigService } from '../../../services/config.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Photo, PhotoExif, PhotoVisibilite } from '../../../models/photo.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { compressToJpeg } from '../../../utils/image-compress';
import { readExif } from '../../../utils/exif-reader';
import { switchMap, of } from 'rxjs';

@Component({
  selector: 'app-portfolio',
  imports: [FormsModule, PhotoLightbox],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.css'
})
export class MembrePortfolio implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private photoService = inject(PhotoService);
  private authService = inject(AuthService);
  private configService = inject(ConfigService);
  private confirmService = inject(ConfirmService);

  private profile$ = this.authService.currentUserProfile$;
  profile = toSignal(this.profile$);

  private myPhotos$ = this.profile$.pipe(
    switchMap(p => p ? this.photoService.getMyPhotos(p.uid) : of([]))
  );
  photos = toSignal(this.myPhotos$, { initialValue: [] as Photo[] });
  photoCount   = computed(() => this.photos().length);
  publicCount  = computed(() => this.photos().filter(p => p.visibilite === 'public').length);
  membreCount  = computed(() => this.photos().filter(p => p.visibilite === 'membre').length);

  private categoriesRaw = toSignal(this.configService.getCategories(), { initialValue: [] });
  categories = computed(() =>
    [...this.categoriesRaw()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }))
  );

  // --- Upload ---
  showModal = signal(false);
  selectedFile = signal<File | null>(null);
  previewUrl = signal('');
  uploadTitre = '';
  uploadDescription = '';
  uploadVisibilite: PhotoVisibilite = 'membre';
  uploadCategorie = '';
  private pendingExif: PhotoExif = {};
  uploading = signal(false);
  uploadProgress = signal(0);

  // --- Edit ---
  editPhoto = signal<Photo | null>(null);
  editTitre = '';
  editDescription = '';
  editVisibilite: PhotoVisibilite = 'membre';
  editCategorie = '';
  editSaving = signal(false);

  // --- Lightbox ---
  lightboxIndex = signal<number | null>(null);

  isAdmin = computed(() => this.profile()?.role === 'admin');

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
      description: p.description || undefined,
      nomAuteur: this.userName(),
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
      deletePhoto: async (photo) => {
        const p = this.photos().find(x => x.id === photo.id);
        if (!p) return;
        const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
        if (ok) await this.photoService.deletePhoto(p);
      },
    };
  });

  ngOnInit() {}

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.lightboxIndex() !== null) { this.closeLightbox(); return; }
      if (this.editPhoto()) { this.closeEdit(); return; }
      if (this.showModal()) { this.closeModal(); return; }
    }
  }

  // --- Upload ---
  openUpload() { this.showModal.set(true); }

  closeModal() {
    if (this.uploading()) return;
    this.showModal.set(false);
    this.resetFile();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setFile(file);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) this.setFile(file);
  }

  private async setFile(file: File) {
    this.pendingExif = await readExif(file);
    const compressed = await compressToJpeg(file);
    this.selectedFile.set(compressed);
    this.uploadTitre = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = e => this.previewUrl.set(e.target?.result as string);
    reader.readAsDataURL(compressed);
  }

  resetFile() {
    this.selectedFile.set(null);
    this.previewUrl.set('');
    this.uploadTitre = '';
    this.uploadDescription = '';
    this.uploadVisibilite = 'membre';
    this.uploadCategorie = '';
    this.pendingExif = {};
    this.uploadProgress.set(0);
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  uploadFile() {
    const file = this.selectedFile();
    const profile = this.profile();
    if (!file || !profile) return;
    this.uploading.set(true);
    this.photoService.uploadPhoto(file, profile.uid, profile.nom, {
      titre: this.uploadTitre,
      description: this.uploadDescription,
      visibilite: this.uploadVisibilite,
      categorie: this.uploadCategorie || undefined,
      exif: this.pendingExif,
    }).subscribe({
      next: state => {
        this.uploadProgress.set(state.progress);
        if (state.state === 'done') { this.uploading.set(false); this.closeModal(); }
      },
      error: () => this.uploading.set(false)
    });
  }

  // --- Edit ---
  openEdit(photo: Photo) {
    this.editPhoto.set(photo);
    this.editTitre = photo.titre;
    this.editDescription = photo.description ?? '';
    this.editVisibilite = photo.visibilite;
    this.editCategorie = photo.categorie ?? '';
  }

  closeEdit() {
    if (this.editSaving()) return;
    this.editPhoto.set(null);
  }

  async saveEdit() {
    const photo = this.editPhoto();
    if (!photo || this.editSaving()) return;
    this.editSaving.set(true);
    await this.photoService.updatePhotoMeta(photo.id, {
      titre: this.editTitre.trim() || photo.titre,
      description: this.editDescription,
      visibilite: this.editVisibilite,
      categorie: this.editCategorie,
    });
    this.editSaving.set(false);
    this.editPhoto.set(null);
  }

  async toggleVisibilite(photo: Photo) {
    await this.photoService.toggleVisibilite(photo);
  }

  async deletePhoto(photo: Photo) {
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (ok) await this.photoService.deletePhoto(photo);
  }

  // --- Lightbox ---
  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(null); }

  // --- Helpers ---
  getCategorieLabel(val?: Photo['categorie']): string {
    const cat = this.categories().find(c => c.value === val);
    return cat?.label ?? '';
  }

  formatDateCapture(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  visibiliteLabel(v: PhotoVisibilite): string {
    return v === 'public' ? 'Public' : 'Membres';
  }

  visibiliteTitle(v: PhotoVisibilite): string {
    return v === 'public' ? 'Visible par tous — cliquer pour passer en membres' : 'Visible par les membres — cliquer pour passer en public';
  }
}
