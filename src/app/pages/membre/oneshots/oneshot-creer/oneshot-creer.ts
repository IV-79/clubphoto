import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { OneShotService } from '../../../../services/oneshot.service';
import { AuthService } from '../../../../services/auth.service';

@Component({
  selector: 'app-oneshot-creer',
  imports: [FormsModule, RouterLink],
  templateUrl: './oneshot-creer.html',
  styleUrl: './oneshot-creer.css',
})
export class OneShotCreer {
  private oneShotService = inject(OneShotService);
  private authService = inject(AuthService);
  private router = inject(Router);

  profile = toSignal(this.authService.currentUserProfile$);

  titre = '';
  description = '';
  date = '';
  saving = signal(false);

  async submit() {
    const profile = this.profile();
    if (!profile || !this.titre.trim() || this.saving()) return;
    this.saving.set(true);
    const id = await this.oneShotService.create({
      titre: this.titre.trim(),
      description: this.description.trim() || undefined,
      date: this.date || undefined,
      creatorUid: profile.uid,
      nomCreateur: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
    });
    this.saving.set(false);
    this.router.navigate(['/membre/oneshots', id, 'gerer']);
  }
}
