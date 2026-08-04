import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { SortieService } from '../../../services/sortie.service';
import { ArticleService } from '../../../services/article.service';

interface MemberBar  { nom: string; total: number; }
interface StorageItem { label: string; color: string; bytes: number; pct: number; }

@Component({
  selector: 'app-overview',
  imports: [MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class Overview implements OnInit {
  private authService    = inject(AuthService);
  private sortieService  = inject(SortieService);
  private articleService = inject(ArticleService);

  loading  = signal(true);
  hasError = signal(false);

  totalMembres  = signal(0);
  membresActifs = signal(0);
  suspendus     = signal(0);
  activePct     = signal(0);
  roleBreakdown = signal({ admin: 0, contributeur: 0, membre: 0 });
  totalSorties  = signal(0);
  totalArticles = signal(0);

  storageTotal = signal(0);
  storageByCat = signal({ portfolio: 0, themes: 0, oneshots: 0, defis: 0, documents: 0 });
  topMembers   = signal<MemberBar[]>([]);

  storageItems = computed<StorageItem[]>(() => {
    const cat   = this.storageByCat();
    const total = this.storageTotal() || 1;
    return [
      { label: 'Portfolio',      color: '#3b82f6', bytes: cat.portfolio, pct: Math.round(cat.portfolio / total * 100) },
      { label: 'Thèmes du mois', color: '#10b981', bytes: cat.themes,    pct: Math.round(cat.themes    / total * 100) },
      { label: 'One-shots',      color: '#f59e0b', bytes: cat.oneshots,  pct: Math.round(cat.oneshots  / total * 100) },
      { label: 'Défis',          color: '#ef4444', bytes: cat.defis,     pct: Math.round(cat.defis     / total * 100) },
      { label: 'Documents',      color: '#8b5cf6', bytes: cat.documents, pct: Math.round(cat.documents / total * 100) },
    ];
  });

  donutGradient = computed(() => {
    if (this.storageTotal() === 0) return 'conic-gradient(var(--border-medium) 0% 100%)';
    let cursor = 0;
    const stops = this.storageItems().map(item => {
      const from = cursor;
      cursor += item.pct;
      return `${item.color} ${from}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });

  maxMemberStorage = computed(() => this.topMembers()[0]?.total ?? 1);

  // ── Cleanup ──────────────────────────────────────────────────────────────

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.hasError.set(false);

    const now    = new Date();
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);

    forkJoin({
      membres:  this.authService.getAllMembersOnce(),
      sorties:  this.sortieService.getSortiesOnce(),
      articles: this.articleService.getAllArticles(),
    }).subscribe({
      next: ({ membres, sorties, articles }) => {
        const actifs = membres.filter(m =>
          !m.isSuspended && m.derniereConnexion && new Date(m.derniereConnexion) >= cutoff
        ).length;
        this.totalMembres.set(membres.length);
        this.membresActifs.set(actifs);
        this.suspendus.set(membres.filter(m => m.isSuspended).length);
        this.activePct.set(membres.length > 0 ? Math.round(actifs / membres.length * 100) : 0);
        this.roleBreakdown.set({
          admin:        membres.filter(m => m.role === 'admin').length,
          contributeur: membres.filter(m => m.role === 'contributeur').length,
          membre:       membres.filter(m => m.role === 'membre').length,
        });
        this.totalArticles.set(articles.filter(a => a.statut === 'publie').length);
        this.totalSorties.set(sorties.length);

        const cat = { portfolio: 0, themes: 0, oneshots: 0, defis: 0, documents: 0 };
        membres.forEach(m => {
          cat.portfolio += m.storageUsed?.portfolio ?? 0;
          cat.themes    += m.storageUsed?.themes    ?? 0;
          cat.oneshots  += m.storageUsed?.oneshots  ?? 0;
          cat.defis     += m.storageUsed?.defis     ?? 0;
          cat.documents += m.storageUsed?.documents ?? 0;
        });
        this.storageByCat.set(cat);
        this.storageTotal.set(cat.portfolio + cat.themes + cat.oneshots + cat.defis + cat.documents);
        this.topMembers.set(
          membres
            .map(m => ({
              nom: [m.prenom, m.nom].filter(Boolean).join(' '),
              total: (m.storageUsed?.portfolio ?? 0) + (m.storageUsed?.themes ?? 0)
                   + (m.storageUsed?.oneshots  ?? 0) + (m.storageUsed?.defis ?? 0)
                   + (m.storageUsed?.documents ?? 0),
            }))
            .filter(m => m.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
        );
        this.loading.set(false);
      },
      error: () => { this.hasError.set(true); this.loading.set(false); },
    });
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 Ko';
    if (bytes < 1_048_576)     return `${Math.round(bytes / 1024)} Ko`;
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} Mo`;
    return `${(bytes / 1_073_741_824).toFixed(2)} Go`;
  }

  barWidth(total: number): number {
    return Math.round(total / this.maxMemberStorage() * 100);
  }

}
