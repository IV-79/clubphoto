import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, setDoc, getDocs, getDoc,
  query, orderBy, where, deleteField, increment,
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Exposition, ExpoSuggestion, ExpoVoteDoc, ExpoPhoto } from '../models/exposition.model';
import { generateId } from '../utils/id';

export interface ExpoUploadState {
  progress: number;
  done: boolean;
  photo?: ExpoPhoto;
}

@Injectable({ providedIn: 'root' })
export class ExpositionService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private injector  = inject(Injector);

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
    dateOuverturePublic?: string;
  }): Promise<string> {
    const payload = Object.fromEntries(
      Object.entries({ ...data, statut: 'ideation', dateCreation: new Date().toISOString() })
        .filter(([, v]) => v !== undefined)
    );
    const ref = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'expositions'), payload)
    );
    return ref.id;
  }

  getExposition(id: string): Observable<Exposition | null> {
    return (runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'expositions', id), { idField: 'id' })
    ) as Observable<Exposition | undefined>).pipe(map(e => e ?? null));
  }

  getExpositionOnce(id: string): Observable<Exposition | undefined> {
    return from(runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'expositions', id))
    )).pipe(map(d => d.exists() ? { id: d.id, ...d.data() } as Exposition : undefined));
  }

  getExpositionsOnce(): Observable<Exposition[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'expositions'), orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Exposition))));
  }

  // Expositions clôturées uniquement — lisibles sans authentification (règle: statut == 'cloture')
  getPublicExpositionsOnce(): Observable<Exposition[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'expositions'),
        where('statut', '==', 'cloture'), orderBy('dateCreation', 'desc')))
    )).pipe(map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Exposition))));
  }

  async update(id: string, data: Record<string, unknown>): Promise<void> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      clean[k] = (v === undefined || v === '') ? deleteField() : v;
    }
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', id), clean)
    );
  }

  async setCouverture(id: string, file: File): Promise<{ url: string; path: string }> {
    const path = `expositions/${id}/couverture`;
    const storageRef = ref(this.storage, path);
    await uploadBytesResumable(storageRef, file).then();
    const url = await getDownloadURL(storageRef);
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', id), { photoCouvertureUrl: url, photoCouverturePath: path })
    );
    return { url, path };
  }

  async removeCouverture(id: string, path: string): Promise<void> {
    await deleteObject(ref(this.storage, path)).catch(() => {});
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', id), {
        photoCouvertureUrl: deleteField(),
        photoCouverturePath: deleteField(),
      })
    );
  }

  async deleteExposition(id: string, photoCouverturePath?: string): Promise<void> {
    const [photosSnap, suggsSnap, votesSnap] = await runInInjectionContext(this.injector, () =>
      Promise.all([
        getDocs(collection(this.firestore, `expositions/${id}/photos`)),
        getDocs(collection(this.firestore, `expositions/${id}/suggestions`)),
        getDocs(collection(this.firestore, `expositions/${id}/votes`)),
      ])
    );
    const storageDels: Promise<void>[] = photosSnap.docs
      .map(p => deleteObject(ref(this.storage, (p.data() as ExpoPhoto).storagePath)).catch(() => {}));
    if (photoCouverturePath) storageDels.push(deleteObject(ref(this.storage, photoCouverturePath)).catch(() => {}));

    await Promise.all([
      ...storageDels,
      ...photosSnap.docs.map(p => runInInjectionContext(this.injector, () => deleteDoc(p.ref))),
      ...suggsSnap.docs.map(p => runInInjectionContext(this.injector, () => deleteDoc(p.ref))),
      ...votesSnap.docs.map(p => runInInjectionContext(this.injector, () => deleteDoc(p.ref))),
    ]);
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'expositions', id))
    );
  }

  // ── Suggestions ─────────────────────────────────────────────────────────────

  getSuggestions(expoId: string): Observable<ExpoSuggestion[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `expositions/${expoId}/suggestions`), { idField: 'id' })
    ) as Observable<ExpoSuggestion[]>;
  }

  async addSuggestion(expoId: string, texte: string, source: 'membre' | 'admin'): Promise<string> {
    const ref = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `expositions/${expoId}/suggestions`), {
        texte: texte.trim(), actif: true, source,
      })
    );
    return ref.id;
  }

  async getSuggestionsOnce(expoId: string): Promise<ExpoSuggestion[]> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `expositions/${expoId}/suggestions`))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ExpoSuggestion));
  }

  async updateSuggestion(expoId: string, suggId: string, data: Partial<Pick<ExpoSuggestion, 'texte' | 'actif'>>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `expositions/${expoId}/suggestions`, suggId), data as Record<string, unknown>)
    );
  }

  async deleteSuggestion(expoId: string, suggId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `expositions/${expoId}/suggestions`, suggId))
    );
  }

  // ── Votes ────────────────────────────────────────────────────────────────────

  getMonVote(expoId: string, uid: string): Observable<ExpoVoteDoc | null> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, `expositions/${expoId}/votes`, uid))
    ).pipe(map(d => d ? d as ExpoVoteDoc : null)) as Observable<ExpoVoteDoc | null>;
  }

  async getMonVoteOnce(expoId: string, uid: string): Promise<ExpoVoteDoc | null> {
    const d = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, `expositions/${expoId}/votes`, uid))
    );
    return d.exists() ? d.data() as ExpoVoteDoc : null;
  }

  getTousVotes(expoId: string): Observable<ExpoVoteDoc[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `expositions/${expoId}/votes`))
    ) as Observable<ExpoVoteDoc[]>;
  }

  async getTousVotesOnce(expoId: string): Promise<ExpoVoteDoc[]> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `expositions/${expoId}/votes`))
    );
    return snap.docs.map(d => d.data() as ExpoVoteDoc);
  }

  async voter(expoId: string, uid: string, themeIds: string[]): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `expositions/${expoId}/votes`, uid), { themeIds })
    );
  }

  private async supprimerTousVotes(expoId: string): Promise<void> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `expositions/${expoId}/votes`))
    );
    await Promise.all(snap.docs.map(d => runInInjectionContext(this.injector, () => deleteDoc(d.ref))));
  }

  // ── Transitions ──────────────────────────────────────────────────────────────

  async passerNettoyage(expoId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', expoId), { statut: 'nettoyage' })
    );
  }

  async passerVotation(expoId: string, dateFinVote: string, nombreVotesParMembre: number): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', expoId), {
        statut: 'votation', dateFinVote, nombreVotesParMembre,
      })
    );
  }

  async retourNettoyageDepuisVotation(expoId: string): Promise<void> {
    // Compte les scores, pré-coche les ex-aequo, reset les votes
    const [suggsSnap, votesSnap] = await runInInjectionContext(this.injector, () =>
      Promise.all([
        getDocs(collection(this.firestore, `expositions/${expoId}/suggestions`)),
        getDocs(collection(this.firestore, `expositions/${expoId}/votes`)),
      ])
    );

    const scores: Record<string, number> = {};
    for (const voteDoc of votesSnap.docs) {
      const vote = voteDoc.data() as ExpoVoteDoc;
      for (const id of vote.themeIds) scores[id] = (scores[id] ?? 0) + 1;
    }
    const maxScore = Math.max(0, ...Object.values(scores));
    const exaequoIds = maxScore > 0
      ? Object.keys(scores).filter(id => scores[id] === maxScore)
      : [];

    await Promise.all([
      ...suggsSnap.docs.map(s =>
        runInInjectionContext(this.injector, () =>
          updateDoc(s.ref, { actif: exaequoIds.includes(s.id) })
        )
      ),
      ...votesSnap.docs.map(d =>
        runInInjectionContext(this.injector, () => deleteDoc(d.ref))
      ),
    ]);

    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', expoId), {
        statut: 'nettoyage',
        dateFinVote: deleteField(),
        nombreVotesParMembre: deleteField(),
      })
    );
  }

  async passerSoumission(expoId: string, themeChoisi: string, dateFinSoumission: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', expoId), {
        statut: 'soumission', themeChoisi: themeChoisi.trim(), dateFinSoumission,
      })
    );
  }

  async cloture(expoId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'expositions', expoId), { statut: 'cloture' })
    );
  }

  // ── Photos ───────────────────────────────────────────────────────────────────

  getPhotos(expoId: string): Observable<ExpoPhoto[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `expositions/${expoId}/photos`), { idField: 'id' })
    ) as Observable<ExpoPhoto[]>;
  }

  async getPhotosOnce(expoId: string): Promise<ExpoPhoto[]> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `expositions/${expoId}/photos`))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ExpoPhoto));
  }

  uploadPhoto(file: File, expoId: string, meta: { uid: string; nomAuteur: string; exif?: import('../models/photo.model').PhotoExif | null }): Observable<ExpoUploadState> {
    return new Observable(observer => {
      const id = generateId();
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `expositions/${expoId}/${id}.${ext}`;
      const storageRef = ref(this.storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on('state_changed',
        snap => observer.next({ progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100), done: false }),
        err => observer.error(err),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          const data: Omit<ExpoPhoto, 'id'> = {
            url, storagePath, fileSize: file.size,
            uid: meta.uid, nomAuteur: meta.nomAuteur,
            uploadedAt: new Date().toISOString(),
            ...(meta.exif != null ? { exif: meta.exif } : {}),
          };
          const docRef = await runInInjectionContext(this.injector, () =>
            addDoc(collection(this.firestore, `expositions/${expoId}/photos`), data)
          );
          runInInjectionContext(this.injector, () =>
            updateDoc(doc(this.firestore, 'users', meta.uid), {
              'storageUsed.expositions': increment(file.size),
            })
          ).catch(() => {});
          observer.next({ progress: 100, done: true, photo: { id: docRef.id, ...data } });
          observer.complete();
        }
      );
    });
  }

  async deletePhoto(expoId: string, photo: ExpoPhoto): Promise<void> {
    await Promise.all([
      deleteObject(ref(this.storage, photo.storagePath)).catch(() => {}),
      runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, `expositions/${expoId}/photos`, photo.id))
      ),
    ]);
    runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', photo.uid), {
        'storageUsed.expositions': increment(-photo.fileSize),
      })
    ).catch(() => {});
  }
}
