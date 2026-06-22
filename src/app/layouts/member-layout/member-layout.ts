import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../../components/header/header';

@Component({
  selector: 'app-member-layout',
  imports: [RouterOutlet, Header],
  template: `
    <app-header />
    <main class="member-content">
      <router-outlet />
    </main>
  `,
  styles: [`
    .member-content {
      min-height: calc(100vh - 122px);
      background: #fff;
      padding-top: 122px;
    }
  `]
})
export class MemberLayout {}
