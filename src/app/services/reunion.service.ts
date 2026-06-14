import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, addDoc, deleteDoc, updateDoc, query, orderBy
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Reunion } from '../models/reunion.model';

@Injectable({ providedIn: 'root' })
export class ReunionService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  getReunions(): Observable<Reunion[]> {
    const q = query(collection(this.firestore, 'reunions'), orderBy('date', 'asc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Reunion[]>;
  }

  async creer(data: Omit<Reunion, 'id' | 'dateCreation' | 'type'>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'reunions'), {
        ...data,
        type: 'reunion',
        dateCreation: new Date().toISOString(),
      })
    );
  }

  async modifier(id: string, data: Partial<Omit<Reunion, 'id' | 'dateCreation' | 'type'>>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'reunions', id), data as Record<string, unknown>)
    );
  }

  async supprimer(id: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'reunions', id))
    );
  }
}
