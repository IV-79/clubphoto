import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../services/auth.service';
import { LoginModalService } from '../../services/login-modal.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, AsyncPipe, MatMenuModule, MatButtonModule, MatIconModule, MatToolbarModule, MatDividerModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private authService = inject(AuthService);
  private router = inject(Router);
  private loginModal = inject(LoginModalService);

  openLogin() {
    const url = this.router.url;
    this.loginModal.open(url);
    this.closeMobileMenu();
  }

  mobileMenuOpen = signal(false);
  mobileOpenSection = signal<string | null>(null);

  toggleMobileSection(section: string) {
    this.mobileOpenSection.set(this.mobileOpenSection() === section ? null : section);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
    this.mobileOpenSection.set(null);
  }

  profile$ = this.authService.currentUserProfile$;

  isAdmin$ = this.profile$.pipe(map(p => p?.role === 'admin'));
  isMembre$ = this.profile$.pipe(map(p => p?.role === 'membre'));
  isLoggedIn$ = this.authService.user$.pipe(map(user => !!user));

  logout() {
    this.authService.logout();
  }
}
