import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of, switchMap, map } from 'rxjs';
import { EvenementService } from '../../services/evenement.service';
import { OneShotService } from '../../services/oneshot.service';
import { SortieService } from '../../services/sortie.service';
import { AuthService } from '../../services/auth.service';
import { Evenement, EvenementType, EVENEMENT_TYPES } from '../../models/evenement.model';
import { OneShot, ONESHOT_STATUT_LABELS } from '../../models/oneshot.model';
import { Sortie } from '../../models/sortie.model';

const INIT = 3;
const PAGE = 5;

interface CalItem {
  kind: 'event' | 'oneshot' | 'sortie';
  id: string;
  date: string;
  event?: Evenement;
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
  private service = inject(EvenementService);
  private oneShotService = inject(OneShotService);
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);

  // --- Filtres ---
  types = EVENEMENT_TYPES;
  filtre = signal<'tous' | EvenementType | 'oneshot' | 'sortie'>('tous');
  showPasses = signal(false);

  private limitAVenir = signal(INIT);
  private limitPasses = signal(INIT);

  private tous = toSignal(this.service.getEvenements(), { initialValue: [] as Evenement[] });

  // --- OneShots publics ---
  profile = toSignal(this.authService.currentUserProfile$);
  private publicOneShots$ = this.oneShotService.getPublicOneShots();
  private oneshots = toSignal(this.publicOneShots$, { initialValue: [] as OneShot[] });
  private sorties = toSignal(this.sortieService.getSorties(), { initialValue: [] as Sortie[] });

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
  }

  loadMoreAVenir() { this.limitAVenir.update(n => n + PAGE); }
  loadMorePasses()  { this.limitPasses.update(n => n + PAGE); }

  // --- Inscriptions OneShot ---
  private inscriptionStatus$ = combineLatest([
    this.authService.currentUserProfile$,
    this.publicOneShots$,
  ]).pipe(
    switchMap(([profile, oneshots]) => {
      if (!profile) return of({} as Record<string, boolean>);
      const open = oneshots.filter(e => e.statut === 'inscription');
      if (open.length === 0) return of({} as Record<string, boolean>);
      return combineLatest(
        open.map(os =>
          this.oneShotService.getInscriptions(os.id).pipe(
            map(ins => [os.id, ins.some(i => i.uid === profile.uid)] as [string, boolean])
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
    return EVENEMENT_TYPES.find(t => t.value === type)?.label ?? type;
  }
}
