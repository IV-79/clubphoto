import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../services/auth.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, AsyncPipe, MatMenuModule, MatButtonModule, MatIconModule, MatToolbarModule, MatDividerModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private authService = inject(AuthService);

  mobileMenuOpen = signal(false);

  profile$ = this.authService.currentUserProfile$;

  isAdmin$ = this.profile$.pipe(map(p => p?.role === 'admin'));
  isMembre$ = this.profile$.pipe(map(p => p?.role === 'membre'));
  isLoggedIn$ = this.authService.user$.pipe(map(user => !!user));

  logout() {
    this.authService.logout();
  }
}
