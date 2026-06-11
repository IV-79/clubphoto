import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, authState, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, updateDoc, collection, collectionData } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { from, switchMap, of, Observable, map } from 'rxjs';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private injector = inject(Injector);

  user$ = authState(this.auth);

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
    })
  );

  login(email: string, password: string) {
    return runInInjectionContext(this.injector, () =>
      signInWithEmailAndPassword(this.auth, email, password)
    );
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

  logout() {
    return runInInjectionContext(this.injector, () =>
      signOut(this.auth)
    ).then(() => {
      this.router.navigate(['/login']);
    });
  }
}
