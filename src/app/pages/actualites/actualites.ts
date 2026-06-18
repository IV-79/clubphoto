import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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

      @if (articles().length === 0) {
        <p class="empty">Aucun article pour le moment.</p>
      } @else {
        <div class="grid">
          @for (a of filtered(); track a.id) {
            <app-article-card [article]="a" [isEditor]="canEdit()" (clicked)="selected.set($event)" />
          }
        </div>
      }
    </div>

    @if (selected()) {
      <app-article-lightbox [article]="selected()!" (closed)="selected.set(null)" />
    }
  `,
  styles: [`
    .page-wrap { max-width: 1100px; margin: 40px auto; padding: 0 24px; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 28px; gap: 16px;
    }
    .page-title {
      color: #1a237e; border-bottom: 3px solid #ffb300;
      padding-bottom: 8px; display: inline-block; margin: 0;
    }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 28px; }
    .chip {
      border: 2px solid #e0e0e0; background: #fff; border-radius: 20px;
      padding: 6px 18px; cursor: pointer; font-size: .83rem; font-weight: 500;
      transition: all .18s; color: #444;
    }
    .chip.active { background: var(--c, #1a237e); color: #fff; border-color: var(--c, #1a237e); }
    .chip:not(.active):hover { background: #f5f5f5; border-color: #ccc; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 24px;
    }
    .empty { color: #999; text-align: center; margin-top: 60px; font-size: 1rem; }
  `]
})
export class Actualites {
  private articleService = inject(ArticleService);
  private authService    = inject(AuthService);

  types      = ARTICLE_TYPES;
  activeType = signal<ArticleType | null>(null);
  selected   = signal<Article | null>(null);

  private profile = toSignal(this.authService.currentUserProfile$);

  canEdit = computed(() => {
    const role = this.profile()?.role;
    return role === 'admin' || role === 'redacteur';
  });

  articles = toSignal(
    this.authService.user$.pipe(
      switchMap(user =>
        this.articleService.getAllArticles().pipe(
          map(list => list.filter(a =>
            a.statut === 'publie' && (user ? true : a.portee === 'public')
          ))
        )
      )
    ),
    { initialValue: [] as Article[] }
  );

  filtered = computed(() => {
    const type = this.activeType();
    const list = [...this.articles()].sort((a, b) =>
      (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0)
    );
    return type ? list.filter(a => a.type === type) : list;
  });
}
