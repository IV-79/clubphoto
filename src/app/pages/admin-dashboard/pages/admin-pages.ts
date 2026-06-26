import { Component, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { Auth } from '@angular/fire/auth';
import { PageContentService, PageId } from '../../../services/page-content.service';

const PAGE_LABELS: Record<PageId, string> = {
  histoire: 'Histoire du club',
  bureau:   'Le Bureau',
  adhesion: 'Adhésion',
  charte:   'Charte du site',
  contact:  'Contact',
};

@Component({
  selector: 'app-admin-pages',
  imports: [FormsModule],
  templateUrl: './admin-pages.html',
  styleUrl: './admin-pages.css',
})
export class AdminPages {
  private pageService = inject(PageContentService);
  private auth        = inject(Auth);

  readonly pages: PageId[] = ['histoire', 'bureau', 'adhesion', 'charte', 'contact'];
  readonly pageLabels = PAGE_LABELS;

  currentPage = signal<PageId>('histoire');
  pageLabel   = computed(() => PAGE_LABELS[this.currentPage()]);

  saving  = signal(false);
  saved   = signal(false);

  editorValue   = '';
  forceReaccept = false;

  loaded = toSignal(
    toObservable(this.currentPage).pipe(
      switchMap(id => this.pageService.getContent(id))
    ),
    { initialValue: null as any }
  );

  constructor() {
    effect(() => {
      const c = this.loaded() as string | null;
      if (c !== null) this.editorValue = c;
    });
  }

  selectPage(page: PageId) {
    if (page === this.currentPage()) return;
    this.currentPage.set(page);
    this.saved.set(false);
  }

  async save() {
    this.saving.set(true);
    this.saved.set(false);
    try {
      const uid = this.auth.currentUser?.uid ?? '';
      await this.pageService.saveContent(this.currentPage(), this.editorValue, uid);
      if (this.forceReaccept && this.currentPage() === 'charte') {
        await this.pageService.bumpCharteVersion();
        this.forceReaccept = false;
      }
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } finally {
      this.saving.set(false);
    }
  }
}
