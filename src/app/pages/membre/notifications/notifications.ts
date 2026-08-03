import { Component, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
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
  private readonly uid = computed(() => this.profile()?.uid ?? null);
  private refreshTick = signal(0);

  private readonly notifTrigger = computed(() => ({ uid: this.uid(), tick: this.refreshTick() }));

  notifications = toSignal(
    toObservable(this.notifTrigger).pipe(
      switchMap(({ uid }) => uid ? this.notifService.getNotifications(uid) : of([] as AppNotification[]))
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
    if (!n.lu) {
      await this.notifService.markAsRead(uid, n.id);
      this.refreshTick.update(t => t + 1);
    }
    if (n.type !== 'admin' && n.lien) this.router.navigateByUrl(n.lien);
  }

  async markAllRead() {
    const uid = this.profile()?.uid;
    if (uid) {
      await this.notifService.markAllAsRead(uid);
      this.refreshTick.update(t => t + 1);
    }
  }

  async deleteNotif(n: AppNotification, event: Event) {
    event.stopPropagation();
    const uid = this.profile()?.uid;
    if (uid) {
      await this.notifService.deleteNotif(uid, n.id);
      this.refreshTick.update(t => t + 1);
    }
  }

  async deleteUnread() {
    const uid = this.profile()?.uid;
    if (uid) {
      await this.notifService.deleteUnread(uid);
      this.refreshTick.update(t => t + 1);
    }
  }

  async deleteAll() {
    const uid = this.profile()?.uid;
    if (uid) {
      await this.notifService.deleteAll(uid);
      this.refreshTick.update(t => t + 1);
    }
  }
}
