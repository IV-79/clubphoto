import { Component, inject, signal, computed } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { EvenementService } from '../../services/evenement.service';
import { Evenement, EvenementType, EVENEMENT_TYPES } from '../../models/evenement.model';

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

  tous = toSignal(this.service.getEvenements(), { initialValue: [] as Evenement[] });

  filtres = computed(() => {
    const f = this.filtre();
    return f === 'tous' ? this.tous() : this.tous().filter(e => e.type === f);
  });

  aVenir = computed(() =>
    [...this.filtres().filter(e => !this.isPasse(e.date))].sort((a, b) => a.date.localeCompare(b.date))
  );
  passes = computed(() =>
    [...this.filtres().filter(e => this.isPasse(e.date))].sort((a, b) => b.date.localeCompare(a.date))
  );

  isPasse(date: string): boolean {
    return new Date(date + 'T23:59:59') < new Date();
  }

  formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  labelType(type: string): string {
    return EVENEMENT_TYPES.find(t => t.value === type)?.label ?? type;
  }
}
