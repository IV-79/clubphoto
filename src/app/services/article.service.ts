import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc,
  addDoc, updateDoc, deleteDoc, query, orderBy, where, deleteField, getDocs
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Article } from '../models/article.model';
import { compressImage, COMPRESS_ACTUALITE } from '../utils/image-compress';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private firestore    = inject(Firestore);
  private storage      = inject(Storage);
  private injector     = inject(Injector);
  private notifService = inject(NotificationService);

  getAllArticles(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'articles'), orderBy('dateCreation', 'desc')),
        { idField: 'id' }
      )
    ) as Observable<Article[]>;
  }

  // Articles publics visibles par tout le monde (y compris anonymes)
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

  getPublicArticlesOnce(): Observable<Article[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'articles'),
        where('statut', '==', 'publie'), where('portee', '==', 'public'),
        orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Article))));
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

  async addArticle(article: Omit<Article, 'id'>): Promise<string> {
    const clean = Object.fromEntries(
      Object.entries(article).filter(([, v]) => v !== undefined)
    );
    const ref = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'articles'), clean)
    );
    if (article.statut === 'publie') {
      this.notifService.broadcast('article',
        `${article.auteurNom} a publié un nouvel article : « ${article.titre} »`,
        { lien: '/actualites', sourceNom: article.auteurNom, excludeUid: article.auteurUid }
      ).catch(() => {});
    }
    return ref.id;
  }

  async updateArticle(
    id: string,
    data: Partial<Omit<Article, 'id' | 'dateCreation' | 'auteurUid'>>,
    publishNotif?: { titre: string; auteurNom: string; auteurUid: string }
  ): Promise<void> {
    const mapped = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === undefined ? deleteField() : v])
    );
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'articles', id), {
        ...mapped,
        dateMiseAJour: new Date().toISOString(),
      })
    );
    if (publishNotif && data.statut === 'publie') {
      this.notifService.broadcast('article',
        `${publishNotif.auteurNom} a publié un article : « ${publishNotif.titre} »`,
        { lien: '/actualites', sourceNom: publishNotif.auteurNom, excludeUid: publishNotif.auteurUid }
      ).catch(() => {});
    }
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
    return compressImage(file, COMPRESS_ACTUALITE).then(compressed => {
      const path = `articles/${articleId}/couverture.webp`;
      const storageRef = ref(this.storage, path);
      return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, compressed, { contentType: 'image/webp' });
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
