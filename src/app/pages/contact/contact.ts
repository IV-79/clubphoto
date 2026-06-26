import { Component, inject, computed } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { marked } from 'marked';
import { PageContentService } from '../../services/page-content.service';

@Component({
  selector: 'app-contact',
  imports: [],
  template: `
    <div class="contact-wrap">
      <h1 class="contact-title">Contact</h1>
      @if (loading()) {
        <p class="contact-placeholder">Chargement…</p>
      } @else if (raw()) {
        <div class="club-md-content" [innerHTML]="safeHtml()"></div>
      } @else {
        <p class="contact-placeholder">Contenu à venir.</p>
      }
    </div>
  `,
  styleUrl: './contact.css',
})
export class Contact {
  private pageService = inject(PageContentService);
  private sanitizer   = inject(DomSanitizer);

  raw      = toSignal(this.pageService.getContent('contact'), { initialValue: null as any });
  loading  = computed(() => this.raw() === null);
  safeHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(
      marked.parse(this.raw() ?? '', { async: false }) as string
    )
  );
}
