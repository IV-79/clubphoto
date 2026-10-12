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
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { OneShotService } from '../../../services/oneshot.service';
import { DefiService } from '../../../services/defi.service';
import { ExpositionService } from '../../../services/exposition.service';
import { ConfigService, SiteConfig } from '../../../services/config.service';
import { Sortie, SORTIE_TYPE_META, SortieType } from '../../../models/sortie.model';
import { OneShot } from '../../../models/oneshot.model';
import { Defi } from '../../../models/defi.model';
import { Exposition } from '../../../models/exposition.model';
import { UserProfile } from '../../../models/user.model';
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
  private configService = inject(ConfigService);

  private siteConfig = toSignal(this.configService.getSiteConfigOnce(), { initialValue: {} as SiteConfig });
  private joursAvant = computed(() => this.siteConfig().joursAvantEvenement ?? 7);
  private joursApres = computed(() => this.siteConfig().joursApresEvenement ?? 7);

  profile = toSignal(this.authService.currentUserProfile$);

  readonly canOrganize = computed(() => {
    const role = this.profile()?.role;
    return role === 'admin' || role === 'contributeur';
  });

  private loaded = signal(false);

  // ── Data signals ────────────────────────────────────────────────
  sorties = signal<Sortie[]>([]);
  sortiesTerminees = signal<Sortie[]>([]);
  oneshots = signal<OneShot[]>([]);
  defis = signal<Defi[]>([]);
  expositions = signal<Exposition[]>([]);
  mesSorties = signal<Sortie[]>([]);
  mesOneShots = signal<OneShot[]>([]);
  mesDefis = signal<Defi[]>([]);
  mesSortiesInscritesIds = signal<string[]>([]);
  mesOneShotsInscritsIds = signal<string[]>([]);
  mesDefisInscritsIds = signal<string[]>([]);

  private termCursor = signal<QueryDocumentSnapshot<DocumentData> | null>(null);
  private hasMoreFirestore = signal(false);
  private visibleTermCount = signal(4);

  private readonly TERM_PAGE_SIZE = 4;
  private readonly TERM_STEP = 4;

  constructor() {
    effect(() => {
      const p = this.profile();
      if (p === undefined) return;
      if (this.loaded()) return;
      untracked(() => {
        this.loaded.set(true);
        this.charger(p);
      });
    });
  }

  private async charger(profile: UserProfile | null) {
    const uid = profile?.uid ?? null;
    const loggedIn = !!profile;

    const loads: Promise<void>[] = [];

    loads.push(
      firstValueFrom(this.sortieService.getSortiesActivesOnce())
        .then((list) =>
          this.sorties.set(
            loggedIn ? list : list.filter((s) => (s.visibilite ?? 'public') === 'public'),
          ),
        )
        .catch(() => {}),
    );

    loads.push(
      firstValueFrom(this.oneShotService.getPublicOneShotsOnce())
        .then((list) =>
          this.oneshots.set(
            loggedIn ? list : list.filter((o) => (o.visibilite ?? 'public') === 'public'),
          ),
        )
        .catch(() => {}),
    );

    loads.push(
      firstValueFrom(loggedIn ? this.defiService.getDefisOnce() : this.defiService.getPublicDefisOnce())
        .then((list) => this.defis.set(list))
        .catch(() => {}),
    );

    loads.push(
      firstValueFrom(
        loggedIn ? this.expoService.getExpositionsOnce() : this.expoService.getPublicExpositionsOnce(),
      )
        .then((list) => this.expositions.set(list))
        .catch(() => {}),
    );

    if (uid) {
      loads.push(
        firstValueFrom(this.sortieService.getMesSortiesOnce(uid))
          .then((list) => this.mesSorties.set(list))
          .catch(() => {}),
      );
      loads.push(
        firstValueFrom(this.oneShotService.getMyOneShotsOnce(uid))
          .then((list) => this.mesOneShots.set(list))
          .catch(() => {}),
      );
      loads.push(
        firstValueFrom(this.defiService.getMesDefisOnce(uid))
          .then((list) => this.mesDefis.set(list))
          .catch(() => {}),
      );
      loads.push(
        firstValueFrom(this.sortieService.getMesSortiesInscritesIds(uid))
          .then((ids) => this.mesSortiesInscritesIds.set(ids))
          .catch(() => {}),
      );
      loads.push(
        firstValueFrom(this.oneShotService.getMesOneShotsInscritsIds(uid))
          .then((ids) => this.mesOneShotsInscritsIds.set(ids))
          .catch(() => {}),
      );
      loads.push(
        firstValueFrom(this.defiService.getMesDefisInscritsIds(uid))
          .then((ids) => this.mesDefisInscritsIds.set(ids))
          .catch(() => {}),
      );
    }

    this.fetchTerminees(loggedIn);
    await Promise.all(loads);
  }

  private fetchTerminees(loggedIn = !!this.profile()): void {
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

  mesExpositions = computed(() =>
    this.expositions().filter((e) => e.organisateurUid === this.profile()?.uid),
  );

  hasOrganisees = computed(
    () =>
      this.mesSorties().length > 0 ||
      this.mesOneShots().length > 0 ||
      this.mesDefis().length > 0 ||
      this.mesExpositions().length > 0,
  );

  enCours = computed((): ActiviteItem[] => {
    const sorties: ActiviteItem[] = this.sorties()
      .filter((s) => !this.isAfterWindow(s.date) && !this.isBeforeWindow(s.dateFinSoumission ?? s.date))
      .map((data) => ({ kind: 'sortie' as const, data }));

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

    const defis: ActiviteItem[] = this.defis()
      .filter(
        (d) =>
          !this.isAfterWindow(d.dateDebutSoumission) && !this.isBeforeWindow(d.dateCloturVotes),
      )
      .map((data) => ({ kind: 'defi' as const, data }));

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

    const expos: ActiviteItem[] = this.expositions()
      .filter((e) => this.isExpoAVenir(e))
      .map((data) => ({ kind: 'exposition' as const, data }));

    return [...sorties, ...defis, ...expos].sort((a, b) =>
      this.effectiveDate(a).localeCompare(this.effectiveDate(b)),
    );
  });

  passees = computed((): ActiviteItem[] => {
    const enCoursIds = new Set(
      this.sorties()
        .filter((s) => !this.isAfterWindow(s.date) && !this.isBeforeWindow(s.dateFinSoumission ?? s.date))
        .map((s) => s.id),
    );
    const sorties: ActiviteItem[] = this.sortiesTerminees()
      .filter((s) => !enCoursIds.has(s.id))
      .map((data) => ({ kind: 'sortie' as const, data }));

    const oneshots: ActiviteItem[] = this.oneshots()
      .filter(
        (o) =>
          o.statut === 'resultats' &&
          (!o.datePassageResultats || this.isBeforeWindow(o.datePassageResultats)),
      )
      .map((data) => ({ kind: 'oneshot' as const, data }));

    const defis: ActiviteItem[] = this.defis()
      .filter((d) => this.isBeforeWindow(d.dateCloturVotes))
      .map((data) => ({ kind: 'defi' as const, data }));

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
                : false;
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
  private readonly windowStart = computed(() => this.dateOffset(-this.joursAvant()));
  private readonly windowEnd = computed(() => this.dateOffset(this.joursApres()));

  private isBeforeWindow(date: string): boolean {
    return date < this.windowStart();
  }
  private isAfterWindow(date: string): boolean {
    return date > this.windowEnd();
  }

  private isExpoAVenir(e: Exposition): boolean {
    return !!e.dateDebutIdeation && e.dateDebutIdeation > this.today;
  }
  private isExpoPassee(e: Exposition): boolean {
    return !!e.dateExposition && this.isBeforeWindow(e.dateExposition);
  }
}
