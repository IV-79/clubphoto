import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ReunionService } from '../../../services/reunion.service';
import { SortieService } from '../../../services/sortie.service';
import { ArticleService } from '../../../services/article.service';

interface AgendaItem { date: string; titre: string; type: string; lieu?: string; }
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
  private reunionService = inject(ReunionService);
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
  storageByCat = signal({ portfolio: 0, themes: 0, oneshots: 0, documents: 0 });
  topMembers   = signal<MemberBar[]>([]);
  agendaItems  = signal<AgendaItem[]>([]);

  storageItems = computed<StorageItem[]>(() => {
    const cat   = this.storageByCat();
    const total = this.storageTotal() || 1;
    return [
      { label: 'Portfolio',      color: '#3b82f6', bytes: cat.portfolio, pct: Math.round(cat.portfolio / total * 100) },
      { label: 'Thèmes du mois', color: '#10b981', bytes: cat.themes,    pct: Math.round(cat.themes    / total * 100) },
      { label: 'One-shots',      color: '#f59e0b', bytes: cat.oneshots,  pct: Math.round(cat.oneshots  / total * 100) },
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

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.hasError.set(false);

    const now     = new Date();
    const today   = now.toISOString().split('T')[0];
    const cutoff  = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
    const in30    = new Date(now); in30.setDate(in30.getDate() + 30);
    const in30str = in30.toISOString().split('T')[0];

    forkJoin({
      membres:  this.authService.getAllMembersOnce(),
      reunions: this.reunionService.getReunions(),
      sorties:  this.sortieService.getSortiesOnce(),
      articles: this.articleService.getAllArticles(),
    }).subscribe({
      next: ({ membres, reunions, sorties, articles }) => {
        // --- Membres ---
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

        // --- Articles ---
        this.totalArticles.set(articles.filter(a => a.statut === 'publie').length);

        // --- Sorties ---
        this.totalSorties.set(sorties.length);

        // --- Stockage ---
        const cat = { portfolio: 0, themes: 0, oneshots: 0, documents: 0 };
        membres.forEach(m => {
          cat.portfolio += m.storageUsed?.portfolio ?? 0;
          cat.themes    += m.storageUsed?.themes    ?? 0;
          cat.oneshots  += m.storageUsed?.oneshots  ?? 0;
          cat.documents += m.storageUsed?.documents ?? 0;
        });
        this.storageByCat.set(cat);
        this.storageTotal.set(cat.portfolio + cat.themes + cat.oneshots + cat.documents);

        this.topMembers.set(
          membres
            .map(m => ({
              nom: [m.prenom, m.nom].filter(Boolean).join(' '),
              total: (m.storageUsed?.portfolio ?? 0) + (m.storageUsed?.themes ?? 0)
                   + (m.storageUsed?.oneshots  ?? 0) + (m.storageUsed?.documents ?? 0),
            }))
            .filter(m => m.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
        );

        // --- Agenda ---
        const agenda: AgendaItem[] = [];
        sorties
          .filter(s => s.date >= today && s.date <= in30str)
          .forEach(s => agenda.push({ date: s.date, titre: s.titre, type: s.type ?? 'sortie_photo', lieu: s.lieu }));
        reunions
          .filter(r => r.date >= today && r.date <= in30str)
          .forEach(r => agenda.push({ date: r.date, titre: r.titre, type: 'reunion', lieu: r.lieu }));
        this.agendaItems.set(agenda.sort((a, b) => a.date.localeCompare(b.date)));

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

  dayNum(d: string):   string { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric' }); }
  monthStr(d: string): string { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short' }).replace('.',''); }
  weekStr(d: string):  string { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }); }

  readonly typeConfig: Record<string, { label: string; icon: string; color: string }> = {
    sortie_photo: { label: 'Sortie Photo', icon: 'photo_camera', color: '#3b82f6' },
    sortie_club:  { label: 'Sortie Club',  icon: 'hiking',       color: '#10b981' },
    atelier:      { label: 'Atelier',      icon: 'brush',        color: '#f59e0b' },
    reunion:      { label: 'Réunion',      icon: 'groups',       color: '#8b5cf6' },
  };

  eventLabel(t: string): string { return this.typeConfig[t]?.label ?? t; }
  eventIcon(t: string):  string { return this.typeConfig[t]?.icon  ?? 'event'; }
  eventColor(t: string): string { return this.typeConfig[t]?.color ?? 'var(--text-secondary)'; }
  eventBg(t: string):    string {
    const c = this.eventColor(t);
    return c.startsWith('#') ? c + '22' : 'var(--border)';
  }
}
