import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable, map, catchError, of } from 'rxjs';

export type PageId = 'histoire' | 'bureau' | 'adhesion' | 'charte' | 'contact' | 'mentions-legales' | 'cgv' | 'confidentialite';

@Injectable({ providedIn: 'root' })
export class PageContentService {
  private firestore = inject(Firestore);
  private injector  = inject(Injector);

  getContent(pageId: PageId): Observable<string> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'pages', pageId))
    ).pipe(
      map((data: any) => data?.contenu ?? ''),
      catchError(() => of(''))
    );
  }

  getCharteDoc(): Observable<{ contenu: string; charteVersion: number }> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'pages', 'charte'))
    ).pipe(
      map((data: any) => ({
        contenu:        data?.contenu        ?? '',
        charteVersion:  data?.charteVersion  ?? 0,
      })),
      catchError(() => of({ contenu: '', charteVersion: 0 }))
    );
  }

  async bumpCharteVersion(): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, 'pages', 'charte'),
        { charteVersion: (Date.now()) },
        { merge: true }
      )
    );
  }

  getCguDoc(): Observable<{ contenu: string; cguVersion: number }> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'pages', 'cgv'))
    ).pipe(
      map((data: any) => ({
        contenu:    data?.contenu    ?? '',
        cguVersion: data?.cguVersion ?? 0,
      })),
      catchError(() => of({ contenu: '', cguVersion: 0 }))
    );
  }

  async bumpCguVersion(): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, 'pages', 'cgv'),
        { cguVersion: Date.now() },
        { merge: true }
      )
    );
  }

  async saveContent(pageId: PageId, contenu: string, uid: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, 'pages', pageId), {
        contenu,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      }, { merge: true })
    );
  }
}
