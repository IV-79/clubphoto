import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../../components/header/header';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-member-layout',
  imports: [RouterOutlet, Header],
  template: `
    <app-header />
    <main class="member-content" [class.has-test-banner]="isTestEnv">
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
      .member-content.has-test-banner {
        padding-top: 150px;
        min-height: calc(100vh - 150px);
      }
    `,
  ],
})
export class MemberLayout {
  readonly isTestEnv = !environment.production;
}
