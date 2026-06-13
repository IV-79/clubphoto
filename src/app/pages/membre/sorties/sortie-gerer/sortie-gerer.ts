import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SortieService } from '../../../../services/sortie.service';
import { AuthService } from '../../../../services/auth.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { Sortie } from '../../../../models/sortie.model';

@Component({
  selector: 'app-sortie-gerer',
  imports: [
    RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatDatepickerModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './sortie-gerer.html',
  styleUrl: './sortie-gerer.css',
})
export class SortieGerer {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);

  sortieId = this.route.snapshot.paramMap.get('id')!;
  profile = toSignal(this.authService.currentUserProfile$);

  sortie = toSignal(
    this.sortieService.getSortie(this.sortieId).pipe(startWith(null as Sortie | null))
  );

  inscriptions = toSignal(
    this.sortieService.getInscriptions(this.sortieId),
    { initialValue: [] }
  );

  saving = signal(false);
  editMode = signal(false);

  form = new FormGroup({
    titre:                  new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    description:            new FormControl('', { nonNullable: true }),
    date:                   new FormControl<Date | null>(null, [Validators.required]),
    lieu:                   new FormControl('', { nonNullable: true }),
    maxParticipants:        new FormControl<number | null>(null),
    inscriptionObligatoire: new FormControl(true, { nonNullable: true }),
    uploadParticipantsOnly: new FormControl(true, { nonNullable: true }),
  });

  get inscriptionObligatoire() {
    return this.form.get('inscriptionObligatoire')!.value;
  }

  startEdit() {
    const s = this.sortie();
    if (!s) return;
    this.form.reset({
      titre: s.titre,
      description: s.description ?? '',
      date: s.date ? new Date(s.date + 'T12:00:00') : null,
      lieu: s.lieu ?? '',
      maxParticipants: s.maxParticipants ?? null,
      inscriptionObligatoire: s.inscriptionObligatoire,
      uploadParticipantsOnly: s.uploadParticipantsOnly,
    });
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
  }

  async saveEdit() {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const date = v.date!;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const inscriptionObligatoire = v.inscriptionObligatoire;
      await this.sortieService.updateSortie(this.sortieId, {
        titre: v.titre.trim(),
        description: v.description.trim() || undefined,
        date: `${yyyy}-${mm}-${dd}`,
        lieu: v.lieu.trim() || undefined,
        maxParticipants: v.maxParticipants ?? undefined,
        inscriptionObligatoire,
        uploadParticipantsOnly: inscriptionObligatoire ? v.uploadParticipantsOnly : false,
      });
      this.editMode.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSortie() {
    const s = this.sortie();
    const ok = await this.confirmService.confirm(
      `Supprimer « ${s?.titre ?? 'cette sortie'} » et toutes ses photos définitivement ?`
    );
    if (!ok) return;
    await this.sortieService.deleteSortie(this.sortieId);
    this.router.navigate(['/galeries/sorties']);
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }
}
