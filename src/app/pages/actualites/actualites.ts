import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ArticleService } from '../../services/article.service';

@Component({
  selector: 'app-actualites',
  imports: [AsyncPipe, DatePipe, RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  template: `
    <div class="page-wrap">
      <h1 class="page-title">Actualités</h1>
      @if (articles$ | async; as articles) {
        @if (articles.length === 0) {
          <p class="empty">Aucun article publié pour l'instant.</p>
        } @else {
          <div class="list">
            @for (a of articles; track a.id) {
              <mat-card class="item">
                <mat-card-content>
                  <h2>{{ a.titre }}</h2>
                  <p class="date">{{ a.datePublication | date:'d MMMM yyyy':'':'fr' }}</p>
                  <p>{{ a.extrait }}</p>
                </mat-card-content>
                <mat-card-actions>
                  <a [routerLink]="['/actualites', a.id]" mat-button color="primary">Lire la suite</a>
                </mat-card-actions>
              </mat-card>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`.page-wrap{max-width:900px;margin:40px auto;padding:0 24px}.page-title{color:#1a237e;border-bottom:3px solid #ffb300;padding-bottom:8px;display:inline-block}.list{display:flex;flex-direction:column;gap:16px;margin-top:24px}.item{border-radius:8px}.date{color:#888;font-size:.85rem}.empty{color:#999;margin-top:40px;text-align:center}`]
})
export class Actualites {
  articles$ = inject(ArticleService).getAllArticles();
}
