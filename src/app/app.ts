import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LoginModalComponent } from './components/login-modal/login-modal';
import { ConfirmModal } from './components/confirm-modal/confirm-modal';
import { GpsConsentModal } from './components/gps-consent-modal/gps-consent-modal';
import { CharteModal } from './components/charte-modal/charte-modal';
import { CharteService } from './services/charte.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginModalComponent, ConfirmModal, GpsConsentModal, CharteModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('club-photo');

  private charteService = inject(CharteService);
  mustAcceptCharte = toSignal(this.charteService.mustAccept$, { initialValue: false });
}
