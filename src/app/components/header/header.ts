import { Component, inject, signal, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { LoginModalService } from '../../services/login-modal.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, AsyncPipe, MatIconModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private loginModal  = inject(LoginModalService);

  // Desktop dropdowns
  openMenu = signal<string | null>(null);

  toggleMenu(name: string, event: MouseEvent) {
    event.stopPropagation();
    this.openMenu.set(this.openMenu() === name ? null : name);
  }

  @HostListener('document:click')
  closeMenus() { this.openMenu.set(null); }

  // Mobile menu
  mobileMenuOpen    = signal(false);
  mobileOpenSection = signal<string | null>(null);

  toggleMobileSection(section: string) {
    this.mobileOpenSection.set(this.mobileOpenSection() === section ? null : section);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
    this.mobileOpenSection.set(null);
  }

  openLogin() {
    this.loginModal.open(this.router.url);
    this.closeMobileMenu();
  }

  profile$    = this.authService.currentUserProfile$;
  isAdmin$    = this.profile$.pipe(map(p => p?.role === 'admin'));
  isLoggedIn$ = this.authService.user$.pipe(map(user => !!user));

  logout() { this.authService.logout(); }
}
