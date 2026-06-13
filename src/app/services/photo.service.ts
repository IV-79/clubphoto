import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import {
  Firestore, collection, collectionData, doc, addDoc, deleteDoc, updateDoc, query, where, orderBy, deleteField, arrayUnion, arrayRemove
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Photo, PhotoExif, PhotoVisibilite, UploadState } from '../models/photo.model';
import { Commentaire, Reponse } from '../models/commentaire.model';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private storage = inject(Storage);
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  uploadPhoto(
    file: File,
    uid: string,
    nomMembre: string,
    meta: { titre: string; visibilite: PhotoVisibilite; categorie?: string; exif?: PhotoExif }
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
              visibilite: meta.visibilite,
              dateUpload: new Date().toISOString(),
              storagePath,
              ...(meta.categorie ? { categorie: meta.categorie as Photo['categorie'] } : {}),
              ...(meta.exif && Object.keys(meta.exif).length ? { exif: meta.exif } : {}),
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

  /** Photos visibles par un visiteur anonyme (public seulement). */
  getPhotosVisiteur(uid: string): Observable<Photo[]> {
    const q = query(
      collection(this.firestore, 'photos'),
      where('uid', '==', uid),
      where('visibilite', '==', 'public')
    );
    return (runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Photo[]>).pipe(
      map(photos => [...photos].sort((a, b) => b.dateUpload.localeCompare(a.dateUpload)))
    );
  }

  /** Photos visibles par un membre connecté (public + membre). */
  getPhotosMembre(uid: string): Observable<Photo[]> {
    const q = query(
      collection(this.firestore, 'photos'),
      where('uid', '==', uid),
      where('visibilite', 'in', ['public', 'membre'])
    );
    return (runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Photo[]>).pipe(
      map(photos => [...photos].sort((a, b) => b.dateUpload.localeCompare(a.dateUpload)))
    );
  }

  async deletePhoto(photo: Photo): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      Promise.all([
        deleteObject(ref(this.storage, photo.storagePath)),
        deleteDoc(doc(this.firestore, 'photos', photo.id))
      ])
    );
  }

  async updatePhotoMeta(photoId: string, data: { titre: string; visibilite: PhotoVisibilite; categorie: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photoId), {
        titre: data.titre,
        visibilite: data.visibilite,
        categorie: data.categorie || deleteField(),
      })
    );
  }

  async toggleVisibilite(photo: Photo): Promise<void> {
    const next: PhotoVisibilite = photo.visibilite === 'public' ? 'membre' : 'public';
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photo.id), { visibilite: next })
    );
  }

  // --- Likes ---

  async toggleLikePhoto(photoId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photoId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
  }

  // --- Commentaires ---

  getCommentaires(photoId: string): Observable<Commentaire[]> {
    const q = query(
      collection(this.firestore, `photos/${photoId}/commentaires`),
      orderBy('createdAt', 'asc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Commentaire[]>;
  }

  async addCommentaire(photoId: string, data: { texte: string; auteurUid: string; nomAuteur: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `photos/${photoId}/commentaires`), {
        ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
      })
    );
  }

  async deleteCommentaire(photoId: string, commentId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `photos/${photoId}/commentaires`, commentId))
    );
  }

  async toggleLikeCommentaire(photoId: string, commentId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `photos/${photoId}/commentaires`, commentId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
  }

  async addReply(photoId: string, commentId: string, reply: Omit<Reponse, 'id'>): Promise<void> {
    const replyWithId: Reponse = { ...reply, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` };
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `photos/${photoId}/commentaires`, commentId), {
        replies: arrayUnion(replyWithId),
      })
    );
  }

  async deleteReply(photoId: string, commentId: string, replyId: string, allReplies: Reponse[]): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `photos/${photoId}/commentaires`, commentId), {
        replies: allReplies.filter(r => r.id !== replyId),
      })
    );
  }
}
