import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Auth, signInWithEmailAndPassword, signOut, authState,
  createUserWithEmailAndPassword, sendSignInLinkToEmail, sendPasswordResetEmail
} from '@angular/fire/auth';
import {
  Firestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, collectionData, query, where, getDocs
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Router } from '@angular/router';
import { from, switchMap, of, Observable, map, shareReplay } from 'rxjs';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private router = inject(Router);
  private injector = inject(Injector);

  user$ = authState(this.auth).pipe(shareReplay(1));

  currentUserProfile$: Observable<UserProfile | null> = this.user$.pipe(
    switchMap(user => {
      if (!user) return of(null);
      return from(
        runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', user.uid))
        )
      ).pipe(
        map(snap => snap.exists() ? (snap.data() as UserProfile) : null)
      );
    }),
    shareReplay(1)
  );

  login(email: string, password: string) {
    return runInInjectionContext(this.injector, () =>
      signInWithEmailAndPassword(this.auth, email, password)
    );
  }

  async logoutSilent(): Promise<void> {
    await runInInjectionContext(this.injector, () => signOut(this.auth));
  }

  async register(email: string, password: string, nom: string) {
    const credential = await runInInjectionContext(this.injector, () =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );
    const profile: UserProfile = {
      uid: credential.user.uid,
      email,
      nom,
      role: 'membre',
      dateAdhesion: new Date().toISOString().split('T')[0]
    };
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, 'users', credential.user.uid), profile)
    );
    return credential;
  }

  async ensureUserDocument(): Promise<UserProfile | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const snap = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'users', user.uid))
    );
    if (snap.exists()) return snap.data() as UserProfile;
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email ?? '',
      nom: user.displayName ?? user.email ?? '',
      role: 'membre',
      dateAdhesion: new Date().toISOString().split('T')[0]
    };
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, 'users', user.uid), profile)
    );
    return profile;
  }

  async getUserRole(): Promise<'admin' | 'membre' | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const snap = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, 'users', user.uid))
    );
    if (!snap.exists()) return null;
    return (snap.data() as UserProfile).role;
  }

  getAllMembers(): Observable<UserProfile[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(collection(this.firestore, 'users'), { idField: 'uid' })
    ) as Observable<UserProfile[]>;
  }

  getMemberProfile(uid: string): Observable<UserProfile | null> {
    return from(
      runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', uid))
      )
    ).pipe(
      map(snap => snap.exists() ? (snap.data() as UserProfile) : null)
    );
  }

  async updateProfile(uid: string, data: Partial<Omit<UserProfile, 'uid' | 'email' | 'role' | 'dateAdhesion'>>): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), data as Record<string, unknown>)
    );
  }

  async updateLastConnection(uid: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), {
        derniereConnexion: new Date().toISOString(),
      })
    );
  }

  async changeMemberRole(uid: string, role: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), { role })
    );
  }

  async suspendMember(uid: string, isSuspended: boolean): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), { isSuspended })
    );
  }

  async resetPassword(email: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      sendPasswordResetEmail(this.auth, email, {
        url: `${window.location.origin}/`,
        handleCodeInApp: false,
      })
    );
  }

  async inviteMember(email: string): Promise<void> {
    const actionCodeSettings = {
      url: `${window.location.origin}/completer-profil`,
      handleCodeInApp: true,
    };
    await runInInjectionContext(this.injector, () =>
      sendSignInLinkToEmail(this.auth, email, actionCodeSettings)
    );
    window.localStorage.setItem('emailForSignIn', email);
  }

  async recalculateStorage(uid: string): Promise<void> {
    let portfolio = 0;
    let themes = 0;
    let oneshots = 0;

    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'photos'), where('uid', '==', uid)))
    );
    for (const d of photosSnap.docs) {
      portfolio += (d.data() as { fileSize?: number }).fileSize ?? 0;
    }

    const themesSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'themes'))
    );
    for (const themeDoc of themesSnap.docs) {
      const soumSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'themes', themeDoc.id, 'soumissions'),
          where('membreUid', '==', uid)
        ))
      );
      for (const d of soumSnap.docs) {
        themes += (d.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    const oneshotsSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'oneshots'))
    );
    for (const osDoc of oneshotsSnap.docs) {
      const osPhotosSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'oneshots', osDoc.id, 'photos'),
          where('membreUid', '==', uid)
        ))
      );
      for (const pd of osPhotosSnap.docs) {
        oneshots += (pd.data() as { fileSize?: number }).fileSize ?? 0;
      }
    }

    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'users', uid), { storageUsed: { portfolio, themes, oneshots } })
    );
  }

  async deleteMemberData(uid: string): Promise<void> {
    const deletes: Promise<void>[] = [];

    // 1. Photos portfolio
    const photosSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, 'photos'), where('uid', '==', uid)))
    );
    for (const d of photosSnap.docs) {
      const sp = (d.data() as { storagePath?: string }).storagePath;
      if (sp) deletes.push(deleteObject(ref(this.storage, sp)).catch(() => {}));
      deletes.push(runInInjectionContext(this.injector, () => deleteDoc(d.ref)));
    }

    // 2. Soumissions thèmes (par thème pour éviter collectionGroup et son index requis)
    const themesSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'themes'))
    );
    for (const themeDoc of themesSnap.docs) {
      const soumSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'themes', themeDoc.id, 'soumissions'),
          where('membreUid', '==', uid)
        ))
      );
      for (const d of soumSnap.docs) {
        const sp = (d.data() as { storagePath?: string }).storagePath;
        if (sp) deletes.push(deleteObject(ref(this.storage, sp)).catch(() => {}));
        deletes.push(runInInjectionContext(this.injector, () => deleteDoc(d.ref)));
      }
    }

    // 3. OneShots : photos + inscriptions directes (id doc == uid)
    const oneshotsSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'oneshots'))
    );
    for (const osDoc of oneshotsSnap.docs) {
      const osId = osDoc.id;
      deletes.push(
        runInInjectionContext(this.injector, () =>
          deleteDoc(doc(this.firestore, 'oneshots', osId, 'inscriptions', uid))
        ).catch(() => {})
      );
      const osPhotosSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'oneshots', osId, 'photos'),
          where('membreUid', '==', uid)
        ))
      );
      for (const pd of osPhotosSnap.docs) {
        const sp = (pd.data() as { storagePath?: string }).storagePath;
        if (sp) deletes.push(deleteObject(ref(this.storage, sp)).catch(() => {}));
        deletes.push(runInInjectionContext(this.injector, () => deleteDoc(pd.ref)));
      }
    }

    // 4. Sorties : inscriptions directes (id doc == uid)
    const sortiesSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'sorties'))
    );
    for (const sortieDoc of sortiesSnap.docs) {
      deletes.push(
        runInInjectionContext(this.injector, () =>
          deleteDoc(doc(this.firestore, 'sorties', sortieDoc.id, 'inscriptions', uid))
        ).catch(() => {})
      );
    }

    // 5. Profil Firestore
    deletes.push(runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'users', uid))
    ));

    await Promise.all(deletes);
  }

  uploadUserPhoto(uid: string, file: File, type: 'profil' | 'bandeau'): Observable<{ state: 'uploading' | 'done'; progress: number; url?: string }> {
    return new Observable(observer => {
      const storagePath = `user-photos/${uid}/${type}.jpg`;
      const storageRef = ref(this.storage, storagePath);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        snap => observer.next({ state: 'uploading', progress: Math.round(snap.bytesTransferred / snap.totalBytes * 100) }),
        err => observer.error(err),
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          observer.next({ state: 'done', progress: 100, url });
          observer.complete();
        }
      );
    });
  }

  logout() {
    return runInInjectionContext(this.injector, () =>
      signOut(this.auth)
    ).then(() => {
      this.router.navigate(['/']);
    });
  }
}
