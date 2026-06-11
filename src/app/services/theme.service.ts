import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, addDoc, deleteDoc, updateDoc,
  query, where, orderBy, getDocs, getDoc
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { ThemeMensuel } from '../models/theme.model';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  private col() {
    return collection(this.firestore, 'themes');
  }

  getThemes(): Observable<ThemeMensuel[]> {
    const q = query(this.col(), orderBy('moisAnnee', 'desc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeMensuel[]>;
  }

  getThemeOuvert(): Observable<ThemeMensuel | null> {
    const q = query(this.col(), where('statut', '==', 'ouvert'));
    return (runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeMensuel[]>).pipe(
      map(themes => themes[0] ?? null)
    );
  }

  getTheme(id: string): Observable<ThemeMensuel | null> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'themes', id))
      ).then(snap => {
        observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as ThemeMensuel : null);
        observer.complete();
      }).catch(err => observer.error(err));
    });
  }

  async creerTheme(data: { titre: string; description: string; moisAnnee: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(this.col(), {
        ...data,
        statut: 'brouillon',
        dateCreation: new Date().toISOString(),
      })
    );
  }

  async ouvrirTheme(id: string): Promise<void> {
    await runInInjectionContext(this.injector, async () => {
      const openSnap = await getDocs(query(this.col(), where('statut', '==', 'ouvert')));
      await Promise.all(
        openSnap.docs.map(d =>
          updateDoc(d.ref, { statut: 'ferme', dateFermeture: new Date().toISOString() })
        )
      );
      await updateDoc(doc(this.firestore, 'themes', id), {
        statut: 'ouvert',
        dateOuverture: new Date().toISOString(),
      });
    });
  }

  async fermerTheme(id: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'themes', id), {
        statut: 'ferme',
        dateFermeture: new Date().toISOString(),
      })
    );
  }

  async supprimerTheme(id: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'themes', id))
    );
  }
}
