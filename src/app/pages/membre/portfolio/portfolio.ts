import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PhotoService } from '../../../services/photo.service';
import { AuthService } from '../../../services/auth.service';
import { Photo, PHOTO_CATEGORIES } from '../../../models/photo.model';
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

  private profile$ = this.authService.currentUserProfile$;

  profile = toSignal(this.profile$);

  private myPhotos$ = this.profile$.pipe(
    switchMap(p => p ? this.photoService.getMyPhotos(p.uid) : of([]))
  );

  photos = toSignal(this.myPhotos$, { initialValue: [] as Photo[] });
  photoCount = computed(() => this.photos().length);
  publicCount = computed(() => this.photos().filter(p => p.isPublic).length);

  categories = PHOTO_CATEGORIES;

  showModal = signal(false);
  selectedFile = signal<File | null>(null);
  previewUrl = signal('');
  uploadTitre = '';
  uploadPublic = false;
  uploadCategorie = '';
  uploading = signal(false);
  uploadProgress = signal(0);

  toDelete = signal<Photo | null>(null);

  ngOnInit() {}

  openUpload() {
    this.showModal.set(true);
  }

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

  private setFile(file: File) {
    this.selectedFile.set(file);
    this.uploadTitre = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = e => this.previewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
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
        if (state.state === 'done') {
          this.uploading.set(false);
          this.closeModal();
        }
      },
      error: () => {
        this.uploading.set(false);
      }
    });
  }

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

  confirmDelete(photo: Photo) {
    this.toDelete.set(photo);
  }

  cancelDelete() {
    this.toDelete.set(null);
  }

  async executeDelete() {
    const photo = this.toDelete();
    if (!photo) return;
    await this.photoService.deletePhoto(photo);
    this.toDelete.set(null);
  }
}
