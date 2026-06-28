import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, docData, setDoc, getDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from, map, catchError, of } from 'rxjs';
import { PHOTO_CATEGORIES } from '../models/photo.model';
import { compressImage, COMPRESS_HERO } from '../utils/image-compress';

export interface CategorieConfig {
  value: string;
  label: string;
}

export interface SiteConfig {
  heroImageUrl?: string;
  heroImageStoragePath?: string;
  heroSource?: 'manuel' | 'theme_du_mois';
}

const CONFIG_CATEGORIES = 'config/photoCategories';
const CONFIG_SITE       = 'config/siteConfig';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private injector  = inject(Injector);

  getCategories(): Observable<CategorieConfig[]> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, CONFIG_CATEGORIES))
    ).pipe(
      map((data: any) => data?.items ?? (PHOTO_CATEGORIES as CategorieConfig[])),
      catchError(() => of(PHOTO_CATEGORIES as CategorieConfig[]))
    );
  }

  async saveCategories(items: CategorieConfig[]): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, CONFIG_CATEGORIES), { items })
    );
  }

  getSiteConfig(): Observable<SiteConfig> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, CONFIG_SITE))
    ).pipe(
      map((data: any) => (data ?? {}) as SiteConfig),
      catchError(() => of({} as SiteConfig))
    );
  }

  getSiteConfigOnce(): Observable<SiteConfig> {
    return from(runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, CONFIG_SITE))
    )).pipe(
      map((d: any) => (d.exists() ? d.data() : {}) as SiteConfig),
      catchError(() => of({} as SiteConfig))
    );
  }

  async saveSiteConfig(config: Partial<SiteConfig>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, CONFIG_SITE), config, { merge: true })
    );
  }

  async uploadHeroImage(file: File): Promise<{ url: string; storagePath: string }> {
    const compressed = await compressImage(file, COMPRESS_HERO);
    const storagePath = 'config/hero.webp';
    const storageRef = ref(this.storage, storagePath);
    const task = uploadBytesResumable(storageRef, compressed);
    await new Promise<void>((resolve, reject) => task.on('state_changed', null, reject, resolve));
    const url = await getDownloadURL(storageRef);
    return { url, storagePath };
  }

  async deleteHeroImage(storagePath: string): Promise<void> {
    await deleteObject(ref(this.storage, storagePath));
  }
}
