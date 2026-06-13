import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { OneShotService } from '../../../../services/oneshot.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { OneShotPhoto, OneShotTheme, OneShotInscription } from '../../../../models/oneshot.model';
import { compressToJpeg } from '../../../../utils/image-compress';
import { readExif } from '../../../../utils/exif-reader';

interface FileEntry {
  file: File;
  name: string;
  sizeMb: string;
}

@Component({
  selector: 'app-oneshot-photos',
  imports: [FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './oneshot-photos.html',
  styleUrl: './oneshot-photos.css',
})
export class OneShotPhotos {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private oneShotService = inject(OneShotService);
  private route = inject(ActivatedRoute);
  private confirmService = inject(ConfirmService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  event        = toSignal(this.oneShotService.getOneShot(this.id));
  themes       = toSignal(this.oneShotService.getThemes(this.id),       { initialValue: [] as OneShotTheme[] });
  inscriptions = toSignal(this.oneShotService.getInscriptions(this.id), { initialValue: [] as OneShotInscription[] });
  photos       = toSignal(this.oneShotService.getPhotos(this.id),       { initialValue: [] as OneShotPhoto[] });

  // Photo groupées par thème pour l'affichage
  photosByTheme = computed(() => {
    const themes = this.themes();
    const photos = this.photos();
    const unassigned = photos.filter(p => !p.themeId);
    const byTheme = themes.map(t => ({
      theme: t,
      photos: photos.filter(p => p.themeId === t.id),
    }));
    return { byTheme, unassigned };
  });

  nonAssigneesCount = computed(() =>
    this.photos().filter(p => !p.membreUid || !p.themeId).length
  );

  peutUploader = computed(() =>
    ['inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? '')
  );

  // --- Upload ---
  selectedFiles = signal<FileEntry[]>([]);
  preassignMembreUid = '';
  preassignThemeId   = '';
  uploading    = signal(false);
  uploadDone   = signal(0);
  uploadTotal  = signal(0);

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.setFiles(Array.from(input.files));
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length) this.setFiles(files);
  }

  private setFiles(files: File[]) {
    this.selectedFiles.set(files.map(f => ({
      file: f,
      name: f.name.replace(/\.[^.]+$/, ''),
      sizeMb: (f.size / 1024 / 1024).toFixed(1),
    })));
  }

  clearFiles() {
    this.selectedFiles.set([]);
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  async uploadAll() {
    const entries = this.selectedFiles();
    if (!entries.length || this.uploading()) return;

    const membre = this.inscriptions().find(i => i.uid === this.preassignMembreUid);
    const meta = {
      membreUid:  this.preassignMembreUid  || '',
      nomMembre:  membre?.nomMembre        || '',
      themeId:    this.preassignThemeId    || '',
    };

    this.uploading.set(true);
    this.uploadDone.set(0);
    this.uploadTotal.set(entries.length);

    for (const entry of entries) {
      const [exif, compressed] = await Promise.all([readExif(entry.file), compressToJpeg(entry.file)]);
      await new Promise<void>((resolve, reject) => {
        this.oneShotService.uploadPhoto(compressed, this.id, { ...meta, exif }).subscribe({
          complete: () => { this.uploadDone.update(n => n + 1); resolve(); },
          error: reject,
        });
      });
    }

    this.uploading.set(false);
    this.clearFiles();
    this.preassignMembreUid = '';
    this.preassignThemeId   = '';
  }

  // --- Assignation par photo ---
  editingPhotoId = signal<string | null>(null);
  editMembreUid  = '';
  editThemeId    = '';
  editSaving     = signal(false);

  startEdit(photo: OneShotPhoto) {
    this.editingPhotoId.set(photo.id);
    this.editMembreUid = photo.membreUid;
    this.editThemeId   = photo.themeId;
  }

  cancelEdit() { this.editingPhotoId.set(null); }

  async saveEdit(photo: OneShotPhoto) {
    if (this.editSaving()) return;
    const membre = this.inscriptions().find(i => i.uid === this.editMembreUid);
    this.editSaving.set(true);
    await this.oneShotService.updatePhotoAssignment(this.id, photo.id, {
      membreUid: this.editMembreUid  || '',
      nomMembre: membre?.nomMembre   || '',
      themeId:   this.editThemeId    || '',
    });
    this.editSaving.set(false);
    this.editingPhotoId.set(null);
  }

  // --- Suppression ---
  async deletePhoto(photo: OneShotPhoto) {
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (!ok) return;
    await this.oneShotService.deletePhoto(this.id, photo);
  }

  // --- Helpers ---
  themeName(themeId: string): string {
    return this.themes().find(t => t.id === themeId)?.nom ?? '';
  }
}
