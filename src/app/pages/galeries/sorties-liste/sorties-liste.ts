import { Component, inject, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { OneShotService } from '../../../services/oneshot.service';
import { Sortie, SORTIE_TYPE_META, SortieType } from '../../../models/sortie.model';
import { OneShot, ONESHOT_STATUT_LABELS, OneShotStatut } from '../../../models/oneshot.model';

export type ActiviteItem =
  | { kind: 'sortie'; data: Sortie }
  | { kind: 'oneshot'; data: OneShot };

@Component({
  selector: 'app-sorties-liste',
  imports: [RouterLink],
  templateUrl: './sorties-liste.html',
  styleUrl: './sorties-liste.css',
})
export class SortiesListe {
  private sortieService  = inject(SortieService);
  private oneShotService = inject(OneShotService);
  private authService    = inject(AuthService);

  profile  = toSignal(this.authService.currentUserProfile$);
  sorties  = toSignal(this.sortieService.getSorties(), { initialValue: [] as Sortie[] });
  oneshots = toSignal(this.oneShotService.getPublicOneShots(), { initialValue: [] as OneShot[] });

  private mesSorties$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.sortieService.getMesSorties(p.uid) : of([] as Sortie[]))
  );
  mesSorties = toSignal(this.mesSorties$, { initialValue: [] as Sortie[] });

  // OneSHots du créateur connecté — pour afficher les brouillons (préparation) uniquement à lui
  private mesOneShots$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.oneShotService.getMyOneShots(p.uid) : of([] as OneShot[]))
  );
  mesOneShots = toSignal(this.mesOneShots$, { initialValue: [] as OneShot[] });

  private mesSortiesInscritesIds$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.sortieService.getMesSortiesInscritesIds(p.uid) : of([] as string[]))
  );
  mesSortiesInscritesIds = toSignal(this.mesSortiesInscritesIds$, { initialValue: [] as string[] });

  private mesOneShotsInscritsIds$ = toObservable(this.profile).pipe(
    switchMap(p => p ? this.oneShotService.getMesOneShotsInscritsIds(p.uid) : of([] as string[]))
  );
  mesOneShotsInscritsIds = toSignal(this.mesOneShotsInscritsIds$, { initialValue: [] as string[] });

  hasOrganisees = computed(() =>
    this.mesSorties().length > 0 || this.mesOneShots().length > 0
  );

  readonly sortieTypes = Object.entries(SORTIE_TYPE_META) as [SortieType, { label: string; emoji: string }][];

  filterTexte      = signal('');
  filterType       = signal<SortieType | 'oneshot' | null>(null);
  filterDateDu     = signal('');
  filterDateAu     = signal('');
  filterOrganisees = signal(false);
  filterParticipe  = signal(false);

  hasFilters = computed(() =>
    !!this.filterTexte().trim() || this.filterType() !== null ||
    !!this.filterDateDu() || !!this.filterDateAu() ||
    this.filterOrganisees() || this.filterParticipe()
  );

  onTypeChange(value: string): void {
    this.filterType.set(value ? value as SortieType | 'oneshot' : null);
  }

  resetFilters(): void {
    this.filterTexte.set('');
    this.filterType.set(null);
    this.filterDateDu.set('');
    this.filterDateAu.set('');
    this.filterOrganisees.set(false);
    this.filterParticipe.set(false);
  }

  aVenir = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter(s => this.isAVenir(s.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(data => ({ kind: 'sortie' as const, data }));

    // Merge public oneshots with creator's preparation ones (deduplicate by id)
    const publicOneShots = this.oneshots().filter(o => o.statut !== 'resultats');
    const publicIds = new Set(publicOneShots.map(o => o.id));
    const mesEnPrep = this.mesOneShots().filter(o => o.statut === 'preparation' && !publicIds.has(o.id));

    const oneshots: ActiviteItem[] = [...publicOneShots, ...mesEnPrep]
      .sort((a, b) => a.dateCreation.localeCompare(b.dateCreation))
      .map(data => ({ kind: 'oneshot' as const, data }));

    return [...sorties, ...oneshots];
  });

  passees = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter(s => !this.isAVenir(s.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(data => ({ kind: 'sortie' as const, data }));

    const oneshots: ActiviteItem[] = this.oneshots()
      .filter(o => o.statut === 'resultats')
      .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))
      .map(data => ({ kind: 'oneshot' as const, data }));

    return [...sorties, ...oneshots];
  });

  private applyFilters(items: ActiviteItem[]): ActiviteItem[] {
    const texte        = this.filterTexte().toLowerCase().trim();
    const type         = this.filterType();
    const dateDu       = this.filterDateDu();
    const dateAu       = this.filterDateAu();
    const organisees   = this.filterOrganisees();
    const participe    = this.filterParticipe();
    const uid          = this.profile()?.uid;
    const inscritsSortieIds   = new Set(this.mesSortiesInscritesIds());
    const inscritsOneShotIds  = new Set(this.mesOneShotsInscritsIds());

    return items.filter(item => {
      if (texte && !item.data.titre.toLowerCase().includes(texte)) return false;

      if (type !== null) {
        if (type === 'oneshot' && item.kind !== 'oneshot') return false;
        if (type !== 'oneshot' && (item.kind !== 'sortie' || (item.data as Sortie).type !== type)) return false;
      }

      const date = item.kind === 'sortie'
        ? (item.data as Sortie).date
        : ((item.data as OneShot).date ?? (item.data as OneShot).dateCreation.slice(0, 10));
      if (dateDu && date < dateDu) return false;
      if (dateAu && date > dateAu) return false;

      if (uid && (organisees || participe)) {
        const isOrganisateur = item.kind === 'sortie'
          ? (item.data as Sortie).organisateurUid === uid
          : (item.data as OneShot).creatorUid === uid;
        const isInscrit = item.kind === 'sortie'
          ? inscritsSortieIds.has(item.data.id!)
          : inscritsOneShotIds.has(item.data.id!);
        if (!((organisees && isOrganisateur) || (participe && isInscrit))) return false;
      }

      return true;
    });
  }

  aVenirFiltrees  = computed(() => this.applyFilters(this.aVenir()));
  passeesFiltrees = computed(() => this.applyFilters(this.passees()));

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

  typeLabel(type: SortieType | undefined): string {
    return type ? SORTIE_TYPE_META[type].label : 'Sortie Photo';
  }

  typeEmoji(type: SortieType | undefined): string {
    return type ? SORTIE_TYPE_META[type].emoji : '📸';
  }

  oneShotStatutLabel(statut: OneShotStatut): string {
    return ONESHOT_STATUT_LABELS[statut];
  }

  oneShotStatutClass(statut: OneShotStatut): string {
    switch (statut) {
      case 'inscription':            return 'sortie-status status-oneshot-inscription';
      case 'fermeture_inscriptions': return 'sortie-status status-oneshot-fermee';
      case 'vote':                   return 'sortie-status status-oneshot-vote';
      case 'resultats':              return 'sortie-status status-passee';
      default:                       return 'sortie-status';
    }
  }

  asSortie(item: ActiviteItem): Sortie {
    return item.data as Sortie;
  }

  asOneShot(item: ActiviteItem): OneShot {
    return item.data as OneShot;
  }
}
