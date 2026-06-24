import { Component, inject, signal, effect, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith, map } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { SortieService } from '../../../../services/sortie.service';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { SortieType } from '../../../../models/sortie.model';

type CreationType = SortieType | 'oneshot';

@Component({
  selector: 'app-sortie-creer',
  imports: [
    RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatDatepickerModule, MatButtonModule, MatSelectModule, MatIconModule,
  ],
  templateUrl: './sortie-creer.html',
  styleUrl: './sortie-creer.css',
})
export class SortieCreer {
  private sortieService  = inject(SortieService);
  private oneShotService = inject(OneShotService);
  private authService    = inject(AuthService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);

  profile = toSignal(this.authService.currentUserProfile$);
  saving  = signal(false);
  minDate = new Date();

  form = new FormGroup({
    type:                   new FormControl<CreationType>('sortie_photo', { nonNullable: true }),
    titre:                  new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    description:            new FormControl('', { nonNullable: true }),
    date:                   new FormControl<Date | null>(null, [Validators.required]),
    lieu:                   new FormControl('', { nonNullable: true }),
    maxParticipants:        new FormControl<number | null>(null),
    inscriptionObligatoire: new FormControl(true, { nonNullable: true }),
  });

  isOneShot = toSignal(
    this.form.get('type')!.valueChanges.pipe(
      startWith(this.form.get('type')!.value),
      map(v => v === 'oneshot')
    ),
    { initialValue: false }
  );

  constructor() {
    // Sync date validator avec le type sélectionné
    effect(() => {
      const dateCtrl = this.form.get('date')!;
      if (this.isOneShot()) {
        dateCtrl.clearValidators();
      } else {
        dateCtrl.setValidators([Validators.required]);
      }
      untracked(() => dateCtrl.updateValueAndValidity({ emitEvent: false }));
    });

    // Preselect depuis query param (?type=oneshot)
    if (this.route.snapshot.queryParamMap.get('type') === 'oneshot') {
      this.form.patchValue({ type: 'oneshot' });
    }
  }

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
      const nom = `${profile.prenom ?? ''} ${profile.nom}`.trim();

      if (v.type === 'oneshot') {
        const id = await this.oneShotService.create({
          titre: v.titre.trim(),
          creatorUid: profile.uid,
          nomCreateur: nom,
          ...(v.description.trim() ? { description: v.description.trim() } : {}),
          ...(v.date ? { date: this.dateToStr(v.date) } : {}),
          ...(v.lieu.trim() ? { lieu: v.lieu.trim() } : {}),
        });
        await this.oneShotService.inscrire(id, profile.uid, nom);
        this.router.navigate(['/galeries/oneshots', id]);
      } else {
        const inscriptionObligatoire = v.inscriptionObligatoire;
        const id = await this.sortieService.createSortie({
          type: v.type as SortieType,
          titre: v.titre.trim(),
          date: this.dateToStr(v.date!),
          nbInscrits: 0,
          inscriptionObligatoire,
          organisateurUid: profile.uid,
          nomOrganisateur: nom,
          ...(v.lieu.trim() ? { lieu: v.lieu.trim() } : {}),
          ...(v.description.trim() ? { description: v.description.trim() } : {}),
          ...(inscriptionObligatoire && v.maxParticipants != null ? { maxParticipants: v.maxParticipants } : {}),
        });
        if (inscriptionObligatoire) {
          await this.sortieService.inscrire(id, profile.uid, nom);
        }
        this.router.navigate(['/galeries/sorties', id]);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private dateToStr(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
