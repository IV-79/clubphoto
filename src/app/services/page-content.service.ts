import { Injectable } from '@angular/core';
import { doc, setDoc } from 'firebase/firestore';
import { Observable, map, catchError, of } from 'rxjs';
import { db, docStream } from '../utils/firebase';

export type PageId =
  | 'histoire'
  | 'bureau'
  | 'adhesion'
  | 'charte'
  | 'contact'
  | 'mentions-legales'
  | 'cgv'
  | 'confidentialite';

@Injectable({ providedIn: 'root' })
export class PageContentService {
  getContent(pageId: PageId): Observable<string> {
    return docStream<any>(doc(db, 'pages', pageId)).pipe(
      map((data) => data?.contenu ?? ''),
      catchError(() => of('')),
    );
  }

  getCharteDoc(): Observable<{ contenu: string; charteVersion: number }> {
    return docStream<any>(doc(db, 'pages', 'charte')).pipe(
      map((data) => ({
        contenu: data?.contenu ?? '',
        charteVersion: data?.charteVersion ?? 0,
      })),
      catchError(() => of({ contenu: '', charteVersion: 0 })),
    );
  }

  async bumpCharteVersion(): Promise<void> {
    await setDoc(doc(db, 'pages', 'charte'), { charteVersion: Date.now() }, { merge: true });
  }

  getCguDoc(): Observable<{ contenu: string; cguVersion: number }> {
    return docStream<any>(doc(db, 'pages', 'cgv')).pipe(
      map((data) => ({
        contenu: data?.contenu ?? '',
        cguVersion: data?.cguVersion ?? 0,
      })),
      catchError(() => of({ contenu: '', cguVersion: 0 })),
    );
  }

  async bumpCguVersion(): Promise<void> {
    await setDoc(doc(db, 'pages', 'cgv'), { cguVersion: Date.now() }, { merge: true });
  }

  async saveContent(pageId: PageId, contenu: string, uid: string): Promise<void> {
    await setDoc(
      doc(db, 'pages', pageId),
      {
        contenu,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      },
      { merge: true },
    );
  }
}
