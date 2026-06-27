import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DefiService } from '../../../../services/defi.service';
import { AuthService } from '../../../../services/auth.service';
import { DatePickerComponent } from '../../../../components/date-picker/date-picker';

function datesOrder(control: AbstractControl): ValidationErrors | null {
  const debut = control.get('dateDebutSoumission')?.value as string;
  const fin   = control.get('dateFinSoumission')?.value as string;
  const vote  = control.get('dateCloturVotes')?.value as string;
  if (debut && fin && fin <= debut) return { finAvantDebut: true };
  if (fin && vote && vote <= fin)   return { voteAvantFin: true };
  return null;
}

@Component({
  selector: 'app-defi-creer',
  imports: [
    RouterLink, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    DatePickerComponent,
  ],
  templateUrl: './defi-creer.html',
  styleUrl: './defi-creer.css',
})
export class DefiCreer {
  private defiService = inject(DefiService);
  private authService = inject(AuthService);
  private router      = inject(Router);

  profile = toSignal(this.authService.currentUserProfile$);
  saving  = signal(false);
  today   = new Date().toISOString().slice(0, 10);

  pendingCoverFile = signal<File | null>(null);
  coverPreviewUrl  = signal<string | null>(null);
  coverDragOver    = signal(false);

  form = new FormGroup({
    titre:               new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    theme:               new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    description:         new FormControl('', { nonNullable: true }),
    dateDebutSoumission: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    dateFinSoumission:   new FormControl('', { validators: [Validators.required], nonNullable: true }),
    dateCloturVotes:     new FormControl('', { validators: [Validators.required], nonNullable: true }),
    maxPhotos:           new FormControl(2, { validators: [Validators.required, Validators.min(1), Validators.max(10)], nonNullable: true }),
    maxVotes:            new FormControl(3, { validators: [Validators.required, Validators.min(1), Validators.max(20)], nonNullable: true }),
    visibilite:          new FormControl<'public' | 'membre'>('public', { nonNullable: true }),
  }, { validators: datesOrder });

  get dateErrors(): string | null {
    const e = this.form.errors;
    if (!e) return null;
    if (e['finAvantDebut']) return 'La date de fin de soumission doit être après le début.';
    if (e['voteAvantFin'])  return 'La date de clôture des votes doit être après la fin des soumissions.';
    return null;
  }

  async submit() {
    if (this.form.invalid || this.saving()) return;
    const profile = this.profile();
    if (!profile) return;

    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const nom = `${profile.prenom ?? ''} ${profile.nom}`.trim();
      const id = await this.defiService.createDefi({
        titre:               v.titre.trim(),
        theme:               v.theme.trim(),
        description:         v.description.trim(),
        dateDebutSoumission: v.dateDebutSoumission,
        dateFinSoumission:   v.dateFinSoumission,
        dateCloturVotes:     v.dateCloturVotes,
        maxPhotos:           v.maxPhotos,
        maxVotes:            v.maxVotes,
        visibilite:          v.visibilite,
        organisateurUid:     profile.uid,
        organisateurNom:     nom,
      });
      if (this.pendingCoverFile()) {
        await this.defiService.setCouverture(id, this.pendingCoverFile()!);
      }
      this.router.navigate(['/galeries/defis', id]);
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
