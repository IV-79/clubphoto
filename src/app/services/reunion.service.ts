import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, getDocs, doc, addDoc, deleteDoc, updateDoc, query, orderBy, deleteField
} from '@angular/fire/firestore';
import { Observable, firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reunion } from '../models/reunion.model';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { DocumentService } from './document.service';

@Injectable({ providedIn: 'root' })
export class ReunionService {
  private firestore   = inject(Firestore);
  private injector    = inject(Injector);
  private notifService = inject(NotificationService);
  private authService  = inject(AuthService);
  private docService   = inject(DocumentService);

  getReunions(): Observable<Reunion[]> {
    const q = query(collection(this.firestore, 'reunions'), orderBy('date', 'asc'));
    return from(runInInjectionContext(this.injector, () => getDocs(q))).pipe(
      map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Reunion)))
    );
  }

  async creer(data: Omit<Reunion, 'id' | 'dateCreation' | 'type'>): Promise<void> {
    const ref = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'reunions'), {
        ...data,
        type: 'reunion',
        dateCreation: new Date().toISOString(),
      })
    );

    const profile = await firstValueFrom(this.authService.currentUserProfile$);
    const adminNom = profile ? `${profile.prenom} ${profile.nom}` : 'Admin';
    const adminUid = profile?.uid ?? undefined;

    await this.notifService.broadcast('reunion', `Nouvelle réunion : ${data.titre}`, {
      lien: `/calendrier?reunion=${ref.id}`,
      sourceNom: adminNom,
      excludeUid: adminUid,
    });
  }

  async modifier(
    id: string,
    data: Partial<Omit<Reunion, 'id' | 'dateCreation' | 'type'>>,
    notifCtx?: { oldDate: string; titre: string }
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      update[key] = (typeof val === 'string' && val === '') ? deleteField() : val;
    }
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'reunions', id), update)
    );
    if (notifCtx && data.date && data.date !== notifCtx.oldDate) {
      const profile = await firstValueFrom(this.authService.currentUserProfile$);
      const adminNom = profile ? `${profile.prenom ?? ''} ${profile.nom}`.trim() : 'Admin';
      const dateStr = new Date(data.date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      await this.notifService.broadcast('reunion',
        `La date de la réunion « ${notifCtx.titre} » a changé : ${dateStr}`,
        { lien: `/calendrier?reunion=${id}`, sourceNom: adminNom, excludeUid: profile?.uid }
      );
    }
  }

  async supprimer(id: string): Promise<void> {
    await this.docService.unlinkDocumentsByReunion(id);
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, 'reunions', id))
    );
  }
}
