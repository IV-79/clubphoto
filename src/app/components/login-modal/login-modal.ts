import { Component, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoginModalService } from '../../services/login-modal.service';

@Component({
  selector: 'app-login-modal',
  imports: [FormsModule, RouterLink],
  templateUrl: './login-modal.html',
  styleUrl: './login-modal.css',
})
export class LoginModalComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly modal = inject(LoginModalService);

  email = '';
  password = '';
  error = signal('');
  loading = signal(false);

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.modal.isOpen()) this.close();
  }

  close() {
    this.modal.close();
    this.email = '';
    this.password = '';
    this.error.set('');
  }

  async submit() {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    try {
      await this.authService.login(this.email, this.password);
      const returnUrl = this.modal.returnUrl();
      this.modal.close();
      if (returnUrl) {
        this.router.navigateByUrl(returnUrl);
      } else {
        const profile = await this.authService.ensureUserDocument();
        this.router.navigate([profile?.role === 'admin' ? '/admin' : '/']);
      }
    } catch {
      this.error.set('Identifiants incorrects. Veuillez réessayer.');
    } finally {
      this.loading.set(false);
    }
  }
}
