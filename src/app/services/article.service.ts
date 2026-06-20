import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc,
  addDoc, updateDoc, deleteDoc, query, orderBy, where, deleteField
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { Article } from '../models/article.model';
import { compressToJpeg } from '../utils/image-compress';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private injector  = inject(Injector);

  getAllArticles(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'articles'), orderBy('dateCreation', 'desc')),
        { idField: 'id' }
      )
    ) as Observable<Article[]>;
  }

  getPublishedArticles(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(
          collection(this.firestore, 'articles'),
          where('statut', '==', 'publie'),
          orderBy('dateCreation', 'desc')
        ),
        { idField: 'id' }
      )
    ) as Observable<Article[]>;
  }

  getPublicArticles(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(
          collection(this.firestore, 'articles'),
          where('statut', '==', 'publie'),
          where('portee', '==', 'public'),
          orderBy('dateCreation', 'desc')
        ),
        { idField: 'id' }
      )
    ) as Observable<Article[]>;
  }

  async addArticle(article: Omit<Article, 'id'>): Promise<string> {
    const clean = Object.fromEntries(
      Object.entries(article).filter(([, v]) => v !== undefined)
    );
    const ref = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'articles'), clean)
    );
    return ref.id;
  }

  async updateArticle(id: string, data: Partial<Omit<Article, 'id' | 'dateCreation' | 'auteurUid'>>): Promise<void> {
    const mapped = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === undefined ? deleteField() : v])
    );
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'articles', id), {
        ...mapped,
        dateMiseAJour: new Date().toISOString(),
      })
    );
  }

  async deleteArticle(id: string, couvertureStoragePath?: string): Promise<void> {
    if (couvertureStoragePath) await this.deleteCouverture(couvertureStoragePath);
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'articles', id))
    );
  }

  uploadCouverture(
    articleId: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<{ url: string; storagePath: string }> {
    return compressToJpeg(file).then(compressed => {
      const path = `articles/${articleId}/couverture.jpg`;
      const storageRef = ref(this.storage, path);
      return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, compressed, { contentType: 'image/jpeg' });
        task.on('state_changed',
          snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => resolve({ url: await getDownloadURL(task.snapshot.ref), storagePath: path })
        );
      });
    });
  }

  async deleteCouverture(storagePath: string): Promise<void> {
    try { await deleteObject(ref(this.storage, storagePath)); } catch { /* ignore */ }
  }
}
