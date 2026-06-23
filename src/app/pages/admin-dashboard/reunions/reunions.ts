import { Component, inject, signal, computed } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ReunionService } from '../../../services/reunion.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Reunion } from '../../../models/reunion.model';

const INIT = 8;
const PAGE = 8;

@Component({
  selector: 'app-reunions',
  imports: [
    SlicePipe, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatDatepickerModule,
    MatButtonModule, MatIconModule,
  ],
  templateUrl: './reunions.html',
  styleUrl: './reunions.css',
})
export class Reunions {
  private service = inject(ReunionService);
  private confirmService = inject(ConfirmService);

  private readonly todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  reunions = toSignal(this.service.getReunions(), { initialValue: [] as Reunion[] });

  showPasses = signal(false);
  showCreateForm = signal(false);
  expandedId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  saving = signal(false);

  private limitAVenir = signal(INIT);
  private limitPasses = signal(INIT);

  private aVenirAll = computed(() =>
    this.reunions()
      .filter(r => r.date >= this.todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
  );
  private passesAll = computed(() =>
    this.reunions()
      .filter(r => r.date < this.todayStr)
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  aVenir        = computed(() => this.aVenirAll().slice(0, this.limitAVenir()));
  passes        = computed(() => this.passesAll().slice(0, this.limitPasses()));
  aVenirCount   = computed(() => this.aVenirAll().length);
  passesCount   = computed(() => this.passesAll().length);
  hasMoreAVenir = computed(() => this.limitAVenir() < this.aVenirAll().length);
  hasMorePasses = computed(() => this.limitPasses() < this.passesAll().length);

  createForm = this.buildForm();
  editForm   = this.buildForm();

  openCreate() {
    this.editingId.set(null);
    this.createForm.reset({ titre: '', date: null, lieu: '', description: '' });
    this.showCreateForm.set(true);
    this.expandedId.set(null);
  }

  cancelCreate() { this.showCreateForm.set(false); }

  async creer() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.createForm.getRawValue();
      await this.service.creer({
        titre: v.titre.trim(),
        date: this.dateToString(v.date),
        ...(v.lieu.trim()        ? { lieu: v.lieu.trim() }               : {}),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      });
      this.showCreateForm.set(false);
      this.createForm.reset();
    } finally { this.saving.set(false); }
  }

  toggleExpand(id: string) {
    if (this.editingId() === id) return;
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  startEdit(r: Reunion) {
    this.showCreateForm.set(false);
    this.editForm.reset({
      titre: r.titre,
      date: new Date(r.date + 'T12:00:00'),
      lieu: r.lieu ?? '',
      description: r.description ?? '',
    });
    this.editingId.set(r.id);
    this.expandedId.set(r.id);
  }

  cancelEdit() { this.editingId.set(null); }

  async sauvegarder(id: string) {
    if (this.editForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.editForm.getRawValue();
      const oldReunion = this.reunions().find(r => r.id === id);
      await this.service.modifier(id, {
        titre: v.titre.trim(),
        date: this.dateToString(v.date),
        ...(v.lieu.trim()        ? { lieu: v.lieu.trim() }               : {}),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      }, oldReunion ? { oldDate: oldReunion.date, titre: v.titre.trim() } : undefined);
      this.editingId.set(null);
    } finally { this.saving.set(false); }
  }

  async supprimer(r: Reunion) {
    const ok = await this.confirmService.confirm(`Supprimer « ${r.titre} » définitivement ?`);
    if (!ok) return;
    await this.service.supprimer(r.id);
    if (this.editingId() === r.id) this.editingId.set(null);
    if (this.expandedId() === r.id) this.expandedId.set(null);
  }

  loadMoreAVenir() { this.limitAVenir.update(n => n + PAGE); }
  loadMorePasses()  { this.limitPasses.update(n => n + PAGE); }

  monthOf(date: string): string { return date.slice(0, 7); }

  formatMonth(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  formatDateFull(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  mapsUrl(lieu: string): string {
    return `https://www.google.com/maps/search/?q=${encodeURIComponent(lieu)}`;
  }

  private buildForm() {
    return new FormGroup({
      titre:       new FormControl('', { validators: [Validators.required], nonNullable: true }),
      date:        new FormControl<Date | null>(null, [Validators.required]),
      lieu:        new FormControl('', { nonNullable: true }),
      description: new FormControl('', { nonNullable: true }),
    });
  }

  private dateToString(d: Date | null): string {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
