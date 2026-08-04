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
      <div class="cover">
        @if (article().couvertureUrl) {
          <img [src]="article().couvertureUrl" [alt]="article().titre" loading="lazy" />
        } @else {
          <div class="cover-placeholder placeholder-{{ article().type }}">
            <mat-icon class="placeholder-icon">{{ meta().icon }}</mat-icon>
          </div>
        }
        <span class="type-badge" [style.background]="meta().color">
          <mat-icon>{{ meta().icon }}</mat-icon>{{ meta().label }}
        </span>
        @if (article().portee === 'membre') {
          <span class="membre-badge" title="Membres uniquement"><mat-icon>lock</mat-icon></span>
        }
        @if (isActivePinned()) {
          <span class="pin-badge" title="Épinglé"><mat-icon>push_pin</mat-icon></span>
        }
      </div>
      <div class="body">
        @if (isEditor() && article().statut !== 'publie') {
          <span class="statut-badge" [class.brouillon]="article().statut === 'brouillon'" [class.expire]="article().statut === 'expire'">
            {{ article().statut === 'brouillon' ? 'Brouillon' : 'Expiré' }}
          </span>
        }
        <h3 class="titre">{{ article().titre }}</h3>
        @if (article().date) {
          <p class="meta">📅 {{ article().date | date:'d MMM yyyy':'':'fr' }}</p>
        }
        @if (article().lieu) {
          <p class="meta">
            <mat-icon class="lieu-icon">location_on</mat-icon>
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
      background: var(--bg-surface); box-shadow: 0 2px 8px var(--card-shadow);
      transition: transform .2s, box-shadow .2s;
      display: flex; flex-direction: column;
      position: relative;
    }
    .card:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,.2); }
    .cover {
      position: relative; aspect-ratio: 16/9; overflow: hidden;
      background: var(--bg-surface-raised); flex-shrink: 0;
    }
    .cover img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .cover-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
    }
    .placeholder-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; opacity: 0.35; }
    .placeholder-info      { background: linear-gradient(135deg, rgba(25,118,210,0.08), rgba(25,118,210,0.22)); color: #1976d2; }
    .placeholder-encart    { background: linear-gradient(135deg, rgba(123,31,162,0.08), rgba(123,31,162,0.22)); color: #7b1fa2; }
    .placeholder-expo      { background: linear-gradient(135deg, rgba(230,81,0,0.08),   rgba(230,81,0,0.22));   color: #e65100; }
    .placeholder-evenement { background: linear-gradient(135deg, rgba(46,125,50,0.08),  rgba(46,125,50,0.22));  color: #2e7d32; }
    .placeholder-annonce   { background: linear-gradient(135deg, rgba(245,124,0,0.08),  rgba(245,124,0,0.22));  color: #f57c00; }
    .type-badge {
      position: absolute; bottom: 8px; left: 8px;
      display: inline-flex; align-items: center; gap: 4px;
      color: #fff; padding: 4px 10px; border-radius: 20px;
      font-size: .72rem; font-weight: 600; letter-spacing: .3px;
    }
    .type-badge mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .membre-badge {
      position: absolute; top: 8px; left: 8px;
      background: rgba(0,0,0,.55); color: #ffb300;
      border-radius: 50%; width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
    }
    .membre-badge mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .pin-badge {
      position: absolute; top: 8px; right: 8px;
      background: rgba(0,0,0,.55); color: #ffb300;
      border-radius: 50%; width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
    }
    .pin-badge mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .body { padding: 14px 16px 18px; flex: 1; }
    .titre { margin: 0 0 8px; font-size: .97rem; font-weight: 600; line-height: 1.35; color: var(--text-primary); }
    .meta {
      display: flex; align-items: flex-start; gap: 5px;
      margin: 4px 0 0; font-size: .78rem; color: var(--text-secondary);
    }
    .meta mat-icon { font-size: 13px; width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }
    .lieu-link { color: var(--c-blue); text-decoration: none; }
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
    @media (hover: none) { .card .edit-btn { opacity: 1; } }
    .edit-btn mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .statut-badge {
      display: inline-block; padding: 2px 9px; border-radius: 10px;
      font-size: .68rem; font-weight: 700; letter-spacing: .4px;
      text-transform: uppercase; margin-bottom: 6px;
    }
    .statut-badge.brouillon { background: var(--bg-surface-raised); color: var(--text-muted); }
    .statut-badge.expire    { background: #ffebee; color: #c62828; }
  `]
})
export class ArticleCard {
  article  = input.required<Article>();
  isEditor = input<boolean>(false);
  clicked  = output<Article>();
  meta = computed(() => getArticleTypeMeta(this.article().type));
  isActivePinned = computed(() => {
    const a = this.article();
    const today = new Date().toISOString().slice(0, 10);
    return a.epingle && (!a.date || a.date >= today);
  });

  mapsUrl(lieu: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
  }
}
