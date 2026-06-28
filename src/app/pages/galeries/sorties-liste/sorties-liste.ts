import { Component, inject, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, map } from 'rxjs';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { OneShotService } from '../../../services/oneshot.service';
import { DefiService } from '../../../services/defi.service';
import { Sortie, SORTIE_TYPE_META, SortieType } from '../../../models/sortie.model';
import { OneShot } from '../../../models/oneshot.model';
import { Defi, getDefiStatut } from '../../../models/defi.model';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { ActiviteCard, ActiviteItem } from '../../../components/activite-card/activite-card';

export type { ActiviteItem };

@Component({
  selector: 'app-sorties-liste',
  imports: [RouterLink, DatePickerComponent, ActiviteCard],
  templateUrl: './sorties-liste.html',
  styleUrl: './sorties-liste.css',
})
export class SortiesListe {
  private sortieService  = inject(SortieService);
  private oneShotService = inject(OneShotService);
  private defiService    = inject(DefiService);
  private authService    = inject(AuthService);

  profile = toSignal(this.authService.currentUserProfile$);

  // Computed stables sur valeurs primitives — ne se propagent que si login/uid change réellement,
  // pas sur chaque mise à jour de champ (ex. derniereConnexion après login).
  private readonly loggedIn = computed(() => !!this.profile());
  private readonly uid      = computed(() => this.profile()?.uid ?? null);

  private sorties$ = toObservable(this.loggedIn).pipe(
    switchMap(loggedIn => this.sortieService.getSortiesOnce().pipe(
      map(list => loggedIn ? list : list.filter(s => (s.visibilite ?? 'public') === 'public'))
    ))
  );
  sorties = toSignal(this.sorties$, { initialValue: [] as Sortie[] });

  private oneshots$ = toObservable(this.loggedIn).pipe(
    switchMap(loggedIn => this.oneShotService.getPublicOneShotsOnce().pipe(
      map(list => loggedIn ? list : list.filter(o => (o.visibilite ?? 'public') === 'public'))
    ))
  );
  oneshots = toSignal(this.oneshots$, { initialValue: [] as OneShot[] });

  private defis$ = toObservable(this.loggedIn).pipe(
    switchMap(loggedIn => loggedIn ? this.defiService.getDefisOnce() : this.defiService.getPublicDefisOnce())
  );
  defis = toSignal(this.defis$, { initialValue: [] as Defi[] });

  private mesSorties$ = toObservable(this.uid).pipe(
    switchMap(uid => uid ? this.sortieService.getMesSortiesOnce(uid) : of([] as Sortie[]))
  );
  mesSorties = toSignal(this.mesSorties$, { initialValue: [] as Sortie[] });

  private mesOneShots$ = toObservable(this.uid).pipe(
    switchMap(uid => uid ? this.oneShotService.getMyOneShotsOnce(uid) : of([] as OneShot[]))
  );
  mesOneShots = toSignal(this.mesOneShots$, { initialValue: [] as OneShot[] });

  private mesDefis$ = toObservable(this.uid).pipe(
    switchMap(uid => uid ? this.defiService.getMesDefisOnce(uid) : of([] as Defi[]))
  );
  mesDefis = toSignal(this.mesDefis$, { initialValue: [] as Defi[] });

  private mesSortiesInscritesIds$ = toObservable(this.uid).pipe(
    switchMap(uid => uid ? this.sortieService.getMesSortiesInscritesIds(uid) : of([] as string[]))
  );
  mesSortiesInscritesIds = toSignal(this.mesSortiesInscritesIds$, { initialValue: [] as string[] });

  private mesOneShotsInscritsIds$ = toObservable(this.uid).pipe(
    switchMap(uid => uid ? this.oneShotService.getMesOneShotsInscritsIds(uid) : of([] as string[]))
  );
  mesOneShotsInscritsIds = toSignal(this.mesOneShotsInscritsIds$, { initialValue: [] as string[] });

  private mesDefisInscritsIds$ = toObservable(this.uid).pipe(
    switchMap(uid => uid ? this.defiService.getMesDefisInscritsIds(uid) : of([] as string[]))
  );
  mesDefisInscritsIds = toSignal(this.mesDefisInscritsIds$, { initialValue: [] as string[] });

  hasOrganisees = computed(() =>
    this.mesSorties().length > 0 || this.mesOneShots().length > 0 || this.mesDefis().length > 0
  );

  readonly sortieTypes = Object.entries(SORTIE_TYPE_META) as [SortieType, { label: string; emoji: string }][];

  filterTexte      = signal('');
  filterType       = signal<SortieType | 'oneshot' | 'defi' | null>(null);
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
    this.filterType.set(value ? value as SortieType | 'oneshot' | 'defi' : null);
  }

  resetFilters(): void {
    this.filterTexte.set('');
    this.filterType.set(null);
    this.filterDateDu.set('');
    this.filterDateAu.set('');
    this.filterOrganisees.set(false);
    this.filterParticipe.set(false);
  }

  enCours = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter(s => !this.isPastDate(s.date) && this.isWithin7Days(s.date))
      .map(data => ({ kind: 'sortie' as const, data }));

    const activeStatuts = ['inscription', 'fermeture_inscriptions', 'vote'];
    const publicActive = this.oneshots().filter(o => activeStatuts.includes(o.statut));
    const publicActiveIds = new Set(publicActive.map(o => o.id));
    const mesActifs = this.mesOneShots().filter(o => activeStatuts.includes(o.statut) && !publicActiveIds.has(o.id));
    const oneshots: ActiviteItem[] = [...publicActive, ...mesActifs]
      .map(data => ({ kind: 'oneshot' as const, data }));

    const defis: ActiviteItem[] = this.defis()
      .filter(d => {
        const s = getDefiStatut(d);
        return s === 'soumission' || s === 'vote' ||
               (s === 'a_venir' && this.isWithin7Days(d.dateDebutSoumission));
      })
      .map(data => ({ kind: 'defi' as const, data }));

    return [...sorties, ...oneshots, ...defis]
      .sort((a, b) => this.effectiveDate(a).localeCompare(this.effectiveDate(b)));
  });

  enPreparation = computed((): ActiviteItem[] => {
    const publicIds = new Set(this.oneshots().map(o => o.id));
    return this.mesOneShots()
      .filter(o => o.statut === 'preparation' && !publicIds.has(o.id))
      .map(data => ({ kind: 'oneshot' as const, data }));
  });

  aVenir = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter(s => !this.isPastDate(s.date) && !this.isWithin7Days(s.date))
      .map(data => ({ kind: 'sortie' as const, data }));

    const defis: ActiviteItem[] = this.defis()
      .filter(d => getDefiStatut(d) === 'a_venir' && !this.isWithin7Days(d.dateDebutSoumission))
      .map(data => ({ kind: 'defi' as const, data }));

    return [...sorties, ...defis]
      .sort((a, b) => this.effectiveDate(a).localeCompare(this.effectiveDate(b)));
  });

  passees = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter(s => this.isPastDate(s.date))
      .map(data => ({ kind: 'sortie' as const, data }));

    const oneshots: ActiviteItem[] = this.oneshots()
      .filter(o => o.statut === 'resultats')
      .map(data => ({ kind: 'oneshot' as const, data }));

    const defis: ActiviteItem[] = this.defis()
      .filter(d => getDefiStatut(d) === 'resultats')
      .map(data => ({ kind: 'defi' as const, data }));

    return [...sorties, ...oneshots, ...defis]
      .sort((a, b) => this.effectiveDate(b).localeCompare(this.effectiveDate(a)));
  });

  private applyFilters(items: ActiviteItem[]): ActiviteItem[] {
    const texte        = this.filterTexte().toLowerCase().trim();
    const type         = this.filterType();
    const dateDu       = this.filterDateDu();
    const dateAu       = this.filterDateAu();
    const organisees   = this.filterOrganisees();
    const participe    = this.filterParticipe();
    const uid          = this.profile()?.uid;
    const inscritsSortieIds  = new Set(this.mesSortiesInscritesIds());
    const inscritsOneShotIds = new Set(this.mesOneShotsInscritsIds());
    const inscritsDefiIds    = new Set(this.mesDefisInscritsIds());

    return items.filter(item => {
      if (texte && !item.data.titre.toLowerCase().includes(texte)) return false;

      if (type !== null) {
        if (type === 'oneshot' && item.kind !== 'oneshot') return false;
        if (type === 'defi'    && item.kind !== 'defi')    return false;
        if (type !== 'oneshot' && type !== 'defi' && (item.kind !== 'sortie' || (item.data as Sortie).type !== type)) return false;
      }

      const date = this.effectiveDate(item);
      if (dateDu && date < dateDu) return false;
      if (dateAu && date > dateAu) return false;

      if (uid && (organisees || participe)) {
        const isOrganisateur = item.kind === 'sortie'
          ? (item.data as Sortie).organisateurUid === uid
          : item.kind === 'oneshot'
            ? (item.data as OneShot).creatorUid === uid
            : (item.data as Defi).organisateurUid === uid;
        const isInscrit = item.kind === 'sortie'
          ? inscritsSortieIds.has(item.data.id!)
          : item.kind === 'oneshot'
            ? inscritsOneShotIds.has(item.data.id!)
            : inscritsDefiIds.has(item.data.id!);
        if (!((organisees && isOrganisateur) || (participe && isInscrit))) return false;
      }

      return true;
    });
  }

  enCoursFiltrees = computed(() => this.applyFilters(this.enCours()));
  aVenirFiltrees  = computed(() => this.applyFilters(this.aVenir()));
  passeesFiltrees = computed(() => this.applyFilters(this.passees()));

  private effectiveDate(item: ActiviteItem): string {
    if (item.kind === 'sortie')  return (item.data as Sortie).date;
    if (item.kind === 'oneshot') return (item.data as OneShot).date ?? (item.data as OneShot).dateCreation.slice(0, 10);
    return (item.data as Defi).dateDebutSoumission;
  }

  private get todayStr(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }

  private isPastDate(date: string): boolean {
    return date < this.todayStr;
  }

  private isWithin7Days(date: string): boolean {
    if (date < this.todayStr) return false;
    const limit = new Date();
    limit.setDate(limit.getDate() + 7);
    const y = limit.getFullYear();
    const m = String(limit.getMonth() + 1).padStart(2, '0');
    const d = String(limit.getDate()).padStart(2, '0');
    return date <= `${y}-${m}-${d}`;
  }
}
