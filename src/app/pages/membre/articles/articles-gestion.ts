import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ArticleService } from '../../../services/article.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Article, ARTICLE_TYPES, getArticleTypeMeta } from '../../../models/article.model';

const STATUT_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  publie: 'Publié',
  expire: 'Expiré',
};

const STATUT_COLORS: Record<string, string> = {
  brouillon: '#9e9e9e',
  publie: '#2e7d32',
  expire: '#c62828',
};

@Component({
  selector: 'app-articles-gestion',
  imports: [
    RouterLink, DatePipe,
    MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatTooltipModule,
  ],
  template: `
    <div class="page-wrap">
      <div class="page-header">
        <h2 class="page-title">Gestion des articles</h2>
        <a routerLink="/membre/articles/creer" mat-raised-button color="primary">
          <mat-icon>add</mat-icon> Nouvel article
        </a>
      </div>

      @if (articles().length === 0) {
        <div class="empty">
          <mat-icon>article</mat-icon>
          <p>Aucun article pour l'instant.</p>
          <a routerLink="/membre/articles/creer" mat-raised-button color="primary">Créer le premier</a>
        </div>
      } @else {
        <div class="table-wrap">
          <table mat-table [dataSource]="articles()">

            <ng-container matColumnDef="epingle">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let a">
                @if (a.epingle) {
                  <mat-icon class="pin-icon" matTooltip="Épinglé">push_pin</mat-icon>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let a">
                <span class="type-chip"
                  [style.background]="getTypeMeta(a.type).color"
                  [style.color]="'#fff'">
                  {{ getTypeMeta(a.type).label }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="titre">
              <th mat-header-cell *matHeaderCellDef>Titre</th>
              <td mat-cell *matCellDef="let a" class="titre-cell">{{ a.titre }}</td>
            </ng-container>

            <ng-container matColumnDef="portee">
              <th mat-header-cell *matHeaderCellDef>Portée</th>
              <td mat-cell *matCellDef="let a">
                @if (a.portee === 'membre') {
                  <mat-icon matTooltip="Membres uniquement" class="lock-icon">lock</mat-icon>
                } @else {
                  <mat-icon matTooltip="Public" class="pub-icon">public</mat-icon>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="statut">
              <th mat-header-cell *matHeaderCellDef>Statut</th>
              <td mat-cell *matCellDef="let a">
                <span class="statut-chip" [style.background]="statutColor(a.statut)">
                  {{ statutLabel(a.statut) }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let a" class="date-cell">
                {{ a.date ? (a.date | date:'d MMM yy':'':'fr') : '—' }}
              </td>
            </ng-container>

            <ng-container matColumnDef="auteur">
              <th mat-header-cell *matHeaderCellDef>Auteur</th>
              <td mat-cell *matCellDef="let a" class="auteur-cell">{{ a.auteurNom }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let a" class="actions-cell">
                <a [routerLink]="['/membre/articles', a.id, 'editer']" mat-icon-button matTooltip="Modifier">
                  <mat-icon>edit</mat-icon>
                </a>
                <button mat-icon-button color="warn" matTooltip="Supprimer" (click)="delete(a)">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-title { margin: 0; font-size: 1.4rem; font-weight: 600; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; }
    .pin-icon { color: #ffb300; font-size: 18px; width: 18px; height: 18px; }
    .lock-icon { color: #888; font-size: 18px; }
    .pub-icon { color: #43a047; font-size: 18px; }
    .type-chip {
      display: inline-block; padding: 2px 10px; border-radius: 12px;
      font-size: .72rem; font-weight: 600;
    }
    .statut-chip {
      display: inline-block; padding: 2px 10px; border-radius: 12px;
      font-size: .72rem; font-weight: 600; color: #fff;
    }
    .titre-cell { font-weight: 500; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .date-cell { white-space: nowrap; font-size: .82rem; color: #555; }
    .auteur-cell { font-size: .82rem; color: #666; white-space: nowrap; }
    .actions-cell { white-space: nowrap; }
    .empty {
      display: flex; flex-direction: column; align-items: center;
      padding: 60px 24px; gap: 12px; color: #999;
    }
    .empty mat-icon { font-size: 52px; width: 52px; height: 52px; }
  `]
})
export class ArticlesGestion {
  private articleService = inject(ArticleService);
  private confirmService = inject(ConfirmService);
  private snackBar       = inject(MatSnackBar);

  cols = ['epingle', 'type', 'titre', 'portee', 'statut', 'date', 'auteur', 'actions'];

  articles = toSignal(this.articleService.getAllArticles(), { initialValue: [] as Article[] });

  getTypeMeta = getArticleTypeMeta;
  statutLabel = (s: string) => STATUT_LABELS[s] ?? s;
  statutColor = (s: string) => STATUT_COLORS[s] ?? '#9e9e9e';

  async delete(a: Article) {
    const ok = await this.confirmService.confirm(`Supprimer "${a.titre}" ?`);
    if (!ok) return;
    try {
      await this.articleService.deleteArticle(a.id!, a.couvertureStoragePath);
      this.snackBar.open('Article supprimé', '', { duration: 3000 });
    } catch {
      this.snackBar.open('Erreur lors de la suppression', '', { duration: 4000 });
    }
  }
}
