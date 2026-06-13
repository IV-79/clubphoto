import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PhotoService } from '../../../services/photo.service';
import { AuthService } from '../../../services/auth.service';
import { ConfigService } from '../../../services/config.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Photo, PhotoExif, PhotoVisibilite } from '../../../models/photo.model';
import { compressToJpeg } from '../../../utils/image-compress';
import { readExif, hasExif } from '../../../utils/exif-reader';
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
  uploadVisibilite: PhotoVisibilite = 'membre';
  uploadCategorie = '';
  private pendingExif: PhotoExif = {};
  uploading = signal(false);
  uploadProgress = signal(0);

  // --- Edit ---
  editPhoto = signal<Photo | null>(null);
  editTitre = '';
  editVisibilite: PhotoVisibilite = 'membre';
  editCategorie = '';
  editSaving = signal(false);

  // --- Infos EXIF ---
  exifPhoto = signal<Photo | null>(null);
  readonly hasExif = hasExif;

  // --- Delete ---

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
      visibilite: this.editVisibilite,
      categorie: this.editCategorie,
    });
    this.editSaving.set(false);
    this.editPhoto.set(null);
  }

  async toggleVisibilite(photo: Photo) {
    await this.photoService.toggleVisibilite(photo);
  }

  visibiliteLabel(v: PhotoVisibilite): string {
    return v === 'public' ? 'Public' : 'Membres';
  }

  formatDateCapture(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  getCategorieLabel(value: string): string {
    if (!value) return '';
    return this.categories().find(c => c.value === value)?.label ?? value;
  }

  visibiliteTitle(v: PhotoVisibilite): string {
    return v === 'public'
      ? 'Visible par tous — cliquer pour "Membres seulement"'
      : 'Membres connectés seulement — cliquer pour "Public"';
  }

  async deletePhoto(photo: Photo) {
    const ok = await this.confirmService.confirm(
      `« ${photo.titre} » sera supprimée définitivement.`
    );
    if (!ok) return;
    await this.photoService.deletePhoto(photo);
  }

  // --- Lightbox ---
  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(-1); }
  prevPhoto() { const i = this.lightboxIndex(); if (i > 0) this.lightboxIndex.set(i - 1); }
  nextPhoto() { const i = this.lightboxIndex(); if (i < this.photos().length - 1) this.lightboxIndex.set(i + 1); }
}
