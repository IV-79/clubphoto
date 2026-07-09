import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { SortieService } from '../../../services/sortie.service';
import { ArticleService } from '../../../services/article.service';
import { CleanupService, CleanupPreview, CleanupResult, OrphanPreview } from '../../../services/cleanup.service';
import { ConfirmService } from '../../../services/confirm.service';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';

interface MemberBar  { nom: string; total: number; }
interface StorageItem { label: string; color: string; bytes: number; pct: number; }

@Component({
  selector: 'app-overview',
  imports: [MatCardModule, MatIconModule, MatButtonModule, DatePickerComponent],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class Overview implements OnInit {
  private authService    = inject(AuthService);
  private sortieService  = inject(SortieService);
  private articleService = inject(ArticleService);
  cleanupService         = inject(CleanupService);
  private confirmService = inject(ConfirmService);

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

  // ── Cleanup ──────────────────────────────────────────────────────────────

  cleanupThemesDate  = signal('');
  cleanupOsDate      = signal('');
  cleanupDefiDate    = signal('');
  cleanupSortieDate  = signal('');

  keepTop3Themes = signal(true);
  keepTop3Os     = signal(true);
  keepTop3Defis  = signal(true);

  cleanupThemesPreview  = signal<CleanupPreview | null>(null);
  cleanupOsPreview      = signal<CleanupPreview | null>(null);
  cleanupDefiPreview    = signal<CleanupPreview | null>(null);
  cleanupSortiePreview  = signal<CleanupPreview | null>(null);
  orphanPreview         = signal<OrphanPreview | null>(null);

  cleanupThemesResult  = signal<CleanupResult | null>(null);
  cleanupOsResult      = signal<CleanupResult | null>(null);
  cleanupDefiResult    = signal<CleanupResult | null>(null);
  cleanupSortieResult  = signal<CleanupResult | null>(null);
  orphanResult         = signal<{ deleted: number } | null>(null);

  cleanupRunning = signal(false);

  private twoYearsAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().split('T')[0];
  }

  ngOnInit() {
    const ago = this.twoYearsAgo();
    this.cleanupThemesDate.set(ago);
    this.cleanupOsDate.set(ago);
    this.cleanupDefiDate.set(ago);
    this.cleanupSortieDate.set(ago);
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

  onThemesDateChange(d: string)  { this.cleanupThemesDate.set(d);  this.cleanupThemesPreview.set(null);  this.cleanupThemesResult.set(null);  }
  onOsDateChange(d: string)      { this.cleanupOsDate.set(d);      this.cleanupOsPreview.set(null);      this.cleanupOsResult.set(null);      }
  onDefiDateChange(d: string)    { this.cleanupDefiDate.set(d);    this.cleanupDefiPreview.set(null);    this.cleanupDefiResult.set(null);    }
  onSortieDate(d: string)        { this.cleanupSortieDate.set(d);  this.cleanupSortiePreview.set(null);  this.cleanupSortieResult.set(null);  }

  onTop3ThemesChange(e: Event)   { this.keepTop3Themes.set((e.target as HTMLInputElement).checked); this.cleanupThemesPreview.set(null); }
  onTop3OsChange(e: Event)       { this.keepTop3Os.set((e.target as HTMLInputElement).checked);     this.cleanupOsPreview.set(null);     }
  onTop3DefiChange(e: Event)     { this.keepTop3Defis.set((e.target as HTMLInputElement).checked);  this.cleanupDefiPreview.set(null);   }

  async previewThemes() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupThemesResult.set(null);
      this.cleanupThemesPreview.set(await this.cleanupService.previewThemes(this.cleanupThemesDate(), this.keepTop3Themes()));
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async executeThemes() {
    const p = this.cleanupThemesPreview();
    if (!p || !await this.confirmService.confirm(`Supprimer définitivement ${p.photosToDelete} photo(s) des thèmes anciens ? Cette action est irréversible.`)) return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupThemesResult.set(await this.cleanupService.executeThemes(this.cleanupThemesDate(), this.keepTop3Themes()));
      this.cleanupThemesPreview.set(null);
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async previewOs() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupOsResult.set(null);
      this.cleanupOsPreview.set(await this.cleanupService.previewOneshots(this.cleanupOsDate(), this.keepTop3Os()));
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async executeOs() {
    const p = this.cleanupOsPreview();
    if (!p || !await this.confirmService.confirm(`Supprimer définitivement ${p.photosToDelete} photo(s) des one-shots anciens ? Cette action est irréversible.`)) return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupOsResult.set(await this.cleanupService.executeOneshots(this.cleanupOsDate(), this.keepTop3Os()));
      this.cleanupOsPreview.set(null);
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async previewDefis() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupDefiResult.set(null);
      this.cleanupDefiPreview.set(await this.cleanupService.previewDefis(this.cleanupDefiDate(), this.keepTop3Defis()));
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async executeDefis() {
    const p = this.cleanupDefiPreview();
    if (!p || !await this.confirmService.confirm(`Supprimer définitivement ${p.photosToDelete} photo(s) des défis anciens ? Cette action est irréversible.`)) return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupDefiResult.set(await this.cleanupService.executeDefis(this.cleanupDefiDate(), this.keepTop3Defis()));
      this.cleanupDefiPreview.set(null);
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async previewSorties() {
    this.cleanupRunning.set(true);
    try {
      this.cleanupSortieResult.set(null);
      this.cleanupSortiePreview.set(await this.cleanupService.previewSorties(this.cleanupSortieDate()));
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async executeSorties() {
    const p = this.cleanupSortiePreview();
    if (!p || !await this.confirmService.confirm(`Supprimer définitivement toutes les ${p.photosToDelete} photo(s) des sorties anciennes ? Les documents de sortie sont conservés. Cette action est irréversible.`)) return;
    this.cleanupRunning.set(true);
    try {
      this.cleanupSortieResult.set(await this.cleanupService.executeSorties(this.cleanupSortieDate()));
      this.cleanupSortiePreview.set(null);
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async previewOrphans() {
    this.cleanupRunning.set(true);
    try {
      this.orphanResult.set(null);
      this.orphanPreview.set(await this.cleanupService.previewOrphans());
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }

  async executeOrphans() {
    const p = this.orphanPreview();
    if (!p || !await this.confirmService.confirm(`Supprimer définitivement ${p.orphanCount} fichier(s) orphelins de Storage ? Cette action est irréversible.`)) return;
    this.cleanupRunning.set(true);
    try {
      this.orphanResult.set(await this.cleanupService.executeOrphans(p));
      this.orphanPreview.set(null);
    } catch (e) { console.error(e); }
    finally { this.cleanupRunning.set(false); }
  }
}
