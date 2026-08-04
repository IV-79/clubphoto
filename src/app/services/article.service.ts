import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc,
  addDoc, updateDoc, deleteDoc, query, orderBy, where, deleteField, getDocs,
  limit, startAfter, QueryDocumentSnapshot, DocumentData, QueryConstraint
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
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'articles'), orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Article))));
  }

  // Articles publics visibles par tout le monde (y compris anonymes)
  getPublicArticles(): Observable<Article[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'articles'),
        where('statut', '==', 'publie'), where('portee', '==', 'public'),
        orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Article))));
  }

  getPublicArticlesOnce(): Observable<Article[]> {
    return this.getPublicArticles();
  }

  async getArticlesPaged(
    role: string | null,
    pageSize: number,
    after?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{ items: Article[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    const constraints: QueryConstraint[] = [];
    if (role !== 'admin' && role !== 'contributeur') {
      constraints.push(where('statut', '==', 'publie'));
      if (!role) constraints.push(where('portee', '==', 'public'));
    }
    constraints.push(orderBy('epingle', 'desc'));
    constraints.push(orderBy('dateCreation', 'desc'));
    if (after) constraints.push(startAfter(after));
    constraints.push(limit(pageSize + 1));

    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'articles'), ...constraints))
    );
    const hasMore = snap.docs.length > pageSize;
    const docs    = snap.docs.slice(0, pageSize);
    return {
      items:  docs.map(d => ({ id: d.id, ...d.data() } as Article)),
      cursor: docs[docs.length - 1] ?? null,
      hasMore,
    };
  }

  getPublishedArticles(): Observable<Article[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'articles'),
        where('statut', '==', 'publie'),
        orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Article))));
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
