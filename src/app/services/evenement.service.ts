import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, addDoc, deleteDoc, updateDoc, query, orderBy
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Evenement } from '../models/evenement.model';

@Injectable({ providedIn: 'root' })
export class EvenementService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  getEvenements(): Observable<Evenement[]> {
    const q = query(collection(this.firestore, 'evenements'), orderBy('date', 'asc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Evenement[]>;
  }

  async creer(data: Omit<Evenement, 'id' | 'dateCreation'>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'evenements'), { ...data, dateCreation: new Date().toISOString() })
    );
  }

  async modifier(id: string, data: Partial<Omit<Evenement, 'id' | 'dateCreation'>>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'evenements', id), data as Record<string, unknown>)
    );
  }

  async supprimer(id: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'evenements', id))
    );
  }
}
