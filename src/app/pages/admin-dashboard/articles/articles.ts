import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-articles',
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  template: `
    <div class="page-header">
      <h2 class="page-title">Articles</h2>
      <button mat-raised-button color="primary">
        <mat-icon>add</mat-icon> Nouvel article
      </button>
    </div>
    <mat-card>
      <mat-card-content>
        <div class="empty-state">
          <mat-icon>article</mat-icon>
          <p>Aucun article pour l'instant.</p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.page-title{margin:0;font-size:1.5rem;font-weight:500}.empty-state{display:flex;flex-direction:column;align-items:center;padding:48px;color:#999}.empty-state mat-icon{font-size:48px;width:48px;height:48px;margin-bottom:12px}`]
})
export class AdminArticles {}
