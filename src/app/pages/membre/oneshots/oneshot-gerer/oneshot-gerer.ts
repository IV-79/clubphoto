import { Component, inject, signal, computed, effect, untracked, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';
import {
  OneShotTheme, OneShotStatut, ONESHOT_STATUT_LABELS
} from '../../../../models/oneshot.model';

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

  private id = this.route.snapshot.paramMap.get('id')!;

  event = toSignal(this.oneShotService.getOneShot(this.id));
  themes = toSignal(this.oneShotService.getThemes(this.id), { initialValue: [] as OneShotTheme[] });
  inscriptions = toSignal(this.oneShotService.getInscriptions(this.id), { initialValue: [] });
  profile = toSignal(this.authService.currentUserProfile$);

  statutLabel = computed(() => ONESHOT_STATUT_LABELS[this.event()?.statut ?? 'preparation']);

  // Transitions
  nextStatut = computed<OneShotStatut | null>(() => {
    switch (this.event()?.statut) {
      case 'preparation':            return 'inscription';
      case 'inscription':            return 'vote';
      case 'fermeture_inscriptions': return 'vote';
      case 'vote':                   return 'resultats';
      default:                       return null;
    }
  });
  nextStatutLabel = computed(() => {
    switch (this.event()?.statut) {
      case 'preparation':            return 'Ouvrir les inscriptions';
      case 'inscription':            return 'Ouvrir les votes (sans fermer les inscriptions)';
      case 'fermeture_inscriptions': return 'Ouvrir les votes';
      case 'vote':                   return 'Publier les résultats';
      default:                       return '';
    }
  });
  peutFermerInscriptions = computed(() => this.event()?.statut === 'inscription');
  peutEditerThemes = computed(() =>
    ['preparation', 'inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? '')
  );
  peutEditerDate = computed(() =>
    ['preparation', 'inscription', 'fermeture_inscriptions'].includes(this.event()?.statut ?? '')
  );

  transitioning = signal(false);
  confirmTransition = signal(false);

  constructor() {
    // Synchronise dateValue depuis Firestore quand l'event charge
    effect(() => {
      const d = this.event()?.date ?? '';
      untracked(() => { this.dateValue = d; });
    });
  }

  // Date
  dateValue = '';
  savingDate = signal(false);

  async saveDate() {
    if (this.savingDate()) return;
    this.savingDate.set(true);
    await this.oneShotService.updateDate(this.id, this.dateValue);
    this.savingDate.set(false);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Thèmes
  newThemeNom = '';
  editingThemeId = signal<string | null>(null);
  editingThemeNom = '';
  savingTheme = signal(false);

  ngOnInit() {
    // Vérifier que l'utilisateur est bien le créateur
    this.authService.currentUserProfile$.subscribe(profile => {
      const ev = this.event();
      if (ev && profile && ev.creatorUid !== profile.uid) {
        this.router.navigate(['/membre/oneshots']);
      }
    });
  }

  async avancer() {
    const next = this.nextStatut();
    if (!next || this.transitioning()) return;
    this.transitioning.set(true);
    this.confirmTransition.set(false);
    await this.oneShotService.updateStatut(this.id, next);
    this.transitioning.set(false);
  }

  async fermerInscriptions() {
    if (this.transitioning()) return;
    this.transitioning.set(true);
    await this.oneShotService.updateStatut(this.id, 'fermeture_inscriptions');
    this.transitioning.set(false);
  }

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

  async deleteTheme(themeId: string) {
    await this.oneShotService.deleteTheme(this.id, themeId);
  }
}
