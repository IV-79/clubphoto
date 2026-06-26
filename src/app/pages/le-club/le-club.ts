import { Component, inject, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { marked } from 'marked';
import { PageContentService } from '../../services/page-content.service';

function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

@Component({
  selector: 'app-le-club',
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class LeClub {}

@Component({
  selector: 'app-histoire',
  imports: [],
  template: `
    <div class="club-page-wrap">
      <h1 class="club-page-title">Histoire du club</h1>
      @if (loading()) {
        <p class="club-placeholder">Chargement…</p>
      } @else if (raw()) {
        <div class="club-md-content" [innerHTML]="safeHtml()"></div>
      } @else {
        <p class="club-placeholder">Contenu à venir.</p>
      }
    </div>
  `,
  styleUrl: './le-club.css',
})
export class Histoire {
  private pageService = inject(PageContentService);
  private sanitizer   = inject(DomSanitizer);

  raw      = toSignal(this.pageService.getContent('histoire'), { initialValue: null as any });
  loading  = computed(() => this.raw() === null);
  safeHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.raw() ?? ''))
  );
}

@Component({
  selector: 'app-bureau',
  imports: [],
  template: `
    <div class="club-page-wrap">
      <h1 class="club-page-title">Le Bureau</h1>
      @if (loading()) {
        <p class="club-placeholder">Chargement…</p>
      } @else if (raw()) {
        <div class="club-md-content" [innerHTML]="safeHtml()"></div>
      } @else {
        <p class="club-placeholder">Contenu à venir.</p>
      }
    </div>
  `,
  styleUrl: './le-club.css',
})
export class Bureau {
  private pageService = inject(PageContentService);
  private sanitizer   = inject(DomSanitizer);

  raw      = toSignal(this.pageService.getContent('bureau'), { initialValue: null as any });
  loading  = computed(() => this.raw() === null);
  safeHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.raw() ?? ''))
  );
}

@Component({
  selector: 'app-adhesion',
  imports: [],
  template: `
    <div class="club-page-wrap">
      <h1 class="club-page-title">Adhésion</h1>
      @if (loading()) {
        <p class="club-placeholder">Chargement…</p>
      } @else if (raw()) {
        <div class="club-md-content" [innerHTML]="safeHtml()"></div>
      } @else {
        <p class="club-placeholder">Contenu à venir.</p>
      }
    </div>
  `,
  styleUrl: './le-club.css',
})
export class Adhesion {
  private pageService = inject(PageContentService);
  private sanitizer   = inject(DomSanitizer);

  raw      = toSignal(this.pageService.getContent('adhesion'), { initialValue: null as any });
  loading  = computed(() => this.raw() === null);
  safeHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.raw() ?? ''))
  );
}
