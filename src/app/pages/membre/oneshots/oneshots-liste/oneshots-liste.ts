import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of, combineLatest, map } from 'rxjs';
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

  profile = toSignal(this.authService.currentUserProfile$);

  private mesEvents$ = this.authService.currentUserProfile$.pipe(
    switchMap(p => p ? this.oneShotService.getMyOneShots(p.uid) : of([]))
  );

  private autresEventsRaw = toSignal(
    combineLatest([
      this.authService.currentUserProfile$,
      this.oneShotService.getPublicOneShots(),
    ]).pipe(
      map(([profile, events]) =>
        events.filter(e => e.creatorUid !== profile?.uid)
          .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))
      )
    ),
    { initialValue: [] as OneShot[] }
  );

  mesEvents = toSignal(this.mesEvents$, { initialValue: [] as OneShot[] });
  autresEvents = computed(() => this.autresEventsRaw());

  statutLabel(statut: string): string {
    return ONESHOT_STATUT_LABELS[statut as keyof typeof ONESHOT_STATUT_LABELS] ?? statut;
  }
}
