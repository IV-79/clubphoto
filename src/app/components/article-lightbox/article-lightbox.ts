import { Component, input, output, computed, inject, OnInit, OnDestroy, HostListener } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { toSignal } from '@angular/core/rxjs-interop';
import { Article, getArticleTypeMeta } from '../../models/article.model';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-article-lightbox',
  imports: [DatePipe, MatIconModule, MatButtonModule],
  template: `
    <div class="lb-overlay" (click)="onOverlayClick($event)">
      <div class="lb-panel">
        <div class="lb-top-actions">
          <button class="lb-close" (click)="closed.emit()" aria-label="Fermer">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        @if (article().couvertureUrl) {
          <div class="lb-cover">
            <img [src]="article().couvertureUrl" [alt]="article().titre" />
          </div>
        }

        <div class="lb-content">
          <div class="lb-chips">
            <span class="chip-type" [style.background]="meta().color">
              <mat-icon>{{ meta().icon }}</mat-icon>{{ meta().label }}
            </span>
            @if (article().epingle) {
              <span class="chip-info"><mat-icon>push_pin</mat-icon>Épinglé</span>
            }
            @if (article().portee === 'membre') {
              <span class="chip-info"><mat-icon>lock</mat-icon>Membres</span>
            }
          </div>

          <h2 class="lb-titre">{{ article().titre }}</h2>

          <div class="lb-meta-row">
            @if (article().date) {
              <span class="lb-meta">
                <mat-icon>calendar_today</mat-icon>
                {{ article().date | date:'d MMMM yyyy':'':'fr' }}
              </span>
            }
            @if (profile() && article().lieu) {
              <span class="lb-meta">
                <mat-icon>place</mat-icon>
                <a [href]="mapsUrl(article().lieu!)" target="_blank" rel="noopener noreferrer" class="lieu-link">
                  {{ article().lieu }}
                </a>
              </span>
            }
            <span class="lb-meta lb-auteur">
              <mat-icon>person</mat-icon>{{ article().auteurNom }}
            </span>
          </div>

          @if (article().description) {
            <div class="lb-description">{{ article().description }}</div>
          }

          @if (article().lienExterne) {
            <a [href]="article().lienExterne" target="_blank" rel="noopener noreferrer"
               mat-raised-button color="primary" class="lb-link-btn">
              <mat-icon>open_in_new</mat-icon> En savoir plus
            </a>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lb-overlay {
      position: fixed; inset: 0; z-index: 1200;
      background: rgba(0,0,0,.75);
      display: flex; align-items: center; justify-content: center;
      padding: 16px; animation: fadeIn .15s ease;
    }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    .lb-panel {
      background: var(--bg-surface); border-radius: 16px; overflow: hidden;
      max-width: 680px; width: 100%; max-height: 90vh;
      overflow-y: auto; position: relative;
      animation: slideUp .2s ease;
    }
    @keyframes slideUp { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }
    .lb-top-actions {
      position: sticky; top: 0; z-index: 10;
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 12px 0; background: transparent;
    }
    .lb-close {
      background: rgba(0,0,0,.45); border: none; cursor: pointer;
      border-radius: 50%; width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center; color: #fff;
      transition: background .15s;
    }
    .lb-close:hover { background: rgba(0,0,0,.7); }
    .lb-cover { overflow: hidden; background: var(--bg-surface-raised); }
    .lb-cover img { width: 100%; height: auto; display: block; }
    .lb-content { padding: 20px 24px 28px; }
    .lb-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .chip-type {
      display: inline-flex; align-items: center; gap: 5px;
      color: #fff; padding: 4px 12px; border-radius: 20px;
      font-size: .78rem; font-weight: 600;
    }
    .chip-type mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .chip-info {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: .78rem; color: var(--text-secondary); padding: 4px 10px;
      background: var(--bg-surface-raised); border-radius: 20px;
    }
    .chip-info mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .lb-titre { margin: 0 0 14px; font-size: 1.45rem; font-weight: 700; line-height: 1.3; color: var(--text-primary); }
    .lb-meta-row { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 18px; }
    .lb-meta {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: .83rem; color: var(--text-secondary);
    }
    .lb-meta mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .lb-auteur { color: var(--text-muted); }
    .lieu-link { color: var(--c-blue); text-decoration: none; }
    .lieu-link:hover { text-decoration: underline; }
    .lb-description {
      font-size: .95rem; line-height: 1.75; color: var(--text-primary);
      white-space: pre-wrap; margin-bottom: 22px;
    }
    .lb-link-btn { display: inline-flex; align-items: center; gap: 6px; }
  `]
})
export class ArticleLightbox implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  profile = toSignal(this.authService.currentUserProfile$);

  article = input.required<Article>();
  closed  = output<void>();
  meta = computed(() => getArticleTypeMeta(this.article().type));

  ngOnInit()    { document.body.style.overflow = 'hidden'; }
  ngOnDestroy() { document.body.style.overflow = ''; }

  mapsUrl(lieu: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.closed.emit(); }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('lb-overlay')) this.closed.emit();
  }
}
