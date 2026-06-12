import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import {
  Firestore, collection, collectionData, doc, addDoc, deleteDoc, updateDoc, query, where, orderBy, deleteField
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Photo, UploadState } from '../models/photo.model';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private storage = inject(Storage);
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  uploadPhoto(
    file: File,
    uid: string,
    nomMembre: string,
    meta: { titre: string; isPublic: boolean; categorie?: string }
  ): Observable<UploadState> {
    return new Observable(observer => {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `photos/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const storageRef = ref(this.storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on(
        'state_changed',
        snapshot => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          observer.next({ state: 'uploading', progress });
        },
        error => observer.error(error),
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            const data: Omit<Photo, 'id'> = {
              uid,
              nomMembre,
              titre: meta.titre.trim() || file.name.replace(/\.[^.]+$/, ''),
              description: '',
              url,
              isPublic: meta.isPublic,
              dateUpload: new Date().toISOString(),
              storagePath,
              ...(meta.categorie ? { categorie: meta.categorie as Photo['categorie'] } : {}),
            };
            const docRef = await runInInjectionContext(this.injector, () =>
              addDoc(collection(this.firestore, 'photos'), data)
            );
            observer.next({ state: 'done', progress: 100, photo: { id: docRef.id, ...data } });
            observer.complete();
          } catch (e) {
            observer.error(e);
          }
        }
      );
    });
  }

  getMyPhotos(uid: string): Observable<Photo[]> {
    const q = query(
      collection(this.firestore, 'photos'),
      where('uid', '==', uid),
      orderBy('dateUpload', 'desc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Photo[]>;
  }

  async deletePhoto(photo: Photo): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      Promise.all([
        deleteObject(ref(this.storage, photo.storagePath)),
        deleteDoc(doc(this.firestore, 'photos', photo.id))
      ])
    );
  }

  getPublicPhotos(uid: string): Observable<Photo[]> {
    const q = query(
      collection(this.firestore, 'photos'),
      where('uid', '==', uid),
      where('isPublic', '==', true),
      orderBy('dateUpload', 'desc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Photo[]>;
  }

  async updatePhotoMeta(photoId: string, data: { titre: string; isPublic: boolean; categorie: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photoId), {
        titre: data.titre,
        isPublic: data.isPublic,
        categorie: data.categorie || deleteField(),
      })
    );
  }

  async toggleVisibility(photo: Photo): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photo.id), { isPublic: !photo.isPublic })
    );
  }
}
