import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  arrayUnion,
  arrayRemove,
  increment,
  getDocs,
  getDoc,
  deleteField,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  writeBatch,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { db, storage } from '../utils/firebase';
import { ThemeMensuel, ThemeSoumission, ThemeVote } from '../models/theme.model';
import { PhotoExif } from '../models/photo.model';
import { Commentaire, Reponse } from '../models/commentaire.model';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';
import { compressImage, COMPRESS_THUMB } from '../utils/image-compress';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  getThemeOnce(id: string): Observable<ThemeMensuel | undefined> {
    return from(getDoc(doc(db, 'themes', id))).pipe(
      map((snap) =>
        snap.exists() ? ({ id: snap.id, ...snap.data() } as ThemeMensuel) : undefined,
      ),
    );
  }

  getThemesOnce(): Observable<ThemeMensuel[]> {
    return from(getDocs(query(collection(db, 'themes'), orderBy('mois', 'desc')))).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeMensuel)),
    );
  }

  private moisCutoff(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  getThemesActifsOnce(): Observable<ThemeMensuel[]> {
    const cutoff = this.moisCutoff();
    return from(
      getDocs(
        query(collection(db, 'themes'), where('mois', '>=', cutoff), orderBy('mois', 'desc')),
      ),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeMensuel)));
  }

  getThemesTerminesPage(
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    pageSize: number,
  ): Observable<{
    items: ThemeMensuel[];
    cursor: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean;
  }> {
    const cutoff = this.moisCutoff();
    const base = [where('mois', '<', cutoff), orderBy('mois', 'desc')];
    const q = cursor
      ? query(collection(db, 'themes'), ...base, startAfter(cursor), limit(pageSize))
      : query(collection(db, 'themes'), ...base, limit(pageSize));
    return from(getDocs(q)).pipe(
      map((snap) => ({
        items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeMensuel),
        cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
        hasMore: snap.docs.length === pageSize,
      })),
    );
  }

  getSoumissionsOnce(themeId: string): Observable<ThemeSoumission[]> {
    return from(
      getDocs(
        query(collection(db, 'themes', themeId, 'soumissions'), orderBy('uploadedAt', 'asc')),
      ),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeSoumission)));
  }

  getTousVotesOnce(themeId: string): Observable<ThemeVote[]> {
    return from(getDocs(collection(db, 'themes', themeId, 'votes'))).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeVote)),
    );
  }

  getMesVotesOnce(themeId: string, uid: string): Observable<ThemeVote[]> {
    const q = query(collection(db, 'themes', themeId, 'votes'), where('voterUid', '==', uid));
    return from(getDocs(q)).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ThemeVote)),
    );
  }

  async creerTheme(data: {
    titre: string;
    description: string;
    mois: string;
    dateFinVote: string;
    maxPhotos: number;
    maxVotes: number;
    createdBy: string;
  }): Promise<string> {
    const docRef = await addDoc(collection(db, 'themes'), {
      ...data,
      nbSoumissions: 0,
      nbParticipants: 0,
      dateCreation: new Date().toISOString(),
    });
    return docRef.id;
  }

  async setCouverture(id: string, file: File): Promise<void> {
    const path = `themes/${id}/couverture`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'themes', id), {
      photoCouvertureUrl: url,
      photoCouverturePath: path,
      photoCouvertureFileSize: file.size,
    });
  }

  async removeCouverture(id: string, path: string): Promise<void> {
    await deleteObject(ref(storage, path)).catch(() => {});
    await updateDoc(doc(db, 'themes', id), {
      photoCouvertureUrl: deleteField(),
      photoCouverturePath: deleteField(),
      photoCouvertureFileSize: deleteField(),
    });
  }

  async modifierTheme(
    id: string,
    data: {
      titre: string;
      description: string;
      mois: string;
      dateFinVote: string;
      maxPhotos: number;
      maxVotes: number;
    },
  ): Promise<void> {
    await updateDoc(doc(db, 'themes', id), data as Record<string, unknown>);
  }

  async supprimerTheme(id: string): Promise<void> {
    const [themeSnap, soumSnap, votesSnap, commSnap] = await Promise.all([
      getDoc(doc(db, 'themes', id)),
      getDocs(collection(db, 'themes', id, 'soumissions')),
      getDocs(collection(db, 'themes', id, 'votes')),
      getDocs(collection(db, 'themes', id, 'commentaires')),
    ]);

    // Fetch commentaires of each soumission in parallel
    const soumCommSnaps = await Promise.all(
      soumSnap.docs.map((s) =>
        getDocs(collection(db, 'themes', id, 'soumissions', s.id, 'commentaires')),
      ),
    );

    const themeData = themeSnap.data() as { photoCouverturePath?: string } | undefined;
    const storageDels: Promise<void>[] = [];
    const sizeByUser: Record<string, number> = {};

    // Cover photo
    if (themeData?.photoCouverturePath) {
      storageDels.push(deleteObject(ref(storage, themeData.photoCouverturePath)).catch(() => {}));
    }

    // Soumission files
    for (const s of soumSnap.docs) {
      const d = s.data() as {
        storagePath?: string;
        thumbnailPath?: string;
        membreUid?: string;
        fileSize?: number;
      };
      if (d.storagePath)
        storageDels.push(deleteObject(ref(storage, d.storagePath)).catch(() => {}));
      if (d.thumbnailPath)
        storageDels.push(deleteObject(ref(storage, d.thumbnailPath)).catch(() => {}));
      if (d.membreUid && d.fileSize) {
        sizeByUser[d.membreUid] = (sizeByUser[d.membreUid] ?? 0) + d.fileSize;
      }
    }

    await Promise.all([
      ...storageDels,
      ...soumSnap.docs.map((d) => deleteDoc(d.ref)),
      ...soumCommSnaps.flatMap((snap) => snap.docs.map((d) => deleteDoc(d.ref))),
      ...votesSnap.docs.map((d) => deleteDoc(d.ref)),
      ...commSnap.docs.map((d) => deleteDoc(d.ref)),
    ]);
    await deleteDoc(doc(db, 'themes', id));
    Object.entries(sizeByUser).forEach(([uid, size]) =>
      updateDoc(doc(db, 'users', uid), { 'storageUsed.themes': increment(-size) }).catch(() => {}),
    );
  }

  async uploadSoumission(
    themeId: string,
    uid: string,
    nomMembre: string,
    file: File,
    exif?: PhotoExif,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const existingSnap = await getDocs(
      query(
        collection(db, 'themes', themeId, 'soumissions'),
        where('membreUid', '==', uid),
        limit(1),
      ),
    );
    const isFirstSoumission = existingSnap.empty;

    const ts = Date.now();
    const storagePath = `themes/${themeId}/${uid}_${ts}.webp`;
    const thumbPath = `themes/${themeId}/${uid}_${ts}_thumb.webp`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        async () => {
          try {
            const [url, thumb] = await Promise.all([
              getDownloadURL(storageRef),
              compressImage(file, COMPRESS_THUMB),
            ]);
            const thumbSnap = await uploadBytes(ref(storage, thumbPath), thumb);
            const thumbnailUrl = await getDownloadURL(thumbSnap.ref);
            const batch = writeBatch(db);
            const soumRef = doc(collection(db, 'themes', themeId, 'soumissions'));
            batch.set(soumRef, {
              membreUid: uid,
              nomMembre,
              url,
              storagePath,
              fileSize: file.size + thumb.size,
              thumbnailUrl,
              thumbnailPath: thumbPath,
              uploadedAt: new Date().toISOString(),
              ...(hasExif(exif) ? { exif } : {}),
            });
            batch.update(doc(db, 'themes', themeId), {
              nbSoumissions: increment(1),
              ...(isFirstSoumission ? { nbParticipants: increment(1) } : {}),
            });
            try {
              await batch.commit();
            } catch (e) {
              deleteObject(ref(storage, storagePath)).catch(() => {});
              deleteObject(ref(storage, thumbPath)).catch(() => {});
              throw e;
            }
            updateDoc(doc(db, 'users', uid), {
              'storageUsed.themes': increment(file.size + thumb.size),
            }).catch(() => {});
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  async deleteSoumission(
    themeId: string,
    soumissionId: string,
    storagePath: string,
    membreUid?: string,
    fileSize?: number,
    thumbnailPath?: string,
  ): Promise<void> {
    let isLastSoumission = false;
    if (membreUid) {
      const snap = await getDocs(
        query(
          collection(db, 'themes', themeId, 'soumissions'),
          where('membreUid', '==', membreUid),
          limit(2),
        ),
      );
      isLastSoumission = snap.size === 1;
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'themes', themeId, 'soumissions', soumissionId));
    batch.update(doc(db, 'themes', themeId), {
      nbSoumissions: increment(-1),
      ...(isLastSoumission ? { nbParticipants: increment(-1) } : {}),
    });
    await batch.commit();

    // Storage après Firestore : si Storage échoue, le doc est déjà supprimé (pas de lien mort)
    deleteObject(ref(storage, storagePath)).catch(() => {});
    if (thumbnailPath) deleteObject(ref(storage, thumbnailPath)).catch(() => {});

    if (membreUid && fileSize) {
      updateDoc(doc(db, 'users', membreUid), {
        'storageUsed.themes': increment(-fileSize),
      }).catch(() => {});
    }
  }

  async recalculeCompteurs(themeId: string): Promise<void> {
    const snap = await getDocs(collection(db, 'themes', themeId, 'soumissions'));
    const nbSoumissions = snap.size;
    const uids = new Set(snap.docs.map((d) => d.data()['membreUid'] as string));
    await updateDoc(doc(db, 'themes', themeId), { nbSoumissions, nbParticipants: uids.size });
  }

  async voter(themeId: string, voterUid: string, soumissionId: string): Promise<void> {
    await setDoc(doc(db, 'themes', themeId, 'votes', `${voterUid}_${soumissionId}`), {
      voterUid,
      soumissionId,
      votedAt: new Date().toISOString(),
    });
  }

  async deVoter(themeId: string, voterUid: string, soumissionId: string): Promise<void> {
    await deleteDoc(doc(db, 'themes', themeId, 'votes', `${voterUid}_${soumissionId}`));
  }

  // --- Likes ---

  async toggleLikePhoto(
    themeId: string,
    soumissionId: string,
    uid: string,
    currentlyLiked: boolean,
  ): Promise<void> {
    await updateDoc(doc(db, 'themes', themeId, 'soumissions', soumissionId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  }

  // --- Commentaires ---

  getCommentaires(themeId: string, soumissionId: string): Observable<Commentaire[]> {
    const q = query(
      collection(db, `themes/${themeId}/soumissions/${soumissionId}/commentaires`),
      orderBy('createdAt', 'asc'),
    );
    return from(getDocs(q)).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commentaire)),
    );
  }

  async addCommentaire(
    themeId: string,
    soumissionId: string,
    data: { texte: string; auteurUid: string; nomAuteur: string },
  ): Promise<void> {
    await addDoc(collection(db, `themes/${themeId}/soumissions/${soumissionId}/commentaires`), {
      ...data,
      likes: [],
      replies: [],
      createdAt: new Date().toISOString(),
    });
  }

  async deleteCommentaire(themeId: string, soumissionId: string, commentId: string): Promise<void> {
    await deleteDoc(
      doc(db, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId),
    );
  }

  async toggleLikeCommentaire(
    themeId: string,
    soumissionId: string,
    commentId: string,
    uid: string,
    currentlyLiked: boolean,
  ): Promise<void> {
    await updateDoc(
      doc(db, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId),
      {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      },
    );
  }

  async addReply(
    themeId: string,
    soumissionId: string,
    commentId: string,
    reply: Omit<Reponse, 'id'>,
  ): Promise<void> {
    const replyWithId: Reponse = { ...reply, id: generateId() };
    await updateDoc(
      doc(db, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId),
      {
        replies: arrayUnion(replyWithId),
      },
    );
  }

  async deleteReply(
    themeId: string,
    soumissionId: string,
    commentId: string,
    replyId: string,
    allReplies: Reponse[],
  ): Promise<void> {
    await updateDoc(
      doc(db, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId),
      {
        replies: allReplies.filter((r) => r.id !== replyId),
      },
    );
  }
}
