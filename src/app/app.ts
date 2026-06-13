import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginModalComponent } from './components/login-modal/login-modal';
import { ConfirmModal } from './components/confirm-modal/confirm-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginModalComponent, ConfirmModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('club-photo');
}
