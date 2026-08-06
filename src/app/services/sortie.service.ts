import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';
import {
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, setDoc, getDocs, getDoc,
  query, where, orderBy, arrayUnion, arrayRemove, increment, deleteField,
  limit, startAfter, QueryDocumentSnapshot, DocumentData
} from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { db, storage, collectionStream, docStream } from '../utils/firebase';
import {
  Sortie, SortieInscription, SortieImage, SortieCommentaire, SortieReply
} from '../models/sortie.model';
import { PhotoExif } from '../models/photo.model';
import { compressImage, COMPRESS_THUMB } from '../utils/image-compress';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';

export interface SortieUploadState {
  progress: number;
  done: boolean;
  image?: SortieImage;
}

@Injectable({ providedIn: 'root' })
export class SortieService {
  private notifService = inject(NotificationService);

  getSorties(): Observable<Sortie[]> {
    const q = query(collection(db, 'sorties'), orderBy('date', 'desc'));
    return collectionStream<Sortie>(q, 'id');
  }

  getSortiesOnce(): Observable<Sortie[]> {
    return from(getDocs(query(collection(db, 'sorties'), orderBy('date', 'desc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Sortie))));
  }

  getSortiesActivesOnce(): Observable<Sortie[]> {
    const d = new Date(); d.setDate(d.getDate() - 7);
    const windowStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return from(getDocs(query(collection(db, 'sorties'),
      where('date', '>=', windowStart), orderBy('date', 'asc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Sortie))));
  }

  getSortiesTermineesPage(
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    pageSize: number
  ): Observable<{ items: Sortie[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    const d = new Date(); d.setDate(d.getDate() - 7);
    const windowStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const q = cursor
      ? query(collection(db, 'sorties'),
          where('date', '<', windowStart), orderBy('date', 'desc'), startAfter(cursor), limit(pageSize))
      : query(collection(db, 'sorties'),
          where('date', '<', windowStart), orderBy('date', 'desc'), limit(pageSize));
    return from(getDocs(q)).pipe(map(snap => ({
      items:   snap.docs.map(d => ({ id: d.id, ...d.data() } as Sortie)),
      cursor:  snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
      hasMore: snap.docs.length === pageSize,
    })));
  }

  getMesSortiesOnce(uid: string): Observable<Sortie[]> {
    return from(getDocs(query(collection(db, 'sorties'),
      where('organisateurUid', '==', uid), orderBy('date', 'desc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Sortie))));
  }

  getSortieOnce(id: string): Observable<Sortie | null> {
    return from(getDoc(doc(db, 'sorties', id)))
      .pipe(map(d => d.exists() ? { id: d.id, ...d.data() } as Sortie : null));
  }

  getPhotosOnce(sortieId: string): Observable<SortieImage[]> {
    return from(getDocs(query(collection(db, `sorties/${sortieId}/photos`), orderBy('uploadedAt', 'asc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as SortieImage))));
  }

  getInscriptionsOnce(sortieId: string): Observable<SortieInscription[]> {
    return from(getDocs(collection(db, `sorties/${sortieId}/inscriptions`)))
      .pipe(map(snap => snap.docs.map(d => d.data() as SortieInscription)));
  }

  getSortie(id: string): Observable<Sortie> {
    return docStream<Sortie>(doc(db, 'sorties', id), 'id') as Observable<Sortie>;
  }

  getMesSorties(uid: string): Observable<Sortie[]> {
    const q = query(collection(db, 'sorties'), where('organisateurUid', '==', uid), orderBy('date', 'desc'));
    return collectionStream<Sortie>(q, 'id');
  }

  async createSortie(data: Omit<Sortie, 'id' | 'dateCreation' | 'photoCouvertureUrl'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'sorties'), {
      ...data,
      nbInscrits: data.nbInscrits ?? 0,
      dateCreation: new Date().toISOString(),
    });
    const { getSortieTypeLabel } = await import('../models/sortie.model');
    const typeLabel = getSortieTypeLabel(data.type);
    this.notifService.broadcast('sortie',
      `${data.nomOrganisateur} a organisé un nouvel événement « ${data.titre} » (${typeLabel})`,
      { lien: `/galeries/sorties/${docRef.id}`, sourceNom: data.nomOrganisateur, excludeUid: data.organisateurUid }
    ).catch(() => {});
    return docRef.id;
  }

  async updateSortie(
    id: string,
    data: Partial<Omit<Sortie, 'id' | 'dateCreation' | 'organisateurUid' | 'nomOrganisateur'>>,
    notifCtx?: { oldDate: string; titre: string; nomOrganisateur: string; organisateurUid: string }
  ): Promise<void> {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (val !== undefined) {
        clean[key] = (typeof val === 'string' && val === '') ? deleteField() : val;
      }
    }
    await updateDoc(doc(db, 'sorties', id), clean);
    if (notifCtx && data.date && data.date !== notifCtx.oldDate) {
      const dateStr = new Date(data.date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      this.notifService.broadcast('sortie',
        `La date de l'événement « ${notifCtx.titre} » a changé : ${dateStr}`,
        { lien: `/galeries/sorties/${id}`, sourceNom: notifCtx.nomOrganisateur, excludeUid: notifCtx.organisateurUid }
      ).catch(() => {});
    }
  }

  async setImageEvenement(sortieId: string, file: File): Promise<void> {
    const path = `sorties/${sortieId}/evenement-cover`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'sorties', sortieId), { imageEvenementUrl: url, imageEvenementPath: path });
  }

  async removeImageEvenement(sortieId: string, path: string): Promise<void> {
    await deleteObject(ref(storage, path)).catch(() => {});
    await updateDoc(doc(db, 'sorties', sortieId), {
      imageEvenementUrl: deleteField(),
      imageEvenementPath: deleteField(),
    });
  }

  async deleteSortie(
    sortieId: string,
    notifCtx?: { titre: string; nomOrganisateur: string; organisateurUid: string; imageEvenementPath?: string }
  ): Promise<void> {
    const [sortieSnap, photosSnap, inscritsSnap] = await Promise.all([
      getDoc(doc(db, 'sorties', sortieId)),
      getDocs(collection(db, `sorties/${sortieId}/photos`)),
      getDocs(collection(db, `sorties/${sortieId}/inscriptions`)),
    ]);
    const sortieData = sortieSnap.data() as { imageEvenementPath?: string } | undefined;

    const storageDeletions: Promise<void>[] = [];
    for (const p of photosSnap.docs) {
      const d = p.data();
      if (d['storagePath'])   storageDeletions.push(deleteObject(ref(storage, d['storagePath'])).catch(() => {}));
      if (d['thumbnailPath']) storageDeletions.push(deleteObject(ref(storage, d['thumbnailPath'])).catch(() => {}));
    }
    const coverPath = sortieData?.imageEvenementPath ?? notifCtx?.imageEvenementPath;
    if (coverPath) storageDeletions.push(deleteObject(ref(storage, coverPath)).catch(() => {}));

    await Promise.all([
      ...storageDeletions,
      ...photosSnap.docs.map(p  => deleteDoc(p.ref)),
      ...inscritsSnap.docs.map(p => deleteDoc(p.ref)),
    ]);
    await deleteDoc(doc(db, 'sorties', sortieId));
    if (notifCtx && inscritsSnap.docs.length > 0) {
      const msg = `L'événement « ${notifCtx.titre} » auquel vous étiez inscrit(e) a été annulé.`;
      Promise.all(
        inscritsSnap.docs
          .map(d => (d.data() as SortieInscription).uid)
          .filter(uid => uid !== notifCtx.organisateurUid)
          .map(uid => this.notifService.sendToUser(uid, 'sortie', msg, {
            sourceNom: notifCtx.nomOrganisateur
          }))
      ).catch(() => {});
    }
  }

  // --- Inscriptions ---

  getMesSortiesInscritesIds(uid: string): Observable<string[]> {
    const q = query(collectionGroup(db, 'inscriptions'), where('uid', '==', uid));
    return from(getDocs(q)).pipe(
      map(snap => snap.docs
        .filter(d => d.ref.parent.parent?.path.startsWith('sorties/'))
        .map(d => d.ref.parent.parent!.id)
      )
    );
  }

  getInscriptions(sortieId: string): Observable<SortieInscription[]> {
    return collectionStream<SortieInscription>(collection(db, `sorties/${sortieId}/inscriptions`));
  }

  async inscrire(sortieId: string, uid: string, nomMembre: string): Promise<void> {
    await Promise.all([
      setDoc(doc(db, `sorties/${sortieId}/inscriptions`, uid), {
        uid, nomMembre, dateInscription: new Date().toISOString(),
      }),
      updateDoc(doc(db, 'sorties', sortieId), { nbInscrits: increment(1) }),
    ]);
  }

  async desinscrire(sortieId: string, uid: string): Promise<void> {
    await Promise.all([
      deleteDoc(doc(db, `sorties/${sortieId}/inscriptions`, uid)),
      updateDoc(doc(db, 'sorties', sortieId), { nbInscrits: increment(-1) }),
    ]);
  }

  // --- Photos ---

  getPhotos(sortieId: string): Observable<SortieImage[]> {
    const q = query(collection(db, `sorties/${sortieId}/photos`), orderBy('uploadedAt', 'asc'));
    return collectionStream<SortieImage>(q, 'id');
  }

  uploadPhoto(
    file: File,
    sortieId: string,
    meta: { uploaderUid: string; nomUploader: string; exif?: PhotoExif }
  ): Observable<SortieUploadState> {
    return new Observable(observer => {
      const id = generateId();
      const ext = file.name.split('.').pop() ?? 'webp';
      const storagePath = `sorties/${sortieId}/${id}.${ext}`;
      const thumbPath   = `sorties/${sortieId}/${id}_thumb.${ext}`;
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
          const imageData: Omit<SortieImage, 'id'> = {
            url, storagePath, likes: [], uploadedAt: new Date().toISOString(),
            uploaderUid: meta.uploaderUid, nomUploader: meta.nomUploader,
            thumbnailUrl, thumbnailPath: thumbPath,
            ...(hasExif(meta.exif) ? { exif: meta.exif } : {}),
          };
          const docRef = await addDoc(collection(db, `sorties/${sortieId}/photos`), imageData);
          const sortieDoc = await getDoc(doc(db, 'sorties', sortieId));
          if (!sortieDoc.data()?.['photoCouvertureUrl']) {
            await updateDoc(doc(db, 'sorties', sortieId), { photoCouvertureUrl: url });
          }
          observer.next({ progress: 100, done: true, image: { id: docRef.id, ...imageData } });
          observer.complete();
        }
      );
    });
  }

  async deletePhoto(sortieId: string, image: SortieImage, currentCoverUrl?: string): Promise<void> {
    const deletes: Promise<unknown>[] = [
      deleteObject(ref(storage, image.storagePath)).catch(() => {}),
      deleteDoc(doc(db, `sorties/${sortieId}/photos`, image.id)),
    ];
    if (image.thumbnailPath) deletes.push(deleteObject(ref(storage, image.thumbnailPath)).catch(() => {}));
    await Promise.all(deletes);
    if (currentCoverUrl === image.url) {
      const photosSnap = await getDocs(query(collection(db, `sorties/${sortieId}/photos`), orderBy('uploadedAt', 'asc')));
      const first = photosSnap.docs[0];
      await updateDoc(doc(db, 'sorties', sortieId), {
        photoCouvertureUrl: first ? first.data()['url'] : null,
      });
    }
  }

  async toggleLikePhoto(sortieId: string, photoId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await updateDoc(doc(db, `sorties/${sortieId}/photos`, photoId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
    await this.updateBestCover(sortieId);
  }

  private async updateBestCover(sortieId: string): Promise<void> {
    const photosSnap = await getDocs(query(collection(db, `sorties/${sortieId}/photos`), orderBy('uploadedAt', 'asc')));
    if (photosSnap.empty) return;
    const best = photosSnap.docs.reduce((acc, d) => {
      const dLikes = (d.data()['likes'] as string[] | undefined)?.length ?? 0;
      const accLikes = (acc.data()['likes'] as string[] | undefined)?.length ?? 0;
      return dLikes > accLikes ? d : acc;
    });
    await updateDoc(doc(db, 'sorties', sortieId), { photoCouvertureUrl: best.data()['url'] });
  }

  // --- Commentaires ---

  getCommentaires(sortieId: string, photoId: string): Observable<SortieCommentaire[]> {
    const q = query(
      collection(db, `sorties/${sortieId}/photos/${photoId}/commentaires`),
      orderBy('createdAt', 'asc')
    );
    return from(getDocs(q)).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as SortieCommentaire)))
    );
  }

  async addCommentaire(
    sortieId: string,
    photoId: string,
    data: { texte: string; auteurUid: string; nomAuteur: string }
  ): Promise<void> {
    await addDoc(collection(db, `sorties/${sortieId}/photos/${photoId}/commentaires`), {
      ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
    });
  }

  async deleteCommentaire(sortieId: string, photoId: string, commentaireId: string): Promise<void> {
    await deleteDoc(doc(db, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId));
  }

  async toggleLikeCommentaire(
    sortieId: string, photoId: string, commentaireId: string, uid: string, currentlyLiked: boolean
  ): Promise<void> {
    await updateDoc(doc(db, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  }

  async addReply(
    sortieId: string, photoId: string, commentaireId: string, reply: Omit<SortieReply, 'id'>
  ): Promise<void> {
    const replyWithId: SortieReply = { ...reply, id: generateId() };
    await updateDoc(doc(db, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId), {
      replies: arrayUnion(replyWithId),
    });
  }

  async deleteReply(
    sortieId: string, photoId: string, commentaireId: string,
    replyId: string, allReplies: SortieReply[]
  ): Promise<void> {
    await updateDoc(doc(db, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId), {
      replies: allReplies.filter(r => r.id !== replyId),
    });
  }
}
