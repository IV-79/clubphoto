import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, deleteDoc, setDoc, query, where, orderBy,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { ThemeMensuel, ThemeSoumission, ThemeVote } from '../models/theme.model';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private injector  = inject(Injector);

  private col() {
    return collection(this.firestore, 'themes');
  }

  getThemes(): Observable<ThemeMensuel[]> {
    const q = query(this.col(), orderBy('mois', 'desc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeMensuel[]>;
  }

  getTheme(id: string): Observable<ThemeMensuel | undefined> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'themes', id), { idField: 'id' })
    ) as Observable<ThemeMensuel | undefined>;
  }

  getSoumissions(themeId: string): Observable<ThemeSoumission[]> {
    const q = query(
      collection(this.firestore, 'themes', themeId, 'soumissions'),
      orderBy('uploadedAt', 'asc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeSoumission[]>;
  }

  getMesVotes(themeId: string, uid: string): Observable<ThemeVote[]> {
    const q = query(
      collection(this.firestore, 'themes', themeId, 'votes'),
      where('voterUid', '==', uid)
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeVote[]>;
  }

  getTousVotes(themeId: string): Observable<ThemeVote[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        collection(this.firestore, 'themes', themeId, 'votes'),
        { idField: 'id' }
      )
    ) as Observable<ThemeVote[]>;
  }

  async creerTheme(data: {
    titre: string;
    description: string;
    mois: string;
    dateOuverture: string;
    dateCloture: string;
    dateFinVote: string;
    maxPhotos: number;
    maxVotes: number;
    createdBy: string;
  }): Promise<void> {
    await addDoc(this.col(), {
      ...data,
      dateCreation: new Date().toISOString(),
    });
  }

  async supprimerTheme(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'themes', id));
  }

  async uploadSoumission(
    themeId: string,
    uid: string,
    nomMembre: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const storagePath = `themes/${themeId}/${uid}_${Date.now()}.jpg`;
    const storageRef = ref(this.storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => {
          try {
            const url = await getDownloadURL(storageRef);
            await addDoc(
              collection(this.firestore, 'themes', themeId, 'soumissions'),
              { membreUid: uid, nomMembre, url, storagePath, uploadedAt: new Date().toISOString() }
            );
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  async deleteSoumission(themeId: string, soumissionId: string, storagePath: string): Promise<void> {
    await Promise.all([
      deleteObject(ref(this.storage, storagePath)).catch(() => {}),
      deleteDoc(doc(this.firestore, 'themes', themeId, 'soumissions', soumissionId)),
    ]);
  }

  async voter(themeId: string, voterUid: string, soumissionId: string): Promise<void> {
    await setDoc(
      doc(this.firestore, 'themes', themeId, 'votes', `${voterUid}_${soumissionId}`),
      { voterUid, soumissionId, votedAt: new Date().toISOString() }
    );
  }

  async deVoter(themeId: string, voterUid: string, soumissionId: string): Promise<void> {
    await deleteDoc(
      doc(this.firestore, 'themes', themeId, 'votes', `${voterUid}_${soumissionId}`)
    );
  }
}
