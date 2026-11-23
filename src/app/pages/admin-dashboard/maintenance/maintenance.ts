import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import {
  CleanupService,
  CleanupPreview,
  CleanupResult,
  OrphanPreview,
} from '../../../services/cleanup.service';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { OneShotService } from '../../../services/oneshot.service';
import { ConfirmService } from '../../../services/confirm.service';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { ref, getDownloadURL, getBytes } from 'firebase/storage';
import { db, storage, uploadStatic } from '../../../utils/firebase';
import { compressImage, COMPRESS_PORTFOLIO, COMPRESS_THUMB } from '../../../utils/image-compress';

@Component({
  selector: 'app-maintenance',
  imports: [MatIconModule, DatePickerComponent],
  templateUrl: './maintenance.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './maintenance.css',
})
export class Maintenance implements OnInit {
  cleanupService = inject(CleanupService);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private oneShotService = inject(OneShotService);
  private confirmService = inject(ConfirmService);

  // ── Cleanup ──────────────────────────────────────────────────────────────

  cleanupThemesDate = signal('');
  cleanupOsDate = signal('');
  cleanupDefiDate = signal('');
  cleanupSortieDate = signal('');
  cleanupArticleDate = signal('');

  keepTop3Themes = signal(true);
  keepTop3Os = signal(true);
  keepTop3Defis = signal(true);
  articleExpiredOnly = signal(true);

  cleanupThemesPreview = signal<CleanupPreview | null>(null);
  cleanupOsPreview = signal<CleanupPreview | null>(null);
  cleanupDefiPreview = signal<CleanupPreview | null>(null);
  cleanupSortiePreview = signal<CleanupPreview | null>(null);
  cleanupArticlePreview = signal<CleanupPreview | null>(null);
  orphanPreview = signal<OrphanPreview | null>(null);

  cleanupThemesResult = signal<CleanupResult | null>(null);
  cleanupOsResult = signal<CleanupResult | null>(null);
  cleanupDefiResult = signal<CleanupResult | null>(null);
  cleanupSortieResult = signal<CleanupResult | null>(null);
  cleanupArticleResult = signal<CleanupResult | null>(null);
  orphanResult = signal<{ deleted: number } | null>(null);

  cleanupRunning = signal(false);

  // ── Recalculs ────────────────────────────────────────────────────────────

  recalculThemesRunning = signal(false);
  recalculThemesOk = signal(false);
  recalculThemesProgress = signal('');
  recalculStorageRunning = signal(false);
  recalculStorageOk = signal(false);
  recalculStorageProgress = signal('');
  recalculOsRunning = signal(false);
  recalculOsOk = signal(false);
  recalculOsProgress = signal('');

  // ── Réencodage portfolio ─────────────────────────────────────────────────

  reencodeRunning = signal(false);
  reencodeOk = signal(false);
  reencodeProgress = signal('');
  reencodeResult = signal<{ scanned: number; reencoded: number; savedBytes: number } | null>(null);

  // TMP nettoyage — à supprimer après usage
  reencodeAllRunning = signal(false);
  reencodeAllOk = signal(false);
  reencodeAllProgress = signal('');
  reencodeAllResult = signal<{ scanned: number; reencoded: number; savedBytes: number } | null>(null);

  private twoYearsAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().split('T')[0];
  }

  ngOnInit() {
    const ago = this.twoYearsAgo();
    this.cleanupThemesDate.set(ago);
    this.cleanupOsDate.set(ago);
    this.cleanupDefiDate.set(ago);
    this.cleanupSortieDate.set(ago);
    this.cleanupArticleDate.set(ago);
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 Ko';
    if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} Ko`;
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} Mo`;
    return `${(bytes / 1_073_741_824).toFixed(2)} Go`;
  }

  onThemesDateChange(d: string) {
    this.cleanupThemesDate.set(d);
    this.cleanupThemesPreview.set(null);
    this.cleanupThemesResult.set(null);
  }
  onOsDateChange(d: string) {
    this.cleanupOsDate.set(d);
    this.cleanupOsPreview.set(null);
    this.cleanupOsResult.set(null);
  }
  onDefiDateChange(d: string) {
    this.cleanupDefiDate.set(d);
    this.cleanupDefiPreview.set(null);
    this.cleanupDefiResult.set(null);
  }
  onSortieDate(d: string) {
    this.cleanupSortieDate.set(d);
    this.cleanupSortiePreview.set(null);
    this.cleanupSortieResult.set(null);
  }
  onArticleDateChange(d: string) {
    this.cleanupArticleDate.set(d);
    this.cleanupArticlePreview.set(null);
    this.cleanupArticleResult.set(null);
  }

  onTop3ThemesChange(e: Event) {
    this.keepTop3Themes.set((e.target as HTMLInputElement).checked);
    this.cleanupThemesPreview.set(null);
  }
  onTop3OsChange(e: Event) {
    this.keepTop3Os.set((e.target as HTMLInputElement).checked);
    this.cleanupOsPreview.set(null);
  }
  onTop3DefiChange(e: Event) {
    this.keepTop3Defis.set((e.target as HTMLInputElement).checked);
    this.cleanupDefiPreview.set(null);
  }
  onArticleExpiredOnlyChange(e: Event) {
    this.articleExpiredOnly.set((e.target as HTMLInputElement).checked);
    this.cleanupArticlePreview.set(null);
  }

  async previewThemes() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupThemesResult.set(null);
      this.cleanupThemesPreview.set(
        await this.cleanupService.previewThemes(this.cleanupThemesDate(), this.keepTop3Themes()),
      );
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async executeThemes() {
    const p = this.cleanupThemesPreview();
    if (
      !p ||
      !(await this.confirmService.confirm(
        `Supprimer définitivement ${p.photosToDelete} photo(s) des thèmes anciens ? Cette action est irréversible.`,
      ))
    )
      return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupThemesResult.set(
        await this.cleanupService.executeThemes(this.cleanupThemesDate(), this.keepTop3Themes()),
      );
      this.cleanupThemesPreview.set(null);
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async previewOs() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupOsResult.set(null);
      this.cleanupOsPreview.set(
        await this.cleanupService.previewOneshots(this.cleanupOsDate(), this.keepTop3Os()),
      );
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async executeOs() {
    const p = this.cleanupOsPreview();
    if (
      !p ||
      !(await this.confirmService.confirm(
        `Supprimer définitivement ${p.photosToDelete} photo(s) des one-shots anciens ? Cette action est irréversible.`,
      ))
    )
      return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupOsResult.set(
        await this.cleanupService.executeOneshots(this.cleanupOsDate(), this.keepTop3Os()),
      );
      this.cleanupOsPreview.set(null);
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async previewDefis() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupDefiResult.set(null);
      this.cleanupDefiPreview.set(
        await this.cleanupService.previewDefis(this.cleanupDefiDate(), this.keepTop3Defis()),
      );
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async executeDefis() {
    const p = this.cleanupDefiPreview();
    if (
      !p ||
      !(await this.confirmService.confirm(
        `Supprimer définitivement ${p.photosToDelete} photo(s) des défis anciens ? Cette action est irréversible.`,
      ))
    )
      return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupDefiResult.set(
        await this.cleanupService.executeDefis(this.cleanupDefiDate(), this.keepTop3Defis()),
      );
      this.cleanupDefiPreview.set(null);
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async previewSorties() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupSortieResult.set(null);
      this.cleanupSortiePreview.set(
        await this.cleanupService.previewSorties(this.cleanupSortieDate()),
      );
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async executeSorties() {
    const p = this.cleanupSortiePreview();
    if (
      !p ||
      !(await this.confirmService.confirm(
        `Supprimer définitivement toutes les ${p.photosToDelete} photo(s) des sorties anciennes ? Les documents de sortie sont conservés. Cette action est irréversible.`,
      ))
    )
      return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupSortieResult.set(
        await this.cleanupService.executeSorties(this.cleanupSortieDate()),
      );
      this.cleanupSortiePreview.set(null);
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async previewArticles() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupArticleResult.set(null);
      this.cleanupArticlePreview.set(
        await this.cleanupService.previewArticles(
          this.cleanupArticleDate(),
          this.articleExpiredOnly(),
        ),
      );
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async executeArticles() {
    const p = this.cleanupArticlePreview();
    if (
      !p ||
      !(await this.confirmService.confirm(
        `Supprimer définitivement ${p.events} article(s) et leur image de couverture ? Cette action est irréversible.`,
      ))
    )
      return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupArticleResult.set(
        await this.cleanupService.executeArticles(
          this.cleanupArticleDate(),
          this.articleExpiredOnly(),
        ),
      );
      this.cleanupArticlePreview.set(null);
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async previewOrphans() {
    this.cleanupRunning.set(true);
    try {
      this.orphanResult.set(null);
      this.orphanPreview.set(await this.cleanupService.previewOrphans());
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async executeOrphans() {
    const p = this.orphanPreview();
    if (
      !p ||
      !(await this.confirmService.confirm(
        `Supprimer définitivement ${p.orphanCount} fichier(s) orphelins de Storage ? Cette action est irréversible.`,
      ))
    )
      return;
    this.cleanupRunning.set(true);
    try {
      this.orphanResult.set(await this.cleanupService.executeOrphans(p));
      this.orphanPreview.set(null);
    } catch (e) {
      console.error(e);
    } finally {
      this.cleanupRunning.set(false);
    }
  }

  async recalculerCompteursThemes() {
    if (this.recalculThemesRunning()) return;
    this.recalculThemesRunning.set(true);
    this.recalculThemesOk.set(false);
    try {
      const themes = await firstValueFrom(this.themeService.getThemesOnce());
      let i = 0;
      for (const theme of themes) {
        i++;
        this.recalculThemesProgress.set(`${i}/${themes.length}`);
        await this.themeService.recalculeCompteurs(theme.id);
      }
      this.recalculThemesProgress.set('');
      this.recalculThemesOk.set(true);
      setTimeout(() => this.recalculThemesOk.set(false), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      this.recalculThemesRunning.set(false);
    }
  }

  async recalculerCompteursOneShots() {
    if (this.recalculOsRunning()) return;
    this.recalculOsRunning.set(true);
    this.recalculOsOk.set(false);
    try {
      const oneshots = await firstValueFrom(this.oneShotService.getAllOneShotsOnce());
      let i = 0;
      for (const os of oneshots) {
        i++;
        this.recalculOsProgress.set(`${i}/${oneshots.length}`);
        await this.oneShotService.recalculeCompteurs(os.id);
      }
      this.recalculOsProgress.set('');
      this.recalculOsOk.set(true);
      setTimeout(() => this.recalculOsOk.set(false), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      this.recalculOsRunning.set(false);
    }
  }

  async reencodePhotosLourdes() {
    if (this.reencodeRunning()) return;
    this.reencodeRunning.set(true);
    this.reencodeResult.set(null);
    this.reencodeProgress.set('Scan…');
    try {
      const q = query(collection(db, 'photos'), where('fileSize', '>', 5 * 1024 * 1024));
      const snap = await getDocs(q);
      const photos = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as {
          uid: string;
          url: string;
          storagePath: string;
          thumbnailPath?: string;
          fileSize: number;
        }),
      }));

      let reencoded = 0;
      let savedBytes = 0;
      const affectedUids = new Set<string>();

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        this.reencodeProgress.set(`${i + 1}/${photos.length}`);
        try {
          const bytes = await getBytes(ref(storage, photo.storagePath));
          const filename = photo.storagePath.split('/').pop() ?? 'photo.webp';
          const type = filename.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
          const file = new File([bytes], filename, { type });

          const mainNew = await compressImage(file, COMPRESS_PORTFOLIO);
          const thumbNew = await compressImage(mainNew, COMPRESS_THUMB);
          const newSize = mainNew.size + thumbNew.size;
          if (newSize >= photo.fileSize) continue;

          const mainRef = ref(storage, photo.storagePath);
          await uploadStatic(mainRef, mainNew);
          const newUrl = await getDownloadURL(mainRef);

          let newThumbUrl: string | undefined;
          if (photo.thumbnailPath) {
            const thumbRef = ref(storage, photo.thumbnailPath);
            await uploadStatic(thumbRef, thumbNew);
            newThumbUrl = await getDownloadURL(thumbRef);
          }

          await updateDoc(doc(db, 'photos', photo.id), {
            url: newUrl,
            fileSize: newSize,
            ...(newThumbUrl ? { thumbnailUrl: newThumbUrl } : {}),
          });

          savedBytes += photo.fileSize - newSize;
          affectedUids.add(photo.uid);
          reencoded++;
        } catch (e) {
          console.error(`Erreur photo ${photo.id}:`, e);
        }
      }

      for (const uid of affectedUids) {
        await this.authService.recalculateStorage(uid);
      }
      if (affectedUids.size > 0) {
        this.authService.invalidateAllMembresCache();
      }

      this.reencodeResult.set({ scanned: photos.length, reencoded, savedBytes });
      if (reencoded > 0) {
        this.reencodeOk.set(true);
        setTimeout(() => this.reencodeOk.set(false), 6000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.reencodeRunning.set(false);
      this.reencodeProgress.set('');
    }
  }

  // TMP nettoyage — à supprimer après usage
  async reencodeToutes() {
    if (this.reencodeAllRunning()) return;
    this.reencodeAllRunning.set(true);
    this.reencodeAllResult.set(null);
    this.reencodeAllProgress.set('Scan…');
    try {
      const snap = await getDocs(collection(db, 'photos'));
      const photos = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as {
          uid: string;
          url: string;
          storagePath: string;
          thumbnailPath?: string;
          fileSize: number;
        }),
      }));

      let reencoded = 0;
      let savedBytes = 0;
      const affectedUids = new Set<string>();

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        this.reencodeAllProgress.set(`${i + 1}/${photos.length}`);
        try {
          const bytes = await getBytes(ref(storage, photo.storagePath));
          const filename = photo.storagePath.split('/').pop() ?? 'photo.webp';
          const type = filename.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
          const file = new File([bytes], filename, { type });

          const mainNew = await compressImage(file, COMPRESS_PORTFOLIO);
          const thumbNew = await compressImage(mainNew, COMPRESS_THUMB);
          const newSize = mainNew.size + thumbNew.size;
          if (newSize >= photo.fileSize) continue;

          const mainRef = ref(storage, photo.storagePath);
          await uploadStatic(mainRef, mainNew);
          const newUrl = await getDownloadURL(mainRef);

          let newThumbUrl: string | undefined;
          if (photo.thumbnailPath) {
            const thumbRef = ref(storage, photo.thumbnailPath);
            await uploadStatic(thumbRef, thumbNew);
            newThumbUrl = await getDownloadURL(thumbRef);
          }

          await updateDoc(doc(db, 'photos', photo.id), {
            url: newUrl,
            fileSize: newSize,
            ...(newThumbUrl ? { thumbnailUrl: newThumbUrl } : {}),
          });

          savedBytes += photo.fileSize - newSize;
          affectedUids.add(photo.uid);
          reencoded++;
        } catch (e) {
          console.error(`Erreur photo ${photo.id}:`, e);
        }
      }

      for (const uid of affectedUids) {
        await this.authService.recalculateStorage(uid);
      }
      if (affectedUids.size > 0) {
        this.authService.invalidateAllMembresCache();
      }

      this.reencodeAllResult.set({ scanned: photos.length, reencoded, savedBytes });
      if (reencoded > 0) {
        this.reencodeAllOk.set(true);
        setTimeout(() => this.reencodeAllOk.set(false), 6000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.reencodeAllRunning.set(false);
      this.reencodeAllProgress.set('');
    }
  }

  async recalculerStockageMembres() {
    if (this.recalculStorageRunning()) return;
    this.recalculStorageRunning.set(true);
    this.recalculStorageOk.set(false);
    try {
      const membres = await firstValueFrom(this.authService.getAllMembersOnce());
      let i = 0;
      for (const m of membres) {
        i++;
        this.recalculStorageProgress.set(`${i}/${membres.length}`);
        await this.authService.recalculateStorage(m.uid);
      }
      this.recalculStorageProgress.set('');
      this.recalculStorageOk.set(true);
      setTimeout(() => this.recalculStorageOk.set(false), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      this.recalculStorageRunning.set(false);
    }
  }
}
