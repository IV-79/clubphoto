import { Component, inject, computed } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { marked } from 'marked';
import { PageContentService } from '../../../services/page-content.service';

@Component({
  selector: 'app-cgu',
  imports: [],
  templateUrl: './cgu.html',
  styleUrl: './cgu.css',
})
export class CGU {
  private pageService = inject(PageContentService);
  private sanitizer   = inject(DomSanitizer);

  raw      = toSignal(this.pageService.getContent('cgv'), { initialValue: null as any });
  loading  = computed(() => this.raw() === null);
  safeHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(
      marked.parse(this.raw() ?? '', { async: false }) as string
    )
  );
}
