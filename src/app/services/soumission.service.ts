import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, setDoc, deleteDoc, docData, collection, collectionData, query, where } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Soumission } from '../models/soumission.model';

@Injectable({ providedIn: 'root' })
export class SoumissionService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  // ID = "{uid}_{themeId}" — un seul document par membre par thème, pas de requête composée nécessaire
  private docRef(uid: string, themeId: string) {
    return doc(this.firestore, 'soumissions', `${uid}_${themeId}`);
  }

  getMaSoumission(uid: string, themeId: string): Observable<Soumission | null> {
    return (runInInjectionContext(this.injector, () =>
      docData(this.docRef(uid, themeId), { idField: 'id' })
    ) as Observable<Soumission | undefined>).pipe(
      map(data => data ?? null)
    );
  }

  async soumettre(data: Omit<Soumission, 'id' | 'dateSoumission'>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(this.docRef(data.uid, data.themeId), {
        ...data,
        dateSoumission: new Date().toISOString(),
      })
    );
  }

  getSoumissionsTheme(themeId: string): Observable<Soumission[]> {
    const q = query(
      collection(this.firestore, 'soumissions'),
      where('themeId', '==', themeId)
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Soumission[]>;
  }

  getAllSoumissions(): Observable<Soumission[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, 'soumissions'), { idField: 'id' })
    ) as Observable<Soumission[]>;
  }

  async retirer(uid: string, themeId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(this.docRef(uid, themeId))
    );
  }
}
