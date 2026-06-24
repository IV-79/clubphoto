import { Component, inject, signal, computed, effect, untracked, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import { ConfirmService } from '../../../../services/confirm.service';
import { OneShotTheme, ONESHOT_STATUT_LABELS } from '../../../../models/oneshot.model';

@Component({
  selector: 'app-oneshot-gerer',
  imports: [FormsModule, RouterLink],
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

  dateValue = '';
  lieuValue = '';
  saving = signal(false);

  constructor() {
    effect(() => {
      const ev = this.event();
      untracked(() => {
        this.dateValue = ev?.date ?? '';
        this.lieuValue = ev?.lieu ?? '';
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
      this.oneShotService.updateLieu(this.id, this.lieuValue.trim()),
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
}
