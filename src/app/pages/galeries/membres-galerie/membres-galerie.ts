import { Component, inject, computed } from '@angular/core';
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
      map(membres => membres.sort((a, b) => this.nomComplet(a).localeCompare(this.nomComplet(b), 'fr')))
    ),
    { initialValue: [] as UserProfile[] }
  );

  profile    = toSignal(this.authService.currentUserProfile$);
  isLoggedIn = computed(() => !!this.profile());

  membres = computed(() => {
    const loggedIn = this.isLoggedIn();
    return this.allMembres().filter(m =>
      (m.photoCount ?? 0) > 0 &&
      (loggedIn || (m.visibilite ?? 'public') === 'public')
    );
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
