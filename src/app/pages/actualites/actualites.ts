import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { QueryDocumentSnapshot, DocumentData } from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';
import { ArticleService } from '../../services/article.service';
import { ArticleCard } from '../../components/article-card/article-card';
import { ArticleLightbox } from '../../components/article-lightbox/article-lightbox';
import { Article, ArticleType, ARTICLE_TYPES } from '../../models/article.model';

@Component({
  selector: 'app-actualites',
  imports: [RouterLink, MatButtonModule, MatIconModule, ArticleCard, ArticleLightbox],
  template: `
    <div class="page-wrap">
      <div class="page-header">
        <h1 class="page-title">Actualités</h1>
        @if (canEdit()) {
          <a routerLink="/membre/articles/creer" mat-raised-button color="primary">
            <mat-icon>add</mat-icon> Nouvel article
          </a>
        }
      </div>

      <div class="filters">
        <button class="chip" [class.active]="activeType() === null"
          (click)="activeType.set(null)">Tous</button>
        @for (t of types; track t.value) {
          <button class="chip" [class.active]="activeType() === t.value"
            [style.--c]="t.color" (click)="activeType.set(t.value)">
            {{ t.label }}
          </button>
        }
      </div>

      @if (filtered().length === 0 && !loading()) {
        <p class="empty">Aucun article pour le moment.</p>
      } @else {
        <div class="grid">
          @for (a of filtered(); track a.id) {
            <app-article-card [article]="a" [isEditor]="canEdit()" (clicked)="selected.set($event)" />
          }
        </div>
        @if (hasMore()) {
          <div class="load-more">
            <button class="btn-load-more" (click)="loadMore()" [disabled]="loading()">
              {{ loading() ? 'Chargement…' : 'Charger plus' }}
            </button>
          </div>
        }
      }
    </div>

    @if (selected()) {
      <app-article-lightbox [article]="selected()!" (closed)="selected.set(null)" />
    }
  `,
  styles: [`
    .page-wrap { max-width: 1200px; margin: 40px auto; padding: 0 32px; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px; gap: 16px;
    }
    .page-title {
      font-size: 2rem; font-weight: 300; letter-spacing: 1px;
      color: var(--text-accent); border-bottom: 3px solid #ffb300;
      padding-bottom: 8px; display: inline-block; margin: 0;
    }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 28px; }
    .chip {
      border: 2px solid var(--border-medium); background: var(--bg-surface); border-radius: 20px;
      padding: 6px 18px; cursor: pointer; font-size: .83rem; font-weight: 500;
      transition: all .18s; color: var(--text-secondary);
    }
    .chip.active { background: var(--c, var(--text-accent)); color: #fff; border-color: var(--c, var(--text-accent)); }
    .chip:not(.active):hover { background: var(--bg-surface-raised); border-color: var(--border-strong); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 24px;
    }
    .empty { color: var(--text-muted); text-align: center; margin-top: 60px; font-size: 1rem; }
    .load-more { display: flex; justify-content: center; margin-top: 32px; }
    .btn-load-more {
      padding: 10px 32px; border-radius: 24px; border: 2px solid var(--border-medium);
      background: var(--bg-surface); color: var(--text-secondary);
      font-size: .9rem; font-weight: 500; cursor: pointer; transition: all .18s;
    }
    .btn-load-more:hover:not(:disabled) { border-color: var(--text-accent); color: var(--text-accent); }
    .btn-load-more:disabled { opacity: .5; cursor: default; }
  `]
})
export class Actualites {
  private articleService = inject(ArticleService);
  private authService    = inject(AuthService);

  types      = ARTICLE_TYPES;
  activeType = signal<ArticleType | null>(null);
  selected   = signal<Article | null>(null);

  private profile = toSignal(this.authService.currentUserProfile$);
  private readonly role = computed(() => this.profile()?.role ?? null);

  canEdit  = computed(() => this.role() === 'admin' || this.role() === 'contributeur');
  articles = signal<Article[]>([]);
  hasMore  = signal(false);
  loading  = signal(false);
  private cursor = signal<QueryDocumentSnapshot<DocumentData> | null>(null);

  constructor() {
    effect(() => {
      const _role = this.role();
      untracked(() => {
        this.articles.set([]);
        this.cursor.set(null);
        this.hasMore.set(false);
        void this.loadPage(6);
      });
    });
  }

  private async loadPage(pageSize: number) {
    this.loading.set(true);
    try {
      const result = await this.articleService.getArticlesPaged(
        this.role(), pageSize, this.cursor() ?? undefined
      );
      this.articles.update(prev => [...prev, ...result.items]);
      this.cursor.set(result.cursor);
      this.hasMore.set(result.hasMore);
    } finally {
      this.loading.set(false);
    }
  }

  loadMore() { void this.loadPage(3); }

  filtered = computed(() => {
    const type  = this.activeType();
    const today = new Date().toISOString().slice(0, 10);
    const isActivePin = (a: Article) => a.epingle && (!a.date || a.date >= today);
    const all  = this.articles();
    const pins = all.filter(a => isActivePin(a));
    const rest = all.filter(a => !isActivePin(a));
    const list = [...pins, ...rest];
    return type ? list.filter(a => a.type === type) : list;
  });
}
