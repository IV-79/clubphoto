import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { EvenementService } from '../../services/evenement.service';
import { Evenement, EvenementType, EVENEMENT_TYPES } from '../../models/evenement.model';

const INIT = 3;
const PAGE = 5;

@Component({
  selector: 'app-calendrier',
  imports: [SlicePipe],
  templateUrl: './calendrier.html',
  styleUrl: './calendrier.css',
})
export class Calendrier {
  private service = inject(EvenementService);

  types = EVENEMENT_TYPES;
  filtre = signal<EvenementType | 'tous'>('tous');
  showPasses = signal(false);

  private limitAVenir = signal(INIT);
  private limitPasses = signal(INIT);

  private tous = toSignal(this.service.getEvenements(), { initialValue: [] as Evenement[] });

  private filtres = computed(() => {
    const f = this.filtre();
    return f === 'tous' ? this.tous() : this.tous().filter(e => e.type === f);
  });

  private aVenirAll = computed(() =>
    [...this.filtres().filter(e => !this.isPasse(e.date))].sort((a, b) => a.date.localeCompare(b.date))
  );
  private passesAll = computed(() =>
    [...this.filtres().filter(e => this.isPasse(e.date))].sort((a, b) => b.date.localeCompare(a.date))
  );

  aVenir      = computed(() => this.aVenirAll().slice(0, this.limitAVenir()));
  passes      = computed(() => this.passesAll().slice(0, this.limitPasses()));
  aVenirCount = computed(() => this.aVenirAll().length);
  passesCount = computed(() => this.passesAll().length);
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
