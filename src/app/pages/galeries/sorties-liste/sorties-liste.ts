import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { Sortie } from '../../../models/sortie.model';

@Component({
  selector: 'app-sorties-liste',
  imports: [RouterLink],
  templateUrl: './sorties-liste.html',
  styleUrl: './sorties-liste.css',
})
export class SortiesListe {
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);

  profile = toSignal(this.authService.currentUserProfile$);
  sorties = toSignal(this.sortieService.getSorties(), { initialValue: [] as Sortie[] });

  private mesSorties$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.sortieService.getMesSorties(p.uid) : of([] as Sortie[]))
  );
  mesSorties = toSignal(this.mesSorties$, { initialValue: [] as Sortie[] });

  aVenir = computed(() =>
    this.sorties()
      .filter(s => this.isAVenir(s.date))
      .sort((a, b) => a.date.localeCompare(b.date))
  );

  passees = computed(() =>
    this.sorties()
      .filter(s => !this.isAVenir(s.date))
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  isAVenir(date: string): boolean {
    return new Date(date + 'T00:00:00') > new Date();
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  mapsUrl(lieu: string): string {
    return `https://maps.google.com/?q=${encodeURIComponent(lieu)}`;
  }
}
