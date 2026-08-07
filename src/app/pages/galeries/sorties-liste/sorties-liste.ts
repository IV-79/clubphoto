import {
  Component,
  inject,
  computed,
  signal,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, map } from 'rxjs';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { OneShotService } from '../../../services/oneshot.service';
import { DefiService } from '../../../services/defi.service';
import { ExpositionService } from '../../../services/exposition.service';
import { Sortie, SORTIE_TYPE_META, SortieType } from '../../../models/sortie.model';
import { OneShot } from '../../../models/oneshot.model';
import { Defi } from '../../../models/defi.model';
import { Exposition } from '../../../models/exposition.model';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { ActiviteCard, ActiviteItem } from '../../../components/activite-card/activite-card';

export type { ActiviteItem };

@Component({
  selector: 'app-sorties-liste',
  imports: [RouterLink, DatePickerComponent, ActiviteCard],
  templateUrl: './sorties-liste.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './sorties-liste.css',
})
export class SortiesListe {
  private sortieService = inject(SortieService);
  private oneShotService = inject(OneShotService);
  private defiService = inject(DefiService);
  private expoService = inject(ExpositionService);
  private authService = inject(AuthService);

  profile = toSignal(this.authService.currentUserProfile$);

  // Computed stables sur valeurs primitives — ne se propagent que si login/uid change réellement,
  // pas sur chaque mise à jour de champ (ex. derniereConnexion après login).
  private readonly loggedIn = computed(() => !!this.profile());
  private readonly uid = computed(() => this.profile()?.uid ?? null);

  private sorties$ = toObservable(this.loggedIn).pipe(
    switchMap((loggedIn) =>
      this.sortieService
        .getSortiesActivesOnce()
        .pipe(
          map((list) =>
            loggedIn ? list : list.filter((s) => (s.visibilite ?? 'public') === 'public'),
          ),
        ),
    ),
  );
  sorties = toSignal(this.sorties$, { initialValue: [] as Sortie[] });

  private readonly TERM_PAGE_SIZE = 4;
  private readonly TERM_STEP = 4;
  sortiesTerminees = signal<Sortie[]>([]);
  private termCursor = signal<QueryDocumentSnapshot<DocumentData> | null>(null);
  private hasMoreFirestore = signal(false);
  private visibleTermCount = signal(4);

  private oneshots$ = toObservable(this.loggedIn).pipe(
    switchMap((loggedIn) =>
      this.oneShotService
        .getPublicOneShotsOnce()
        .pipe(
          map((list) =>
            loggedIn ? list : list.filter((o) => (o.visibilite ?? 'public') === 'public'),
          ),
        ),
    ),
  );
  oneshots = toSignal(this.oneshots$, { initialValue: [] as OneShot[] });

  private defis$ = toObservable(this.loggedIn).pipe(
    switchMap((loggedIn) =>
      loggedIn ? this.defiService.getDefisOnce() : this.defiService.getPublicDefisOnce(),
    ),
  );
  defis = toSignal(this.defis$, { initialValue: [] as Defi[] });

  private expositions$ = toObservable(this.loggedIn).pipe(
    switchMap((loggedIn) =>
      loggedIn
        ? this.expoService.getExpositionsOnce()
        : this.expoService.getPublicExpositionsOnce(),
    ),
  );
  expositions = toSignal(this.expositions$, { initialValue: [] as Exposition[] });

  private mesSorties$ = toObservable(this.uid).pipe(
    switchMap((uid) => (uid ? this.sortieService.getMesSortiesOnce(uid) : of([] as Sortie[]))),
  );
  mesSorties = toSignal(this.mesSorties$, { initialValue: [] as Sortie[] });

  private mesOneShots$ = toObservable(this.uid).pipe(
    switchMap((uid) => (uid ? this.oneShotService.getMyOneShotsOnce(uid) : of([] as OneShot[]))),
  );
  mesOneShots = toSignal(this.mesOneShots$, { initialValue: [] as OneShot[] });

  private mesDefis$ = toObservable(this.uid).pipe(
    switchMap((uid) => (uid ? this.defiService.getMesDefisOnce(uid) : of([] as Defi[]))),
  );
  mesDefis = toSignal(this.mesDefis$, { initialValue: [] as Defi[] });

  private mesSortiesInscritesIds$ = toObservable(this.uid).pipe(
    switchMap((uid) =>
      uid ? this.sortieService.getMesSortiesInscritesIds(uid) : of([] as string[]),
    ),
  );
  mesSortiesInscritesIds = toSignal(this.mesSortiesInscritesIds$, { initialValue: [] as string[] });

  private mesOneShotsInscritsIds$ = toObservable(this.uid).pipe(
    switchMap((uid) =>
      uid ? this.oneShotService.getMesOneShotsInscritsIds(uid) : of([] as string[]),
    ),
  );
  mesOneShotsInscritsIds = toSignal(this.mesOneShotsInscritsIds$, { initialValue: [] as string[] });

  private mesDefisInscritsIds$ = toObservable(this.uid).pipe(
    switchMap((uid) => (uid ? this.defiService.getMesDefisInscritsIds(uid) : of([] as string[]))),
  );
  mesDefisInscritsIds = toSignal(this.mesDefisInscritsIds$, { initialValue: [] as string[] });

  mesExpositions = computed(() =>
    this.expositions().filter((e) => e.organisateurUid === this.uid()),
  );

  hasOrganisees = computed(
    () =>
      this.mesSorties().length > 0 ||
      this.mesOneShots().length > 0 ||
      this.mesDefis().length > 0 ||
      this.mesExpositions().length > 0,
  );

  constructor() {
    effect(() => {
      const loggedIn = this.loggedIn();
      this.sortiesTerminees.set([]);
      this.termCursor.set(null);
      this.hasMoreFirestore.set(false);
      this.visibleTermCount.set(this.TERM_STEP);
      this.fetchTerminees(loggedIn);
    });
  }

  private fetchTerminees(loggedIn = this.loggedIn()): void {
    const cursor = untracked(() => this.termCursor());
    this.sortieService
      .getSortiesTermineesPage(cursor, this.TERM_PAGE_SIZE)
      .subscribe(({ items, cursor, hasMore }) => {
        const visible = loggedIn
          ? items
          : items.filter((s) => (s.visibilite ?? 'public') === 'public');
        this.sortiesTerminees.update((prev) => [...prev, ...visible]);
        this.termCursor.set(cursor);
        this.hasMoreFirestore.set(hasMore);
      });
  }

  loadMoreTerminees(): void {
    const next = this.visibleTermCount() + this.TERM_STEP;
    this.visibleTermCount.set(next);
    // Fetch Firestore si on arrive en fin de sorties chargées
    if (next >= this.sortiesTerminees().length && this.hasMoreFirestore()) {
      this.fetchTerminees();
    }
  }

  readonly sortieTypes = Object.entries(SORTIE_TYPE_META) as [
    SortieType,
    { label: string; emoji: string },
  ][];

  filterTexte = signal('');
  filterType = signal<SortieType | 'oneshot' | 'defi' | 'exposition' | null>(null);
  filterDateDu = signal('');
  filterDateAu = signal('');
  filterOrganisees = signal(false);
  filterParticipe = signal(false);

  hasFilters = computed(
    () =>
      !!this.filterTexte().trim() ||
      this.filterType() !== null ||
      !!this.filterDateDu() ||
      !!this.filterDateAu() ||
      this.filterOrganisees() ||
      this.filterParticipe(),
  );

  onTypeChange(value: string): void {
    this.filterType.set(value ? (value as SortieType | 'oneshot' | 'defi' | 'exposition') : null);
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
    // Sorties : today-7 ≤ date ≤ today+7 (query démarre à today-7, on coupe à today+7)
    const sorties: ActiviteItem[] = this.sorties()
      .filter((s) => !this.isAfterWindow(s.date))
      .map((data) => ({ kind: 'sortie' as const, data }));

    // OneShots : actifs (inscription/fermeture/vote) OU en résultats depuis ≤ 7 jours
    const isOneShotEnCours = (o: OneShot) =>
      ['inscription', 'fermeture_inscriptions', 'vote'].includes(o.statut) ||
      (o.statut === 'resultats' &&
        !!o.datePassageResultats &&
        !this.isBeforeWindow(o.datePassageResultats));
    const publicActive = this.oneshots().filter(isOneShotEnCours);
    const publicActiveIds = new Set(publicActive.map((o) => o.id));
    const mesActifs = this.mesOneShots().filter(
      (o) => isOneShotEnCours(o) && !publicActiveIds.has(o.id),
    );
    const oneshots: ActiviteItem[] = [...publicActive, ...mesActifs].map((data) => ({
      kind: 'oneshot' as const,
      data,
    }));

    // Défis : overlap [dateDebutSoumission, dateCloturVotes] ∩ [today-7, today+7]
    const defis: ActiviteItem[] = this.defis()
      .filter(
        (d) =>
          !this.isAfterWindow(d.dateDebutSoumission) && !this.isBeforeWindow(d.dateCloturVotes),
      )
      .map((data) => ({ kind: 'defi' as const, data }));

    // Expositions : ni à venir (dateDebutIdeation futur) ni terminées (dateExposition > 7j passée)
    const expos: ActiviteItem[] = this.expositions()
      .filter((e) => !this.isExpoAVenir(e) && !this.isExpoPassee(e))
      .map((data) => ({ kind: 'exposition' as const, data }));

    return [...sorties, ...oneshots, ...defis, ...expos].sort((a, b) =>
      this.effectiveDate(a).localeCompare(this.effectiveDate(b)),
    );
  });

  enPreparation = computed((): ActiviteItem[] => {
    const publicIds = new Set(this.oneshots().map((o) => o.id));
    return this.mesOneShots()
      .filter((o) => o.statut === 'preparation' && !publicIds.has(o.id))
      .map((data) => ({ kind: 'oneshot' as const, data }));
  });

  aVenir = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter((s) => this.isAfterWindow(s.date))
      .map((data) => ({ kind: 'sortie' as const, data }));

    const defis: ActiviteItem[] = this.defis()
      .filter((d) => this.isAfterWindow(d.dateDebutSoumission))
      .map((data) => ({ kind: 'defi' as const, data }));

    // Expositions dont l'idéation n'a pas encore commencé
    const expos: ActiviteItem[] = this.expositions()
      .filter((e) => this.isExpoAVenir(e))
      .map((data) => ({ kind: 'exposition' as const, data }));

    return [...sorties, ...defis, ...expos].sort((a, b) =>
      this.effectiveDate(a).localeCompare(this.effectiveDate(b)),
    );
  });

  passees = computed((): ActiviteItem[] => {
    // Sorties : tout ce qui est en Firestore (date < today-7 garanti par la query)
    const sorties: ActiviteItem[] = this.sortiesTerminees().map((data) => ({
      kind: 'sortie' as const,
      data,
    }));

    // OneShots : resultats ET grace period expirée (pas de datePassageResultats = ancien doc, traité comme passé)
    const oneshots: ActiviteItem[] = this.oneshots()
      .filter(
        (o) =>
          o.statut === 'resultats' &&
          (!o.datePassageResultats || this.isBeforeWindow(o.datePassageResultats)),
      )
      .map((data) => ({ kind: 'oneshot' as const, data }));

    // Défis : dateCloturVotes < today-7
    const defis: ActiviteItem[] = this.defis()
      .filter((d) => this.isBeforeWindow(d.dateCloturVotes))
      .map((data) => ({ kind: 'defi' as const, data }));

    // Expositions dont la date d'exposition est passée (> 7 jours)
    const expos: ActiviteItem[] = this.expositions()
      .filter((e) => this.isExpoPassee(e))
      .map((data) => ({ kind: 'exposition' as const, data }));

    return [...sorties, ...oneshots, ...defis, ...expos].sort((a, b) =>
      this.effectiveDate(b).localeCompare(this.effectiveDate(a)),
    );
  });

  private applyFilters(items: ActiviteItem[]): ActiviteItem[] {
    const texte = this.filterTexte().toLowerCase().trim();
    const type = this.filterType();
    const dateDu = this.filterDateDu();
    const dateAu = this.filterDateAu();
    const organisees = this.filterOrganisees();
    const participe = this.filterParticipe();
    const uid = this.profile()?.uid;
    const inscritsSortieIds = new Set(this.mesSortiesInscritesIds());
    const inscritsOneShotIds = new Set(this.mesOneShotsInscritsIds());
    const inscritsDefiIds = new Set(this.mesDefisInscritsIds());

    return items.filter((item) => {
      if (texte && !item.data.titre.toLowerCase().includes(texte)) return false;

      if (type !== null) {
        if (type === 'oneshot' && item.kind !== 'oneshot') return false;
        if (type === 'defi' && item.kind !== 'defi') return false;
        if (type === 'exposition' && item.kind !== 'exposition') return false;
        if (
          type !== 'oneshot' &&
          type !== 'defi' &&
          type !== 'exposition' &&
          (item.kind !== 'sortie' || (item.data as Sortie).type !== type)
        )
          return false;
      }

      const date = this.effectiveDate(item);
      if (dateDu && date < dateDu) return false;
      if (dateAu && date > dateAu) return false;

      if (uid && (organisees || participe)) {
        const isOrganisateur =
          item.kind === 'sortie'
            ? (item.data as Sortie).organisateurUid === uid
            : item.kind === 'oneshot'
              ? (item.data as OneShot).creatorUid === uid
              : item.kind === 'exposition'
                ? (item.data as Exposition).organisateurUid === uid
                : (item.data as Defi).organisateurUid === uid;
        const isInscrit =
          item.kind === 'sortie'
            ? inscritsSortieIds.has(item.data.id!)
            : item.kind === 'oneshot'
              ? inscritsOneShotIds.has(item.data.id!)
              : item.kind === 'defi'
                ? inscritsDefiIds.has(item.data.id!)
                : false; // les expositions n'ont pas d'inscriptions
        if (!((organisees && isOrganisateur) || (participe && isInscrit))) return false;
      }

      return true;
    });
  }

  enCoursFiltrees = computed(() => this.applyFilters(this.enCours()));
  aVenirFiltrees = computed(() => this.applyFilters(this.aVenir()));
  passeesFiltrees = computed(() => this.applyFilters(this.passees()));

  passeesFiltreesVisible = computed(() => this.passeesFiltrees().slice(0, this.visibleTermCount()));

  hasMoreTerminees = computed(
    () => this.passeesFiltrees().length > this.visibleTermCount() || this.hasMoreFirestore(),
  );

  private effectiveDate(item: ActiviteItem): string {
    if (item.kind === 'sortie') return (item.data as Sortie).date;
    if (item.kind === 'oneshot')
      return (item.data as OneShot).date ?? (item.data as OneShot).dateCreation.slice(0, 10);
    if (item.kind === 'exposition') {
      const e = item.data as Exposition;
      return e.dateExposition ?? e.dateDebutIdeation ?? e.dateFinIdeation;
    }
    return (item.data as Defi).dateDebutSoumission;
  }

  private dateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private get today(): string {
    return this.dateOffset(0);
  }
  private get windowStart(): string {
    return this.dateOffset(-7);
  }
  private get windowEnd(): string {
    return this.dateOffset(7);
  }

  private isBeforeWindow(date: string): boolean {
    return date < this.windowStart;
  }
  private isAfterWindow(date: string): boolean {
    return date > this.windowEnd;
  }

  private isExpoAVenir(e: Exposition): boolean {
    return !!e.dateDebutIdeation && e.dateDebutIdeation > this.today;
  }
  private isExpoPassee(e: Exposition): boolean {
    return !!e.dateExposition && this.isBeforeWindow(e.dateExposition);
  }
}
