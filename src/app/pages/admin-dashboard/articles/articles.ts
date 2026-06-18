import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-articles',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="page-header">
      <h2 class="page-title">Articles</h2>
    </div>
    <div class="redirect-card">
      <mat-icon>article</mat-icon>
      <p>La gestion des articles est accessible à tous les rédacteurs.</p>
      <a routerLink="/membre/articles" mat-raised-button color="primary">
        <mat-icon>open_in_new</mat-icon> Gérer les articles
      </a>
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 24px; }
    .page-title { margin: 0; font-size: 1.5rem; font-weight: 500; }
    .redirect-card {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      padding: 60px 24px; background: #fff; border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0,0,0,.1); color: #555;
    }
    .redirect-card mat-icon { font-size: 52px; width: 52px; height: 52px; color: #bdbdbd; }
  `]
})
export class AdminArticles {}
