import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  increment,
  getDocs,
  where,
  deleteField,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  updateMetadata,
} from 'firebase/storage';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { db, storage } from '../utils/firebase';
import { ClubDocument, DocumentDossier } from '../models/document.model';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  // --- Dossiers ---

  getDossiersOnce(): Observable<DocumentDossier[]> {
    return from(getDocs(query(collection(db, 'documentDossiers'), orderBy('ordre', 'asc')))).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocumentDossier)),
    );
  }

  async addDossier(nom: string, ordre: number): Promise<string> {
    const r = await addDoc(collection(db, 'documentDossiers'), { nom, ordre });
    return r.id;
  }

  async updateDossier(id: string, nom: string, ordre: number): Promise<void> {
    await updateDoc(doc(db, 'documentDossiers', id), { nom, ordre });
  }

  async deleteDossier(id: string): Promise<void> {
    await deleteDoc(doc(db, 'documentDossiers', id));
  }

  // --- Documents ---

  generateDocId(): string {
    return doc(collection(db, 'documents')).id;
  }

  async createDocument(id: string, data: Omit<ClubDocument, 'id'>): Promise<void> {
    await setDoc(doc(db, 'documents', id), data);
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<ClubDocument, 'id' | 'uploadeurUid' | 'uploadeurNom' | 'dateCreation'>>,
  ): Promise<void> {
    await updateDoc(doc(db, 'documents', id), {
      ...data,
      dateMiseAJour: new Date().toISOString(),
    });
  }

  async deleteDocument(id: string, storagePath: string): Promise<void> {
    await deleteObject(ref(storage, storagePath)).catch(() => {});
    await deleteDoc(doc(db, 'documents', id));
  }

  getDocumentsOnce(): Observable<ClubDocument[]> {
    return from(getDocs(query(collection(db, 'documents'), orderBy('dateCreation', 'desc')))).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClubDocument)),
    );
  }

  getDocumentsByReunion(reunionId: string): Observable<ClubDocument[]> {
    return from(
      getDocs(query(collection(db, 'documents'), where('reunionId', '==', reunionId))),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClubDocument)));
  }

  async lierAReunion(docId: string, reunionId: string): Promise<void> {
    await updateDoc(doc(db, 'documents', docId), { reunionId });
  }

  async delierReunion(docId: string): Promise<void> {
    await updateDoc(doc(db, 'documents', docId), { reunionId: deleteField() });
  }

  async unlinkDocumentsByReunion(reunionId: string): Promise<void> {
    const snap = await getDocs(
      query(collection(db, 'documents'), where('reunionId', '==', reunionId)),
    );
    await Promise.all(snap.docs.map((d) => this.delierReunion(d.id)));
  }

  async getDocumentsByUser(uid: string): Promise<ClubDocument[]> {
    const snap = await getDocs(
      query(collection(db, 'documents'), where('uploadeurUid', '==', uid)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClubDocument);
  }

  async deleteAllDocumentsByUser(uid: string): Promise<void> {
    const docs = await this.getDocumentsByUser(uid);
    await Promise.all(docs.map((d) => this.deleteDocument(d.id!, d.storagePath)));
  }

  uploadFile(
    docId: string,
    file: File,
    filename: string,
    onProgress?: (pct: number) => void,
  ): Promise<{ url: string; storagePath: string }> {
    const path = `documents/${docId}/file`;
    const storageRef = ref(storage, path);
    const metadata = {
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    };
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, metadata);
      task.on(
        'state_changed',
        (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        async () => resolve({ url: await getDownloadURL(task.snapshot.ref), storagePath: path }),
      );
    });
  }

  async updateFileMetadata(storagePath: string, filename: string): Promise<void> {
    await updateMetadata(ref(storage, storagePath), {
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }

  async incrementStorage(uid: string, bytes: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { 'storageUsed.documents': increment(bytes) });
  }

  async decrementStorage(uid: string, bytes: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { 'storageUsed.documents': increment(-bytes) });
  }
}
