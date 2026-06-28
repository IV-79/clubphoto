import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, setDoc,
  collectionData, docData, query, orderBy, where, getDocs, getDoc, increment, limit
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from, map } from 'rxjs';
import { Defi, DefiInscription, DefiPhoto, DefiVote } from '../models/defi.model';
import { UserProfile } from '../models/user.model';
import { generateId } from '../utils/id';
import { readExif } from '../utils/exif-reader';
import { compressImage, COMPRESS_COUVERTURE, COMPRESS_EVENT, COMPRESS_THUMB } from '../utils/image-compress';
import { NotificationService } from './notification.service';

export type DefiUploadState = { progress: number; done: false } | { progress: 100; done: true; photo: DefiPhoto };

@Injectable({ providedIn: 'root' })
export class DefiService {
  private firestore    = inject(Firestore);
  private storage      = inject(Storage);
  private injector     = inject(Injector);
  private notifService = inject(NotificationService);

  // ── Lecture ──────────────────────────────────────────────────────────

  getDefis(): Observable<Defi[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'defis'), orderBy('dateCreation', 'desc')),
        { idField: 'id' }
      )
    ) as Observable<Defi[]>;
  }

  getPublicDefis(): Observable<Defi[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'defis'),
          where('visibilite', '==', 'public'),
          orderBy('dateCreation', 'desc')),
        { idField: 'id' }
      )
    ) as Observable<Defi[]>;
  }

  getDefisOnce(): Observable<Defi[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'defis'), orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Defi))));
  }

  getPublicDefisOnce(): Observable<Defi[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'defis'),
        where('visibilite', '==', 'public'), orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Defi))));
  }

  getMesDefisOnce(uid: string): Observable<Defi[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'defis'), where('organisateurUid', '==', uid)))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Defi))));
  }

  getDefiOnce(id: string): Observable<Defi | null> {
    return from(runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'defis', id))
    )).pipe(map(d => d.exists() ? { id: d.id, ...d.data() } as Defi : null));
  }

  getInscriptionsOnce(defiId: string): Observable<DefiInscription[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `defis/${defiId}/inscriptions`))
    )).pipe(map(snap => snap.docs.map(d => ({ uid: d.id, ...d.data() } as DefiInscription))));
  }

  getPhotosOnce(defiId: string): Observable<DefiPhoto[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, `defis/${defiId}/photos`), orderBy('uploadedAt', 'asc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as DefiPhoto))));
  }

  getVotesOnce(defiId: string): Observable<DefiVote[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `defis/${defiId}/votes`))
    )).pipe(map(snap => snap.docs.map(d => ({ voterUid: d.id, ...d.data() } as DefiVote))));
  }

  getMonVoteOnce(defiId: string, voterUid: string): Observable<DefiVote | null> {
    return from(runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, `defis/${defiId}/votes`, voterUid))
    )).pipe(map(d => d.exists() ? { voterUid, ...d.data() } as DefiVote : null));
  }

  getDefi(id: string): Observable<Defi | null> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'defis', id), { idField: 'id' })
    ).pipe(map(d => (d as Defi | undefined) ?? null)) as Observable<Defi | null>;
  }

  getMesDefis(uid: string): Observable<Defi[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'defis'), where('organisateurUid', '==', uid)),
        { idField: 'id' }
      )
    ) as Observable<Defi[]>;
  }

  getMesDefisInscritsIds(uid: string): Observable<string[]> {
    return runInInjectionContext(this.injector, () => {
      const q = query(collectionGroup(this.firestore, 'inscriptions'), where('uid', '==', uid));
      return from(getDocs(q)).pipe(
        map(snap => snap.docs
          .filter(d => d.ref.parent.parent?.path.startsWith('defis/'))
          .map(d => d.ref.parent.parent!.id)
        )
      );
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  async createDefi(data: Omit<Defi, 'id' | 'nbInscrits' | 'dateCreation'>): Promise<string> {
    const docRef = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'defis'), {
        ...data,
        nbInscrits: 0,
        nbParticipants: 0,
        dateCreation: new Date().toISOString(),
      })
    );
    this.notifService.broadcast('defi',
      `${data.organisateurNom} propose un nouveau défi photo « ${data.titre} » — Thème : ${data.theme}`,
      { lien: `/galeries/defis/${docRef.id}`, sourceNom: data.organisateurNom, excludeUid: data.organisateurUid }
    ).catch(() => {});
    return docRef.id;
  }

  async updateDefi(id: string, data: Partial<Defi>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'defis', id), data as Record<string, unknown>)
    );
  }

  async deleteDefi(id: string): Promise<void> {
    const defiSnap = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'defis', id))
    );
    const defiData = defiSnap.data() as { photoCouverturePath?: string } | undefined;

    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `defis/${id}/photos`))
    );
    const inscritsSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `defis/${id}/inscriptions`))
    );
    const votesSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `defis/${id}/votes`))
    );

    const storageDeletes: Promise<void>[] = [];
    for (const p of photosSnap.docs) {
      const d = p.data() as { storagePath?: string; thumbnailPath?: string };
      if (d.storagePath)   storageDeletes.push(deleteObject(ref(this.storage, d.storagePath)).catch(() => {}));
      if (d.thumbnailPath) storageDeletes.push(deleteObject(ref(this.storage, d.thumbnailPath)).catch(() => {}));
    }
    if (defiData?.photoCouverturePath) {
      storageDeletes.push(deleteObject(ref(this.storage, defiData.photoCouverturePath)).catch(() => {}));
    }

    const firestoreDeletes: Promise<void>[] = [
      ...photosSnap.docs.map(p  => runInInjectionContext(this.injector, () => deleteDoc(p.ref))),
      ...inscritsSnap.docs.map(p => runInInjectionContext(this.injector, () => deleteDoc(p.ref))),
      ...votesSnap.docs.map(p   => runInInjectionContext(this.injector, () => deleteDoc(p.ref))),
    ];

    await Promise.all([...storageDeletes, ...firestoreDeletes]);
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'defis', id))
    );
  }

  // ── Couverture ───────────────────────────────────────────────────────

  async setCouverture(id: string, file: File): Promise<void> {
    const storagePath = `defis/${id}/couverture.webp`;
    const storageRef = ref(this.storage, storagePath);
    const compressed = await compressImage(file, COMPRESS_COUVERTURE);
    await uploadBytesResumable(storageRef, compressed);
    const url = await getDownloadURL(storageRef);
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'defis', id), { photoCouvertureUrl: url, photoCouverturePath: storagePath })
    );
  }

  async removeCouverture(id: string, storagePath: string): Promise<void> {
    await deleteObject(ref(this.storage, storagePath)).catch(() => {});
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'defis', id), { photoCouvertureUrl: null, photoCouverturePath: null })
    );
  }

  // ── Inscriptions ─────────────────────────────────────────────────────

  getInscriptions(defiId: string): Observable<DefiInscription[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        collection(this.firestore, `defis/${defiId}/inscriptions`),
        { idField: 'uid' }
      )
    ) as Observable<DefiInscription[]>;
  }

  async inscrire(defiId: string, user: UserProfile): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `defis/${defiId}/inscriptions`, user.uid), {
        uid: user.uid,
        nom: user.nom,
        ...(user.prenom ? { prenom: user.prenom } : {}),
        dateInscription: new Date().toISOString(),
      })
    );
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'defis', defiId), { nbInscrits: increment(1) })
    );
  }

  async desinscrire(defiId: string, uid: string): Promise<void> {
    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, `defis/${defiId}/photos`), where('membreUid', '==', uid)))
    );
    for (const photoDoc of photosSnap.docs) {
      const storagePath = (photoDoc.data() as DefiPhoto).storagePath;
      if (storagePath) await deleteObject(ref(this.storage, storagePath)).catch(() => {});
      await runInInjectionContext(this.injector, () => deleteDoc(photoDoc.ref));
    }
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `defis/${defiId}/votes`, uid))
    ).catch(() => {});
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `defis/${defiId}/inscriptions`, uid))
    );
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'defis', defiId), { nbInscrits: increment(-1) })
    );
  }

  // ── Photos ───────────────────────────────────────────────────────────

  getPhotos(defiId: string): Observable<DefiPhoto[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, `defis/${defiId}/photos`), orderBy('uploadedAt', 'asc')),
        { idField: 'id' }
      )
    ) as Observable<DefiPhoto[]>;
  }

  uploadPhoto(defiId: string, file: File, user: UserProfile): Observable<DefiUploadState> {
    return new Observable(observer => {
      (async () => {
        try {
          const exif = await readExif(file);
          const fileSize = file.size;
          const id = generateId();
          const storagePath = `defis/${defiId}/${user.uid}-${id}.webp`;
          const thumbPath   = `defis/${defiId}/${user.uid}-${id}_thumb.webp`;
          const [compressed, thumb] = await Promise.all([
            compressImage(file, COMPRESS_EVENT),
            compressImage(file, COMPRESS_THUMB),
          ]);
          const storageRef = ref(this.storage, storagePath);
          const task = uploadBytesResumable(storageRef, compressed);

          task.on('state_changed',
            snap => observer.next({ progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100), done: false }),
            err => observer.error(err),
            async () => {
              const [url, thumbSnap] = await Promise.all([
                getDownloadURL(task.snapshot.ref),
                uploadBytes(ref(this.storage, thumbPath), thumb),
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
              const docRef = await runInInjectionContext(this.injector, () =>
                addDoc(collection(this.firestore, `defis/${defiId}/photos`), photoData)
              );
              const existingSnap = await runInInjectionContext(this.injector, () =>
                getDocs(query(collection(this.firestore, `defis/${defiId}/photos`), where('membreUid', '==', user.uid), limit(2)))
              );
              if (existingSnap.size === 1) {
                await runInInjectionContext(this.injector, () =>
                  updateDoc(doc(this.firestore, 'defis', defiId), { nbParticipants: increment(1) })
                );
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
      deleteObject(ref(this.storage, photo.storagePath)).catch(() => {}),
      runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, `defis/${defiId}/photos`, photo.id))
      ),
    ];
    if (photo.thumbnailPath) deletes.push(deleteObject(ref(this.storage, photo.thumbnailPath)).catch(() => {}));
    await Promise.all(deletes);
    const remainingSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, `defis/${defiId}/photos`), where('membreUid', '==', photo.membreUid), limit(1)))
    );
    if (remainingSnap.empty) {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'defis', defiId), { nbParticipants: increment(-1) })
      );
    }
  }

  // ── Votes ─────────────────────────────────────────────────────────────

  getVotes(defiId: string): Observable<DefiVote[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `defis/${defiId}/votes`), { idField: 'voterUid' })
    ) as Observable<DefiVote[]>;
  }

  getMonVote(defiId: string, voterUid: string): Observable<DefiVote | null> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, `defis/${defiId}/votes`, voterUid))
    ).pipe(
      map(d => d ? { voterUid, ...(d as any) } as DefiVote : null)
    ) as Observable<DefiVote | null>;
  }

  async voter(defiId: string, voterUid: string, photoId: string): Promise<void> {
    const voteRef = doc(this.firestore, `defis/${defiId}/votes`, voterUid);
    const snap = await runInInjectionContext(this.injector, () => getDoc(voteRef));
    const photoIds: string[] = snap.exists() ? ((snap.data() as DefiVote).photoIds ?? []) : [];
    if (photoIds.includes(photoId)) return;
    await runInInjectionContext(this.injector, () =>
      setDoc(voteRef, { voterUid, photoIds: [...photoIds, photoId] })
    );
  }

  async desvote(defiId: string, voterUid: string, photoId: string): Promise<void> {
    const voteRef = doc(this.firestore, `defis/${defiId}/votes`, voterUid);
    const snap = await runInInjectionContext(this.injector, () => getDoc(voteRef));
    if (!snap.exists()) return;
    const photoIds = ((snap.data() as DefiVote).photoIds ?? []).filter((id: string) => id !== photoId);
    await runInInjectionContext(this.injector, () =>
      setDoc(voteRef, { voterUid, photoIds })
    );
  }

  // ── Extension des votes ──────────────────────────────────────────────

  async extendVotes(defiId: string, newDate: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'defis', defiId), { dateCloturVotes: newDate })
    );
  }
}
