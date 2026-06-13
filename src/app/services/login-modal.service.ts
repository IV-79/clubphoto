import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoginModalService {
  isOpen = signal(false);
  returnUrl = signal<string | null>(null);

  open(returnUrl?: string) {
    this.returnUrl.set(returnUrl ?? null);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
    this.returnUrl.set(null);
  }
}
