import { initializeApp } from 'firebase/app';
import { getFirestore, onSnapshot, Query, DocumentReference } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const app = initializeApp(environment.firebase);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export function collectionStream<T>(q: Query<any>, idField?: string): Observable<T[]> {
  return new Observable(sub => onSnapshot(q, snap =>
    sub.next(snap.docs.map(d => (idField ? { [idField]: d.id, ...d.data() } : d.data()) as T))
  ));
}

export function docStream<T>(ref: DocumentReference<any>, idField?: string): Observable<T | null> {
  return new Observable(sub => onSnapshot(ref, snap =>
    sub.next(snap.exists() ? (idField ? { [idField]: snap.id, ...snap.data() } : snap.data()) as T : null)
  ));
}
