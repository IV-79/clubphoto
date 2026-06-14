import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { SortieService } from '../../../../services/sortie.service';
import { AuthService } from '../../../../services/auth.service';

@Component({
  selector: 'app-sortie-creer',
  imports: [
    RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatDatepickerModule, MatButtonModule, MatIconModule,
  ],
  templateUrl: './sortie-creer.html',
  styleUrl: './sortie-creer.css',
})
export class SortieCreer {
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);
  private router = inject(Router);

  profile = toSignal(this.authService.currentUserProfile$);
  saving = signal(false);
  minDate = new Date();

  form = new FormGroup({
    titre:                 new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    description:           new FormControl('', { nonNullable: true }),
    date:                  new FormControl<Date | null>(null, [Validators.required]),
    lieu:                  new FormControl('', { validators: [Validators.required], nonNullable: true }),
    maxParticipants:       new FormControl<number | null>(null),
    inscriptionObligatoire: new FormControl(true, { nonNullable: true }),
    uploadParticipantsOnly: new FormControl(true, { nonNullable: true }),
  });

  get inscriptionObligatoire() {
    return this.form.get('inscriptionObligatoire')!.value;
  }

  async submit() {
    if (this.form.invalid || this.saving()) return;
    const profile = this.profile();
    if (!profile) return;

    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const date = v.date!;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');

      const inscriptionObligatoire = v.inscriptionObligatoire;
      const uploadParticipantsOnly = inscriptionObligatoire ? v.uploadParticipantsOnly : false;

      const nomOrganisateur = `${profile.prenom ?? ''} ${profile.nom}`.trim();
      const id = await this.sortieService.createSortie({
        titre: v.titre.trim(),
        date: `${yyyy}-${mm}-${dd}`,
        lieu: v.lieu.trim(),
        inscriptionObligatoire,
        uploadParticipantsOnly,
        organisateurUid: profile.uid,
        nomOrganisateur,
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
        ...(inscriptionObligatoire && v.maxParticipants != null ? { maxParticipants: v.maxParticipants } : {}),
      });

      if (inscriptionObligatoire) {
        await this.sortieService.inscrire(id, profile.uid, nomOrganisateur);
      }

      this.router.navigate(['/galeries/sorties', id]);
    } finally {
      this.saving.set(false);
    }
  }
}
