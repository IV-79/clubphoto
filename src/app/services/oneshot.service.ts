import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, setDoc, query, where, orderBy, arrayUnion, arrayRemove, increment, getDocs
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import {
  OneShot, OneShotTheme, OneShotInscription,
  OneShotPhoto, OneShotVote, OneShotStatut
} from '../models/oneshot.model';
import { NotificationService } from './notification.service';
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
  private firestore     = inject(Firestore);
  private storage       = inject(Storage);
  private injector      = inject(Injector);
  private notifService  = inject(NotificationService);

  // --- OneShot ---

  async create(data: { titre: string; description?: string; lieu?: string; creatorUid: string; nomCreateur: string; date?: string }): Promise<string> {
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

  async updateDate(
    id: string,
    date: string,
    notifCtx?: { oldDate: string; titre: string; nomCreateur: string; creatorUid: string }
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', id), { date })
    );
    if (notifCtx && date && date !== notifCtx.oldDate) {
      const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      this.notifService.broadcast('oneshot',
        `La date du OneShot « ${notifCtx.titre} » a changé : ${dateStr}`,
        { lien: `/galeries/oneshots/${id}`, sourceNom: notifCtx.nomCreateur, excludeUid: notifCtx.creatorUid }
      ).catch(() => {});
    }
  }

  async updateLieu(id: string, lieu: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', id), { lieu })
    );
  }

  async deleteOneShot(id: string): Promise<void> {
    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `oneshots/${id}/photos`))
    );
    await Promise.all(
      photosSnap.docs
        .map(d => d.data()['storagePath'] as string)
        .filter(Boolean)
        .map(path => deleteObject(ref(this.storage, path)).catch(() => {}))
    );
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'oneshots', id))
    );
  }

  async updateStatut(
    id: string,
    statut: OneShotStatut,
    notifCtx?: { titre: string; nomCreateur: string; creatorUid: string }
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', id), { statut })
    );
    if (notifCtx) {
      const msgs: Partial<Record<OneShotStatut, string>> = {
        inscription:  `${notifCtx.nomCreateur} a ouvert les inscriptions pour le OneShot « ${notifCtx.titre} »`,
        vote:         `Le vote est ouvert pour le OneShot « ${notifCtx.titre} »`,
        resultats:    `Les résultats du OneShot « ${notifCtx.titre} » sont disponibles`,
      };
      const msg = msgs[statut];
      if (msg) {
        this.notifService.broadcast('oneshot', msg, {
          lien: `/galeries/oneshots/${id}`,
          sourceNom: notifCtx.nomCreateur,
          excludeUid: notifCtx.creatorUid,
        }).catch(() => {});
      }
    }
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
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', oneShotId), { nbThemes: increment(1) })
    ).catch(() => {});
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
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', oneShotId), { nbThemes: increment(-1) })
    ).catch(() => {});
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
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', oneShotId), { nbInscrits: increment(1) })
    ).catch(() => {});
  }

  async desinscrire(oneShotId: string, uid: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `oneshots/${oneShotId}/inscriptions`, uid))
    );
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'oneshots', oneShotId), { nbInscrits: increment(-1) })
    ).catch(() => {});
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
            fileSize: file.size,
            membreUid: meta.membreUid, nomMembre: meta.nomMembre, themeId: meta.themeId,
            ...(hasExif(meta.exif) ? { exif: meta.exif } : {}),
          };
          const docRef = await runInInjectionContext(this.injector, () =>
            addDoc(collection(this.firestore, `oneshots/${oneShotId}/photos`), data)
          );
          if (meta.membreUid) {
            await runInInjectionContext(this.injector, () =>
              updateDoc(doc(this.firestore, 'users', meta.membreUid), {
                'storageUsed.oneshots': increment(file.size),
              })
            ).catch(() => {});
          }
          observer.next({ progress: 100, done: true, photo: { id: docRef.id, ...data } });
          observer.complete();
        }
      );
    });
  }

  async updatePhotoAssignment(
    oneShotId: string,
    photoId: string,
    data: { membreUid: string; nomMembre: string; themeId: string },
    oldMembreUid?: string,
    fileSize?: number
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `oneshots/${oneShotId}/photos`, photoId), data)
    );
    // La mise à jour cross-user de storageUsed est bloquée par les règles Firestore
    // (allow write: if request.auth.uid == uid || isAdmin() — l'appel isAdmin() est
    // interceptable). Le recalcul est délégué au bouton "Recalculer" dans admin/membre.
  }

  async deletePhoto(oneShotId: string, photo: OneShotPhoto): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      Promise.all([
        deleteObject(ref(this.storage, photo.storagePath)),
        deleteDoc(doc(this.firestore, `oneshots/${oneShotId}/photos`, photo.id)),
      ])
    );
    if (photo.fileSize && photo.membreUid) {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', photo.membreUid), {
          'storageUsed.oneshots': increment(-photo.fileSize!),
        })
      ).catch(() => {});
    }
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
