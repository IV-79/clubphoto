import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { NotificationService } from './notification.service';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, setDoc, getDocs, getDoc,
  query, where, orderBy, arrayUnion, arrayRemove
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import {
  Sortie, SortieInscription, SortieImage, SortieCommentaire, SortieReply
} from '../models/sortie.model';
import { PhotoExif } from '../models/photo.model';
import { hasExif } from '../utils/exif-reader';
import { generateId } from '../utils/id';

export interface SortieUploadState {
  progress: number;
  done: boolean;
  image?: SortieImage;
}

@Injectable({ providedIn: 'root' })
export class SortieService {
  private firestore    = inject(Firestore);
  private storage      = inject(Storage);
  private injector     = inject(Injector);
  private notifService = inject(NotificationService);

  getSorties(): Observable<Sortie[]> {
    const q = query(collection(this.firestore, 'sorties'), orderBy('date', 'desc'));
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Sortie[]>;
  }

  getSortie(id: string): Observable<Sortie> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'sorties', id), { idField: 'id' })
    ) as Observable<Sortie>;
  }

  getMesSorties(uid: string): Observable<Sortie[]> {
    const q = query(
      collection(this.firestore, 'sorties'),
      where('organisateurUid', '==', uid),
      orderBy('date', 'desc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<Sortie[]>;
  }

  async createSortie(data: Omit<Sortie, 'id' | 'dateCreation' | 'photoCouvertureUrl'>): Promise<string> {
    const docRef = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'sorties'), {
        ...data,
        dateCreation: new Date().toISOString(),
      })
    );
    this.notifService.broadcast('sortie',
      `${data.nomOrganisateur} a organisé une nouvelle sortie photo : « ${data.titre} »`,
      { lien: `/galeries/sorties/${docRef.id}`, sourceNom: data.nomOrganisateur, excludeUid: data.organisateurUid }
    ).catch(() => {});
    return docRef.id;
  }

  async updateSortie(id: string, data: Partial<Omit<Sortie, 'id' | 'dateCreation' | 'organisateurUid' | 'nomOrganisateur'>>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'sorties', id), { ...data })
    );
  }

  async deleteSortie(sortieId: string): Promise<void> {
    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `sorties/${sortieId}/photos`))
    );
    await Promise.all(
      photosSnap.docs
        .map(d => d.data()['storagePath'] as string)
        .filter(Boolean)
        .map(path => deleteObject(ref(this.storage, path)).catch(() => {}))
    );
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'sorties', sortieId))
    );
  }

  // --- Inscriptions ---

  getInscriptions(sortieId: string): Observable<SortieInscription[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, `sorties/${sortieId}/inscriptions`))
    ) as Observable<SortieInscription[]>;
  }

  async inscrire(sortieId: string, uid: string, nomMembre: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `sorties/${sortieId}/inscriptions`, uid), {
        uid, nomMembre, dateInscription: new Date().toISOString(),
      })
    );
  }

  async desinscrire(sortieId: string, uid: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `sorties/${sortieId}/inscriptions`, uid))
    );
  }

  // --- Photos ---

  getPhotos(sortieId: string): Observable<SortieImage[]> {
    const q = query(
      collection(this.firestore, `sorties/${sortieId}/photos`),
      orderBy('uploadedAt', 'asc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<SortieImage[]>;
  }

  uploadPhoto(
    file: File,
    sortieId: string,
    meta: { uploaderUid: string; nomUploader: string; exif?: PhotoExif }
  ): Observable<SortieUploadState> {
    return new Observable(observer => {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `sorties/${sortieId}/${generateId()}.${ext}`;
      const storageRef = ref(this.storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);

      task.on('state_changed',
        snap => observer.next({ progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100), done: false }),
        err => observer.error(err),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          const imageData: Omit<SortieImage, 'id'> = {
            url, storagePath, likes: [], uploadedAt: new Date().toISOString(),
            uploaderUid: meta.uploaderUid, nomUploader: meta.nomUploader,
            ...(hasExif(meta.exif) ? { exif: meta.exif } : {}),
          };
          const docRef = await runInInjectionContext(this.injector, () =>
            addDoc(collection(this.firestore, `sorties/${sortieId}/photos`), imageData)
          );
          // Set as cover if none yet
          const sortieDoc = await runInInjectionContext(this.injector, () =>
            getDoc(doc(this.firestore, 'sorties', sortieId))
          );
          if (!sortieDoc.data()?.['photoCouvertureUrl']) {
            await runInInjectionContext(this.injector, () =>
              updateDoc(doc(this.firestore, 'sorties', sortieId), { photoCouvertureUrl: url })
            );
          }
          observer.next({ progress: 100, done: true, image: { id: docRef.id, ...imageData } });
          observer.complete();
        }
      );
    });
  }

  async deletePhoto(sortieId: string, image: SortieImage, currentCoverUrl?: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      Promise.all([
        deleteObject(ref(this.storage, image.storagePath)).catch(() => {}),
        deleteDoc(doc(this.firestore, `sorties/${sortieId}/photos`, image.id)),
      ])
    );
    if (currentCoverUrl === image.url) {
      const photosSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(collection(this.firestore, `sorties/${sortieId}/photos`), orderBy('uploadedAt', 'asc')))
      );
      const first = photosSnap.docs[0];
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'sorties', sortieId), {
          photoCouvertureUrl: first ? first.data()['url'] : null,
        })
      );
    }
  }

  async toggleLikePhoto(sortieId: string, photoId: string, uid: string, currentlyLiked: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `sorties/${sortieId}/photos`, photoId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
    await this.updateBestCover(sortieId);
  }

  private async updateBestCover(sortieId: string): Promise<void> {
    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, `sorties/${sortieId}/photos`), orderBy('uploadedAt', 'asc')))
    );
    if (photosSnap.empty) return;
    const best = photosSnap.docs.reduce((acc, d) => {
      const dLikes = (d.data()['likes'] as string[] | undefined)?.length ?? 0;
      const accLikes = (acc.data()['likes'] as string[] | undefined)?.length ?? 0;
      return dLikes > accLikes ? d : acc;
    });
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'sorties', sortieId), {
        photoCouvertureUrl: best.data()['url'],
      })
    );
  }

  // --- Commentaires ---

  getCommentaires(sortieId: string, photoId: string): Observable<SortieCommentaire[]> {
    const q = query(
      collection(this.firestore, `sorties/${sortieId}/photos/${photoId}/commentaires`),
      orderBy('createdAt', 'asc')
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' })
    ) as Observable<SortieCommentaire[]>;
  }

  async addCommentaire(
    sortieId: string,
    photoId: string,
    data: { texte: string; auteurUid: string; nomAuteur: string }
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `sorties/${sortieId}/photos/${photoId}/commentaires`), {
        ...data, likes: [], replies: [], createdAt: new Date().toISOString(),
      })
    );
  }

  async deleteCommentaire(sortieId: string, photoId: string, commentaireId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId))
    );
  }

  async toggleLikeCommentaire(
    sortieId: string, photoId: string, commentaireId: string, uid: string, currentlyLiked: boolean
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId), {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      })
    );
  }

  async addReply(
    sortieId: string, photoId: string, commentaireId: string, reply: Omit<SortieReply, 'id'>
  ): Promise<void> {
    const replyWithId: SortieReply = { ...reply, id: generateId() };
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId), {
        replies: arrayUnion(replyWithId),
      })
    );
  }

  async deleteReply(
    sortieId: string, photoId: string, commentaireId: string,
    replyId: string, allReplies: SortieReply[]
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `sorties/${sortieId}/photos/${photoId}/commentaires`, commentaireId), {
        replies: allReplies.filter(r => r.id !== replyId),
      })
    );
  }
}
