import { Component, inject, signal, effect, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith, map } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { DatePickerComponent } from '../../../../components/date-picker/date-picker';
import { SortieService } from '../../../../services/sortie.service';
import { OneShotService } from '../../../../services/oneshot.service';
import { DefiService } from '../../../../services/defi.service';
import { AuthService } from '../../../../services/auth.service';
import { SortieType } from '../../../../models/sortie.model';
import { compressImage, COMPRESS_COUVERTURE } from '../../../../utils/image-compress';

type CreationType = SortieType | 'oneshot' | 'defi';

@Component({
  selector: 'app-sortie-creer',
  imports: [
    RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatButtonModule, MatSelectModule, MatIconModule,
    DatePickerComponent,
  ],
  templateUrl: './sortie-creer.html',
  styleUrl: './sortie-creer.css',
})
export class SortieCreer {
  private sortieService  = inject(SortieService);
  private oneShotService = inject(OneShotService);
  private defiService    = inject(DefiService);
  private authService    = inject(AuthService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);

  profile = toSignal(this.authService.currentUserProfile$);
  saving = signal(false);
  today  = new Date().toISOString().slice(0, 10);

  pendingCoverFile = signal<File | null>(null);
  coverPreviewUrl  = signal<string | null>(null);
  coverDragOver    = signal(false);

  pendingThemes = signal<string[]>([]);
  newThemeNom   = signal('');

  addPendingTheme(): void {
    const nom = this.newThemeNom().trim();
    if (!nom) return;
    this.pendingThemes.update(ts => [...ts, nom]);
    this.newThemeNom.set('');
  }

  removePendingTheme(index: number): void {
    this.pendingThemes.update(ts => ts.filter((_, i) => i !== index));
  }

  form = new FormGroup({
    type:                   new FormControl<CreationType>('sortie_photo', { nonNullable: true }),
    titre:                  new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    description:            new FormControl('', { nonNullable: true }),
    date:                   new FormControl('', { validators: [Validators.required], nonNullable: true }),
    lieu:                   new FormControl('', { nonNullable: true }),
    maxParticipants:        new FormControl<number | null>(null),
    inscriptionObligatoire: new FormControl(true, { nonNullable: true }),
    // Défi-specific
    theme:               new FormControl('', { nonNullable: true }),
    dateDebutSoumission: new FormControl('', { nonNullable: true }),
    dateFinSoumission:   new FormControl('', { nonNullable: true }),
    dateCloturVotes:     new FormControl('', { nonNullable: true }),
    maxPhotos:           new FormControl(2, { nonNullable: true }),
    maxVotes:            new FormControl(3, { nonNullable: true }),
    visibilite:          new FormControl<'public' | 'membre'>('public', { nonNullable: true }),
  });

  isOneShot = toSignal(
    this.form.get('type')!.valueChanges.pipe(
      startWith(this.form.get('type')!.value),
      map(v => v === 'oneshot')
    ),
    { initialValue: false }
  );

  isDefi = toSignal(
    this.form.get('type')!.valueChanges.pipe(
      startWith(this.form.get('type')!.value),
      map(v => v === 'defi')
    ),
    { initialValue: false }
  );

  constructor() {
    // date: required pour sortie uniquement
    effect(() => {
      const dateCtrl = this.form.get('date')!;
      if (this.isOneShot() || this.isDefi()) {
        dateCtrl.clearValidators();
      } else {
        dateCtrl.setValidators([Validators.required]);
      }
      untracked(() => dateCtrl.updateValueAndValidity({ emitEvent: false }));
    });

    // Champs défi: required quand type=defi uniquement
    effect(() => {
      const themeCtrl = this.form.get('theme')!;
      const d1 = this.form.get('dateDebutSoumission')!;
      const d2 = this.form.get('dateFinSoumission')!;
      const d3 = this.form.get('dateCloturVotes')!;
      if (this.isDefi()) {
        themeCtrl.setValidators([Validators.required, Validators.minLength(2)]);
        d1.setValidators([Validators.required]);
        d2.setValidators([Validators.required]);
        d3.setValidators([Validators.required]);
      } else {
        themeCtrl.clearValidators();
        d1.clearValidators();
        d2.clearValidators();
        d3.clearValidators();
      }
      untracked(() => {
        themeCtrl.updateValueAndValidity({ emitEvent: false });
        d1.updateValueAndValidity({ emitEvent: false });
        d2.updateValueAndValidity({ emitEvent: false });
        d3.updateValueAndValidity({ emitEvent: false });
      });
    });

    // Preselect depuis query param
    const qtype = this.route.snapshot.queryParamMap.get('type');
    if (qtype === 'oneshot') this.form.patchValue({ type: 'oneshot' });
    if (qtype === 'defi')    this.form.patchValue({ type: 'defi' });
  }

  get defiDateError(): string | null {
    const d1 = this.form.get('dateDebutSoumission')!.value;
    const d2 = this.form.get('dateFinSoumission')!.value;
    const d3 = this.form.get('dateCloturVotes')!.value;
    if (d1 && d2 && d2 <= d1) return 'La fin des soumissions doit être après le début.';
    if (d2 && d3 && d3 <= d2) return 'La clôture des votes doit être après la fin des soumissions.';
    return null;
  }

  get inscriptionObligatoire() {
    return this.form.get('inscriptionObligatoire')!.value;
  }

  async submit() {
    if (this.form.invalid || this.saving()) return;
    if (this.isDefi() && this.defiDateError) return;
    const profile = this.profile();
    if (!profile) return;

    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const nom = `${profile.prenom ?? ''} ${profile.nom}`.trim();

      if (v.type === 'defi') {
        const id = await this.defiService.createDefi({
          titre:               v.titre.trim(),
          theme:               v.theme.trim(),
          description:         v.description.trim(),
          dateDebutSoumission: v.dateDebutSoumission,
          dateFinSoumission:   v.dateFinSoumission,
          dateCloturVotes:     v.dateCloturVotes,
          maxPhotos:           v.maxPhotos,
          maxVotes:            v.maxVotes,
          visibilite:              v.visibilite,
          organisateurUid:         profile.uid,
          organisateurNom:         nom,
          inscriptionObligatoire:  v.inscriptionObligatoire,
        });
        if (this.pendingCoverFile()) {
          await this.defiService.setCouverture(id, this.pendingCoverFile()!);
        }
        this.router.navigate(['/galeries/defis', id]);
      } else if (v.type === 'oneshot') {
        const id = await this.oneShotService.create({
          titre: v.titre.trim(),
          creatorUid: profile.uid,
          nomCreateur: nom,
          visibilite: v.visibilite,
          ...(v.description.trim() ? { description: v.description.trim() } : {}),
          ...(v.date ? { date: v.date } : {}),
          ...(v.lieu.trim() ? { lieu: v.lieu.trim() } : {}),
        });
        await Promise.all(this.pendingThemes().map((t, i) => this.oneShotService.addTheme(id, t, i)));
        await this.oneShotService.inscrire(id, profile.uid, nom);
        if (this.pendingCoverFile()) {
          const compressed = await compressImage(this.pendingCoverFile()!, COMPRESS_COUVERTURE);
          await this.oneShotService.setCouverture(id, compressed);
        }
        this.router.navigate(['/galeries/oneshots', id]);
      } else {
        const inscriptionObligatoire = v.inscriptionObligatoire;
        const id = await this.sortieService.createSortie({
          type: v.type as SortieType,
          titre: v.titre.trim(),
          date: v.date,
          nbInscrits: 0,
          inscriptionObligatoire,
          organisateurUid: profile.uid,
          nomOrganisateur: nom,
          visibilite: v.visibilite,
          ...(v.lieu.trim() ? { lieu: v.lieu.trim() } : {}),
          ...(v.description.trim() ? { description: v.description.trim() } : {}),
          ...(inscriptionObligatoire && v.maxParticipants != null ? { maxParticipants: v.maxParticipants } : {}),
        });
        if (inscriptionObligatoire) {
          await this.sortieService.inscrire(id, profile.uid, nom);
        }
        if (this.pendingCoverFile()) {
          const compressed = await compressImage(this.pendingCoverFile()!, COMPRESS_COUVERTURE);
          await this.sortieService.setImageEvenement(id, compressed);
        }
        this.router.navigate(['/galeries/sorties', id]);
      }
    } finally {
      this.saving.set(false);
    }
  }

  onCoverDrop(event: DragEvent) {
    event.preventDefault();
    this.coverDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.setCoverFile(file);
  }

  onCoverSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setCoverFile(file);
    (event.target as HTMLInputElement).value = '';
  }

  clearCover() {
    const prev = this.coverPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.pendingCoverFile.set(null);
    this.coverPreviewUrl.set(null);
  }

  private setCoverFile(file: File) {
    const prev = this.coverPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.pendingCoverFile.set(file);
    this.coverPreviewUrl.set(URL.createObjectURL(file));
  }
}
