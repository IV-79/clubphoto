import { Component, inject, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../services/auth.service';
import { UserSubscriptions, isSubscribed } from '../../../models/notification.model';

@Component({
  selector: 'app-preferences',
  standalone: true,
  imports: [],
  templateUrl: './preferences.html',
  styleUrl: './preferences.css',
})
export class Preferences {
  private authService = inject(AuthService);

  profile = toSignal(this.authService.currentUserProfile$);
  saving  = signal(false);

  subs = computed((): Required<UserSubscriptions> => {
    const s = this.profile()?.subscriptions;
    return {
      oneshots:  isSubscribed(s, 'oneshot'),
      sorties:   isSubscribed(s, 'sortie'),
      defis:       isSubscribed(s, 'defi'),
      expositions: isSubscribed(s, 'exposition'),
      articles:    isSubscribed(s, 'article'),
      reunions:  isSubscribed(s, 'reunion'),
      documents: isSubscribed(s, 'document'),
      likes:     isSubscribed(s, 'like'),
      comments:  isSubscribed(s, 'comment'),
      admin:     isSubscribed(s, 'admin'),
    };
  });

  async toggle(key: keyof UserSubscriptions) {
    const uid = this.profile()?.uid;
    if (!uid || this.saving()) return;
    this.saving.set(true);
    const updated: Required<UserSubscriptions> = { ...this.subs(), [key]: !this.subs()[key] };
    await this.authService.updateProfile(uid, { subscriptions: updated } as any);
    this.saving.set(false);
  }
}
