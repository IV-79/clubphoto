import {
  Component,
  inject,
  signal,
  OnInit,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { STYLES_PHOTO, UserProfile } from '../../../models/user.model';
import { compressImage, COMPRESS_AVATAR, COMPRESS_BANDEAU } from '../../../utils/image-compress';

@Component({
  selector: 'app-membre-profil',
  imports: [FormsModule],
  templateUrl: './profil.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './profil.css',
})
export class MembreProfil implements OnInit {
  @ViewChild('profilInput') profilInput!: ElementRef<HTMLInputElement>;
  @ViewChild('bandeauInput') bandeauInput!: ElementRef<HTMLInputElement>;

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
    px500: '',
    flickr: '',
    siteWeb: '',
    visibilite: 'public' as 'public' | 'membre',
  };

  saving = signal(false);
  saved = signal(false);
  error = signal('');

  pwModalOpen = signal(false);
  pwForm = { current: '', newPw: '', confirm: '' };
  pwSaving = signal(false);
  pwSaved = signal(false);
  pwError = signal('');

  profilFile = signal<File | null>(null);
  profilPreviewUrl = signal('');
  uploadingProfil = signal(false);

  bandeauFile = signal<File | null>(null);
  bandeauPreviewUrl = signal('');
  uploadingBandeau = signal(false);

  ngOnInit() {
    this.authService.currentUserProfile$.subscribe((p) => {
      if (!p) return;
      this.form.nom = p.nom ?? '';
      this.form.prenom = p.prenom ?? '';
      this.form.bio = p.bio ?? '';
      this.form.appareil = p.appareil ?? '';
      this.form.stylesPhoto = p.stylesPhoto ? [...p.stylesPhoto] : [];
      this.form.instagram = p.instagram ?? '';
      this.form.facebook = p.facebook ?? '';
      this.form.px500 = p.px500 ?? '';
      this.form.flickr = p.flickr ?? '';
      this.form.siteWeb = p.siteWeb ?? '';
      this.form.visibilite = p.visibilite ?? 'public';
    });
  }

  initiales(): string {
    const p = this.profile();
    if (!p) return '?';
    return ((p.prenom?.[0] ?? '') + (p.nom?.[0] ?? '')).toUpperCase() || '?';
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
        nom: this.form.nom.trim(),
        prenom: this.form.prenom.trim(),
        bio: this.form.bio.trim(),
        appareil: this.form.appareil.trim(),
        stylesPhoto: this.form.stylesPhoto,
        instagram: this.form.instagram.trim(),
        facebook: this.form.facebook.trim(),
        px500: this.form.px500.trim(),
        flickr: this.form.flickr.trim(),
        siteWeb: this.form.siteWeb.trim(),
        visibilite: this.form.visibilite,
      });
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch {
      this.error.set('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      this.saving.set(false);
    }
  }

  openPwModal() {
    this.pwForm = { current: '', newPw: '', confirm: '' };
    this.pwError.set('');
    this.pwSaved.set(false);
    this.pwModalOpen.set(true);
  }

  closePwModal() {
    if (this.pwSaving()) return;
    this.pwModalOpen.set(false);
  }

  async changePassword() {
    if (this.pwForm.newPw !== this.pwForm.confirm) {
      this.pwError.set('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }
    if (this.pwForm.newPw.length < 6) {
      this.pwError.set('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    this.pwSaving.set(true);
    this.pwSaved.set(false);
    this.pwError.set('');
    try {
      await this.authService.changePassword(this.pwForm.current, this.pwForm.newPw);
      this.pwSaved.set(true);
      this.pwForm = { current: '', newPw: '', confirm: '' };
      setTimeout(() => {
        this.pwSaved.set(false);
        this.pwModalOpen.set(false);
      }, 1500);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        this.pwError.set('Mot de passe actuel incorrect.');
      } else {
        this.pwError.set('Erreur lors du changement. Réessayez.');
      }
    } finally {
      this.pwSaving.set(false);
    }
  }

  // --- Photo de profil ---
  async onProfilSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, COMPRESS_AVATAR);
    this.profilFile.set(compressed);
    const reader = new FileReader();
    reader.onload = (e) => this.profilPreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(compressed);
  }

  cancelProfil() {
    this.profilFile.set(null);
    this.profilPreviewUrl.set('');
    if (this.profilInput?.nativeElement) this.profilInput.nativeElement.value = '';
  }

  saveProfil() {
    const file = this.profilFile();
    const profile = this.profile();
    if (!file || !profile || this.uploadingProfil()) return;
    this.uploadingProfil.set(true);
    this.authService.uploadUserPhoto(profile.uid, file, 'profil').subscribe({
      next: async (state) => {
        if (state.state === 'done' && state.url) {
          await this.authService.updateProfile(profile.uid, { photoProfilUrl: state.url });
          this.cancelProfil();
          this.uploadingProfil.set(false);
        }
      },
      error: () => this.uploadingProfil.set(false),
    });
  }

  // --- Photo bandeau ---
  async onBandeauSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, COMPRESS_BANDEAU);
    this.bandeauFile.set(compressed);
    const reader = new FileReader();
    reader.onload = (e) => this.bandeauPreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(compressed);
  }

  cancelBandeau() {
    this.bandeauFile.set(null);
    this.bandeauPreviewUrl.set('');
    if (this.bandeauInput?.nativeElement) this.bandeauInput.nativeElement.value = '';
  }

  saveBandeau() {
    const file = this.bandeauFile();
    const profile = this.profile();
    if (!file || !profile || this.uploadingBandeau()) return;
    this.uploadingBandeau.set(true);
    this.authService.uploadUserPhoto(profile.uid, file, 'bandeau').subscribe({
      next: async (state) => {
        if (state.state === 'done' && state.url) {
          await this.authService.updateProfile(profile.uid, { photoBandeauUrl: state.url });
          this.cancelBandeau();
          this.uploadingBandeau.set(false);
        }
      },
      error: () => this.uploadingBandeau.set(false),
    });
  }
}
