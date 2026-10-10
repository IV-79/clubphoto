import { Injectable, signal } from '@angular/core';

interface ConfirmState {
  message: string;
  title: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

export type TripleChoice = 'primary' | 'secondary' | 'cancel';

interface TripleState {
  message: string;
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  resolve: (v: TripleChoice) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private _state = signal<ConfirmState | null>(null);
  private _tripleState = signal<TripleState | null>(null);
  readonly state = this._state.asReadonly();
  readonly tripleState = this._tripleState.asReadonly();

  confirm(
    message: string,
    title = 'Confirmer la suppression',
    confirmLabel = 'Supprimer',
    danger = true,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this._state.set({ message, title, confirmLabel, danger, resolve });
    });
  }

  respond(value: boolean) {
    this._state()?.resolve(value);
    this._state.set(null);
  }

  confirmTriple(
    message: string,
    title: string,
    primaryLabel: string,
    secondaryLabel: string,
  ): Promise<TripleChoice> {
    return new Promise((resolve) => {
      this._tripleState.set({ message, title, primaryLabel, secondaryLabel, resolve });
    });
  }

  respondTriple(value: TripleChoice) {
    this._tripleState()?.resolve(value);
    this._tripleState.set(null);
  }
}
