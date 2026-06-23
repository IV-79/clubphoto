import { Component, inject, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../../services/theme.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ThemeMensuel, computeThemeStatut, ThemeStatut, THEME_STATUT_LABELS } from '../../../models/theme.model';

const INIT = 8;
const PAGE = 8;

const MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

@Component({
  selector: 'app-admin-themes',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule,
  ],
  templateUrl: './themes.html',
  styleUrl: './themes.css',
})
export class AdminThemes {
  private themeService   = inject(ThemeService);
  private authService    = inject(AuthService);
  private confirmService = inject(ConfirmService);

  private readonly todayStr = new Date().toISOString().slice(0, 10);

  themes  = toSignal(this.themeService.getThemes(), { initialValue: [] as ThemeMensuel[] });
  profile = toSignal(this.authService.currentUserProfile$);

  showCreateForm = signal(false);
  showPasses     = signal(false);
  expandedId     = signal<string | null>(null);
  editingId      = signal<string | null>(null);
  saving         = signal(false);
  createError    = signal('');
  editError      = signal('');
  editStatut     = signal<ThemeStatut | null>(null);
  flashEdit      = signal(false);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  private limitActifs = signal(INIT);
  private limitPasses = signal(INIT);

  private actifsAll = computed(() =>
    this.themes()
      .filter(t => computeThemeStatut(t) !== 'resultats')
      .sort((a, b) => a.mois.localeCompare(b.mois))
  );
  private passesAll = computed(() =>
    this.themes()
      .filter(t => computeThemeStatut(t) === 'resultats')
      .sort((a, b) => b.mois.localeCompare(a.mois))
  );

  actifs        = computed(() => this.actifsAll().slice(0, this.limitActifs()));
  passes        = computed(() => this.passesAll().slice(0, this.limitPasses()));
  actifsCount   = computed(() => this.actifsAll().length);
  passesCount   = computed(() => this.passesAll().length);
  hasMoreActifs = computed(() => this.limitActifs() < this.actifsAll().length);
  hasMorePasses = computed(() => this.limitPasses() < this.passesAll().length);

  readonly moisOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: MOIS_FR[i + 1],
  }));

  readonly yearOptions = (() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2].map(String);
  })();

  readonly STATUT_LABELS = THEME_STATUT_LABELS;

  createForm = this.buildForm();
  editForm   = this.buildForm();

  get createCloturePasse(): boolean {
    const v = this.createForm.controls.dateCloture.value;
    return !!v && v <= this.todayStr;
  }

  get editCloturePasse(): boolean {
    const v = this.editForm.controls.dateCloture.value;
    return !!v && v <= this.todayStr;
  }

  openCreate() {
    this.editingId.set(null);
    this.createForm.reset({ maxPhotos: 1, maxVotes: 3, moisYear: String(new Date().getFullYear()) });
    this.createError.set('');
    this.showCreateForm.set(true);
    this.expandedId.set(null);
  }

  cancelCreate() {
    this.showCreateForm.set(false);
    this.createError.set('');
  }

  onCreateMoisChange() {
    const mm   = this.createForm.controls.moisMonth.value;
    const yyyy = this.createForm.controls.moisYear.value;
    if (mm && yyyy) this.fillDates(this.createForm, yyyy, mm);
  }

  async creer() {
    if (this.createForm.invalid || this.saving()) return;
    const v    = this.createForm.getRawValue();
    const mois = `${v.moisYear}-${v.moisMonth}`;
    if (this.themes().some(t => t.mois === mois)) {
      this.createError.set('Un thème existe déjà pour ce mois.');
      return;
    }
    this.saving.set(true);
    try {
      await this.themeService.creerTheme({
        titre:         v.titre.trim(),
        description:   v.description.trim(),
        mois,
        dateOuverture: v.dateOuverture,
        dateCloture:   v.dateCloture,
        dateFinVote:   v.dateFinVote,
        maxPhotos:     Number(v.maxPhotos),
        maxVotes:      Number(v.maxVotes),
        createdBy:     this.profile()?.uid ?? '',
      });
      this.showCreateForm.set(false);
      this.createForm.reset({ maxPhotos: 1, maxVotes: 3 });
      this.createError.set('');
    } finally {
      this.saving.set(false);
    }
  }

  toggleExpand(id: string) {
    if (this.editingId() === id) return;
    if (this.editingId() !== null) {
      this.triggerFlash();
      return;
    }
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  private triggerFlash() {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashEdit.set(false);
    setTimeout(() => {
      this.flashEdit.set(true);
      this.flashTimer = setTimeout(() => this.flashEdit.set(false), 600);
    }, 0);
  }

  startEdit(theme: ThemeMensuel) {
    this.showCreateForm.set(false);
    const s = computeThemeStatut(theme);
    const [moisYear, moisMonth] = theme.mois.split('-');
    this.editForm.reset({
      titre:         theme.titre,
      description:   theme.description ?? '',
      moisMonth,
      moisYear,
      dateOuverture: theme.dateOuverture,
      dateCloture:   theme.dateCloture,
      dateFinVote:   theme.dateFinVote,
      maxPhotos:     theme.maxPhotos,
      maxVotes:      theme.maxVotes,
    });
    if (s === 'en_attente') {
      this.editForm.controls.moisMonth.enable();
      this.editForm.controls.moisYear.enable();
      this.editForm.controls.dateOuverture.enable();
      this.editForm.controls.dateCloture.enable();
      this.editForm.controls.dateFinVote.enable();
    } else {
      this.editForm.controls.moisMonth.disable();
      this.editForm.controls.moisYear.disable();
      this.editForm.controls.dateOuverture.disable();
      this.editForm.controls.dateCloture.disable();
      this.editForm.controls.dateFinVote.disable();
    }
    this.editStatut.set(s);
    this.editError.set('');
    this.editingId.set(theme.id);
    this.expandedId.set(theme.id);
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editError.set('');
  }

  onEditMoisChange() {
    const mm   = this.editForm.controls.moisMonth.value;
    const yyyy = this.editForm.controls.moisYear.value;
    if (mm && yyyy) this.fillDates(this.editForm, yyyy, mm);
  }

  async sauvegarder(id: string) {
    if (this.editForm.invalid || this.saving()) return;
    const v    = this.editForm.getRawValue();
    const mois = `${v.moisYear}-${v.moisMonth}`;
    if (this.themes().some(t => t.mois === mois && t.id !== id)) {
      this.editError.set('Un thème existe déjà pour ce mois.');
      return;
    }
    this.saving.set(true);
    try {
      await this.themeService.modifierTheme(id, {
        titre:         v.titre.trim(),
        description:   v.description.trim(),
        mois,
        dateOuverture: v.dateOuverture,
        dateCloture:   v.dateCloture,
        dateFinVote:   v.dateFinVote,
        maxPhotos:     Number(v.maxPhotos),
        maxVotes:      Number(v.maxVotes),
      });
      this.editingId.set(null);
      this.editError.set('');
    } finally {
      this.saving.set(false);
    }
  }

  async supprimer(theme: ThemeMensuel) {
    const ok = await this.confirmService.confirm(`Supprimer le thème « ${theme.titre} » définitivement ?`);
    if (!ok) return;
    await this.themeService.supprimerTheme(theme.id);
    if (this.editingId() === theme.id) this.editingId.set(null);
    if (this.expandedId() === theme.id) this.expandedId.set(null);
  }

  loadMoreActifs() { this.limitActifs.update(n => n + PAGE); }
  loadMorePasses()  { this.limitPasses.update(n => n + PAGE); }

  statut(theme: ThemeMensuel): ThemeStatut { return computeThemeStatut(theme); }

  canEdit(theme: ThemeMensuel): boolean {
    const s = computeThemeStatut(theme);
    return s === 'en_attente' || s === 'ouvert';
  }

  formatMoisShort(mois: string): string {
    const [year, month] = mois.split('-');
    return new Date(+year, +month - 1).toLocaleDateString('fr-FR', { month: 'short' });
  }

  formatDate(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR');
  }

  private buildForm() {
    return new FormGroup({
      titre:         new FormControl('', { validators: [Validators.required], nonNullable: true }),
      description:   new FormControl('', { nonNullable: true }),
      moisMonth:     new FormControl('', { validators: [Validators.required], nonNullable: true }),
      moisYear:      new FormControl('', { validators: [Validators.required], nonNullable: true }),
      dateOuverture: new FormControl('', { validators: [Validators.required], nonNullable: true }),
      dateCloture:   new FormControl('', { validators: [Validators.required], nonNullable: true }),
      dateFinVote:   new FormControl('', { validators: [Validators.required], nonNullable: true }),
      maxPhotos:     new FormControl(1, { validators: [Validators.required, Validators.min(1)], nonNullable: true }),
      maxVotes:      new FormControl(3, { validators: [Validators.required, Validators.min(1)], nonNullable: true }),
    });
  }

  private fillDates(form: FormGroup, yyyy: string, mm: string) {
    const year      = +yyyy;
    const month     = +mm;
    const lastDay   = new Date(year, month, 0).getDate();
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear  = month === 12 ? year + 1 : year;
    form.controls['dateOuverture'].setValue(`${yyyy}-${mm}-01`);
    form.controls['dateCloture'].setValue(`${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`);
    form.controls['dateFinVote'].setValue(`${String(nextYear)}-${String(nextMonth).padStart(2, '0')}-15`);
  }
}
