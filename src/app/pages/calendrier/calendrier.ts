import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, of, switchMap, map } from 'rxjs';
import { ReunionService } from '../../services/reunion.service';
import { OneShotService } from '../../services/oneshot.service';
import { SortieService } from '../../services/sortie.service';
import { AuthService } from '../../services/auth.service';
import { LoginModalService } from '../../services/login-modal.service';
import { Reunion, REUNION_TYPES } from '../../models/reunion.model';
import { OneShot, ONESHOT_STATUT_LABELS } from '../../models/oneshot.model';
import { Sortie, SORTIE_TYPE_META, SortieType } from '../../models/sortie.model';

const INIT = 3;
const PAGE = 5;

interface CalItem {
  kind: 'event' | 'oneshot' | 'sortie';
  id: string;
  date: string;
  event?: Reunion;
  oneshot?: OneShot;
  sortie?: Sortie;
}

@Component({
  selector: 'app-calendrier',
  imports: [SlicePipe, RouterLink],
  templateUrl: './calendrier.html',
  styleUrl: './calendrier.css',
})
export class Calendrier {
  private service = inject(ReunionService);
  private oneShotService = inject(OneShotService);
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);
  private loginModal = inject(LoginModalService);
  private route = inject(ActivatedRoute);

  // --- Filtres ---
  types = REUNION_TYPES;
  filtre = signal<'tous' | 'reunion' | 'oneshot' | 'sortie'>('tous');
  showPasses = signal(false);

  private limitAVenir = signal(INIT);
  private limitPasses = signal(INIT);

  profile = toSignal(this.authService.currentUserProfile$);
  private readonly loggedIn = computed(() => !!this.profile());
  private readonly uid      = computed(() => this.profile()?.uid ?? null);

  private tous = toSignal(
    toObservable(this.loggedIn).pipe(
      switchMap(loggedIn => loggedIn ? this.service.getReunions() : of([] as Reunion[]))
    ),
    { initialValue: [] as Reunion[] }
  );

  // --- OneShots publics + sorties (one-shot, filtrés par visibilité) ---
  private oneshots = toSignal(
    toObservable(this.loggedIn).pipe(
      switchMap(loggedIn => this.oneShotService.getPublicOneShotsOnce().pipe(
        map(list => loggedIn ? list : list.filter(o => (o.visibilite ?? 'public') === 'public'))
      ))
    ),
    { initialValue: [] as OneShot[] }
  );

  private sorties = toSignal(
    toObservable(this.loggedIn).pipe(
      switchMap(loggedIn => this.sortieService.getSortiesOnce().pipe(
        map(list => loggedIn ? list : list.filter(s => (s.visibilite ?? 'public') === 'public'))
      ))
    ),
    { initialValue: [] as Sortie[] }
  );

  isMembre = computed(() => this.loggedIn());

  // --- Items unifiés (événements + oneshots + sorties avec une date) ---
  private filtresItems = computed((): CalItem[] => {
    const f = this.filtre();
    const showEvents  = f === 'tous' || f === 'reunion';
    const showShots   = f === 'tous' || f === 'oneshot';
    const showSorties = f === 'tous' || f === 'sortie';

    const events: CalItem[] = showEvents
      ? this.tous().map(e => ({ kind: 'event' as const, id: 'e.' + e.id, date: e.date, event: e }))
      : [];
    const shots: CalItem[] = showShots
      ? this.oneshots().filter(os => !!os.date)
          .map(os => ({ kind: 'oneshot' as const, id: 'os.' + os.id, date: os.date!, oneshot: os }))
      : [];
    const sortieItems: CalItem[] = showSorties
      ? this.sorties().map(s => ({ kind: 'sortie' as const, id: 's.' + s.id, date: s.date, sortie: s }))
      : [];
    return [...events, ...shots, ...sortieItems];
  });

  private aVenirAll = computed((): CalItem[] =>
    [...this.filtresItems().filter(i => !this.isPasse(i.date))].sort((a, b) => a.date.localeCompare(b.date))
  );
  private passesAll = computed((): CalItem[] =>
    [...this.filtresItems().filter(i => this.isPasse(i.date))].sort((a, b) => b.date.localeCompare(a.date))
  );

  aVenir        = computed(() => this.aVenirAll().slice(0, this.limitAVenir()));
  passes        = computed(() => this.passesAll().slice(0, this.limitPasses()));
  aVenirCount   = computed(() => this.aVenirAll().length);
  passesCount   = computed(() => this.passesAll().length);
  hasMoreAVenir = computed(() => this.limitAVenir() < this.aVenirAll().length);
  hasMorePasses = computed(() => this.limitPasses() < this.passesAll().length);
  restantAVenir = computed(() => Math.min(PAGE, this.aVenirAll().length - this.limitAVenir()));
  restantPasses = computed(() => Math.min(PAGE, this.passesAll().length - this.limitPasses()));

  constructor() {
    effect(() => {
      this.filtre();
      untracked(() => { this.limitAVenir.set(INIT); this.limitPasses.set(INIT); });
    });

    effect(() => {
      const target = this.queryParams()?.get('reunion');
      if (!target || this.reunionAutoExpanded()) return;
      const itemId = 'e.' + target;
      const allItems = [...this.aVenirAll(), ...this.passesAll()];
      if (allItems.length === 0) return;
      if (allItems.some(i => i.id === itemId)) {
        const isInPasses = this.passesAll().some(i => i.id === itemId);
        untracked(() => {
          if (isInPasses) this.showPasses.set(true);
          this.expandedId.set(itemId);
          this.reunionAutoExpanded.set(true);
        });
      }
    });
  }

  loadMoreAVenir() { this.limitAVenir.update(n => n + PAGE); }
  loadMorePasses()  { this.limitPasses.update(n => n + PAGE); }

  expandedId = signal<string | null>(null);
  private reunionAutoExpanded = signal(false);
  private queryParams = toSignal(this.route.queryParamMap);

  toggleExpand(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // --- Inscriptions OneShot ---
  private readonly inscriptionTrigger = computed(() => ({ uid: this.uid(), oneshots: this.oneshots() }));

  private inscriptionStatus$ = toObservable(this.inscriptionTrigger).pipe(
    switchMap(({ uid, oneshots }) => {
      if (!uid) return of({} as Record<string, boolean>);
      const open = oneshots.filter(e => e.statut === 'inscription');
      if (open.length === 0) return of({} as Record<string, boolean>);
      return combineLatest(
        open.map(os =>
          this.oneShotService.getInscriptionsOnce(os.id).pipe(
            map(ins => [os.id, ins.some(i => i.uid === uid)] as [string, boolean])
          )
        )
      ).pipe(map(pairs => Object.fromEntries(pairs)));
    })
  );

  inscriptionStatus = toSignal(this.inscriptionStatus$, { initialValue: {} as Record<string, boolean> });
  inscrisSaving = signal<string | null>(null);

  isInscrit(oneShotId: string): boolean {
    return this.inscriptionStatus()[oneShotId] ?? false;
  }

  statutLabel(statut: string): string {
    return ONESHOT_STATUT_LABELS[statut as keyof typeof ONESHOT_STATUT_LABELS] ?? statut;
  }

  async inscrire(os: OneShot) {
    const profile = this.profile();
    if (!profile || this.inscrisSaving()) return;
    this.inscrisSaving.set(os.id);
    const nom = `${profile.prenom ?? ''} ${profile.nom}`.trim();
    await this.oneShotService.inscrire(os.id, profile.uid, nom);
    this.inscrisSaving.set(null);
  }

  async desinscrire(os: OneShot) {
    const profile = this.profile();
    if (!profile || this.inscrisSaving()) return;
    this.inscrisSaving.set(os.id);
    await this.oneShotService.desinscrire(os.id, profile.uid);
    this.inscrisSaving.set(null);
  }

  // --- Helpers ---
  isPasse(date: string): boolean {
    return new Date(date + 'T23:59:59') < new Date();
  }

  formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  monthOf(date: string): string { return date.slice(0, 7); }

  formatMonth(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  labelType(type: string): string {
    return REUNION_TYPES.find(t => t.value === type)?.label ?? type;
  }

  mapsUrl(lieu: string): string {
    return `https://www.google.com/maps/search/?q=${encodeURIComponent(lieu)}`;
  }

  sortieTypeBadge(type: SortieType | undefined): string {
    if (!type || !SORTIE_TYPE_META[type]) return 'Événement';
    const m = SORTIE_TYPE_META[type];
    return `${m.emoji} ${m.label}`;
  }

  openLogin() { this.loginModal.open(); }
}
