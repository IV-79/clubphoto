import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData, getDoc,
  addDoc, deleteDoc, setDoc, updateDoc, query, where, orderBy, arrayUnion, arrayRemove, increment, getDocs, deleteField,
  limit, startAfter, QueryDocumentSnapshot, DocumentData,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ThemeMensuel, ThemeSoumission, ThemeVote } from '../models/theme.model';
import { PhotoExif } from '../models/photo.model';
import { Commentaire, Reponse } from '../models/commentaire.model';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';
import { compressImage, COMPRESS_THUMB } from '../utils/image-compress';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private injector  = inject(Injector);

  getThemes(): Observable<ThemeMensuel[]> {
    const q = query(collection(this.firestore, 'themes'), orderBy('mois', 'desc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeMensuel[]>;
  }

  getThemeOnce(id: string): Observable<ThemeMensuel | undefined> {
    return from(runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'themes', id))
    )).pipe(map(snap => snap.exists() ? ({ id: snap.id, ...snap.data() } as ThemeMensuel) : undefined));
  }

  getThemesOnce(): Observable<ThemeMensuel[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'themes'), orderBy('mois', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ThemeMensuel))));
  }

  private moisCutoff(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Thèmes du mois courant et des 2 mois précédents (actifs, vote, résultats récents). */
  getThemesActifsOnce(): Observable<ThemeMensuel[]> {
    const cutoff = this.moisCutoff();
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'themes'),
        where('mois', '>=', cutoff), orderBy('mois', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ThemeMensuel))));
  }

  /** Thèmes terminés antérieurs au cutoff, paginés par lot de pageSize. */
  getThemesTerminesPage(
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    pageSize: number
  ): Observable<{ items: ThemeMensuel[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    const cutoff = this.moisCutoff();
    const base = [where('mois', '<', cutoff), orderBy('mois', 'desc')];
    const q = cursor
      ? query(collection(this.firestore, 'themes'), ...base, startAfter(cursor), limit(pageSize))
      : query(collection(this.firestore, 'themes'), ...base, limit(pageSize));
    return from(runInInjectionContext(this.injector, () => getDocs(q)))
      .pipe(map(snap => ({
        items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ThemeMensuel)),
        cursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
        hasMore: snap.docs.length === pageSize,
      })));
  }

  getSoumissionsOnce(themeId: string): Observable<ThemeSoumission[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'themes', themeId, 'soumissions'), orderBy('uploadedAt', 'asc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ThemeSoumission))));
  }

  getTousVotesOnce(themeId: string): Observable<ThemeVote[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'themes', themeId, 'votes'))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ThemeVote))));
  }

  getTheme(id: string): Observable<ThemeMensuel | undefined> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'themes', id), { idField: 'id' })
    ) as Observable<ThemeMensuel | undefined>;
  }

  getSoumissions(themeId: string): Observable<ThemeSoumission[]> {
    const q = query(
      collection(this.firestore, 'themes', themeId, 'soumissions'),
      orderBy('uploadedAt', 'asc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeSoumission[]>;
  }

  getMesVotesOnce(themeId: string, uid: string): Observable<ThemeVote[]> {
    const q = query(
      collection(this.firestore, 'themes', themeId, 'votes'),
      where('voterUid', '==', uid)
    );
    return from(runInInjectionContext(this.injector, () => getDocs(q)))
      .pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ThemeVote))));
  }

  getMesVotes(themeId: string, uid: string): Observable<ThemeVote[]> {
    const q = query(
      collection(this.firestore, 'themes', themeId, 'votes'),
      where('voterUid', '==', uid)
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<ThemeVote[]>;
  }

  getTousVotes(themeId: string): Observable<ThemeVote[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        collection(this.firestore, 'themes', themeId, 'votes'),
        { idField: 'id' }
      )
    ) as Observable<ThemeVote[]>;
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
    const docRef = await addDoc(collection(this.firestore, 'themes'), {
      ...data,
      dateCreation: new Date().toISOString(),
    });
    return docRef.id;
  }

  async setCouverture(id: string, file: File): Promise<void> {
    const path = `themes/${id}/couverture`;
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'themes', id), { photoCouvertureUrl: url, photoCouverturePath: path })
    );
  }

  async removeCouverture(id: string, path: string): Promise<void> {
    await deleteObject(ref(this.storage, path)).catch(() => {});
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'themes', id), {
        photoCouvertureUrl:  deleteField(),
        photoCouverturePath: deleteField(),
      })
    );
  }

  async modifierTheme(id: string, data: {
    titre: string;
    description: string;
    mois: string;
    dateFinVote: string;
    maxPhotos: number;
    maxVotes: number;
  }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'themes', id), data as Record<string, unknown>)
    );
  }

  async supprimerTheme(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'themes', id));
  }

  async uploadSoumission(
    themeId: string,
    uid: string,
    nomMembre: string,
    file: File,
    exif?: PhotoExif,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const ts = Date.now();
    const storagePath = `themes/${themeId}/${uid}_${ts}.webp`;
    const thumbPath   = `themes/${themeId}/${uid}_${ts}_thumb.webp`;
    const storageRef = ref(this.storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => {
          try {
            const [url, thumb] = await Promise.all([
              getDownloadURL(storageRef),
              compressImage(file, COMPRESS_THUMB),
            ]);
            const thumbSnap = await uploadBytes(ref(this.storage, thumbPath), thumb);
            const thumbnailUrl = await getDownloadURL(thumbSnap.ref);
            await addDoc(
              collection(this.firestore, 'themes', themeId, 'soumissions'),
              {
                membreUid: uid, nomMembre, url, storagePath,
                fileSize: file.size, thumbnailUrl, thumbnailPath: thumbPath,
                uploadedAt: new Date().toISOString(),
                ...(hasExif(exif) ? { exif } : {}),
              }
            );
            await runInInjectionContext(this.injector, () =>
              updateDoc(doc(this.firestore, 'users', uid), {
                'storageUsed.themes': increment(file.size),
              })
            ).catch(() => {});
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  async deleteSoumission(themeId: string, soumissionId: string, storagePath: string, membreUid?: string, fileSize?: number, thumbnailPath?: string): Promise<void> {
    const deletes: Promise<unknown>[] = [
      deleteObject(ref(this.storage, storagePath)).catch(() => {}),
      deleteDoc(doc(this.firestore, 'themes', themeId, 'soumissions', soumissionId)),
    ];
    if (thumbnailPath) deletes.push(deleteObject(ref(this.storage, thumbnailPath)).catch(() => {}));
    await Promise.all(deletes);
    if (membreUid && fileSize) {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', membreUid), {
          'storageUsed.themes': increment(-fileSize),
        })
      ).catch(() => {});
    }
  }

  async voter(themeId: string, voterUid: string, soumissionId: string): Promise<void> {
    await setDoc(
      doc(this.firestore, 'themes', themeId, 'votes', `${voterUid}_${soumissionId}`),
      { voterUid, soumissionId, votedAt: new Date().toISOString() }
    );
  }

  async deVoter(themeId: string, voterUid: string, soumissionId: string): Promise<void> {
    await deleteDoc(
      doc(this.firestore, 'themes', themeId, 'votes', `${voterUid}_${soumissionId}`)
    );
  }

  // --- Likes ---

  async toggleLikePhoto(themeId: string, soumissionId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'themes', themeId, 'soumissions', soumissionId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  }

  // --- Commentaires ---

  getCommentaires(themeId: string, soumissionId: string): Observable<Commentaire[]> {
    const q = query(
      collection(this.firestore, `themes/${themeId}/soumissions/${soumissionId}/commentaires`),
      orderBy('createdAt', 'asc')
    );
    return from(runInInjectionContext(this.injector, () => getDocs(q))).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Commentaire)))
    );
  }

  async addCommentaire(themeId: string, soumissionId: string, data: { texte: string; auteurUid: string; nomAuteur: string }): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `themes/${themeId}/soumissions/${soumissionId}/commentaires`), {
        ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
      })
    );
  }

  async deleteCommentaire(themeId: string, soumissionId: string, commentId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId))
    );
  }

  async toggleLikeCommentaire(themeId: string, soumissionId: string, commentId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
  }

  async addReply(themeId: string, soumissionId: string, commentId: string, reply: Omit<Reponse, 'id'>): Promise<void> {
    const replyWithId: Reponse = { ...reply, id: generateId() };
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId), {
        replies: arrayUnion(replyWithId),
      })
    );
  }

  async deleteReply(themeId: string, soumissionId: string, commentId: string, replyId: string, allReplies: Reponse[]): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `themes/${themeId}/soumissions/${soumissionId}/commentaires`, commentId), {
        replies: allReplies.filter(r => r.id !== replyId),
      })
    );
  }
}
