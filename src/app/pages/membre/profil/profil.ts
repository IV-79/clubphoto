import { Component, inject, signal, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { STYLES_PHOTO } from '../../../models/user.model';

@Component({
  selector: 'app-membre-profil',
  imports: [FormsModule],
  templateUrl: './profil.html',
  styleUrl: './profil.css'
})
export class MembreProfil implements OnInit {
  private authService = inject(AuthService);

  profile = toSignal(this.authService.currentUserProfile$);

  stylesDisponibles = STYLES_PHOTO;

  form = {
    nom: '',
    prenom: '',
    bio: '',
    appareil: '',
    stylesPhoto: [] as string[],
    instagram: '',
    facebook: '',
    siteWeb: '',
  };

  saving = signal(false);
  saved = signal(false);
  error = signal('');

  ngOnInit() {
    this.authService.currentUserProfile$.subscribe(p => {
      if (!p) return;
      this.form.nom        = p.nom ?? '';
      this.form.prenom     = p.prenom ?? '';
      this.form.bio        = p.bio ?? '';
      this.form.appareil   = p.appareil ?? '';
      this.form.stylesPhoto = p.stylesPhoto ? [...p.stylesPhoto] : [];
      this.form.instagram  = p.instagram ?? '';
      this.form.facebook   = p.facebook ?? '';
      this.form.siteWeb    = p.siteWeb ?? '';
    });
  }

  toggleStyle(style: string) {
    const idx = this.form.stylesPhoto.indexOf(style);
    if (idx >= 0) this.form.stylesPhoto.splice(idx, 1);
    else this.form.stylesPhoto.push(style);
  }

  isStyleSelected(style: string): boolean {
    return this.form.stylesPhoto.includes(style);
  }

  async save() {
    const p = this.profile();
    if (!p) return;

    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');

    try {
      await this.authService.updateProfile(p.uid, {
        nom:         this.form.nom.trim(),
        prenom:      this.form.prenom.trim(),
        bio:         this.form.bio.trim(),
        appareil:    this.form.appareil.trim(),
        stylesPhoto: this.form.stylesPhoto,
        instagram:   this.form.instagram.trim(),
        facebook:    this.form.facebook.trim(),
        siteWeb:     this.form.siteWeb.trim(),
      });
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch {
      this.error.set('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      this.saving.set(false);
    }
  }
}
