import { Component, inject, signal, computed, effect, untracked, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { OneShotTheme, ONESHOT_STATUT_LABELS } from '../../../../models/oneshot.model';
import { compressToJpeg } from '../../../../utils/image-compress';
import { DatePickerComponent } from '../../../../components/date-picker/date-picker';
import { ImgRetryDirective } from '../../../../directives/img-retry.directive';

@Component({
  selector: 'app-oneshot-gerer',
  imports: [FormsModule, RouterLink, DatePickerComponent, ImgRetryDirective],
  templateUrl: './oneshot-gerer.html',
  styleUrl: './oneshot-gerer.css',
})
export class OneShotGerer implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);

  private id = this.route.snapshot.paramMap.get('id')!;

  event  = toSignal(this.oneShotService.getOneShot(this.id));
  themes = toSignal(this.oneShotService.getThemes(this.id), { initialValue: [] as OneShotTheme[] });
  profile = toSignal(this.authService.currentUserProfile$);

  statutLabel = computed(() => ONESHOT_STATUT_LABELS[this.event()?.statut ?? 'preparation']);

  peutEditer = computed(() =>
    ['preparation', 'inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? '')
  );

  titreValue       = '';
  dateValue        = '';
  lieuValue        = '';
  descriptionValue = '';
  saving        = signal(false);
  coverUploading = signal(false);
  coverDragOver  = signal(false);

  constructor() {
    effect(() => {
      const ev = this.event();
      untracked(() => {
        this.titreValue       = ev?.titre ?? '';
        this.dateValue        = ev?.date ?? '';
        this.lieuValue        = ev?.lieu ?? '';
        this.descriptionValue = ev?.description ?? '';
      });
    });
  }

  ngOnInit() {
    this.authService.currentUserProfile$.subscribe(profile => {
      const ev = this.event();
      if (ev && profile && ev.creatorUid !== profile.uid) {
        this.router.navigate(['/galeries/oneshots', this.id]);
      }
    });
  }

  cancel() {
    this.router.navigate(['/galeries/oneshots', this.id]);
  }

  async save() {
    if (this.saving()) return;
    this.saving.set(true);
    const ev = this.event();
    await Promise.all([
      this.oneShotService.updateDate(this.id, this.dateValue, ev ? {
        oldDate: ev.date ?? '',
        titre: ev.titre,
        nomCreateur: ev.nomCreateur,
        creatorUid: ev.creatorUid,
      } : undefined),
      this.oneShotService.updateTitre(this.id, this.titreValue),
      this.oneShotService.updateLieu(this.id, this.lieuValue.trim()),
      this.oneShotService.updateDescription(this.id, this.descriptionValue),
    ]);
    this.saving.set(false);
    this.router.navigate(['/galeries/oneshots', this.id]);
  }

  // Thèmes
  newThemeNom = '';
  editingThemeId = signal<string | null>(null);
  editingThemeNom = '';
  savingTheme = signal(false);

  async addTheme() {
    const nom = this.newThemeNom.trim();
    if (!nom || this.savingTheme()) return;
    this.savingTheme.set(true);
    await this.oneShotService.addTheme(this.id, nom, this.themes().length);
    this.newThemeNom = '';
    this.savingTheme.set(false);
  }

  startEdit(theme: OneShotTheme) {
    this.editingThemeId.set(theme.id);
    this.editingThemeNom = theme.nom;
  }

  cancelEdit() { this.editingThemeId.set(null); }

  async saveEdit(themeId: string) {
    const nom = this.editingThemeNom.trim();
    if (!nom || this.savingTheme()) return;
    this.savingTheme.set(true);
    await this.oneShotService.updateTheme(this.id, themeId, nom);
    this.editingThemeId.set(null);
    this.savingTheme.set(false);
  }

  async deleteTheme(theme: OneShotTheme) {
    const ok = await this.confirmService.confirm(`Supprimer le thème « ${theme.nom} » définitivement ?`);
    if (!ok) return;
    await this.oneShotService.deleteTheme(this.id, theme.id);
  }

  onCoverDrop(event: DragEvent) {
    event.preventDefault();
    this.coverDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.uploadCoverFile(file);
  }

  async onCoverSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (file) this.uploadCoverFile(file);
  }

  async removeCover() {
    const path = this.event()?.photoCouverturePath;
    if (!path) return;
    this.coverUploading.set(true);
    try {
      await this.oneShotService.removeCouverture(this.id, path);
    } finally {
      this.coverUploading.set(false);
    }
  }

  private async uploadCoverFile(file: File) {
    this.coverUploading.set(true);
    try {
      const compressed = await compressToJpeg(file);
      await this.oneShotService.setCouverture(this.id, compressed);
    } finally {
      this.coverUploading.set(false);
    }
  }
}
