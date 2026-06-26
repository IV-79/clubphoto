import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup, CdkDragPreview } from '@angular/cdk/drag-drop';
import { OneShotService } from '../../../../services/oneshot.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { OneShotPhoto, OneShotTheme, OneShotInscription } from '../../../../models/oneshot.model';
import { compressToJpeg } from '../../../../utils/image-compress';
import { readExifWithConsent } from '../../../../utils/exif-reader';
import { GpsConsentService } from '../../../../services/gps-consent.service';

interface FileEntry {
  file: File;
  name: string;
  sizeMb: string;
}

interface PhotoSection {
  id: string;
  nom: string;
  photos: OneShotPhoto[];
  isUnassigned: boolean;
  memberCounts: Map<string, number>; // membreUid → nb photos dans cette section
}

@Component({
  selector: 'app-oneshot-photos',
  imports: [FormsModule, RouterLink, CdkDrag, CdkDropList, CdkDropListGroup, CdkDragPreview],
  templateUrl: './oneshot-photos.html',
  styleUrl: './oneshot-photos.css',
})
export class OneShotPhotos {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private oneShotService = inject(OneShotService);
  private route          = inject(ActivatedRoute);
  private confirmService = inject(ConfirmService);
  private gpsConsentService = inject(GpsConsentService);

  readonly id = this.route.snapshot.paramMap.get('id')!;

  event        = toSignal(this.oneShotService.getOneShot(this.id));
  themes       = toSignal(this.oneShotService.getThemes(this.id),       { initialValue: [] as OneShotTheme[] });
  inscriptions = toSignal(this.oneShotService.getInscriptions(this.id), { initialValue: [] as OneShotInscription[] });
  photos       = toSignal(this.oneShotService.getPhotos(this.id),       { initialValue: [] as OneShotPhoto[] });

  // Moves optimistes en attente (photoId → nouveau themeId)
  pendingMoves = signal<Map<string, string>>(new Map());

  // Photos groupées par section, moves optimistes appliqués, non-assignées en premier
  allSections = computed((): PhotoSection[] => {
    const pending = this.pendingMoves();
    const photos = this.photos().map(p =>
      pending.has(p.id) ? { ...p, themeId: pending.get(p.id)! } : p
    );

    const buildCounts = (list: OneShotPhoto[]) => {
      const map = new Map<string, number>();
      for (const p of list) {
        if (p.membreUid) map.set(p.membreUid, (map.get(p.membreUid) ?? 0) + 1);
      }
      return map;
    };

    return [
      {
        id: '',
        nom: 'Non assignées',
        photos: photos.filter(p => !p.themeId),
        isUnassigned: true,
        memberCounts: new Map(),
      },
      ...this.themes().map(t => {
        const tp = photos.filter(p => p.themeId === t.id);
        return { id: t.id, nom: t.nom, photos: tp, isUnassigned: false, memberCounts: buildCounts(tp) };
      }),
    ];
  });

  nonAssigneesCount = computed(() =>
    this.photos().filter(p => !p.membreUid || !p.themeId).length
  );

  // Nombre de paires (membre, thème) où un membre a > 1 photo
  dupeCount = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.photos()) {
      if (p.membreUid && p.themeId) {
        const key = `${p.membreUid}:${p.themeId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.values()].filter(n => n > 1).length;
  });

  submissionProgress = computed(() => {
    const themes   = this.themes();
    const inscrits = this.inscriptions();
    const photos   = this.photos();
    if (!themes.length || !inscrits.length) return null;

    const total   = themes.length * inscrits.length;
    const covered = new Set(
      photos.filter(p => p.membreUid && p.themeId).map(p => `${p.membreUid}:${p.themeId}`)
    ).size;

    const byTheme = themes.map(t => ({
      theme: t,
      submitted: photos.filter(p => p.themeId === t.id && p.membreUid).length,
    }));

    return { covered, total, pct: Math.round(covered / total * 100), byTheme, nbMembers: inscrits.length };
  });

  peutUploader = computed(() =>
    ['inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? '')
  );

  peutGerer = computed(() =>
    ['inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? '')
  );

  // --- Upload ---
  selectedFiles      = signal<FileEntry[]>([]);
  preassignMembreUid = '';
  preassignThemeId   = '';
  uploading          = signal(false);
  uploadDone         = signal(0);
  uploadTotal        = signal(0);

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.setFiles(Array.from(input.files));
  }

  onFileDrop(event: DragEvent) {
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
      membreUid: this.preassignMembreUid || '',
      nomMembre: membre?.nomMembre       || '',
      themeId:   this.preassignThemeId   || '',
    };

    this.uploading.set(true);
    this.uploadDone.set(0);
    this.uploadTotal.set(entries.length);

    for (const entry of entries) {
      const [exif, compressed] = await Promise.all([
        readExifWithConsent(entry.file, this.gpsConsentService),
        compressToJpeg(entry.file),
      ]);
      await new Promise<void>((resolve, reject) => {
        this.oneShotService.uploadPhoto(compressed, this.id, {
          ...meta, titre: entry.name, exif,
        }).subscribe({
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

  // --- Assignation directe ---
  savingPhotoIds = signal<Set<string>>(new Set());

  isSaving(photoId: string) { return this.savingPhotoIds().has(photoId); }

  private addSaving(id: string) {
    this.savingPhotoIds.update(s => new Set([...s, id]));
  }
  private removeSaving(id: string) {
    this.savingPhotoIds.update(s => { const n = new Set(s); n.delete(id); return n; });
  }

  async onMembreChange(photo: OneShotPhoto, uid: string) {
    if (this.isSaving(photo.id)) return;
    const membre = this.inscriptions().find(i => i.uid === uid);
    this.addSaving(photo.id);
    try {
      await this.oneShotService.updatePhotoAssignment(this.id, photo.id, {
        membreUid: uid,
        nomMembre: membre?.nomMembre || '',
        themeId: photo.themeId,
      });
    } finally {
      this.removeSaving(photo.id);
    }
  }

  async onThemeChange(photo: OneShotPhoto, themeId: string) {
    if (this.isSaving(photo.id)) return;
    this.addSaving(photo.id);
    this.pendingMoves.update(m => new Map(m).set(photo.id, themeId));
    try {
      await this.oneShotService.updatePhotoAssignment(this.id, photo.id, {
        membreUid: photo.membreUid,
        nomMembre: photo.nomMembre,
        themeId,
      });
    } finally {
      this.removeSaving(photo.id);
      this.pendingMoves.update(m => { const n = new Map(m); n.delete(photo.id); return n; });
    }
  }

  // --- Drag & Drop entre sections ---
  async onDrop(event: CdkDragDrop<string>) {
    if (event.previousContainer === event.container) return;
    const photo = event.item.data as OneShotPhoto;
    const newThemeId = event.container.data ?? '';

    this.pendingMoves.update(m => new Map(m).set(photo.id, newThemeId));
    try {
      await this.oneShotService.updatePhotoAssignment(this.id, photo.id, {
        membreUid: photo.membreUid,
        nomMembre: photo.nomMembre,
        themeId: newThemeId,
      });
    } catch {
      this.pendingMoves.update(m => { const n = new Map(m); n.delete(photo.id); return n; });
      return;
    }
    setTimeout(() => {
      this.pendingMoves.update(m => { const n = new Map(m); n.delete(photo.id); return n; });
    }, 600);
  }

  // --- Suppression ---
  async deletePhoto(photo: OneShotPhoto) {
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (!ok) return;
    await this.oneShotService.deletePhoto(this.id, photo);
  }
}
