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

  private col() {
    return collection(this.firestore, 'evenements');
  }

  getEvenements(): Observable<Evenement[]> {
    const q = query(this.col(), orderBy('date', 'asc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Evenement[]>;
  }

  async creer(data: Omit<Evenement, 'id' | 'dateCreation'>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(this.col(), { ...data, dateCreation: new Date().toISOString() })
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
