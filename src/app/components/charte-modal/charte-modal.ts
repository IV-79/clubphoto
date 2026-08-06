import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { marked } from 'marked';
import { CharteService } from '../../services/charte.service';

@Component({
  selector: 'app-charte-modal',
  imports: [FormsModule, RouterLink],
  templateUrl: './charte-modal.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './charte-modal.css',
})
export class CharteModal {
  private charteService = inject(CharteService);
  private sanitizer = inject(DomSanitizer);

  private charteDoc = toSignal(this.charteService.getCharteDoc(), {
    initialValue: { contenu: '', charteVersion: 0 },
  });
  private cguDoc = toSignal(this.charteService.getCguDoc(), {
    initialValue: { contenu: '', cguVersion: 0 },
  });

  mustAcceptCharte = toSignal(this.charteService.mustAcceptCharte$, { initialValue: false });
  mustAcceptCgu = toSignal(this.charteService.mustAcceptCgu$, { initialValue: false });

  charteChecked = false;
  cguChecked = false;

  safeCharteHtml = computed(
    (): SafeHtml =>
      this.sanitizer.bypassSecurityTrustHtml(
        marked.parse(this.charteDoc().contenu, { async: false }) as string,
      ),
  );

  get canAccept(): boolean {
    return (
      (!this.mustAcceptCharte() || this.charteChecked) && (!this.mustAcceptCgu() || this.cguChecked)
    );
  }

  accepting = false;

  async accept() {
    if (!this.canAccept) return;
    this.accepting = true;
    try {
      if (this.mustAcceptCharte()) {
        await this.charteService.acceptCharte(this.charteDoc().charteVersion);
      }
      if (this.mustAcceptCgu()) {
        await this.charteService.acceptCgu(this.cguDoc().cguVersion);
      }
    } finally {
      this.accepting = false;
    }
  }

  refuse() {
    this.charteService.refuse();
  }
}
