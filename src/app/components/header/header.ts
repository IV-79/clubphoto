import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map, of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LoginModalService } from '../../services/login-modal.service';
import { NotificationService } from '../../services/notification.service';
import { AppNotification, NOTIF_ICONS } from '../../models/notification.model';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, AsyncPipe, MatIconModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private authService  = inject(AuthService);
  private notifService = inject(NotificationService);
  private router       = inject(Router);
  private loginModal   = inject(LoginModalService);

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

  // Notifications
  private profile = toSignal(this.authService.currentUserProfile$);

  private notifs$ = this.authService.currentUserProfile$.pipe(
    switchMap(p => p ? this.notifService.getNotifications(p.uid) : of([] as AppNotification[]))
  );
  notifications = toSignal(this.notifs$, { initialValue: [] as AppNotification[] });
  unreadCount   = computed(() => this.notifications().filter(n => !n.lu).length);
  recentNotifs  = computed(() => this.notifications().slice(0, 8));

  notifIcon(type: AppNotification['type']): string {
    return NOTIF_ICONS[type] ?? '🔔';
  }

  formatNotifDate(iso: string): string {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin || 1}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  async navigateFromNotif(n: AppNotification) {
    const uid = this.profile()?.uid;
    if (uid && !n.lu) await this.notifService.markAsRead(uid, n.id);
    this.openMenu.set(null);
    if (n.lien) this.router.navigateByUrl(n.lien);
  }

  async markAllRead() {
    const uid = this.profile()?.uid;
    if (uid) await this.notifService.markAllAsRead(uid);
  }

  logout() { this.authService.logout(); }
}
