import { Injectable } from '@angular/core';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Observable, from, map, catchError, of } from 'rxjs';
import { db, storage, docStream } from '../utils/firebase';
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
  maxPhotosPortfolio?: number;
  joursAvantEvenement?: number;
  joursApresEvenement?: number;
}

const CONFIG_CATEGORIES = 'config/photoCategories';
const CONFIG_SITE = 'config/siteConfig';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  getCategories(): Observable<CategorieConfig[]> {
    return docStream<any>(doc(db, CONFIG_CATEGORIES)).pipe(
      map((data: any) => data?.items ?? (PHOTO_CATEGORIES as CategorieConfig[])),
      catchError(() => of(PHOTO_CATEGORIES as CategorieConfig[])),
    );
  }

  getCategoriesOnce(): Observable<CategorieConfig[]> {
    return from(getDoc(doc(db, CONFIG_CATEGORIES))).pipe(
      map((snap) => (snap.exists() ? (snap.data() as any)?.items : null) ?? (PHOTO_CATEGORIES as CategorieConfig[])),
      catchError(() => of(PHOTO_CATEGORIES as CategorieConfig[])),
    );
  }

  async saveCategories(items: CategorieConfig[]): Promise<void> {
    await setDoc(doc(db, CONFIG_CATEGORIES), { items });
  }

  getSiteConfig(): Observable<SiteConfig> {
    return docStream<any>(doc(db, CONFIG_SITE)).pipe(
      map((data: any) => (data ?? {}) as SiteConfig),
      catchError(() => of({} as SiteConfig)),
    );
  }

  getSiteConfigOnce(): Observable<SiteConfig> {
    return from(getDoc(doc(db, CONFIG_SITE))).pipe(
      map((d: any) => (d.exists() ? d.data() : {}) as SiteConfig),
      catchError(() => of({} as SiteConfig)),
    );
  }

  async saveSiteConfig(config: Partial<SiteConfig>): Promise<void> {
    await setDoc(doc(db, CONFIG_SITE), config, { merge: true });
  }

  async uploadHeroImage(file: File): Promise<{ url: string; storagePath: string }> {
    const compressed = await compressImage(file, COMPRESS_HERO);
    const storagePath = 'config/hero.webp';
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, compressed);
    await new Promise<void>((resolve, reject) => task.on('state_changed', null, reject, resolve));
    const url = await getDownloadURL(storageRef);
    return { url, storagePath };
  }

  async deleteHeroImage(storagePath: string): Promise<void> {
    await deleteObject(ref(storage, storagePath));
  }
}
