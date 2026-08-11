import { Injectable, signal } from '@angular/core';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  writeBatch,
  where,
} from 'firebase/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { db } from '../utils/firebase';
import {
  AppNotification,
  NotifType,
  UserSubscriptions,
  isSubscribed,
} from '../models/notification.model';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly refresh = signal(0);
  private bump() {
    this.refresh.update((v) => v + 1);
  }

  // ── Lecture ─────────────────────────────────────────────────

  getNotifications(uid: string): Observable<AppNotification[]> {
    return from(
      getDocs(
        query(
          collection(db, `notifications/${uid}/items`),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
      ),
    ).pipe(map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)));
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
    },
  ): Promise<void> {
    if (toUid === options.sourceUid) return; // pas d'auto-notif
    if (!isSubscribed(options.toSubscriptions, type)) return;
    await addDoc(collection(db, `notifications/${toUid}/items`), {
      type,
      message,
      lien: options.lien ?? null,
      lu: false,
      createdAt: new Date().toISOString(),
      sourceNom: options.sourceNom,
      sourceUid: options.sourceUid,
    });
  }

  // ── Notification directe vers un utilisateur (actions admin) ──

  async sendToUser(
    toUid: string,
    type: NotifType,
    message: string,
    options: { lien?: string; sourceNom: string; sourceUid?: string },
  ): Promise<void> {
    await addDoc(collection(db, `notifications/${toUid}/items`), {
      type,
      message,
      lien: options.lien ?? null,
      lu: false,
      createdAt: new Date().toISOString(),
      sourceNom: options.sourceNom,
      ...(options.sourceUid ? { sourceUid: options.sourceUid } : {}),
    });
  }

  // ── Broadcast vers tous les membres abonnés ──────────────────

  async broadcast(
    type: 'oneshot' | 'sortie' | 'article' | 'reunion' | 'document' | 'defi' | 'exposition',
    message: string,
    options: { lien?: string; sourceNom: string; excludeUid?: string },
  ): Promise<void> {
    const usersSnap = await getDocs(collection(db, 'users'));
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    let count = 0;

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data() as UserProfile;
      if (user.uid === options.excludeUid) continue;
      if (user.isSuspended) continue;
      if (!isSubscribed(user.subscriptions, type)) continue;

      const notifRef = doc(collection(db, `notifications/${user.uid}/items`));
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
    await updateDoc(doc(db, `notifications/${uid}/items`, notifId), { lu: true });
    this.bump();
  }

  async markAllAsRead(uid: string): Promise<void> {
    const snap = await getDocs(
      query(collection(db, `notifications/${uid}/items`), where('lu', '==', false)),
    );
    if (!snap.docs.length) return;
    const batch = writeBatch(db);
    for (const d of snap.docs) batch.update(d.ref, { lu: true });
    await batch.commit();
    this.bump();
  }

  // ── Suppression ──────────────────────────────────────────────

  async deleteNotif(uid: string, notifId: string): Promise<void> {
    await deleteDoc(doc(db, `notifications/${uid}/items`, notifId));
    this.bump();
  }

  async deleteByIds(uid: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const batch = writeBatch(db);
    for (const id of ids) batch.delete(doc(db, `notifications/${uid}/items`, id));
    await batch.commit();
    this.bump();
  }

  async deleteAll(uid: string): Promise<void> {
    const snap = await getDocs(collection(db, `notifications/${uid}/items`));
    if (!snap.docs.length) return;
    const batch = writeBatch(db);
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    this.bump();
  }
}
