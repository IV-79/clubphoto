import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { marked } from 'marked';
import { PageContentService } from '../../../services/page-content.service';

@Component({
  selector: 'app-confidentialite',
  imports: [],
  templateUrl: './confidentialite.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './confidentialite.css',
})
export class Confidentialite {
  private pageService = inject(PageContentService);
  private sanitizer = inject(DomSanitizer);

  raw = toSignal(this.pageService.getContent('confidentialite'), { initialValue: null as any });
  loading = computed(() => this.raw() === null);
  safeHtml = computed(
    (): SafeHtml =>
      this.sanitizer.bypassSecurityTrustHtml(
        marked.parse(this.raw() ?? '', { async: false }) as string,
      ),
  );
}
