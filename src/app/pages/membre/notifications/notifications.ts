import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { NotificationService } from '../../../services/notification.service';
import { AppNotification, NOTIF_ICONS } from '../../../models/notification.model';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications {
  private authService  = inject(AuthService);
  private notifService = inject(NotificationService);
  private router       = inject(Router);

  profile = toSignal(this.authService.currentUserProfile$);

  notifications = toSignal(
    this.authService.currentUserProfile$.pipe(
      switchMap(p => p ? this.notifService.getNotifications(p.uid) : of([] as AppNotification[]))
    ),
    { initialValue: [] as AppNotification[] }
  );

  unreadCount = computed(() => this.notifications().filter(n => !n.lu).length);

  notifIcon(type: AppNotification['type']): string {
    return NOTIF_ICONS[type] ?? '🔔';
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `il y a ${diffMin || 1} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `il y a ${diffD}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  async onNotifClick(n: AppNotification) {
    const uid = this.profile()?.uid;
    if (!uid) return;
    if (!n.lu) await this.notifService.markAsRead(uid, n.id);
    if (n.lien) this.router.navigate([n.lien]);
  }

  async markAllRead() {
    const uid = this.profile()?.uid;
    if (uid) await this.notifService.markAllAsRead(uid);
  }

  async deleteNotif(n: AppNotification, event: Event) {
    event.stopPropagation();
    const uid = this.profile()?.uid;
    if (uid) await this.notifService.deleteNotif(uid, n.id);
  }

  async deleteAll() {
    const uid = this.profile()?.uid;
    if (uid) await this.notifService.deleteAll(uid);
  }
}
