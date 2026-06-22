import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc,
  addDoc, updateDoc, deleteDoc, setDoc, query, orderBy, increment, getDocs, where
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject, updateMetadata } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { ClubDocument, DocumentDossier } from '../models/document.model';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private injector  = inject(Injector);

  // --- Dossiers ---

  getDossiers(): Observable<DocumentDossier[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'documentDossiers'), orderBy('ordre', 'asc')),
        { idField: 'id' }
      )
    ) as Observable<DocumentDossier[]>;
  }

  async addDossier(nom: string, ordre: number): Promise<string> {
    const r = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'documentDossiers'), { nom, ordre })
    );
    return r.id;
  }

  async updateDossier(id: string, nom: string, ordre: number): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'documentDossiers', id), { nom, ordre })
    );
  }

  async deleteDossier(id: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'documentDossiers', id))
    );
  }

  // --- Documents ---

  getDocuments(): Observable<ClubDocument[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'documents'), orderBy('dateCreation', 'desc')),
        { idField: 'id' }
      )
    ) as Observable<ClubDocument[]>;
  }

  generateDocId(): string {
    return doc(collection(this.firestore, 'documents')).id;
  }

  async createDocument(id: string, data: Omit<ClubDocument, 'id'>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, 'documents', id), data)
    );
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<ClubDocument, 'id' | 'uploadeurUid' | 'uploadeurNom' | 'dateCreation'>>
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'documents', id), {
        ...data,
        dateMiseAJour: new Date().toISOString(),
      })
    );
  }

  async deleteDocument(id: string, storagePath: string): Promise<void> {
    await deleteObject(ref(this.storage, storagePath)).catch(() => {});
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'documents', id))
    );
  }

  async getDocumentsByUser(uid: string): Promise<ClubDocument[]> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'documents'), where('uploadeurUid', '==', uid)))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubDocument));
  }

  async deleteAllDocumentsByUser(uid: string): Promise<void> {
    const docs = await this.getDocumentsByUser(uid);
    await Promise.all(docs.map(d =>
      this.deleteDocument(d.id!, d.storagePath)
    ));
  }

  uploadFile(
    docId: string,
    file: File,
    filename: string,
    onProgress?: (pct: number) => void
  ): Promise<{ url: string; storagePath: string }> {
    const path = `documents/${docId}/file`;
    const storageRef = ref(this.storage, path);
    const metadata = {
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    };
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, metadata);
      task.on('state_changed',
        snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => resolve({ url: await getDownloadURL(task.snapshot.ref), storagePath: path })
      );
    });
  }

  async updateFileMetadata(storagePath: string, filename: string): Promise<void> {
    await updateMetadata(ref(this.storage, storagePath), {
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }

  async incrementStorage(uid: string, bytes: number): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), { 'storageUsed.documents': increment(bytes) })
    );
  }

  async decrementStorage(uid: string, bytes: number): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), { 'storageUsed.documents': increment(-bytes) })
    );
  }
}
