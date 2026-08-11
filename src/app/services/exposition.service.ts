import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  deleteField,
  increment,
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
import { Exposition, ExpoSuggestion, ExpoVoteDoc, ExpoPhoto } from '../models/exposition.model';
import { generateId } from '../utils/id';
import { compressImage, COMPRESS_THUMB } from '../utils/image-compress';
import { NotificationService } from './notification.service';

export interface ExpoUploadState {
  progress: number;
  done: boolean;
  photo?: ExpoPhoto;
}

@Injectable({ providedIn: 'root' })
export class ExpositionService {
  private notifService = inject(NotificationService);

  // ── Exposition CRUD ─────────────────────────────────────────────────────────

  async create(data: {
    titre: string;
    description?: string;
    organisateurUid: string;
    nomOrganisateur: string;
    maxPhotosParMembre: number;
    dateDebutIdeation?: string;
    dateFinIdeation: string;
    dateExposition?: string;
    visibilite?: 'public' | 'membre';
  }): Promise<string> {
    const payload = Object.fromEntries(
      Object.entries({
        statut: 'ideation',
        visibilite: 'membre',
        ...data,
        dateCreation: new Date().toISOString(),
      }).filter(([, v]) => v !== undefined),
    );
    const ref = await addDoc(collection(db, 'expositions'), payload);
    this.notifService
      .broadcast(
        'exposition',
        `${data.nomOrganisateur} lance une nouvelle exposition « ${data.titre} »`,
        {
          lien: `/galeries/expositions/${ref.id}`,
          sourceNom: data.nomOrganisateur,
          excludeUid: data.organisateurUid,
        },
      )
      .catch(() => {});
    return ref.id;
  }

  getExpositionOnce(id: string): Observable<Exposition | undefined> {
    return from(getDoc(doc(db, 'expositions', id))).pipe(
      map((d) => (d.exists() ? ({ id: d.id, ...d.data() } as Exposition) : undefined)),
    );
  }

  getExpositionsOnce(): Observable<Exposition[]> {
    return from(
      getDocs(query(collection(db, 'expositions'), orderBy('dateCreation', 'desc'))),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Exposition)));
  }

  getPublicExpositionsOnce(): Observable<Exposition[]> {
    return from(
      getDocs(
        query(
          collection(db, 'expositions'),
          where('visibilite', '==', 'public'),
          orderBy('dateCreation', 'desc'),
        ),
      ),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Exposition)));
  }

  async update(id: string, data: Record<string, unknown>): Promise<void> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      clean[k] = v === undefined || v === '' ? deleteField() : v;
    }
    await updateDoc(doc(db, 'expositions', id), clean);
  }

  async setCouverture(id: string, file: File): Promise<{ url: string; path: string }> {
    const path = `expositions/${id}/couverture`;
    const storageRef = ref(storage, path);
    await uploadBytesResumable(storageRef, file).then();
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'expositions', id), {
      photoCouvertureUrl: url,
      photoCouverturePath: path,
      photoCouvertureFileSize: file.size,
    });
    return { url, path };
  }

  async removeCouverture(id: string, path: string): Promise<void> {
    await deleteObject(ref(storage, path)).catch(() => {});
    await updateDoc(doc(db, 'expositions', id), {
      photoCouvertureUrl: deleteField(),
      photoCouverturePath: deleteField(),
      photoCouvertureFileSize: deleteField(),
    });
  }

  async deleteExposition(id: string, photoCouverturePath?: string): Promise<void> {
    const [photosSnap, suggsSnap, votesSnap] = await Promise.all([
      getDocs(collection(db, `expositions/${id}/photos`)),
      getDocs(collection(db, `expositions/${id}/suggestions`)),
      getDocs(collection(db, `expositions/${id}/votes`)),
    ]);
    const storageDels: Promise<void>[] = [];
    const sizeByUser: Record<string, number> = {};
    for (const p of photosSnap.docs) {
      const d = p.data() as ExpoPhoto;
      storageDels.push(deleteObject(ref(storage, d.storagePath)).catch(() => {}));
      if (d.thumbnailPath)
        storageDels.push(deleteObject(ref(storage, d.thumbnailPath)).catch(() => {}));
      if (d.uid && d.fileSize) {
        sizeByUser[d.uid] = (sizeByUser[d.uid] ?? 0) + d.fileSize;
      }
    }
    if (photoCouverturePath)
      storageDels.push(deleteObject(ref(storage, photoCouverturePath)).catch(() => {}));

    await Promise.all([
      ...storageDels,
      ...photosSnap.docs.map((p) => deleteDoc(p.ref)),
      ...suggsSnap.docs.map((p) => deleteDoc(p.ref)),
      ...votesSnap.docs.map((p) => deleteDoc(p.ref)),
    ]);
    await deleteDoc(doc(db, 'expositions', id));
    Object.entries(sizeByUser).forEach(([uid, size]) =>
      updateDoc(doc(db, 'users', uid), { 'storageUsed.expositions': increment(-size) }).catch(
        () => {},
      ),
    );
  }

  // ── Suggestions ─────────────────────────────────────────────────────────────

  async addSuggestion(expoId: string, texte: string, source: 'membre' | 'admin'): Promise<string> {
    const ref = await addDoc(collection(db, `expositions/${expoId}/suggestions`), {
      texte: texte.trim(),
      actif: true,
      source,
    });
    return ref.id;
  }

  async getSuggestionsOnce(expoId: string): Promise<ExpoSuggestion[]> {
    const snap = await getDocs(collection(db, `expositions/${expoId}/suggestions`));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpoSuggestion);
  }

  async updateSuggestion(
    expoId: string,
    suggId: string,
    data: Partial<Pick<ExpoSuggestion, 'texte' | 'actif'>>,
  ): Promise<void> {
    await updateDoc(
      doc(db, `expositions/${expoId}/suggestions`, suggId),
      data as Record<string, unknown>,
    );
  }

  async deleteSuggestion(expoId: string, suggId: string): Promise<void> {
    await deleteDoc(doc(db, `expositions/${expoId}/suggestions`, suggId));
  }

  // ── Votes ────────────────────────────────────────────────────────────────────

  async getMonVoteOnce(expoId: string, uid: string): Promise<ExpoVoteDoc | null> {
    const d = await getDoc(doc(db, `expositions/${expoId}/votes`, uid));
    return d.exists() ? (d.data() as ExpoVoteDoc) : null;
  }

  async getTousVotesOnce(expoId: string): Promise<ExpoVoteDoc[]> {
    const snap = await getDocs(collection(db, `expositions/${expoId}/votes`));
    return snap.docs.map((d) => d.data() as ExpoVoteDoc);
  }

  async voter(expoId: string, uid: string, themeIds: string[]): Promise<void> {
    await setDoc(doc(db, `expositions/${expoId}/votes`, uid), { themeIds });
  }

  private async supprimerTousVotes(expoId: string): Promise<void> {
    const snap = await getDocs(collection(db, `expositions/${expoId}/votes`));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }

  // ── Transitions ──────────────────────────────────────────────────────────────

  async passerVotation(
    expoId: string,
    dateFinVote: string,
    nombreVotesParMembre: number,
  ): Promise<void> {
    await updateDoc(doc(db, 'expositions', expoId), {
      statut: 'votation',
      dateFinVote,
      nombreVotesParMembre,
    });
  }

  async retourNettoyageDepuisVotation(expoId: string): Promise<void> {
    const [suggsSnap, votesSnap] = await Promise.all([
      getDocs(collection(db, `expositions/${expoId}/suggestions`)),
      getDocs(collection(db, `expositions/${expoId}/votes`)),
    ]);

    const scores: Record<string, number> = {};
    for (const voteDoc of votesSnap.docs) {
      const vote = voteDoc.data() as ExpoVoteDoc;
      for (const id of vote.themeIds) scores[id] = (scores[id] ?? 0) + 1;
    }
    const maxScore = Math.max(0, ...Object.values(scores));
    const exaequoIds =
      maxScore > 0 ? Object.keys(scores).filter((id) => scores[id] === maxScore) : [];

    await Promise.all([
      ...suggsSnap.docs.map((s) => updateDoc(s.ref, { actif: exaequoIds.includes(s.id) })),
      ...votesSnap.docs.map((d) => deleteDoc(d.ref)),
    ]);

    await updateDoc(doc(db, 'expositions', expoId), {
      statut: 'nettoyage',
      dateFinVote: deleteField(),
      nombreVotesParMembre: deleteField(),
    });
  }

  async passerSoumission(
    expoId: string,
    themeChoisi: string,
    dateFinSoumission: string,
  ): Promise<void> {
    await updateDoc(doc(db, 'expositions', expoId), {
      themeChoisi: themeChoisi.trim(),
      dateFinSoumission,
    });
  }

  async cloture(expoId: string): Promise<void> {
    await updateDoc(doc(db, 'expositions', expoId), { statut: 'cloture' });
  }

  async setVisibilite(expoId: string, visibilite: 'public' | 'membre'): Promise<void> {
    await updateDoc(doc(db, 'expositions', expoId), { visibilite });
  }

  async setPhotosPubliques(expoId: string, value: boolean): Promise<void> {
    await updateDoc(doc(db, 'expositions', expoId), { photosPubliques: value });
  }

  // ── Photos ───────────────────────────────────────────────────────────────────

  async getPhotosOnce(expoId: string): Promise<ExpoPhoto[]> {
    const snap = await getDocs(collection(db, `expositions/${expoId}/photos`));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpoPhoto);
  }

  uploadPhoto(
    file: File,
    expoId: string,
    meta: {
      uid: string;
      nomAuteur: string;
      exif?: import('../models/photo.model').PhotoExif | null;
    },
  ): Observable<ExpoUploadState> {
    return new Observable((observer) => {
      const id = generateId();
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `expositions/${expoId}/${id}.${ext}`;
      const thumbPath = `expositions/${expoId}/${id}_thumb.${ext}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on(
        'state_changed',
        (snap) =>
          observer.next({
            progress: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            done: false,
          }),
        (err) => observer.error(err),
        async () => {
          const [url, thumb] = await Promise.all([
            getDownloadURL(task.snapshot.ref),
            compressImage(file, COMPRESS_THUMB),
          ]);
          const thumbSnap = await uploadBytes(ref(storage, thumbPath), thumb);
          const thumbnailUrl = await getDownloadURL(thumbSnap.ref);
          const fileSize = file.size + thumb.size;
          const data: Omit<ExpoPhoto, 'id'> = {
            url,
            storagePath,
            thumbnailUrl,
            thumbnailPath: thumbPath,
            fileSize,
            uid: meta.uid,
            nomAuteur: meta.nomAuteur,
            uploadedAt: new Date().toISOString(),
            ...(meta.exif != null ? { exif: meta.exif } : {}),
          };
          const docRef = await addDoc(collection(db, `expositions/${expoId}/photos`), data);
          updateDoc(doc(db, 'users', meta.uid), {
            'storageUsed.expositions': increment(fileSize),
          }).catch(() => {});
          observer.next({ progress: 100, done: true, photo: { id: docRef.id, ...data } });
          observer.complete();
        },
      );
    });
  }

  async deletePhoto(expoId: string, photo: ExpoPhoto): Promise<void> {
    await Promise.all([
      deleteObject(ref(storage, photo.storagePath)).catch(() => {}),
      ...(photo.thumbnailPath
        ? [deleteObject(ref(storage, photo.thumbnailPath)).catch(() => {})]
        : []),
      deleteDoc(doc(db, `expositions/${expoId}/photos`, photo.id)),
    ]);
    updateDoc(doc(db, 'users', photo.uid), {
      'storageUsed.expositions': increment(-photo.fileSize),
    }).catch(() => {});
  }
}
