import { Component, ChangeDetectionStrategy } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .member-content {
        min-height: calc(100vh - 122px);
        background: var(--bg-page);
        padding-top: 122px;
      }
    `,
  ],
})
export class MemberLayout {}
