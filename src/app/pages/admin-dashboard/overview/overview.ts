import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin, from } from 'rxjs';
import { getDocs, collection, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../../../utils/firebase';
import { AuthService } from '../../../services/auth.service';
import { SortieService } from '../../../services/sortie.service';
import { ArticleService } from '../../../services/article.service';
import { DocumentService } from '../../../services/document.service';

interface MemberBar {
  nom: string;
  total: number;
}
interface StorageItem {
  label: string;
  color: string;
  bytes: number;
  pct: number;
}

@Component({
  selector: 'app-overview',
  imports: [MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './overview.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './overview.css',
})
export class Overview implements OnInit {
  private authService = inject(AuthService);
  private sortieService = inject(SortieService);
  private articleService = inject(ArticleService);
  private documentService = inject(DocumentService);

  loading = signal(true);
  hasError = signal(false);

  totalMembres = signal(0);
  membresActifs = signal(0);
  suspendus = signal(0);
  activePct = signal(0);
  roleBreakdown = signal({ admin: 0, contributeur: 0, membre: 0 });
  totalSorties = signal(0);
  totalArticles = signal(0);
  totalDocuments = signal(0);

  storageTotal = signal(0);
  storageByCat = signal({
    portfolio: 0,
    sorties: 0,
    themes: 0,
    defis: 0,
    oneshots: 0,
    expositions: 0,
    documents: 0,
  });
  topMembers = signal<MemberBar[]>([]);

  storageItems = computed<StorageItem[]>(() => {
    const cat = this.storageByCat();
    const total = this.storageTotal() || 1;
    return [
      {
        label: 'Portfolio',
        color: '#2563eb',
        bytes: cat.portfolio,
        pct: Math.round((cat.portfolio / total) * 100),
      },
      {
        label: 'Sorties',
        color: '#0d9488',
        bytes: cat.sorties,
        pct: Math.round((cat.sorties / total) * 100),
      },
      {
        label: 'Thèmes du mois',
        color: '#16a34a',
        bytes: cat.themes,
        pct: Math.round((cat.themes / total) * 100),
      },
      {
        label: 'Défis',
        color: '#dc2626',
        bytes: cat.defis,
        pct: Math.round((cat.defis / total) * 100),
      },
      {
        label: 'One-shots',
        color: '#d97706',
        bytes: cat.oneshots,
        pct: Math.round((cat.oneshots / total) * 100),
      },
      {
        label: 'Expositions',
        color: '#7c3aed',
        bytes: cat.expositions,
        pct: Math.round((cat.expositions / total) * 100),
      },
      {
        label: 'Documents',
        color: '#ea580c',
        bytes: cat.documents,
        pct: Math.round((cat.documents / total) * 100),
      },
    ];
  });

  donutGradient = computed(() => {
    if (this.storageTotal() === 0) return 'conic-gradient(var(--border-medium) 0% 100%)';
    let cursor = 0;
    const stops = this.storageItems().map((item) => {
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

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);

    forkJoin({
      membres: this.authService.getAllMembersOnce(),
      sorties: this.sortieService.getSortiesOnce(),
      articles: this.articleService.getAllArticles(),
      documents: this.documentService.getDocumentsOnce(),
      themes: from(getDocs(collection(db, 'themes'))),
      oneshots: from(getDocs(collection(db, 'oneshots'))),
      defis: from(getDocs(collection(db, 'defis'))),
      expositions: from(getDocs(collection(db, 'expositions'))),
    }).subscribe({
      next: ({ membres, sorties, articles, documents, themes, oneshots, defis, expositions }) => {
        const actifs = membres.filter(
          (m) => !m.isSuspended && m.derniereConnexion && new Date(m.derniereConnexion) >= cutoff,
        ).length;
        this.totalMembres.set(membres.length);
        this.membresActifs.set(actifs);
        this.suspendus.set(membres.filter((m) => m.isSuspended).length);
        this.activePct.set(membres.length > 0 ? Math.round((actifs / membres.length) * 100) : 0);
        this.roleBreakdown.set({
          admin: membres.filter((m) => m.role === 'admin').length,
          contributeur: membres.filter((m) => m.role === 'contributeur').length,
          membre: membres.filter((m) => m.role === 'membre').length,
        });
        this.totalArticles.set(articles.filter((a) => a.statut === 'publie').length);
        this.totalSorties.set(sorties.length);
        this.totalDocuments.set(documents.length);

        const coverSize = (snap: QuerySnapshot<DocumentData>, field: string) =>
          snap.docs.reduce(
            (s, d) => s + (((d.data() as Record<string, unknown>)[field] as number) ?? 0),
            0,
          );

        const cat = {
          portfolio: 0,
          sorties: 0,
          themes: 0,
          defis: 0,
          oneshots: 0,
          expositions: 0,
          documents: 0,
        };
        membres.forEach((m) => {
          cat.portfolio += m.storageUsed?.portfolio ?? 0;
          cat.sorties += m.storageUsed?.sorties ?? 0;
          cat.themes += m.storageUsed?.themes ?? 0;
          cat.defis += m.storageUsed?.defis ?? 0;
          cat.oneshots += m.storageUsed?.oneshots ?? 0;
          cat.expositions += m.storageUsed?.expositions ?? 0;
          cat.documents += m.storageUsed?.documents ?? 0;
        });
        cat.sorties += sorties.reduce(
          (s, so) =>
            s +
            (((so as unknown as Record<string, unknown>)['imageEvenementFileSize'] as number) ?? 0),
          0,
        );
        cat.themes += coverSize(themes, 'photoCouvertureFileSize');
        cat.oneshots += coverSize(oneshots, 'photoCouvertureFileSize');
        cat.defis += coverSize(defis, 'photoCouvertureFileSize');
        cat.expositions += coverSize(expositions, 'photoCouvertureFileSize');
        this.storageByCat.set(cat);
        this.storageTotal.set(
          cat.portfolio +
            cat.sorties +
            cat.themes +
            cat.defis +
            cat.oneshots +
            cat.expositions +
            cat.documents,
        );
        this.topMembers.set(
          membres
            .map((m) => ({
              nom: [m.prenom, m.nom].filter(Boolean).join(' '),
              total:
                (m.storageUsed?.portfolio ?? 0) +
                (m.storageUsed?.sorties ?? 0) +
                (m.storageUsed?.themes ?? 0) +
                (m.storageUsed?.defis ?? 0) +
                (m.storageUsed?.oneshots ?? 0) +
                (m.storageUsed?.expositions ?? 0) +
                (m.storageUsed?.documents ?? 0),
            }))
            .filter((m) => m.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10),
        );
        this.loading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.loading.set(false);
      },
    });
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 Ko';
    if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} Ko`;
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} Mo`;
    return `${(bytes / 1_073_741_824).toFixed(2)} Go`;
  }

  barWidth(total: number): number {
    return Math.round((total / this.maxMemberStorage()) * 100);
  }
}
