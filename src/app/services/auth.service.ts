import { Injectable, inject } from '@angular/core';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Router } from '@angular/router';
import { from, switchMap, of, Observable, map, shareReplay, pairwise, filter } from 'rxjs';
import { db, auth, storage, collectionStream, docStream } from '../utils/firebase';
import { todayISO } from '../utils/date';
import { DocumentService } from './document.service';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private documentService = inject(DocumentService);

  user$ = new Observable<import('firebase/auth').User | null>((sub) =>
    onAuthStateChanged(auth, (user) => sub.next(user)),
  ).pipe(shareReplay(1));

  currentUserProfile$: Observable<UserProfile | null> = this.user$.pipe(
    switchMap((user) => {
      if (!user) return of(null);
      return docStream<UserProfile>(doc(db, 'users', user.uid)).pipe(map((data) => data ?? null));
    }),
    shareReplay(1),
  );

  constructor() {
    // Force-logout si un admin suspend le membre pendant sa session active
    this.currentUserProfile$
      .pipe(
        pairwise(),
        filter(([prev, curr]) => prev !== null && !prev?.isSuspended && !!curr?.isSuspended),
      )
      .subscribe(() => this.logout());
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async logoutSilent(): Promise<void> {
    await signOut(auth);
  }

  async acceptCharte(version: number): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { charteAccepteeVersion: version });
  }

  async acceptCgu(version: number): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { cguAccepteeVersion: version });
  }

  async ensureUserDocument(): Promise<UserProfile | null> {
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) return snap.data() as UserProfile;
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email ?? '',
      nom: user.displayName ?? user.email ?? '',
      role: 'membre',
      dateAdhesion: todayISO(),
    };
    await setDoc(doc(db, 'users', user.uid), profile);
    return profile;
  }

  async getUserRole(): Promise<'admin' | 'contributeur' | 'membre' | null> {
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return null;
    return (snap.data() as UserProfile).role;
  }

  getAllMembers(): Observable<UserProfile[]> {
    return collectionStream<UserProfile>(collection(db, 'users'), 'uid');
  }

  getAllMembersOnce(): Observable<UserProfile[]> {
    return from(getDocs(collection(db, 'users'))).pipe(
      map((snap) => snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)),
    );
  }

  getMemberProfile(uid: string): Observable<UserProfile | null> {
    return from(getDoc(doc(db, 'users', uid))).pipe(
      map((snap) => (snap.exists() ? (snap.data() as UserProfile) : null)),
    );
  }

  async updateProfile(
    uid: string,
    data: Partial<Omit<UserProfile, 'uid' | 'email' | 'role' | 'dateAdhesion'>>,
  ): Promise<void> {
    await updateDoc(doc(db, 'users', uid), data as Record<string, unknown>);
  }

  async updateLastConnection(uid: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { derniereConnexion: new Date().toISOString() });
  }

  async changeMemberRole(uid: string, role: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { role });
  }

  async suspendMember(uid: string, isSuspended: boolean): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { isSuspended });
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/`,
      handleCodeInApp: false,
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('Non connecté');
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  }

  async inviteMember(email: string): Promise<void> {
    const actionCodeSettings = {
      url: `${window.location.origin}/completer-profil`,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', email);
  }

  async recalculateStorage(uid: string): Promise<void> {
    let portfolio = 0;
    let themes = 0;
    let oneshots = 0;
    let defis = 0;
    let sorties = 0;
    let expositions = 0;

    const photosSnap = await getDocs(query(collection(db, 'photos'), where('uid', '==', uid)));
    for (const d of photosSnap.docs) {
      portfolio += (d.data() as { fileSize?: number }).fileSize ?? 0;
    }

    const themesSnap = await getDocs(collection(db, 'themes'));
    for (const themeDoc of themesSnap.docs) {
      const soumSnap = await getDocs(
        query(collection(db, 'themes', themeDoc.id, 'soumissions'), where('membreUid', '==', uid)),
      );
      for (const d of soumSnap.docs) {
        themes += (d.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    const oneshotsSnap = await getDocs(collection(db, 'oneshots'));
    for (const osDoc of oneshotsSnap.docs) {
      const osPhotosSnap = await getDocs(
        query(collection(db, 'oneshots', osDoc.id, 'photos'), where('membreUid', '==', uid)),
      );
      for (const pd of osPhotosSnap.docs) {
        oneshots += (pd.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    const defisSnap = await getDocs(collection(db, 'defis'));
    for (const defiDoc of defisSnap.docs) {
      const defiPhotosSnap = await getDocs(
        query(collection(db, 'defis', defiDoc.id, 'photos'), where('membreUid', '==', uid)),
      );
      for (const pd of defiPhotosSnap.docs) {
        defis += (pd.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    const sortiesSnap = await getDocs(collection(db, 'sorties'));
    for (const sortieDoc of sortiesSnap.docs) {
      const sortiePhotosSnap = await getDocs(
        query(collection(db, 'sorties', sortieDoc.id, 'photos'), where('uploaderUid', '==', uid)),
      );
      for (const pd of sortiePhotosSnap.docs) {
        sorties += (pd.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    const expositionsSnap = await getDocs(collection(db, 'expositions'));
    for (const expoDoc of expositionsSnap.docs) {
      const expoPhotosSnap = await getDocs(
        query(collection(db, 'expositions', expoDoc.id, 'photos'), where('uid', '==', uid)),
      );
      for (const pd of expoPhotosSnap.docs) {
        expositions += (pd.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    let documents = 0;
    const docsSnap = await getDocs(
      query(collection(db, 'documents'), where('uploadeurUid', '==', uid)),
    );
    for (const d of docsSnap.docs) {
      documents += (d.data() as { taille?: number }).taille ?? 0;
    }

    await updateDoc(doc(db, 'users', uid), {
      storageUsed: { portfolio, themes, oneshots, defis, sorties, expositions, documents },
      photoCount: photosSnap.docs.length,
    });
  }

  async deleteMemberData(uid: string): Promise<void> {
    const deletes: Promise<void>[] = [];

    // 1. Photos portfolio
    const photosSnap = await getDocs(query(collection(db, 'photos'), where('uid', '==', uid)));
    for (const d of photosSnap.docs) {
      const data = d.data() as { storagePath?: string; thumbnailPath?: string };
      if (data.storagePath)
        deletes.push(deleteObject(ref(storage, data.storagePath)).catch(() => {}));
      if (data.thumbnailPath)
        deletes.push(deleteObject(ref(storage, data.thumbnailPath)).catch(() => {}));
      deletes.push(deleteDoc(d.ref));
    }

    // 2. Soumissions thèmes
    const themesSnap = await getDocs(collection(db, 'themes'));
    for (const themeDoc of themesSnap.docs) {
      const soumSnap = await getDocs(
        query(collection(db, 'themes', themeDoc.id, 'soumissions'), where('membreUid', '==', uid)),
      );
      for (const d of soumSnap.docs) {
        const data = d.data() as { storagePath?: string; thumbnailPath?: string };
        if (data.storagePath)
          deletes.push(deleteObject(ref(storage, data.storagePath)).catch(() => {}));
        if (data.thumbnailPath)
          deletes.push(deleteObject(ref(storage, data.thumbnailPath)).catch(() => {}));
        deletes.push(deleteDoc(d.ref));
      }
    }

    // 3. OneShots : photos + inscriptions
    const oneshotsSnap = await getDocs(collection(db, 'oneshots'));
    for (const osDoc of oneshotsSnap.docs) {
      const osId = osDoc.id;
      deletes.push(
        deleteDoc(doc(db, 'oneshots', osId, 'inscriptions', uid)).catch(() => {}) as Promise<void>,
      );
      const osPhotosSnap = await getDocs(
        query(collection(db, 'oneshots', osId, 'photos'), where('membreUid', '==', uid)),
      );
      for (const pd of osPhotosSnap.docs) {
        const data = pd.data() as { storagePath?: string; thumbnailPath?: string };
        if (data.storagePath)
          deletes.push(deleteObject(ref(storage, data.storagePath)).catch(() => {}));
        if (data.thumbnailPath)
          deletes.push(deleteObject(ref(storage, data.thumbnailPath)).catch(() => {}));
        deletes.push(deleteDoc(pd.ref));
      }
    }

    // 4. Défis : photos
    const defisSnap = await getDocs(collection(db, 'defis'));
    for (const defiDoc of defisSnap.docs) {
      const defiPhotosSnap = await getDocs(
        query(collection(db, 'defis', defiDoc.id, 'photos'), where('membreUid', '==', uid)),
      );
      for (const pd of defiPhotosSnap.docs) {
        const data = pd.data() as { storagePath?: string; thumbnailPath?: string };
        if (data.storagePath)
          deletes.push(deleteObject(ref(storage, data.storagePath)).catch(() => {}));
        if (data.thumbnailPath)
          deletes.push(deleteObject(ref(storage, data.thumbnailPath)).catch(() => {}));
        deletes.push(deleteDoc(pd.ref));
      }
    }

    // 5. Sorties : inscriptions
    const sortiesSnap = await getDocs(collection(db, 'sorties'));
    for (const sortieDoc of sortiesSnap.docs) {
      deletes.push(
        deleteDoc(doc(db, 'sorties', sortieDoc.id, 'inscriptions', uid)).catch(
          () => {},
        ) as Promise<void>,
      );
    }

    // 6. Documents partagés
    await this.documentService.deleteAllDocumentsByUser(uid);

    // 7. Photos profil et bandeau Storage
    deletes.push(deleteObject(ref(storage, `user-photos/${uid}/profil.webp`)).catch(() => {}));
    deletes.push(deleteObject(ref(storage, `user-photos/${uid}/bandeau.webp`)).catch(() => {}));

    // 8. Profil Firestore
    deletes.push(deleteDoc(doc(db, 'users', uid)));

    await Promise.all(deletes);
  }

  uploadUserPhoto(
    uid: string,
    file: File,
    type: 'profil' | 'bandeau',
  ): Observable<{ state: 'uploading' | 'done'; progress: number; url?: string }> {
    return new Observable((observer) => {
      const storagePath = `user-photos/${uid}/${type}.webp`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        (snap) =>
          observer.next({
            state: 'uploading',
            progress: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          }),
        (err) => observer.error(err),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          observer.next({ state: 'done', progress: 100, url });
          observer.complete();
        },
      );
    });
  }

  logout() {
    return signOut(auth).then(() => {
      this.router.navigate(['/']);
    });
  }
}
