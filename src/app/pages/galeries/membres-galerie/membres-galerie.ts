import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile } from '../../../models/user.model';

@Component({
  selector: 'app-membres-galerie',
  imports: [RouterLink],
  templateUrl: './membres-galerie.html',
  styleUrl: './membres-galerie.css',
})
export class MembresGalerie {
  private authService = inject(AuthService);

  membres = toSignal(
    this.authService.getAllMembers().pipe(
      map(membres => membres.filter((m): m is UserProfile & { photoCouvertureUrl: string } =>
        !!m.photoCouvertureUrl
      ))
    ),
    { initialValue: [] }
  );

  nomComplet(m: UserProfile): string {
    return m.prenom ? `${m.prenom} ${m.nom}` : m.nom;
  }
}
