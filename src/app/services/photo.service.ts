import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import {
  Firestore, collection, collectionData, doc, addDoc, deleteDoc, updateDoc, query, where, orderBy, limit, deleteField, arrayUnion, arrayRemove, increment
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Photo, PhotoExif, PhotoVisibilite, UploadState } from '../models/photo.model';
import { Commentaire, Reponse } from '../models/commentaire.model';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';
import { NotificationService } from './notification.service';
import { UserSubscriptions } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private storage      = inject(Storage);
  private firestore    = inject(Firestore);
  private injector     = inject(Injector);
  private notifService = inject(NotificationService);

  uploadPhoto(
    file: File,
    uid: string,
    nomMembre: string,
    meta: { titre: string; description?: string; visibilite: PhotoVisibilite; categorie?: string; exif?: PhotoExif }
  ): Observable<UploadState> {
    return new Observable(observer => {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `photos/${uid}/${generateId()}.${ext}`;
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
              description: meta.description?.trim() ?? '',
              url,
              visibilite: meta.visibilite,
              dateUpload: new Date().toISOString(),
              storagePath,
              fileSize: file.size,
              ...(meta.categorie ? { categorie: meta.categorie as Photo['categorie'] } : {}),
              ...(hasExif(meta.exif) ? { exif: meta.exif } : {}),
            };
            const docRef = await runInInjectionContext(this.injector, () =>
              addDoc(collection(this.firestore, 'photos'), data)
            );
            await runInInjectionContext(this.injector, () =>
              updateDoc(doc(this.firestore, 'users', uid), {
                'storageUsed.portfolio': increment(file.size),
              })
            ).catch(() => {});
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

  /** Dernières photos publiques toutes sections confondues. */
  getRecentPublicPhotos(limitCount = 8): Observable<Photo[]> {
    const q = query(
      collection(this.firestore, 'photos'),
      where('visibilite', '==', 'public'),
      orderBy('dateUpload', 'desc'),
      limit(limitCount)
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Photo[]>;
  }

  async deletePhoto(photo: Photo): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      Promise.all([
        deleteObject(ref(this.storage, photo.storagePath)),
        deleteDoc(doc(this.firestore, 'photos', photo.id)),
      ])
    );
    if (photo.fileSize) {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', photo.uid), {
          'storageUsed.portfolio': increment(-photo.fileSize!),
        })
      ).catch(() => {});
    }
  }

  async updatePhotoMeta(photoId: string, data: { titre: string; description: string; visibilite: PhotoVisibilite; categorie: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photoId), {
        titre: data.titre,
        description: data.description.trim(),
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

  async toggleLikePhoto(
    photoId: string,
    uid: string,
    currentlyLiked: boolean,
    notif?: { ownerUid: string; likerNom: string; lien: string; photoTitre?: string; ownerSubscriptions?: UserSubscriptions }
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'photos', photoId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
    if (notif && !currentlyLiked) {
      const msg = notif.photoTitre
        ? `${notif.likerNom} a aimé votre photo «${notif.photoTitre}»`
        : `${notif.likerNom} a aimé une de vos photos`;
      await this.notifService.createPersonalNotif(notif.ownerUid, 'like', msg,
        { lien: notif.lien, sourceNom: notif.likerNom, sourceUid: uid, toSubscriptions: notif.ownerSubscriptions }
      );
    }
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

  async addCommentaire(
    photoId: string,
    data: { texte: string; auteurUid: string; nomAuteur: string },
    notif?: { ownerUid: string; lien: string; photoTitre?: string; ownerSubscriptions?: UserSubscriptions }
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `photos/${photoId}/commentaires`), {
        ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
      })
    );
    if (notif) {
      const msg = notif.photoTitre
        ? `${data.nomAuteur} a commenté votre photo «${notif.photoTitre}»`
        : `${data.nomAuteur} a commenté une de vos photos`;
      await this.notifService.createPersonalNotif(notif.ownerUid, 'comment', msg,
        { lien: notif.lien, sourceNom: data.nomAuteur, sourceUid: data.auteurUid, toSubscriptions: notif.ownerSubscriptions }
      );
    }
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
    const replyWithId: Reponse = { ...reply, id: generateId() };
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
