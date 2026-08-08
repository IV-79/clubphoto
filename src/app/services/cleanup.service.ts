import { Injectable, inject, signal } from '@angular/core';
import { collection, doc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { firstValueFrom } from 'rxjs';
import { db, storage } from '../utils/firebase';
import { ThemeService } from './theme.service';
import { OneShotService } from './oneshot.service';
import { DefiService } from './defi.service';
import { SortieService } from './sortie.service';
import { ArticleService } from './article.service';
import { OneShot } from '../models/oneshot.model';

export interface CleanupPreview {
  events: number;
  photosToDelete: number;
  photosToKeep: number;
  bytesToFree: number;
}

export interface CleanupResult {
  processed: number;
  photosDeleted: number;
  bytesFreed: number;
}

export interface OrphanPreview {
  scanned: number;
  orphanCount: number;
  orphanPaths: string[];
}

export interface CleanupProgress {
  label: string;
  current: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class CleanupService {
  private themeService   = inject(ThemeService);
  private osService      = inject(OneShotService);
  private defiService    = inject(DefiService);
  private sortieService  = inject(SortieService);
  private articleService = inject(ArticleService);

  progress = signal<CleanupProgress | null>(null);

  private keepSet(ids: string[], countMap: Map<string, number>): Set<string> {
    if (ids.length <= 3) return new Set(ids);
    const sorted = [...ids].sort((a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0));
    const threshold = countMap.get(sorted[2]) ?? 0;
    if (threshold === 0) return new Set(ids);
    return new Set(sorted.filter(id => (countMap.get(id) ?? 0) >= threshold));
  }

  private async deleteVotes(collPath: string): Promise<void> {
    const snap = await getDocs(collection(db, collPath));
    if (snap.empty) return;
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  private async listStorageFiles(prefix: string): Promise<string[]> {
    const result = await listAll(ref(storage, prefix));
    const files = result.items.map(item => item.fullPath);
    for (const subDir of result.prefixes) {
      files.push(...await this.listStorageFiles(subDir.fullPath));
    }
    return files;
  }

  // ── Thèmes du mois ──────────────────────────────────────────────────────

  async previewThemes(beforeDate: string, keepTop3 = true): Promise<CleanupPreview> {
    const beforeMois = beforeDate.substring(0, 7);
    const themes = await firstValueFrom(this.themeService.getThemesOnce());
    const old = themes.filter(t => t.mois < beforeMois);

    let photosToDelete = 0, photosToKeep = 0, bytesToFree = 0;
    for (const theme of old) {
      const soumissions = await firstValueFrom(this.themeService.getSoumissionsOnce(theme.id));
      if (!keepTop3) {
        photosToDelete += soumissions.length;
        bytesToFree += soumissions.reduce((s, p) => s + (p.fileSize ?? 0), 0);
      } else {
        const votes = await firstValueFrom(this.themeService.getTousVotesOnce(theme.id));
        const countMap = new Map<string, number>();
        votes.forEach(v => countMap.set(v.soumissionId, (countMap.get(v.soumissionId) ?? 0) + 1));
        const keep = this.keepSet(soumissions.map(s => s.id), countMap);
        soumissions.forEach(s => {
          if (keep.has(s.id)) { photosToKeep++; }
          else { photosToDelete++; bytesToFree += s.fileSize ?? 0; }
        });
      }
    }
    return { events: old.length, photosToDelete, photosToKeep, bytesToFree };
  }

  async executeThemes(beforeDate: string, keepTop3 = true): Promise<CleanupResult> {
    const beforeMois = beforeDate.substring(0, 7);
    const themes = await firstValueFrom(this.themeService.getThemesOnce());
    const old = themes.filter(t => t.mois < beforeMois);

    let photosDeleted = 0, bytesFreed = 0;
    this.progress.set({ label: 'Préparation…', current: 0, total: old.length });

    for (let i = 0; i < old.length; i++) {
      const theme = old[i];
      this.progress.set({ label: theme.titre, current: i + 1, total: old.length });

      const soumissions = await firstValueFrom(this.themeService.getSoumissionsOnce(theme.id));
      let toDelete = soumissions;

      if (keepTop3) {
        const votes = await firstValueFrom(this.themeService.getTousVotesOnce(theme.id));
        const countMap = new Map<string, number>();
        votes.forEach(v => countMap.set(v.soumissionId, (countMap.get(v.soumissionId) ?? 0) + 1));
        const keep = this.keepSet(soumissions.map(s => s.id), countMap);
        toDelete = soumissions.filter(s => !keep.has(s.id));
      }

      for (const s of toDelete) {
        await this.themeService.deleteSoumission(theme.id, s.id, s.storagePath, s.membreUid, s.fileSize, s.thumbnailPath);
        photosDeleted++;
        bytesFreed += s.fileSize ?? 0;
      }
      await this.deleteVotes(`themes/${theme.id}/votes`);
    }
    this.progress.set(null);
    return { processed: old.length, photosDeleted, bytesFreed };
  }

  // ── One-shots ────────────────────────────────────────────────────────────

  private async getAllOneShotsOnce(): Promise<OneShot[]> {
    const snap = await getDocs(collection(db, 'oneshots'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as OneShot));
  }

  async previewOneshots(beforeDate: string, keepTop3 = true): Promise<CleanupPreview> {
    const all = await this.getAllOneShotsOnce();
    const old = all.filter(o => (o.dateCreation ?? '').substring(0, 10) < beforeDate);

    let photosToDelete = 0, photosToKeep = 0, bytesToFree = 0;
    for (const os of old) {
      const photos = await firstValueFrom(this.osService.getPhotosOnce(os.id));
      if (!keepTop3) {
        photosToDelete += photos.length;
        bytesToFree += photos.reduce((s, p) => s + (p.fileSize ?? 0), 0);
      } else {
        const votes = await firstValueFrom(this.osService.getAllVotesOnce(os.id));
        const byTheme = new Map<string, typeof photos>();
        photos.forEach(p => {
          if (!byTheme.has(p.themeId)) byTheme.set(p.themeId, []);
          byTheme.get(p.themeId)!.push(p);
        });
        byTheme.forEach((themePhotos, themeId) => {
          const countMap = new Map<string, number>();
          votes.filter(v => v.themeId === themeId)
               .forEach(v => countMap.set(v.photoId, (countMap.get(v.photoId) ?? 0) + 1));
          const keep = this.keepSet(themePhotos.map(p => p.id), countMap);
          themePhotos.forEach(p => {
            if (keep.has(p.id)) { photosToKeep++; }
            else { photosToDelete++; bytesToFree += p.fileSize ?? 0; }
          });
        });
      }
    }
    return { events: old.length, photosToDelete, photosToKeep, bytesToFree };
  }

  async executeOneshots(beforeDate: string, keepTop3 = true): Promise<CleanupResult> {
    const all = await this.getAllOneShotsOnce();
    const old = all.filter(o => (o.dateCreation ?? '').substring(0, 10) < beforeDate);

    let photosDeleted = 0, bytesFreed = 0;
    this.progress.set({ label: 'Préparation…', current: 0, total: old.length });

    for (let i = 0; i < old.length; i++) {
      const os = old[i];
      this.progress.set({ label: os.titre, current: i + 1, total: old.length });

      const photos = await firstValueFrom(this.osService.getPhotosOnce(os.id));
      let toDelete = photos;

      if (keepTop3) {
        const votes = await firstValueFrom(this.osService.getAllVotesOnce(os.id));
        const byTheme = new Map<string, typeof photos>();
        photos.forEach(p => {
          if (!byTheme.has(p.themeId)) byTheme.set(p.themeId, []);
          byTheme.get(p.themeId)!.push(p);
        });
        const keepIds = new Set<string>();
        byTheme.forEach((themePhotos, themeId) => {
          const countMap = new Map<string, number>();
          votes.filter(v => v.themeId === themeId)
               .forEach(v => countMap.set(v.photoId, (countMap.get(v.photoId) ?? 0) + 1));
          this.keepSet(themePhotos.map(p => p.id), countMap).forEach(id => keepIds.add(id));
        });
        toDelete = photos.filter(p => !keepIds.has(p.id));
      }

      for (const p of toDelete) {
        await this.osService.deletePhoto(os.id, p);
        photosDeleted++;
        bytesFreed += p.fileSize ?? 0;
      }
      await this.deleteVotes(`oneshots/${os.id}/votes`);
    }
    this.progress.set(null);
    return { processed: old.length, photosDeleted, bytesFreed };
  }

  // ── Défis ────────────────────────────────────────────────────────────────

  async previewDefis(beforeDate: string, keepTop3 = true): Promise<CleanupPreview> {
    const all = await firstValueFrom(this.defiService.getDefisOnce());
    const old = all.filter(d => (d.dateCreation ?? '').substring(0, 10) < beforeDate);

    let photosToDelete = 0, photosToKeep = 0, bytesToFree = 0;
    for (const defi of old) {
      const photos = await firstValueFrom(this.defiService.getPhotosOnce(defi.id));
      if (!keepTop3) {
        photosToDelete += photos.length;
        bytesToFree += photos.reduce((s, p) => s + p.fileSize, 0);
      } else {
        const votes = await firstValueFrom(this.defiService.getVotesOnce(defi.id));
        const countMap = new Map<string, number>();
        votes.forEach(v => v.photoIds.forEach(pid =>
          countMap.set(pid, (countMap.get(pid) ?? 0) + 1)
        ));
        const keep = this.keepSet(photos.map(p => p.id), countMap);
        photos.forEach(p => {
          if (keep.has(p.id)) { photosToKeep++; }
          else { photosToDelete++; bytesToFree += p.fileSize; }
        });
      }
    }
    return { events: old.length, photosToDelete, photosToKeep, bytesToFree };
  }

  async executeDefis(beforeDate: string, keepTop3 = true): Promise<CleanupResult> {
    const all = await firstValueFrom(this.defiService.getDefisOnce());
    const old = all.filter(d => (d.dateCreation ?? '').substring(0, 10) < beforeDate);

    let photosDeleted = 0, bytesFreed = 0;
    this.progress.set({ label: 'Préparation…', current: 0, total: old.length });

    for (let i = 0; i < old.length; i++) {
      const defi = old[i];
      this.progress.set({ label: defi.titre, current: i + 1, total: old.length });

      const photos = await firstValueFrom(this.defiService.getPhotosOnce(defi.id));
      let toDelete = photos;

      if (keepTop3) {
        const votes = await firstValueFrom(this.defiService.getVotesOnce(defi.id));
        const countMap = new Map<string, number>();
        votes.forEach(v => v.photoIds.forEach(pid =>
          countMap.set(pid, (countMap.get(pid) ?? 0) + 1)
        ));
        const keep = this.keepSet(photos.map(p => p.id), countMap);
        toDelete = photos.filter(p => !keep.has(p.id));
      }

      for (const p of toDelete) {
        await this.defiService.deletePhoto(defi.id, p);
        photosDeleted++;
        bytesFreed += p.fileSize;
      }
      await this.deleteVotes(`defis/${defi.id}/votes`);
    }
    this.progress.set(null);
    return { processed: old.length, photosDeleted, bytesFreed };
  }

  // ── Sorties ──────────────────────────────────────────────────────────────

  async previewSorties(beforeDate: string): Promise<CleanupPreview> {
    const all = await firstValueFrom(this.sortieService.getSortiesOnce());
    const old = all.filter(s => s.date < beforeDate);

    let photosToDelete = 0;
    for (const sortie of old) {
      const photos = await firstValueFrom(this.sortieService.getPhotosOnce(sortie.id));
      photosToDelete += photos.length;
    }
    return { events: old.length, photosToDelete, photosToKeep: 0, bytesToFree: 0 };
  }

  async executeSorties(beforeDate: string): Promise<CleanupResult> {
    const all = await firstValueFrom(this.sortieService.getSortiesOnce());
    const old = all.filter(s => s.date < beforeDate);

    let photosDeleted = 0;
    this.progress.set({ label: 'Préparation…', current: 0, total: old.length });

    for (let i = 0; i < old.length; i++) {
      const sortie = old[i];
      this.progress.set({ label: sortie.titre, current: i + 1, total: old.length });

      const photos = await firstValueFrom(this.sortieService.getPhotosOnce(sortie.id));
      for (const photo of photos) {
        await this.sortieService.deletePhoto(sortie.id, photo);
        photosDeleted++;
      }
      if (photos.length > 0 && sortie.photoCouvertureUrl) {
        await updateDoc(doc(db, 'sorties', sortie.id), { photoCouvertureUrl: null });
      }
    }
    this.progress.set(null);
    return { processed: old.length, photosDeleted, bytesFreed: 0 };
  }

  // ── Actualités ───────────────────────────────────────────────────────────

  async previewArticles(beforeDate: string, expiredOnly: boolean): Promise<CleanupPreview> {
    const all = await firstValueFrom(this.articleService.getAllArticles());
    const old = all.filter(a =>
      (a.dateCreation ?? '').substring(0, 10) < beforeDate &&
      (!expiredOnly || a.statut === 'expire')
    );
    const withCouverture = old.filter(a => !!a.couvertureStoragePath).length;
    return { events: old.length, photosToDelete: withCouverture, photosToKeep: 0, bytesToFree: 0 };
  }

  async executeArticles(beforeDate: string, expiredOnly: boolean): Promise<CleanupResult> {
    const all = await firstValueFrom(this.articleService.getAllArticles());
    const old = all.filter(a =>
      (a.dateCreation ?? '').substring(0, 10) < beforeDate &&
      (!expiredOnly || a.statut === 'expire')
    );

    let photosDeleted = 0;
    this.progress.set({ label: 'Préparation…', current: 0, total: old.length });

    for (let i = 0; i < old.length; i++) {
      const article = old[i];
      this.progress.set({ label: article.titre, current: i + 1, total: old.length });
      await this.articleService.deleteArticle(article.id!, article.couvertureStoragePath);
      if (article.couvertureStoragePath) photosDeleted++;
    }
    this.progress.set(null);
    return { processed: old.length, photosDeleted, bytesFreed: 0 };
  }

  // ── Orphelins Storage ─────────────────────────────────────────────────────

  async previewOrphans(): Promise<OrphanPreview> {
    this.progress.set({ label: 'Lecture Firestore…', current: 0, total: 8 });

    const known = new Set<string>();

    // Thèmes
    const themes = await firstValueFrom(this.themeService.getThemesOnce());
    for (const theme of themes) {
      if (theme.photoCouverturePath) known.add(theme.photoCouverturePath);
      const subs = await firstValueFrom(this.themeService.getSoumissionsOnce(theme.id));
      subs.forEach(s => { known.add(s.storagePath); if (s.thumbnailPath) known.add(s.thumbnailPath); });
    }
    this.progress.set({ label: 'Lecture Firestore…', current: 1, total: 8 });

    // One-shots
    const oneshots = await this.getAllOneShotsOnce();
    for (const os of oneshots) {
      if (os.photoCouverturePath) known.add(os.photoCouverturePath);
      const photos = await firstValueFrom(this.osService.getPhotosOnce(os.id));
      photos.forEach(p => { known.add(p.storagePath); if (p.thumbnailPath) known.add(p.thumbnailPath); });
    }
    this.progress.set({ label: 'Lecture Firestore…', current: 2, total: 8 });

    // Défis
    const defis = await firstValueFrom(this.defiService.getDefisOnce());
    for (const defi of defis) {
      if (defi.photoCouverturePath) known.add(defi.photoCouverturePath);
      const photos = await firstValueFrom(this.defiService.getPhotosOnce(defi.id));
      photos.forEach(p => { known.add(p.storagePath); if (p.thumbnailPath) known.add(p.thumbnailPath); });
    }
    this.progress.set({ label: 'Lecture Firestore…', current: 3, total: 8 });

    // Sorties
    const sorties = await firstValueFrom(this.sortieService.getSortiesOnce());
    for (const sortie of sorties) {
      if (sortie.imageEvenementPath) known.add(sortie.imageEvenementPath);
      const photos = await firstValueFrom(this.sortieService.getPhotosOnce(sortie.id));
      photos.forEach(p => { known.add(p.storagePath); if (p.thumbnailPath) known.add(p.thumbnailPath); });
    }
    this.progress.set({ label: 'Lecture Firestore…', current: 4, total: 8 });

    // Actualités
    const articles = await firstValueFrom(this.articleService.getAllArticles());
    articles.forEach(a => { if (a.couvertureStoragePath) known.add(a.couvertureStoragePath); });
    this.progress.set({ label: 'Lecture Firestore…', current: 5, total: 8 });

    // Portfolio membres
    const portfolioSnap = await getDocs(collection(db, 'photos'));
    portfolioSnap.docs.forEach(d => {
      const data = d.data() as { storagePath?: string; thumbnailPath?: string };
      if (data.storagePath)   known.add(data.storagePath);
      if (data.thumbnailPath) known.add(data.thumbnailPath);
    });
    this.progress.set({ label: 'Lecture Firestore…', current: 6, total: 8 });

    // Photos profil / bandeau membres
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.docs.forEach(d => {
      const uid = d.id;
      const data = d.data() as { photoProfilUrl?: string; photoBandeauUrl?: string };
      if (data.photoProfilUrl)  known.add(`user-photos/${uid}/profil.webp`);
      if (data.photoBandeauUrl) known.add(`user-photos/${uid}/bandeau.webp`);
    });
    this.progress.set({ label: 'Lecture Firestore…', current: 7, total: 8 });

    // Expositions
    const expositionsSnap = await getDocs(collection(db, 'expositions'));
    for (const expoDoc of expositionsSnap.docs) {
      const data = expoDoc.data() as { photoCouverturePath?: string };
      if (data.photoCouverturePath) known.add(data.photoCouverturePath);
      const expoPhotos = await getDocs(collection(db, 'expositions', expoDoc.id, 'photos'));
      expoPhotos.docs.forEach(pd => {
        const p = pd.data() as { storagePath?: string; thumbnailPath?: string };
        if (p.storagePath)   known.add(p.storagePath);
        if (p.thumbnailPath) known.add(p.thumbnailPath);
      });
    }
    this.progress.set({ label: 'Lecture Firestore…', current: 8, total: 8 });

    // Lister les fichiers Storage sous les 8 préfixes
    this.progress.set({ label: 'Scan Storage…', current: 0, total: 8 });
    const storageFiles: string[] = [];
    const prefixes = ['themes', 'oneshots', 'defis', 'sorties', 'articles', 'photos', 'user-photos', 'expositions'];
    for (let i = 0; i < prefixes.length; i++) {
      this.progress.set({ label: `Scan Storage — ${prefixes[i]}/…`, current: i, total: 8 });
      storageFiles.push(...await this.listStorageFiles(prefixes[i]));
    }

    const orphans = storageFiles.filter(p => !known.has(p));
    this.progress.set(null);
    return { scanned: storageFiles.length, orphanCount: orphans.length, orphanPaths: orphans.slice(0, 100) };
  }

  async executeOrphans(preview: OrphanPreview): Promise<{ deleted: number }> {
    // Re-run preview to get the full list (not just the first 100)
    const full = await this.previewOrphans();

    let deleted = 0;
    this.progress.set({ label: 'Suppression orphelins…', current: 0, total: full.orphanPaths.length });

    for (let i = 0; i < full.orphanPaths.length; i++) {
      const path = full.orphanPaths[i];
      this.progress.set({ label: path, current: i + 1, total: full.orphanPaths.length });
      try {
        await deleteObject(ref(storage, path));
        deleted++;
      } catch { /* fichier déjà absent, on continue */ }
    }
    this.progress.set(null);
    return { deleted };
  }
}
