import { Injectable, signal } from '@angular/core';

interface GpsConsentState {
  resolve: (keep: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class GpsConsentService {
  private _state = signal<GpsConsentState | null>(null);
  readonly state = this._state.asReadonly();

  requestConsent(): Promise<boolean> {
    return new Promise((resolve) => {
      this._state.set({ resolve });
    });
  }

  respond(keep: boolean) {
    this._state()?.resolve(keep);
    this._state.set(null);
  }
}
