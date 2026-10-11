import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../utils/firebase';
import { Partenaire } from '../models/partenaire.model';
import { generateId } from '../utils/id';

export interface LogoUploadState {
  progress: number;
  done: boolean;
  url?: string;
  path?: string;
}

@Injectable({ providedIn: 'root' })
export class PartenairesService {
  generateId(): string {
    return generateId();
  }

  getPartenaires(): Observable<Partenaire[]> {
    return from(
      getDocs(query(collection(db, 'partenaires'), orderBy('ordre', 'asc'))),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Partenaire)));
  }

  uploadLogo(file: File, id: string): Observable<LogoUploadState> {
    return new Observable((observer) => {
      const path = `partenaires/${id}.webp`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        (snap) =>
          observer.next({
            progress: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            done: false,
          }),
        (err) => observer.error(err),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          observer.next({ progress: 100, done: true, url, path });
          observer.complete();
        },
      );
    });
  }

  async creerPartenaire(id: string, data: Omit<Partenaire, 'id'>): Promise<void> {
    await setDoc(doc(db, 'partenaires', id), data);
  }

  async modifierPartenaire(id: string, data: Partial<Omit<Partenaire, 'id'>>): Promise<void> {
    await updateDoc(doc(db, 'partenaires', id), data);
  }

  async supprimerPartenaire(id: string, logoPath: string): Promise<void> {
    await Promise.all([
      deleteDoc(doc(db, 'partenaires', id)),
      deleteObject(ref(storage, logoPath)).catch(() => {}),
    ]);
  }
}
