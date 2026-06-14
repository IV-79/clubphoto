import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { ReunionService } from '../../../services/reunion.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Reunion } from '../../../models/reunion.model';

@Component({
  selector: 'app-reunions',
  imports: [
    ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDatepickerModule,
  ],
  templateUrl: './reunions.html',
  styleUrl: './reunions.css',
})
export class Reunions {
  private service = inject(ReunionService);
  private confirmService = inject(ConfirmService);

  reunions = toSignal(this.service.getReunions(), { initialValue: [] as Reunion[] });

  showCreateForm = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);

  createForm = this.buildForm();
  editForm = this.buildForm();

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
        date: this.dateToString(v.date),
        ...(v.lieu.trim() ? { lieu: v.lieu.trim() } : {}),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      });
      this.createForm.reset();
      this.showCreateForm.set(false);
    } finally { this.saving.set(false); }
  }

  startEdit(ev: Reunion) {
    this.editForm.reset({
      titre: ev.titre,
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
        date: this.dateToString(v.date),
        ...(v.lieu.trim() ? { lieu: v.lieu.trim() } : {}),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      });
      this.editingId.set(null);
    } finally { this.saving.set(false); }
  }

  async supprimer(ev: Reunion) {
    const ok = await this.confirmService.confirm(`Supprimer « ${ev.titre} » définitivement ?`);
    if (!ok) return;
    await this.service.supprimer(ev.id);
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  isPasse(date: string): boolean {
    return new Date(date + 'T23:59:59') < new Date();
  }
}
