import { Injectable, signal } from '@angular/core';

interface ConfirmState {
  message: string;
  title: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private _state = signal<ConfirmState | null>(null);
  readonly state = this._state.asReadonly();

  confirm(message: string, title = 'Confirmer la suppression', confirmLabel = 'Supprimer', danger = true): Promise<boolean> {
    return new Promise(resolve => {
      this._state.set({ message, title, confirmLabel, danger, resolve });
    });
  }

  respond(value: boolean) {
    this._state()?.resolve(value);
    this._state.set(null);
  }
}
