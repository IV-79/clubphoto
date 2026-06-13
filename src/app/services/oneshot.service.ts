import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, setDoc, query, where, orderBy, arrayUnion, arrayRemove
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import {
  OneShot, OneShotTheme, OneShotInscription,
  OneShotPhoto, OneShotVote, OneShotStatut
} from '../models/oneshot.model';
import { PhotoExif } from '../models/photo.model';
import { Commentaire, Reponse } from '../models/commentaire.model';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';

export interface OneShotUploadState {
  progress: number;
  done: boolean;
  photo?: OneShotPhoto;
}

@Injectable({ providedIn: 'root' })
export class OneShotService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private injector = inject(Injector);

  // --- OneShot ---

  async create(data: { titre: string; description?: string; creatorUid: string; nomCreateur: string; date?: string }): Promise<string> {
    const ref = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'oneshots'), {
        ...data,
        statut: 'preparation' as OneShotStatut,
        dateCreation: new Date().toISOString(),
      })
    );
    return ref.id;
  }

  getOneShot(id: string): Observable<OneShot> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'oneshots', id), { idField: 'id' })
    ) as Observable<OneShot>;
  }

  getMyOneShots(uid: string): Observable<OneShot[]> {
    const q = query(
      collection(this.firestore, 'oneshots'),
      where('creatorUid', '==', uid),
      orderBy('dateCreation', 'desc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<OneShot[]>;
  }

  getPublicOneShots(): Observable<OneShot[]> {
    const q = query(
      collection(this.firestore, 'oneshots'),
      where('statut', 'in', ['inscription', 'fermeture_inscriptions', 'vote', 'resultats'])
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<OneShot[]>;
  }

  async updateDate(id: string, date: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', id), { date })
    );
  }

  async updateStatut(id: string, statut: OneShotStatut): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', id), { statut })
    );
  }

  // --- Thèmes ---

  getThemes(oneShotId: string): Observable<OneShotTheme[]> {
    const q = query(
      collection(this.firestore, `oneshots/${oneShotId}/themes`),
      orderBy('ordre')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<OneShotTheme[]>;
  }

  async addTheme(oneShotId: string, nom: string, ordre: number): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `oneshots/${oneShotId}/themes`), { nom, ordre })
    );
  }

  async updateTheme(oneShotId: string, themeId: string, nom: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/themes`, themeId), { nom })
    );
  }

  async deleteTheme(oneShotId: string, themeId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `oneshots/${oneShotId}/themes`, themeId))
    );
  }

  // --- Inscriptions ---

  getInscriptions(oneShotId: string): Observable<OneShotInscription[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `oneshots/${oneShotId}/inscriptions`))
    ) as Observable<OneShotInscription[]>;
  }

  async inscrire(oneShotId: string, uid: string, nomMembre: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `oneshots/${oneShotId}/inscriptions`, uid), {
        uid, nomMembre, dateInscription: new Date().toISOString(),
      })
    );
  }

  async desinscrire(oneShotId: string, uid: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `oneshots/${oneShotId}/inscriptions`, uid))
    );
  }

  // --- Photos ---

  getPhotos(oneShotId: string): Observable<OneShotPhoto[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `oneshots/${oneShotId}/photos`), { idField: 'id' })
    ) as Observable<OneShotPhoto[]>;
  }

  uploadPhoto(
    file: File,
    oneShotId: string,
    meta: { membreUid: string; nomMembre: string; themeId: string; exif?: PhotoExif }
  ): Observable<OneShotUploadState> {
    return new Observable(observer => {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `oneshots/${oneShotId}/${generateId()}.${ext}`;
      const storageRef = ref(this.storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on('state_changed',
        snap => observer.next({ progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100), done: false }),
        err => observer.error(err),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          const data: Omit<OneShotPhoto, 'id'> = {
            url, storagePath, uploadedAt: new Date().toISOString(),
            membreUid: meta.membreUid, nomMembre: meta.nomMembre, themeId: meta.themeId,
            ...(hasExif(meta.exif) ? { exif: meta.exif } : {}),
          };
          const docRef = await runInInjectionContext(this.injector, () =>
            addDoc(collection(this.firestore, `oneshots/${oneShotId}/photos`), data)
          );
          observer.next({ progress: 100, done: true, photo: { id: docRef.id, ...data } });
          observer.complete();
        }
      );
    });
  }

  async updatePhotoAssignment(oneShotId: string, photoId: string, data: { membreUid: string; nomMembre: string; themeId: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/photos`, photoId), data)
    );
  }

  async deletePhoto(oneShotId: string, photo: OneShotPhoto): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      Promise.all([
        deleteObject(ref(this.storage, photo.storagePath)),
        deleteDoc(doc(this.firestore, `oneshots/${oneShotId}/photos`, photo.id)),
      ])
    );
  }

  // --- Votes ---

  getMyVotes(oneShotId: string, voterUid: string): Observable<OneShotVote[]> {
    const q = query(
      collection(this.firestore, `oneshots/${oneShotId}/votes`),
      where('voterUid', '==', voterUid)
    );
    return runInInjectionContext(this.injector, () => collectionData(q)) as Observable<OneShotVote[]>;
  }

  getAllVotes(oneShotId: string): Observable<OneShotVote[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `oneshots/${oneShotId}/votes`))
    ) as Observable<OneShotVote[]>;
  }

  async vote(oneShotId: string, voterUid: string, themeId: string, photoId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `oneshots/${oneShotId}/votes`, `${voterUid}_${themeId}`), {
        voterUid, themeId, photoId, votedAt: new Date().toISOString(),
      })
    );
  }

  // --- Likes ---

  async toggleLikePhoto(oneShotId: string, photoId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/photos`, photoId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
  }

  // --- Commentaires ---

  getCommentaires(oneShotId: string, photoId: string): Observable<Commentaire[]> {
    const q = query(
      collection(this.firestore, `oneshots/${oneShotId}/photos/${photoId}/commentaires`),
      orderBy('createdAt', 'asc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Commentaire[]>;
  }

  async addCommentaire(oneShotId: string, photoId: string, data: { texte: string; auteurUid: string; nomAuteur: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `oneshots/${oneShotId}/photos/${photoId}/commentaires`), {
        ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
      })
    );
  }

  async deleteCommentaire(oneShotId: string, photoId: string, commentId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId))
    );
  }

  async toggleLikeCommentaire(oneShotId: string, photoId: string, commentId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
  }

  async addReply(oneShotId: string, photoId: string, commentId: string, reply: Omit<Reponse, 'id'>): Promise<void> {
    const replyWithId: Reponse = { ...reply, id: generateId() };
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId), {
        replies: arrayUnion(replyWithId),
      })
    );
  }

  async deleteReply(oneShotId: string, photoId: string, commentId: string, replyId: string, allReplies: Reponse[]): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId), {
        replies: allReplies.filter(r => r.id !== replyId),
      })
    );
  }
}
