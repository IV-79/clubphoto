import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { OneShot, ONESHOT_STATUT_LABELS } from '../../../../models/oneshot.model';

@Component({
  selector: 'app-oneshots-liste',
  imports: [RouterLink],
  templateUrl: './oneshots-liste.html',
  styleUrl: './oneshots-liste.css',
})
export class OneShotsListe {
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);

  // Source unique pour le profil — une seule souscription à currentUserProfile$
  profile = toSignal(this.authService.currentUserProfile$);

  // Mes événements : réagit au signal profile via toObservable
  private mesEvents$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.oneShotService.getMyOneShots(p.uid) : of([] as OneShot[]))
  );
  mesEvents = toSignal(this.mesEvents$, { initialValue: [] as OneShot[] });

  // Tous les events publics — souscription indépendante
  private allPublic = toSignal(
    this.oneShotService.getPublicOneShots(),
    { initialValue: [] as OneShot[] }
  );

  // Filtrés + triés via computed, sans souscription Observable supplémentaire
  autresEvents = computed(() => {
    const myUid = this.profile()?.uid;
    return this.allPublic()
      .filter(e => e.creatorUid !== myUid)
      .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));
  });

  statutLabel(statut: string): string {
    return ONESHOT_STATUT_LABELS[statut as keyof typeof ONESHOT_STATUT_LABELS] ?? statut;
  }
}
