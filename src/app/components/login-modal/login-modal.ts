import { Component, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../services/auth.service';
import { LoginModalService } from '../../services/login-modal.service';
import { SuspenduDialogComponent } from '../../shared/suspendu-dialog/suspendu-dialog.component';

@Component({
  selector: 'app-login-modal',
  imports: [FormsModule, RouterLink],
  templateUrl: './login-modal.html',
  styleUrl: './login-modal.css',
})
export class LoginModalComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  readonly modal = inject(LoginModalService);

  email = '';
  password = '';
  error = signal('');
  loading = signal(false);

  resetLoading = signal(false);
  resetMessage = signal('');
  resetSuccess = signal(false);

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.modal.isOpen()) this.close();
  }

  close() {
    this.modal.close();
    this.email = '';
    this.password = '';
    this.error.set('');
    this.resetMessage.set('');
  }

  async submit() {
    if (this.loading()) return;
    this.error.set('');
    this.resetMessage.set('');
    this.loading.set(true);
    try {
      await this.authService.login(this.email, this.password);
      const profile = await this.authService.ensureUserDocument();

      if (profile?.isSuspended) {
        await this.authService.logoutSilent();
        this.modal.close();
        this.dialog.open(SuspenduDialogComponent, { disableClose: true, width: '400px' });
        return;
      }

      const returnUrl = this.modal.returnUrl();
      this.modal.close();
      if (returnUrl) {
        this.router.navigateByUrl(returnUrl);
      } else {
        this.router.navigate([profile?.role === 'admin' ? '/admin' : '/']);
      }
    } catch {
      this.error.set('Identifiants incorrects. Veuillez réessayer.');
    } finally {
      this.loading.set(false);
    }
  }

  async onResetPassword() {
    if (!this.email.trim()) {
      this.resetMessage.set('Renseignez votre email ci-dessus, puis cliquez à nouveau.');
      this.resetSuccess.set(false);
      return;
    }
    this.resetLoading.set(true);
    this.resetMessage.set('');
    this.error.set('');
    try {
      await this.authService.resetPassword(this.email.trim());
      this.resetMessage.set('Email envoyé ! Vérifiez votre boîte mail (et vos spams).');
      this.resetSuccess.set(true);
    } catch {
      this.resetMessage.set('Adresse introuvable ou erreur. Vérifiez l\'email saisi.');
      this.resetSuccess.set(false);
    } finally {
      this.resetLoading.set(false);
    }
  }
}
