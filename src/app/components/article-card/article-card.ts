import { Component, input, output, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Article, getArticleTypeMeta } from '../../models/article.model';

@Component({
  selector: 'app-article-card',
  imports: [DatePipe, RouterLink, MatIconModule, MatButtonModule],
  template: `
    <div class="card" (click)="clicked.emit(article())">
      @if (isEditor()) {
        <a class="edit-btn" [routerLink]="['/membre/articles', article().id, 'editer']"
           mat-icon-button title="Modifier" (click)="$event.stopPropagation()">
          <mat-icon>edit</mat-icon>
        </a>
      }
      @if (article().couvertureUrl) {
        <div class="cover">
          <img [src]="article().couvertureUrl" [alt]="article().titre" loading="lazy" />
          <span class="type-badge" [style.background]="meta().color">
            <mat-icon>{{ meta().icon }}</mat-icon>{{ meta().label }}
          </span>
          @if (article().epingle) {
            <span class="pin-badge" title="Épinglé"><mat-icon>push_pin</mat-icon></span>
          }
          @if (article().portee === 'membre') {
            <span class="membre-badge" title="Membres uniquement"><mat-icon>lock</mat-icon></span>
          }
        </div>
      }
      <div class="body">
        @if (!article().couvertureUrl) {
          <div class="no-cover-header">
            <span class="type-badge-inline" [style.background]="meta().color">
              <mat-icon>{{ meta().icon }}</mat-icon>{{ meta().label }}
            </span>
            <div class="no-cover-icons">
              @if (article().epingle) {
                <span title="Épinglé"><mat-icon class="pin-icon">push_pin</mat-icon></span>
              }
              @if (article().portee === 'membre') {
                <span title="Membres uniquement"><mat-icon class="lock-icon">lock</mat-icon></span>
              }
            </div>
          </div>
        }
        <h3 class="titre">{{ article().titre }}</h3>
        @if (article().date) {
          <p class="meta"><mat-icon>calendar_today</mat-icon>{{ article().date | date:'d MMM yyyy':'':'fr' }}</p>
        }
        @if (article().lieu) {
          <p class="meta">
            <mat-icon>place</mat-icon>
            <a [href]="mapsUrl(article().lieu!)" target="_blank" rel="noopener noreferrer"
               class="lieu-link" (click)="$event.stopPropagation()">{{ article().lieu }}</a>
          </p>
        }
      </div>
    </div>
  `,
  styles: [`
    .card {
      cursor: pointer; border-radius: 12px; overflow: hidden;
      background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.12);
      transition: transform .2s, box-shadow .2s;
      display: flex; flex-direction: column;
      position: relative;
    }
    .card:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,.2); }
    .cover {
      position: relative; aspect-ratio: 16/9; overflow: hidden;
      background: #f0f0f0; flex-shrink: 0;
    }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .type-badge {
      position: absolute; bottom: 8px; left: 8px;
      display: inline-flex; align-items: center; gap: 4px;
      color: #fff; padding: 4px 10px; border-radius: 20px;
      font-size: .72rem; font-weight: 600; letter-spacing: .3px;
    }
    .type-badge mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .pin-badge, .membre-badge {
      position: absolute; top: 8px;
      background: rgba(0,0,0,.55); color: #fff;
      border-radius: 50%; width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
    }
    .pin-badge { right: 8px; color: #ffb300; }
    .membre-badge { left: 8px; color: #ffb300; }
    .pin-badge mat-icon, .membre-badge mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .body { padding: 14px 16px 18px; flex: 1; }
    .no-cover-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .type-badge-inline {
      display: inline-flex; align-items: center; gap: 4px;
      color: #fff; padding: 4px 10px; border-radius: 20px;
      font-size: .72rem; font-weight: 600;
    }
    .type-badge-inline mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .no-cover-icons { display: flex; gap: 4px; align-items: center; }
    .pin-icon { color: #ffb300; font-size: 18px; width: 18px; height: 18px; }
    .lock-icon { color: #888; font-size: 18px; width: 18px; height: 18px; }
    .titre { margin: 0 0 8px; font-size: .97rem; font-weight: 600; line-height: 1.35; color: #1a1a1a; }
    .meta {
      display: flex; align-items: flex-start; gap: 5px;
      margin: 4px 0 0; font-size: .78rem; color: #666;
    }
    .meta mat-icon { font-size: 13px; width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }
    .lieu-link { color: inherit; text-decoration: none; }
    .lieu-link:hover { text-decoration: underline; }
    .edit-btn {
      position: absolute; top: 8px; right: 8px; z-index: 10;
      background: rgba(255,255,255,.92); color: #1976d2;
      border-radius: 50%; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .18s;
      box-shadow: 0 1px 4px rgba(0,0,0,.18);
      text-decoration: none;
    }
    .card:hover .edit-btn { opacity: 1; }
    .edit-btn mat-icon { font-size: 17px; width: 17px; height: 17px; }
  `]
})
export class ArticleCard {
  article  = input.required<Article>();
  isEditor = input<boolean>(false);
  clicked  = output<Article>();
  meta = computed(() => getArticleTypeMeta(this.article().type));

  mapsUrl(lieu: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
  }
}
