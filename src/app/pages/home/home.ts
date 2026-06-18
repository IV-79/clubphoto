import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ArticleService } from '../../services/article.service';

@Component({
  selector: 'app-home',
  imports: [AsyncPipe, DatePipe, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private articleService = inject(ArticleService);

  articles$ = this.articleService.getAllArticles().pipe(
    map(list => list.filter(a => a.statut === 'publie' && a.portee === 'public').slice(0, 6))
  );
}
