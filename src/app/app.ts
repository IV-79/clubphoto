import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginModalComponent } from './components/login-modal/login-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('club-photo');
}
