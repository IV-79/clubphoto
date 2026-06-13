import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { EvenementService } from '../../../services/evenement.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Evenement, EVENEMENT_TYPES } from '../../../models/evenement.model';

@Component({
  selector: 'app-evenements',
  imports: [
    ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDatepickerModule,
  ],
  templateUrl: './evenements.html',
  styleUrl: './evenements.css',
})
export class Evenements {
  private service = inject(EvenementService);
  private confirmService = inject(ConfirmService);

  types = EVENEMENT_TYPES;
  evenements = toSignal(this.service.getEvenements(), { initialValue: [] as Evenement[] });

  showCreateForm = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);

  createForm = this.buildForm();
  editForm = this.buildForm();

  private buildForm() {
    return new FormGroup({
      titre:       new FormControl('', { validators: [Validators.required], nonNullable: true }),
      type:        new FormControl<'reunion'>('reunion', { validators: [Validators.required], nonNullable: true }),
      date:        new FormControl<Date | null>(null, [Validators.required]),
      lieu:        new FormControl('', { nonNullable: true }),
      description: new FormControl('', { nonNullable: true }),
    });
  }

  private dateToString(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${j}`;
  }

  async creer() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.createForm.getRawValue();
      await this.service.creer({
        titre: v.titre.trim(),
        type: v.type,
        date: this.dateToString(v.date),
        lieu: v.lieu.trim() || undefined,
        description: v.description.trim() || undefined,
      });
      this.createForm.reset({ type: 'reunion' });
      this.showCreateForm.set(false);
    } finally { this.saving.set(false); }
  }

  startEdit(ev: Evenement) {
    this.editForm.reset({
      titre: ev.titre,
      type: ev.type,
      date: new Date(ev.date + 'T12:00:00'),
      lieu: ev.lieu ?? '',
      description: ev.description ?? '',
    });
    this.editingId.set(ev.id);
  }

  cancelEdit() { this.editingId.set(null); }

  async sauvegarder(id: string) {
    if (this.editForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.editForm.getRawValue();
      await this.service.modifier(id, {
        titre: v.titre.trim(),
        type: v.type,
        date: this.dateToString(v.date),
        lieu: v.lieu.trim() || undefined,
        description: v.description.trim() || undefined,
      });
      this.editingId.set(null);
    } finally { this.saving.set(false); }
  }

  async supprimer(ev: Evenement) {
    const ok = await this.confirmService.confirm(`Supprimer « ${ev.titre} » définitivement ?`);
    if (!ok) return;
    await this.service.supprimer(ev.id);
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  labelType(type: string): string {
    return this.types.find(t => t.value === type)?.label ?? type;
  }

  isPasse(date: string): boolean {
    return new Date(date + 'T23:59:59') < new Date();
  }
}
