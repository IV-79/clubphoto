import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DocumentService } from '../../../services/document.service';
import { ConfirmService } from '../../../services/confirm.service';
import { DocumentDossier } from '../../../models/document.model';

@Component({
  selector: 'app-document-dossiers',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="page-wrap">
      <h2 class="page-title">Dossiers de documents</h2>
      <p class="page-sub">Les membres peuvent déposer des fichiers dans ces dossiers.</p>

      <!-- Formulaire ajout -->
      <div class="add-form">
        <mat-form-field appearance="outline">
          <mat-label>Nom du dossier</mat-label>
          <input
            matInput
            [(ngModel)]="newNom"
            placeholder="ex: Compte-rendus"
            (keydown.enter)="addDossier()"
          />
        </mat-form-field>
        <button
          mat-raised-button
          color="primary"
          (click)="addDossier()"
          [disabled]="adding() || !newNom.trim()"
        >
          <mat-icon>add</mat-icon> Ajouter
        </button>
      </div>

      <!-- Liste -->
      <div class="dossier-list">
        @for (d of dossiers(); track d.id) {
          <div class="dossier-row">
            @if (editId() === d.id) {
              <mat-form-field appearance="outline" class="edit-field">
                <input matInput [(ngModel)]="editNom" (keydown.enter)="saveEdit(d)" />
              </mat-form-field>
              <button mat-icon-button color="primary" (click)="saveEdit(d)">
                <mat-icon>check</mat-icon>
              </button>
              <button mat-icon-button (click)="editId.set(null)">
                <mat-icon>close</mat-icon>
              </button>
            } @else {
              <div class="dossier-ordre">{{ d.ordre }}</div>
              <span class="dossier-nom">{{ d.nom }}</span>
              <div class="dossier-actions">
                <button mat-icon-button (click)="moveUp(d)" [disabled]="isFirst(d)">
                  <mat-icon>arrow_upward</mat-icon>
                </button>
                <button mat-icon-button (click)="moveDown(d)" [disabled]="isLast(d)">
                  <mat-icon>arrow_downward</mat-icon>
                </button>
                <button mat-icon-button (click)="startEdit(d)">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="warn" (click)="deleteDossier(d)">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
        }
        @if (dossiers().length === 0) {
          <p class="empty">Aucun dossier créé.</p>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .page-wrap {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px 32px;
      }
      .page-title {
        font-size: 2rem;
        font-weight: 300;
        letter-spacing: 1px;
        color: var(--text-accent);
        padding-bottom: 8px;
        border-bottom: 3px solid #ffb300;
        display: inline-block;
        margin: 0 0 4px;
      }
      .page-sub {
        margin: 0 0 24px;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }
      .add-form {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 24px;
      }
      .add-form mat-form-field {
        flex: 1;
      }
      .dossier-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dossier-row {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--bg-surface);
        border: 1px solid var(--border-medium);
        border-radius: 8px;
        padding: 8px 12px;
      }
      .dossier-ordre {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--c-blue-bg);
        color: var(--c-blue);
        font-size: 0.75rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .dossier-nom {
        flex: 1;
        font-weight: 500;
        color: var(--text-primary);
      }
      .dossier-actions {
        display: flex;
        gap: 0;
      }
      .edit-field {
        flex: 1;
      }
      .empty {
        color: var(--text-muted);
        text-align: center;
        padding: 24px 0;
      }
    `,
  ],
})
export class DocumentDossiers implements OnInit {
  private documentService = inject(DocumentService);
  private confirmService = inject(ConfirmService);
  private snackBar = inject(MatSnackBar);

  dossiers = signal<DocumentDossier[]>([]);

  async ngOnInit() {
    this.dossiers.set(await firstValueFrom(this.documentService.getDossiersOnce()));
  }

  newNom = '';
  adding = signal(false);
  editId = signal<string | null>(null);
  editNom = '';

  isFirst(d: DocumentDossier): boolean {
    return this.dossiers()[0]?.id === d.id;
  }
  isLast(d: DocumentDossier): boolean {
    return this.dossiers()[this.dossiers().length - 1]?.id === d.id;
  }

  async addDossier() {
    if (!this.newNom.trim() || this.adding()) return;
    this.adding.set(true);
    try {
      const ordre =
        (this.dossiers().length > 0 ? Math.max(...this.dossiers().map((d) => d.ordre)) : 0) + 1;
      await this.documentService.addDossier(this.newNom.trim(), ordre);
      // Reload pour récupérer l'ID généré par Firestore
      this.dossiers.set(await firstValueFrom(this.documentService.getDossiersOnce()));
      this.newNom = '';
      this.snackBar.open('Dossier créé', '', { duration: 2500 });
    } catch {
      this.snackBar.open('Erreur lors de la création', '', { duration: 3000 });
    } finally {
      this.adding.set(false);
    }
  }

  startEdit(d: DocumentDossier) {
    this.editId.set(d.id!);
    this.editNom = d.nom;
  }

  async saveEdit(d: DocumentDossier) {
    if (!this.editNom.trim()) return;
    try {
      const nom = this.editNom.trim();
      await this.documentService.updateDossier(d.id!, nom, d.ordre);
      this.dossiers.update((list) => list.map((x) => (x.id === d.id ? { ...x, nom } : x)));
      this.editId.set(null);
      this.snackBar.open('Dossier mis à jour', '', { duration: 2500 });
    } catch {
      this.snackBar.open('Erreur lors de la mise à jour', '', { duration: 3000 });
    }
  }

  async moveUp(d: DocumentDossier) {
    const list = this.dossiers();
    const idx = list.findIndex((x) => x.id === d.id);
    if (idx <= 0) return;
    const prev = list[idx - 1];
    await Promise.all([
      this.documentService.updateDossier(d.id!, d.nom, prev.ordre),
      this.documentService.updateDossier(prev.id!, prev.nom, d.ordre),
    ]);
    this.dossiers.update((l) =>
      l.map((x) =>
        x.id === d.id ? { ...x, ordre: prev.ordre } : x.id === prev.id ? { ...x, ordre: d.ordre } : x,
      ).sort((a, b) => a.ordre - b.ordre),
    );
  }

  async moveDown(d: DocumentDossier) {
    const list = this.dossiers();
    const idx = list.findIndex((x) => x.id === d.id);
    if (idx >= list.length - 1) return;
    const next = list[idx + 1];
    await Promise.all([
      this.documentService.updateDossier(d.id!, d.nom, next.ordre),
      this.documentService.updateDossier(next.id!, next.nom, d.ordre),
    ]);
    this.dossiers.update((l) =>
      l.map((x) =>
        x.id === d.id ? { ...x, ordre: next.ordre } : x.id === next.id ? { ...x, ordre: d.ordre } : x,
      ).sort((a, b) => a.ordre - b.ordre),
    );
  }

  async deleteDossier(d: DocumentDossier) {
    const ok = await this.confirmService.confirm(
      `Supprimer le dossier "${d.nom}" ? Les documents existants dans ce dossier ne seront pas supprimés.`,
      'Supprimer le dossier',
    );
    if (!ok) return;
    try {
      await this.documentService.deleteDossier(d.id!);
      this.dossiers.update((list) => list.filter((x) => x.id !== d.id));
      this.snackBar.open('Dossier supprimé', '', { duration: 2500 });
    } catch {
      this.snackBar.open('Erreur lors de la suppression', '', { duration: 3000 });
    }
  }
}
