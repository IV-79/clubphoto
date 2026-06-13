import { Injectable, signal } from '@angular/core';

interface ConfirmState {
  message: string;
  title: string;
  resolve: (v: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private _state = signal<ConfirmState | null>(null);
  readonly state = this._state.asReadonly();

  confirm(message: string, title = 'Confirmer la suppression'): Promise<boolean> {
    return new Promise(resolve => {
      this._state.set({ message, title, resolve });
    });
  }

  respond(value: boolean) {
    this._state()?.resolve(value);
    this._state.set(null);
  }
}
