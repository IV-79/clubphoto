import { Injectable, inject, Injector, runInInjectionContext, signal } from '@angular/core';
import {
  Firestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, collectionData, query, orderBy, limit, writeBatch, where
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppNotification, NotifType, UserSubscriptions, isSubscribed } from '../models/notification.model';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private firestore = inject(Firestore);
  private injector  = inject(Injector);

  readonly refresh = signal(0);
  private bump() { this.refresh.update(v => v + 1); }

  // ── Lecture ─────────────────────────────────────────────────

  getNotifications(uid: string): Observable<AppNotification[]> {
    return from(runInInjectionContext(this.injector, () =>
      getDocs(query(
        collection(this.firestore, `notifications/${uid}/items`),
        orderBy('createdAt', 'desc'),
        limit(50)
      ))
    )).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)))
    );
  }

  // ── Notification personnelle (like / commentaire) ────────────

  async createPersonalNotif(
    toUid: string,
    type: 'like' | 'comment',
    message: string,
    options: {
      lien?: string;
      sourceNom: string;
      sourceUid: string;
      toSubscriptions?: UserSubscriptions;
    }
  ): Promise<void> {
    if (toUid === options.sourceUid) return; // pas d'auto-notif
    if (!isSubscribed(options.toSubscriptions, type)) return;
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `notifications/${toUid}/items`), {
        type,
        message,
        lien: options.lien ?? null,
        lu: false,
        createdAt: new Date().toISOString(),
        sourceNom: options.sourceNom,
        sourceUid: options.sourceUid,
      })
    );
  }

  // ── Notification directe vers un utilisateur (actions admin) ──

  async sendToUser(
    toUid: string,
    type: NotifType,
    message: string,
    options: { lien?: string; sourceNom: string; sourceUid?: string }
  ): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, `notifications/${toUid}/items`), {
        type,
        message,
        lien: options.lien ?? null,
        lu: false,
        createdAt: new Date().toISOString(),
        sourceNom: options.sourceNom,
        ...(options.sourceUid ? { sourceUid: options.sourceUid } : {}),
      })
    );
  }

  // ── Broadcast vers tous les membres abonnés ──────────────────

  async broadcast(
    type: 'oneshot' | 'sortie' | 'article' | 'reunion' | 'document' | 'defi',
    message: string,
    options: { lien?: string; sourceNom: string; excludeUid?: string }
  ): Promise<void> {
    const usersSnap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, 'users'))
    );
    const batch = writeBatch(this.firestore);
    const now = new Date().toISOString();
    let count = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data() as UserProfile;
      if (user.uid === options.excludeUid) continue;
      if (user.isSuspended) continue;
      if (!isSubscribed(user.subscriptions, type)) continue;

      const notifRef = doc(collection(this.firestore, `notifications/${user.uid}/items`));
      batch.set(notifRef, {
        type,
        message,
        lien: options.lien ?? null,
        lu: false,
        createdAt: now,
        sourceNom: options.sourceNom,
      });
      if (++count >= 490) break; // limite batch Firestore
    }

    if (count > 0) await batch.commit();
  }

  // ── Marquage lu ──────────────────────────────────────────────

  async markAsRead(uid: string, notifId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `notifications/${uid}/items`, notifId), { lu: true })
    );
    this.bump();
  }

  async markAllAsRead(uid: string): Promise<void> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(query(
        collection(this.firestore, `notifications/${uid}/items`),
        where('lu', '==', false)
      ))
    );
    if (!snap.docs.length) return;
    const batch = writeBatch(this.firestore);
    for (const d of snap.docs) batch.update(d.ref, { lu: true });
    await batch.commit();
    this.bump();
  }

  // ── Suppression ──────────────────────────────────────────────

  async deleteNotif(uid: string, notifId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `notifications/${uid}/items`, notifId))
    );
    this.bump();
  }

  async deleteByIds(uid: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const batch = writeBatch(this.firestore);
    for (const id of ids) batch.delete(doc(this.firestore, `notifications/${uid}/items`, id));
    await batch.commit();
    this.bump();
  }

  async deleteAll(uid: string): Promise<void> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDocs(collection(this.firestore, `notifications/${uid}/items`))
    );
    if (!snap.docs.length) return;
    const batch = writeBatch(this.firestore);
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    this.bump();
  }
}
