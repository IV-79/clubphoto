import { Injectable, inject } from '@angular/core';
import {
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, arrayUnion, arrayRemove, increment, getDocs, getDoc, deleteField
} from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { db, storage, collectionStream, docStream } from '../utils/firebase';
import {
  OneShot, OneShotTheme, OneShotInscription,
  OneShotPhoto, OneShotVote, OneShotStatut
} from '../models/oneshot.model';
import { NotificationService } from './notification.service';
import { PhotoExif } from '../models/photo.model';
import { Commentaire, Reponse } from '../models/commentaire.model';
import { compressImage, COMPRESS_THUMB } from '../utils/image-compress';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';

export interface OneShotUploadState {
  progress: number;
  done: boolean;
  photo?: OneShotPhoto;
}

@Injectable({ providedIn: 'root' })
export class OneShotService {
  private notifService = inject(NotificationService);

  // --- OneShot ---

  async create(data: { titre: string; description?: string; lieu?: string; creatorUid: string; nomCreateur: string; date?: string; visibilite?: 'public' | 'membre' }): Promise<string> {
    const ref = await addDoc(collection(db, 'oneshots'), {
      ...data,
      statut: 'preparation' as OneShotStatut,
      dateCreation: new Date().toISOString(),
    });
    return ref.id;
  }

  getOneShot(id: string): Observable<OneShot> {
    return docStream<OneShot>(doc(db, 'oneshots', id), 'id') as Observable<OneShot>;
  }

  getMyOneShots(uid: string): Observable<OneShot[]> {
    const q = query(collection(db, 'oneshots'), where('creatorUid', '==', uid), orderBy('dateCreation', 'desc'));
    return collectionStream<OneShot>(q, 'id');
  }

  getPublicOneShots(): Observable<OneShot[]> {
    const q = query(collection(db, 'oneshots'),
      where('statut', 'in', ['inscription', 'fermeture_inscriptions', 'vote', 'resultats']));
    return collectionStream<OneShot>(q, 'id');
  }

  getPublicOneShotsOnce(): Observable<OneShot[]> {
    const q = query(collection(db, 'oneshots'),
      where('statut', 'in', ['inscription', 'fermeture_inscriptions', 'vote', 'resultats']));
    return from(getDocs(q)).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as OneShot))));
  }

  getMyOneShotsOnce(uid: string): Observable<OneShot[]> {
    return from(getDocs(query(collection(db, 'oneshots'),
      where('creatorUid', '==', uid), orderBy('dateCreation', 'desc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as OneShot))));
  }

  getOneShotOnce(id: string): Observable<OneShot | undefined> {
    return from(getDoc(doc(db, 'oneshots', id)))
      .pipe(map(d => d.exists() ? { id: d.id, ...d.data() } as OneShot : undefined));
  }

  getThemesOnce(oneShotId: string): Observable<OneShotTheme[]> {
    return from(getDocs(query(collection(db, `oneshots/${oneShotId}/themes`), orderBy('ordre'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as OneShotTheme))));
  }

  getPhotosOnce(oneShotId: string): Observable<OneShotPhoto[]> {
    return from(getDocs(collection(db, `oneshots/${oneShotId}/photos`)))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as OneShotPhoto))));
  }

  getInscriptionsOnce(oneShotId: string): Observable<OneShotInscription[]> {
    return from(getDocs(collection(db, `oneshots/${oneShotId}/inscriptions`)))
      .pipe(map(snap => snap.docs.map(d => d.data() as OneShotInscription)));
  }

  getMyVotesOnce(oneShotId: string, voterUid: string): Observable<OneShotVote[]> {
    return from(getDocs(query(collection(db, `oneshots/${oneShotId}/votes`), where('voterUid', '==', voterUid))))
      .pipe(map(snap => snap.docs.map(d => d.data() as OneShotVote)));
  }

  getAllVotesOnce(oneShotId: string): Observable<OneShotVote[]> {
    return from(getDocs(collection(db, `oneshots/${oneShotId}/votes`)))
      .pipe(map(snap => snap.docs.map(d => d.data() as OneShotVote)));
  }

  async updateDate(
    id: string,
    date: string,
    notifCtx?: { oldDate: string; titre: string; nomCreateur: string; creatorUid: string }
  ): Promise<void> {
    await updateDoc(doc(db, 'oneshots', id), { date });
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
    await updateDoc(doc(db, 'oneshots', id), { lieu });
  }

  async updateTitre(id: string, titre: string): Promise<void> {
    await updateDoc(doc(db, 'oneshots', id), { titre: titre.trim() });
  }

  async updateDescription(id: string, description: string): Promise<void> {
    const value = description.trim();
    await updateDoc(doc(db, 'oneshots', id), { description: value || deleteField() });
  }

  async updateVisibilite(id: string, visibilite: 'public' | 'membre'): Promise<void> {
    await updateDoc(doc(db, 'oneshots', id), { visibilite });
  }

  async setCouverture(id: string, file: File): Promise<void> {
    const path = `oneshots/${id}/couverture`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'oneshots', id), { photoCouvertureUrl: url, photoCouverturePath: path });
  }

  async removeCouverture(id: string, path: string): Promise<void> {
    await deleteObject(ref(storage, path)).catch(() => {});
    await updateDoc(doc(db, 'oneshots', id), {
      photoCouvertureUrl: deleteField(),
      photoCouverturePath: deleteField(),
    });
  }

  async deleteOneShot(
    id: string,
    notifCtx?: { titre: string; nomCreateur: string; creatorUid: string; photoCouverturePath?: string }
  ): Promise<void> {
    const [oneShotSnap, photosSnap, inscritsSnap, themesSnap, votesSnap] = await Promise.all([
      getDoc(doc(db, 'oneshots', id)),
      getDocs(collection(db, `oneshots/${id}/photos`)),
      getDocs(collection(db, `oneshots/${id}/inscriptions`)),
      getDocs(collection(db, `oneshots/${id}/themes`)),
      getDocs(collection(db, `oneshots/${id}/votes`)),
    ]);
    const oneShotData = oneShotSnap.data() as { photoCouverturePath?: string } | undefined;

    const storageDeletions: Promise<void>[] = [];
    for (const p of photosSnap.docs) {
      const d = p.data();
      if (d['storagePath'])   storageDeletions.push(deleteObject(ref(storage, d['storagePath'])).catch(() => {}));
      if (d['thumbnailPath']) storageDeletions.push(deleteObject(ref(storage, d['thumbnailPath'])).catch(() => {}));
    }
    const coverPath = oneShotData?.photoCouverturePath ?? notifCtx?.photoCouverturePath;
    if (coverPath) storageDeletions.push(deleteObject(ref(storage, coverPath)).catch(() => {}));

    await Promise.all([
      ...storageDeletions,
      ...photosSnap.docs.map(p  => deleteDoc(p.ref)),
      ...inscritsSnap.docs.map(p => deleteDoc(p.ref)),
      ...themesSnap.docs.map(p   => deleteDoc(p.ref)),
      ...votesSnap.docs.map(p    => deleteDoc(p.ref)),
    ]);
    await deleteDoc(doc(db, 'oneshots', id));
    if (notifCtx && inscritsSnap.docs.length > 0) {
      const msg = `Le OneShot « ${notifCtx.titre} » auquel vous étiez inscrit(e) a été annulé.`;
      Promise.all(
        inscritsSnap.docs
          .map(d => (d.data() as OneShotInscription).uid)
          .filter(uid => uid !== notifCtx.creatorUid)
          .map(uid => this.notifService.sendToUser(uid, 'oneshot', msg, {
            sourceNom: notifCtx.nomCreateur
          }))
      ).catch(() => {});
    }
  }

  async updateStatut(
    id: string,
    statut: OneShotStatut,
    notifCtx?: { titre: string; nomCreateur: string; creatorUid: string }
  ): Promise<void> {
    const update: Record<string, unknown> = { statut };
    if (statut === 'resultats') {
      update['datePassageResultats'] = new Date().toISOString().slice(0, 10);
    }
    await updateDoc(doc(db, 'oneshots', id), update);
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
    const q = query(collection(db, `oneshots/${oneShotId}/themes`), orderBy('ordre'));
    return collectionStream<OneShotTheme>(q, 'id');
  }

  async addTheme(oneShotId: string, nom: string, ordre: number): Promise<void> {
    await addDoc(collection(db, `oneshots/${oneShotId}/themes`), { nom, ordre });
    updateDoc(doc(db, 'oneshots', oneShotId), { nbThemes: increment(1) }).catch(() => {});
  }

  async updateTheme(oneShotId: string, themeId: string, nom: string): Promise<void> {
    await updateDoc(doc(db, `oneshots/${oneShotId}/themes`, themeId), { nom });
  }

  async deleteTheme(oneShotId: string, themeId: string): Promise<void> {
    await deleteDoc(doc(db, `oneshots/${oneShotId}/themes`, themeId));
    updateDoc(doc(db, 'oneshots', oneShotId), { nbThemes: increment(-1) }).catch(() => {});
  }

  // --- Inscriptions ---

  getMesOneShotsInscritsIds(uid: string): Observable<string[]> {
    const q = query(collectionGroup(db, 'inscriptions'), where('uid', '==', uid));
    return from(getDocs(q)).pipe(
      map(snap => snap.docs
        .filter(d => d.ref.parent.parent?.path.startsWith('oneshots/'))
        .map(d => d.ref.parent.parent!.id)
      )
    );
  }

  getInscriptions(oneShotId: string): Observable<OneShotInscription[]> {
    return collectionStream<OneShotInscription>(collection(db, `oneshots/${oneShotId}/inscriptions`));
  }

  async inscrire(oneShotId: string, uid: string, nomMembre: string): Promise<void> {
    await setDoc(doc(db, `oneshots/${oneShotId}/inscriptions`, uid), {
      uid, nomMembre, dateInscription: new Date().toISOString(),
    });
    updateDoc(doc(db, 'oneshots', oneShotId), { nbInscrits: increment(1) }).catch(() => {});
  }

  async desinscrire(oneShotId: string, uid: string): Promise<void> {
    await deleteDoc(doc(db, `oneshots/${oneShotId}/inscriptions`, uid));
    updateDoc(doc(db, 'oneshots', oneShotId), { nbInscrits: increment(-1) }).catch(() => {});
  }

  // --- Photos ---

  getPhotos(oneShotId: string): Observable<OneShotPhoto[]> {
    return collectionStream<OneShotPhoto>(collection(db, `oneshots/${oneShotId}/photos`), 'id');
  }

  uploadPhoto(
    file: File,
    oneShotId: string,
    meta: { membreUid: string; nomMembre: string; themeId: string; titre?: string; exif?: PhotoExif }
  ): Observable<OneShotUploadState> {
    return new Observable(observer => {
      const id = generateId();
      const ext = file.name.split('.').pop() ?? 'webp';
      const storagePath = `oneshots/${oneShotId}/${id}.${ext}`;
      const thumbPath   = `oneshots/${oneShotId}/${id}_thumb.${ext}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on('state_changed',
        snap => observer.next({ progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100), done: false }),
        err => observer.error(err),
        async () => {
          const [url, thumb] = await Promise.all([
            getDownloadURL(task.snapshot.ref),
            compressImage(file, COMPRESS_THUMB),
          ]);
          const thumbSnap = await uploadBytes(ref(storage, thumbPath), thumb);
          const thumbnailUrl = await getDownloadURL(thumbSnap.ref);
          const data: Omit<OneShotPhoto, 'id'> = {
            url, storagePath, uploadedAt: new Date().toISOString(),
            fileSize: file.size, thumbnailUrl, thumbnailPath: thumbPath,
            membreUid: meta.membreUid, nomMembre: meta.nomMembre, themeId: meta.themeId,
            ...(meta.titre ? { titre: meta.titre } : {}),
            ...(hasExif(meta.exif) ? { exif: meta.exif } : {}),
          };
          const docRef = await addDoc(collection(db, `oneshots/${oneShotId}/photos`), data);
          if (meta.membreUid) {
            updateDoc(doc(db, 'users', meta.membreUid), {
              'storageUsed.oneshots': increment(file.size),
            }).catch(() => {});
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
    await updateDoc(doc(db, `oneshots/${oneShotId}/photos`, photoId), data);
  }

  async deletePhoto(oneShotId: string, photo: OneShotPhoto): Promise<void> {
    const deletes: Promise<unknown>[] = [
      deleteObject(ref(storage, photo.storagePath)),
      deleteDoc(doc(db, `oneshots/${oneShotId}/photos`, photo.id)),
    ];
    if (photo.thumbnailPath) deletes.push(deleteObject(ref(storage, photo.thumbnailPath)).catch(() => {}));
    await Promise.all(deletes);
    if (photo.fileSize && photo.membreUid) {
      updateDoc(doc(db, 'users', photo.membreUid), {
        'storageUsed.oneshots': increment(-photo.fileSize!),
      }).catch(() => {});
    }
  }

  // --- Votes ---

  getMyVotes(oneShotId: string, voterUid: string): Observable<OneShotVote[]> {
    const q = query(collection(db, `oneshots/${oneShotId}/votes`), where('voterUid', '==', voterUid));
    return collectionStream<OneShotVote>(q);
  }

  getAllVotes(oneShotId: string): Observable<OneShotVote[]> {
    return collectionStream<OneShotVote>(collection(db, `oneshots/${oneShotId}/votes`));
  }

  async vote(oneShotId: string, voterUid: string, themeId: string, photoId: string): Promise<void> {
    await setDoc(doc(db, `oneshots/${oneShotId}/votes`, `${voterUid}_${themeId}`), {
      voterUid, themeId, photoId, votedAt: new Date().toISOString(),
    });
  }

  async unvote(oneShotId: string, voterUid: string, themeId: string): Promise<void> {
    await deleteDoc(doc(db, `oneshots/${oneShotId}/votes`, `${voterUid}_${themeId}`));
  }

  // --- Likes ---

  async toggleLikePhoto(oneShotId: string, photoId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await updateDoc(doc(db, `oneshots/${oneShotId}/photos`, photoId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  }

  // --- Commentaires ---

  getCommentaires(oneShotId: string, photoId: string): Observable<Commentaire[]> {
    const q = query(
      collection(db, `oneshots/${oneShotId}/photos/${photoId}/commentaires`),
      orderBy('createdAt', 'asc')
    );
    return from(getDocs(q)).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Commentaire)))
    );
  }

  async addCommentaire(oneShotId: string, photoId: string, data: { texte: string; auteurUid: string; nomAuteur: string }): Promise<void> {
    await addDoc(collection(db, `oneshots/${oneShotId}/photos/${photoId}/commentaires`), {
      ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
    });
  }

  async deleteCommentaire(oneShotId: string, photoId: string, commentId: string): Promise<void> {
    await deleteDoc(doc(db, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId));
  }

  async toggleLikeCommentaire(oneShotId: string, photoId: string, commentId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await updateDoc(doc(db, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  }

  async addReply(oneShotId: string, photoId: string, commentId: string, reply: Omit<Reponse, 'id'>): Promise<void> {
    const replyWithId: Reponse = { ...reply, id: generateId() };
    await updateDoc(doc(db, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId), {
      replies: arrayUnion(replyWithId),
    });
  }

  async deleteReply(oneShotId: string, photoId: string, commentId: string, replyId: string, allReplies: Reponse[]): Promise<void> {
    await updateDoc(doc(db, `oneshots/${oneShotId}/photos/${photoId}/commentaires`, commentId), {
      replies: allReplies.filter(r => r.id !== replyId),
    });
  }
}
