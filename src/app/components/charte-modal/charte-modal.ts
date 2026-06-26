import { Component, inject, computed } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { marked } from 'marked';
import { CharteService } from '../../services/charte.service';
import { PageContentService } from '../../services/page-content.service';

@Component({
  selector: 'app-charte-modal',
  imports: [],
  templateUrl: './charte-modal.html',
  styleUrl: './charte-modal.css',
})
export class CharteModal {
  private charteService  = inject(CharteService);
  private pageService    = inject(PageContentService);
  private sanitizer      = inject(DomSanitizer);

  private doc = toSignal(this.pageService.getCharteDoc(), {
    initialValue: { contenu: '', charteVersion: 0 }
  });

  safeHtml = computed((): SafeHtml =>
    this.sanitizer.bypassSecurityTrustHtml(
      marked.parse(this.doc().contenu, { async: false }) as string
    )
  );

  accepting = false;

  async accept() {
    this.accepting = true;
    await this.charteService.accept(this.doc().charteVersion);
    this.accepting = false;
  }

  refuse() {
    this.charteService.refuse();
  }
}
