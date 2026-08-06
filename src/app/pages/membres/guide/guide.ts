import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

type Tab = 'general' | 'membres' | 'contributeurs' | 'admins';

@Component({
  selector: 'app-guide',
  imports: [RouterLink, MatIconModule],
  templateUrl: './guide.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './guide.css',
})
export class MembresGuide {
  activeTab = signal<Tab>('general');

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
