import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, collection, collectionData, doc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Article } from '../models/article.model';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  getArticlesPublies(max = 6): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(
          collection(this.firestore, 'articles'),
          where('publie', '==', true),
          orderBy('datePublication', 'desc'),
          limit(max)
        ),
        { idField: 'id' }
      )
    ) as Observable<Article[]>;
  }

  getAllArticles(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'articles'), orderBy('datePublication', 'desc')),
        { idField: 'id' }
      )
    ) as Observable<Article[]>;
  }

  async addArticle(article: Omit<Article, 'id'>) {
    return runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'articles'), article)
    );
  }

  async updateArticle(id: string, data: Partial<Article>) {
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'articles', id), data)
    );
  }

  async deleteArticle(id: string) {
    return runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'articles', id))
    );
  }
}
