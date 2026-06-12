import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PhotoService } from '../../../services/photo.service';
import { AuthService } from '../../../services/auth.service';
import { ConfigService } from '../../../services/config.service';
import { Photo } from '../../../models/photo.model';
import { switchMap, of } from 'rxjs';

@Component({
  selector: 'app-portfolio',
  imports: [FormsModule],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.css'
})
export class MembrePortfolio implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private photoService = inject(PhotoService);
  private authService = inject(AuthService);
  private configService = inject(ConfigService);

  private profile$ = this.authService.currentUserProfile$;
  profile = toSignal(this.profile$);

  private myPhotos$ = this.profile$.pipe(
    switchMap(p => p ? this.photoService.getMyPhotos(p.uid) : of([]))
  );
  photos = toSignal(this.myPhotos$, { initialValue: [] as Photo[] });
  photoCount = computed(() => this.photos().length);
  publicCount = computed(() => this.photos().filter(p => p.isPublic).length);

  private categoriesRaw = toSignal(this.configService.getCategories(), { initialValue: [] });
  categories = computed(() =>
    [...this.categoriesRaw()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }))
  );

  // --- Upload ---
  showModal = signal(false);
  selectedFile = signal<File | null>(null);
  previewUrl = signal('');
  uploadTitre = '';
  uploadPublic = false;
  uploadCategorie = '';
  uploading = signal(false);
  uploadProgress = signal(0);

  // --- Edit ---
  editPhoto = signal<Photo | null>(null);
  editTitre = '';
  editPublic = false;
  editCategorie = '';
  editSaving = signal(false);

  // --- Delete ---
  toDelete = signal<Photo | null>(null);

  // --- Lightbox ---
  lightboxIndex = signal(-1);
  lightboxPhoto = computed(() => {
    const i = this.lightboxIndex();
    return i >= 0 ? this.photos()[i] : null;
  });

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.lightboxIndex() >= 0) { this.closeLightbox(); return; }
      if (this.editPhoto()) { this.closeEdit(); return; }
      if (this.showModal()) { this.closeModal(); return; }
    }
    if (this.lightboxIndex() >= 0) {
      if (e.key === 'ArrowLeft') this.prevPhoto();
      else if (e.key === 'ArrowRight') this.nextPhoto();
    }
  }

  ngOnInit() {}

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
    const compressed = await this.compressToJpeg(file);
    this.selectedFile.set(compressed);
    this.uploadTitre = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = e => this.previewUrl.set(e.target?.result as string);
    reader.readAsDataURL(compressed);
  }

  private compressToJpeg(file: File): Promise<File> {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 3840;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const name = file.name.replace(/\.[^.]+$/, '.jpg');
        const attempt = (quality: number) => {
          canvas.toBlob(blob => {
            if (!blob) { resolve(file); return; }
            if (blob.size > 5 * 1024 * 1024 && quality > 0.65) {
              attempt(quality - 0.15);
            } else {
              resolve(new File([blob], name, { type: 'image/jpeg' }));
            }
          }, 'image/jpeg', quality);
        };
        attempt(0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  resetFile() {
    this.selectedFile.set(null);
    this.previewUrl.set('');
    this.uploadTitre = '';
    this.uploadPublic = false;
    this.uploadCategorie = '';
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
      isPublic: this.uploadPublic,
      categorie: this.uploadCategorie || undefined
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
    this.editPublic = photo.isPublic;
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
      isPublic: this.editPublic,
      categorie: this.editCategorie,
    });
    this.editSaving.set(false);
    this.editPhoto.set(null);
  }

  // --- Cover & visibility ---
  estCouverture(photo: Photo): boolean {
    return this.profile()?.photoCouvertureUrl === photo.url;
  }

  async setCouverture(photo: Photo) {
    const profile = this.profile();
    if (!profile || !photo.isPublic) return;
    await this.authService.updateProfile(profile.uid, { photoCouvertureUrl: photo.url });
  }

  async toggleVisibility(photo: Photo) {
    await this.photoService.toggleVisibility(photo);
  }

  // --- Delete ---
  confirmDelete(photo: Photo) { this.toDelete.set(photo); }
  cancelDelete() { this.toDelete.set(null); }

  async executeDelete() {
    const photo = this.toDelete();
    if (!photo) return;
    await this.photoService.deletePhoto(photo);
    this.toDelete.set(null);
  }

  // --- Lightbox ---
  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(-1); }
  prevPhoto() { const i = this.lightboxIndex(); if (i > 0) this.lightboxIndex.set(i - 1); }
  nextPhoto() { const i = this.lightboxIndex(); if (i < this.photos().length - 1) this.lightboxIndex.set(i + 1); }
}
