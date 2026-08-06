import { Component, inject, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile } from '../../../models/user.model';
import { ImgRetryDirective } from '../../../directives/img-retry.directive';

@Component({
  selector: 'app-membres-galerie',
  imports: [RouterLink, ImgRetryDirective],
  templateUrl: './membres-galerie.html',
  styleUrl: './membres-galerie.css',
})
export class MembresGalerie {
  private authService = inject(AuthService);

  private allMembres = toSignal(
    this.authService.getAllMembersOnce().pipe(
      map(membres => {
        for (let i = membres.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [membres[i], membres[j]] = [membres[j], membres[i]];
        }
        return membres;
      })
    ),
    { initialValue: [] as UserProfile[] }
  );

  profile    = toSignal(this.authService.currentUserProfile$);
  isLoggedIn = computed(() => !!this.profile());

  filtre = signal('');

  membres = computed(() => {
    const loggedIn = this.isLoggedIn();
    const q = this.filtre().trim().toLowerCase();
    return this.allMembres().filter(m => {
      if ((m.photoCount ?? 0) === 0) return false;
      if (!loggedIn && (m.visibilite ?? 'public') !== 'public') return false;
      if (!q) return true;
      const nom = this.nomComplet(m).toLowerCase();
      const styles = (m.stylesPhoto ?? []).join(' ').toLowerCase();
      return nom.includes(q) || styles.includes(q);
    });
  });

  nomComplet(m: UserProfile): string {
    return m.prenom ? `${m.prenom} ${m.nom ?? ''}` : (m.nom ?? '');
  }

  initiales(m: UserProfile): string {
    const p = m.prenom?.[0] ?? '';
    const n = m.nom?.[0] ?? '';
    return (p + n).toUpperCase() || '?';
  }
}
