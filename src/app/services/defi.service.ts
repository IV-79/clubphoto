import { Injectable, inject } from '@angular/core';
import {
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, setDoc,
  query, orderBy, where, getDocs, getDoc, increment, limit
} from 'firebase/firestore';
import { ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Observable, from, map } from 'rxjs';
import { db, storage, collectionStream, docStream } from '../utils/firebase';
import { Defi, DefiInscription, DefiPhoto, DefiVote } from '../models/defi.model';
import { UserProfile } from '../models/user.model';
import { generateId } from '../utils/id';
import { readExif } from '../utils/exif-reader';
import { compressImage, COMPRESS_COUVERTURE, COMPRESS_EVENT, COMPRESS_THUMB } from '../utils/image-compress';
import { NotificationService } from './notification.service';

export type DefiUploadState = { progress: number; done: false } | { progress: 100; done: true; photo: DefiPhoto };

@Injectable({ providedIn: 'root' })
export class DefiService {
  private notifService = inject(NotificationService);

  // ── Lecture ──────────────────────────────────────────────────────────

  getDefis(): Observable<Defi[]> {
    return collectionStream<Defi>(
      query(collection(db, 'defis'), orderBy('dateCreation', 'desc')),
      'id'
    );
  }

  getPublicDefis(): Observable<Defi[]> {
    return collectionStream<Defi>(
      query(collection(db, 'defis'), where('visibilite', '==', 'public'), orderBy('dateCreation', 'desc')),
      'id'
    );
  }

  getDefisOnce(): Observable<Defi[]> {
    return from(getDocs(query(collection(db, 'defis'), orderBy('dateCreation', 'desc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Defi))));
  }

  getPublicDefisOnce(): Observable<Defi[]> {
    return from(getDocs(query(collection(db, 'defis'),
      where('visibilite', '==', 'public'), orderBy('dateCreation', 'desc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Defi))));
  }

  getMesDefisOnce(uid: string): Observable<Defi[]> {
    return from(getDocs(query(collection(db, 'defis'), where('organisateurUid', '==', uid))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Defi))));
  }

  getDefiOnce(id: string): Observable<Defi | null> {
    return from(getDoc(doc(db, 'defis', id)))
      .pipe(map(d => d.exists() ? { id: d.id, ...d.data() } as Defi : null));
  }

  getInscriptionsOnce(defiId: string): Observable<DefiInscription[]> {
    return from(getDocs(collection(db, `defis/${defiId}/inscriptions`)))
      .pipe(map(snap => snap.docs.map(d => ({ uid: d.id, ...d.data() } as DefiInscription))));
  }

  getPhotosOnce(defiId: string): Observable<DefiPhoto[]> {
    return from(getDocs(query(collection(db, `defis/${defiId}/photos`), orderBy('uploadedAt', 'asc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as DefiPhoto))));
  }

  getMyPhotosOnce(defiId: string, uid: string): Observable<DefiPhoto[]> {
    return from(getDocs(query(collection(db, `defis/${defiId}/photos`),
      where('membreUid', '==', uid), orderBy('uploadedAt', 'asc'))))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as DefiPhoto))));
  }

  getVotesOnce(defiId: string): Observable<DefiVote[]> {
    return from(getDocs(collection(db, `defis/${defiId}/votes`)))
      .pipe(map(snap => snap.docs.map(d => ({ voterUid: d.id, ...d.data() } as DefiVote))));
  }

  getMonVoteOnce(defiId: string, voterUid: string): Observable<DefiVote | null> {
    return from(getDoc(doc(db, `defis/${defiId}/votes`, voterUid)))
      .pipe(map(d => d.exists() ? { voterUid, ...d.data() } as DefiVote : null));
  }

  getDefi(id: string): Observable<Defi | null> {
    return docStream<Defi>(doc(db, 'defis', id), 'id').pipe(map(d => d ?? null));
  }

  getMesDefis(uid: string): Observable<Defi[]> {
    return collectionStream<Defi>(
      query(collection(db, 'defis'), where('organisateurUid', '==', uid)),
      'id'
    );
  }

  getMesDefisInscritsIds(uid: string): Observable<string[]> {
    const q = query(collectionGroup(db, 'inscriptions'), where('uid', '==', uid));
    return from(getDocs(q)).pipe(
      map(snap => snap.docs
        .filter(d => d.ref.parent.parent?.path.startsWith('defis/'))
        .map(d => d.ref.parent.parent!.id)
      )
    );
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  async createDefi(data: Omit<Defi, 'id' | 'nbInscrits' | 'dateCreation'>): Promise<string> {
    const docRef = await addDoc(collection(db, 'defis'), {
      ...data,
      nbInscrits: 0,
      nbParticipants: 0,
      dateCreation: new Date().toISOString(),
    });
    this.notifService.broadcast('defi',
      `${data.organisateurNom} propose un nouveau défi photo « ${data.titre} » — Thème : ${data.theme}`,
      { lien: `/galeries/defis/${docRef.id}`, sourceNom: data.organisateurNom, excludeUid: data.organisateurUid }
    ).catch(() => {});
    return docRef.id;
  }

  async updateDefi(id: string, data: Partial<Defi>): Promise<void> {
    await updateDoc(doc(db, 'defis', id), data as Record<string, unknown>);
  }

  async deleteDefi(id: string): Promise<void> {
    const defiSnap = await getDoc(doc(db, 'defis', id));
    const defiData = defiSnap.data() as { photoCouverturePath?: string } | undefined;

    const [photosSnap, inscritsSnap, votesSnap] = await Promise.all([
      getDocs(collection(db, `defis/${id}/photos`)),
      getDocs(collection(db, `defis/${id}/inscriptions`)),
      getDocs(collection(db, `defis/${id}/votes`)),
    ]);

    const storageDeletes: Promise<void>[] = [];
    const sizeByUser: Record<string, number> = {};
    for (const p of photosSnap.docs) {
      const d = p.data() as { storagePath?: string; thumbnailPath?: string; membreUid?: string; fileSize?: number };
      if (d.storagePath)   storageDeletes.push(deleteObject(ref(storage, d.storagePath)).catch(() => {}));
      if (d.thumbnailPath) storageDeletes.push(deleteObject(ref(storage, d.thumbnailPath)).catch(() => {}));
      if (d.membreUid && d.fileSize) {
        sizeByUser[d.membreUid] = (sizeByUser[d.membreUid] ?? 0) + d.fileSize;
      }
    }
    if (defiData?.photoCouverturePath) {
      storageDeletes.push(deleteObject(ref(storage, defiData.photoCouverturePath)).catch(() => {}));
    }

    await Promise.all([
      ...storageDeletes,
      ...photosSnap.docs.map(p  => deleteDoc(p.ref)),
      ...inscritsSnap.docs.map(p => deleteDoc(p.ref)),
      ...votesSnap.docs.map(p   => deleteDoc(p.ref)),
    ]);
    await deleteDoc(doc(db, 'defis', id));
    Object.entries(sizeByUser).forEach(([uid, size]) =>
      updateDoc(doc(db, 'users', uid), { 'storageUsed.defis': increment(-size) }).catch(() => {})
    );
  }

  // ── Couverture ───────────────────────────────────────────────────────

  async setCouverture(id: string, file: File): Promise<void> {
    const storagePath = `defis/${id}/couverture.webp`;
    const storageRef = ref(storage, storagePath);
    const compressed = await compressImage(file, COMPRESS_COUVERTURE);
    await uploadBytesResumable(storageRef, compressed);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'defis', id), { photoCouvertureUrl: url, photoCouverturePath: storagePath });
  }

  async removeCouverture(id: string, storagePath: string): Promise<void> {
    await deleteObject(ref(storage, storagePath)).catch(() => {});
    await updateDoc(doc(db, 'defis', id), { photoCouvertureUrl: null, photoCouverturePath: null });
  }

  // ── Inscriptions ─────────────────────────────────────────────────────

  getInscriptions(defiId: string): Observable<DefiInscription[]> {
    return collectionStream<DefiInscription>(collection(db, `defis/${defiId}/inscriptions`), 'uid');
  }

  async inscrire(defiId: string, user: UserProfile): Promise<void> {
    await setDoc(doc(db, `defis/${defiId}/inscriptions`, user.uid), {
      uid: user.uid,
      nom: user.nom,
      ...(user.prenom ? { prenom: user.prenom } : {}),
      dateInscription: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'defis', defiId), { nbInscrits: increment(1) });
  }

  async desinscrire(defiId: string, uid: string): Promise<void> {
    const photosSnap = await getDocs(query(collection(db, `defis/${defiId}/photos`), where('membreUid', '==', uid)));
    let totalSize = 0;
    const storageDels: Promise<void>[] = [];
    for (const photoDoc of photosSnap.docs) {
      const d = photoDoc.data() as DefiPhoto;
      if (d.storagePath)   storageDels.push(deleteObject(ref(storage, d.storagePath)).catch(() => {}));
      if (d.thumbnailPath) storageDels.push(deleteObject(ref(storage, d.thumbnailPath)).catch(() => {}));
      totalSize += d.fileSize ?? 0;
    }
    await Promise.all([
      ...storageDels,
      ...photosSnap.docs.map(d => deleteDoc(d.ref)),
      deleteDoc(doc(db, `defis/${defiId}/votes`, uid)).catch(() => {}),
      deleteDoc(doc(db, `defis/${defiId}/inscriptions`, uid)),
      updateDoc(doc(db, 'defis', defiId), { nbInscrits: increment(-1) }),
    ]);
    if (totalSize > 0) {
      updateDoc(doc(db, 'users', uid), { 'storageUsed.defis': increment(-totalSize) }).catch(() => {});
    }
  }

  // ── Photos ───────────────────────────────────────────────────────────

  getPhotos(defiId: string): Observable<DefiPhoto[]> {
    return collectionStream<DefiPhoto>(
      query(collection(db, `defis/${defiId}/photos`), orderBy('uploadedAt', 'asc')),
      'id'
    );
  }

  uploadPhoto(defiId: string, file: File, user: UserProfile): Observable<DefiUploadState> {
    return new Observable(observer => {
      (async () => {
        try {
          const exif = await readExif(file);
          const id = generateId();
          const storagePath = `defis/${defiId}/${user.uid}-${id}.webp`;
          const thumbPath   = `defis/${defiId}/${user.uid}-${id}_thumb.webp`;
          const [compressed, thumb] = await Promise.all([
            compressImage(file, COMPRESS_EVENT),
            compressImage(file, COMPRESS_THUMB),
          ]);
          const fileSize = compressed.size + thumb.size;
          const storageRef = ref(storage, storagePath);
          const task = uploadBytesResumable(storageRef, compressed);

          task.on('state_changed',
            snap => observer.next({ progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100), done: false }),
            err => observer.error(err),
            async () => {
              const [url, thumbSnap] = await Promise.all([
                getDownloadURL(task.snapshot.ref),
                uploadBytes(ref(storage, thumbPath), thumb),
              ]);
              const thumbnailUrl = await getDownloadURL(thumbSnap.ref);
              const membreNom = `${user.prenom ?? ''} ${user.nom}`.trim();
              const photoData: Omit<DefiPhoto, 'id'> = {
                membreUid: user.uid, membreNom,
                ...(user.prenom ? { membrePrenom: user.prenom } : {}),
                url, storagePath, fileSize,
                thumbnailUrl, thumbnailPath: thumbPath,
                uploadedAt: new Date().toISOString(),
                ...(Object.keys(exif).length > 0 ? { exif } : {}),
              };
              const docRef = await addDoc(collection(db, `defis/${defiId}/photos`), photoData);
              updateDoc(doc(db, 'users', user.uid), {
                'storageUsed.defis': increment(fileSize),
              }).catch(() => {});
              const existingSnap = await getDocs(query(collection(db, `defis/${defiId}/photos`), where('membreUid', '==', user.uid), limit(2)));
              if (existingSnap.size === 1) {
                await updateDoc(doc(db, 'defis', defiId), { nbParticipants: increment(1) });
              }
              observer.next({ progress: 100, done: true, photo: { id: docRef.id, ...photoData } as DefiPhoto });
              observer.complete();
            }
          );
        } catch (err) {
          observer.error(err);
        }
      })();
    });
  }

  async deletePhoto(defiId: string, photo: DefiPhoto): Promise<void> {
    const deletes: Promise<unknown>[] = [
      deleteObject(ref(storage, photo.storagePath)).catch(() => {}),
      deleteDoc(doc(db, `defis/${defiId}/photos`, photo.id)),
    ];
    if (photo.thumbnailPath) deletes.push(deleteObject(ref(storage, photo.thumbnailPath)).catch(() => {}));
    await Promise.all(deletes);
    if (photo.fileSize && photo.membreUid) {
      updateDoc(doc(db, 'users', photo.membreUid), {
        'storageUsed.defis': increment(-photo.fileSize),
      }).catch(() => {});
    }
    const remainingSnap = await getDocs(query(collection(db, `defis/${defiId}/photos`), where('membreUid', '==', photo.membreUid), limit(1)));
    if (remainingSnap.empty) {
      await updateDoc(doc(db, 'defis', defiId), { nbParticipants: increment(-1) });
    }
  }

  // ── Votes ─────────────────────────────────────────────────────────────

  getVotes(defiId: string): Observable<DefiVote[]> {
    return collectionStream<DefiVote>(collection(db, `defis/${defiId}/votes`), 'voterUid');
  }

  getMonVote(defiId: string, voterUid: string): Observable<DefiVote | null> {
    return docStream<any>(doc(db, `defis/${defiId}/votes`, voterUid)).pipe(
      map(d => d ? { voterUid, ...d } as DefiVote : null)
    );
  }

  async voter(defiId: string, voterUid: string, photoId: string): Promise<void> {
    const voteRef = doc(db, `defis/${defiId}/votes`, voterUid);
    const snap = await getDoc(voteRef);
    const photoIds: string[] = snap.exists() ? ((snap.data() as DefiVote).photoIds ?? []) : [];
    if (photoIds.includes(photoId)) return;
    await setDoc(voteRef, { voterUid, photoIds: [...photoIds, photoId] });
  }

  async desvote(defiId: string, voterUid: string, photoId: string): Promise<void> {
    const voteRef = doc(db, `defis/${defiId}/votes`, voterUid);
    const snap = await getDoc(voteRef);
    if (!snap.exists()) return;
    const photoIds = ((snap.data() as DefiVote).photoIds ?? []).filter((id: string) => id !== photoId);
    await setDoc(voteRef, { voterUid, photoIds });
  }

  // ── Extension des votes ──────────────────────────────────────────────

  async extendVotes(defiId: string, newDate: string): Promise<void> {
    await updateDoc(doc(db, 'defis', defiId), { dateCloturVotes: newDate });
  }
}
