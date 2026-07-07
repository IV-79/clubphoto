import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class DarkModeService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isDark = signal<boolean>(this.initialValue());

  constructor() {
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light');
        localStorage.setItem('color-scheme', this.isDark() ? 'dark' : 'light');
      }
    });
  }

  toggle() { this.isDark.update(v => !v); }

  private initialValue(): boolean {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('color-scheme');
    if (stored) return stored === 'dark';
    return true; // défaut : mode sombre
  }
}
