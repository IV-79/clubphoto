import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { auth } from '../../../utils/firebase';
import { DocumentService } from '../../../services/document.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { NotificationService } from '../../../services/notification.service';
import { ClubDocument, DocumentDossier, getExtensionMeta, extractExtension, extractExtFromUrl } from '../../../models/document.model';

@Component({
  selector: 'app-documents',
  imports: [
    FormsModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page-wrap">
      <!-- En-tête -->
      <div class="page-header">
        <h2 class="page-title">
          <mat-icon>folder_shared</mat-icon>
          Documents
        </h2>
        <button mat-raised-button color="primary" (click)="toggleUploadForm()">
          <mat-icon>note_add</mat-icon>
          Nouveau document
        </button>
      </div>

      <!-- Formulaire ajout -->
      @if (showUploadForm()) {
        <div class="upload-panel">

          <!-- Toggle Fichier / Lien web -->
          <div class="mode-toggle">
            <button class="mode-btn" [class.active]="uploadMode() === 'fichier'" (click)="setMode('fichier')">
              <mat-icon>upload_file</mat-icon>
              Fichier
            </button>
            <button class="mode-btn" [class.active]="uploadMode() === 'lien'" (click)="setMode('lien')">
              <mat-icon>link</mat-icon>
              Lien web
            </button>
          </div>

          <!-- Zone fichier -->
          @if (uploadMode() === 'fichier') {
            <label
              class="file-drop"
              for="upload-input"
              [class.dragging]="isDragging()"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave()"
              (drop)="onDrop($event)"
            >
              @if (uploadFile()) {
                <mat-icon
                  class="file-icon-large"
                  [style.color]="getExtMeta(extractExt(uploadFile()!.name)).color"
                >
                  {{ getExtMeta(extractExt(uploadFile()!.name)).icon }}
                </mat-icon>
                <span class="file-name">{{ uploadFile()!.name }}</span>
                <span class="file-size">{{ formatTaille(uploadFile()!.size) }}</span>
              } @else {
                <mat-icon>upload_file</mat-icon>
                <span>Glisser un fichier ici ou cliquer pour choisir</span>
              }
            </label>
            <input id="upload-input" type="file" style="display:none" (change)="onUploadFileSelected($event)" />
          }

          <!-- Zone lien web -->
          @if (uploadMode() === 'lien') {
            <div class="lien-section">
              <div class="lien-input-row">
                <mat-form-field appearance="outline" class="field-lien">
                  <mat-label>URL du document *</mat-label>
                  <input
                    matInput
                    type="url"
                    [value]="uploadLien"
                    (input)="onLienInput($any($event.target).value)"
                    placeholder="https://…"
                  />
                </mat-form-field>
                <button
                  mat-stroked-button
                  class="verify-btn"
                  (click)="verifyLien()"
                  [disabled]="!isValidUrl(uploadLien) || lienCheckStatus() === 'checking'"
                >
                  @if (lienCheckStatus() === 'checking') {
                    <mat-icon class="spin">sync</mat-icon>
                  } @else {
                    <mat-icon>travel_explore</mat-icon>
                  }
                  Vérifier
                </button>
              </div>

              @if (uploadLien.trim() && !isValidUrl(uploadLien)) {
                <span class="lien-msg error"><mat-icon>error_outline</mat-icon> URL invalide</span>
              }
              @if (lienCheckStatus() === 'ok') {
                <span class="lien-msg ok"><mat-icon>check_circle</mat-icon> Lien accessible</span>
              }
              @if (lienCheckStatus() === 'error') {
                <span class="lien-msg warn"><mat-icon>warning</mat-icon> Lien inaccessible ou non vérifiable — vous pouvez quand même l'ajouter</span>
              }

              @if (isValidUrl(uploadLien)) {
                <div class="lien-ext-preview">
                  <mat-icon [style.color]="getExtMeta(uploadLienExtension()).color">{{ getExtMeta(uploadLienExtension()).icon }}</mat-icon>
                  <span class="ext-badge" [style.background]="getExtMeta(uploadLienExtension()).color">{{ getExtMeta(uploadLienExtension()).label }}</span>
                  <span class="lien-ext-label">Type détecté depuis l'URL</span>
                </div>
              }
            </div>
          }

          <div class="upload-fields">
            <mat-form-field appearance="outline" class="field-nom">
              <mat-label>Nom *</mat-label>
              <input matInput [(ngModel)]="uploadNomBase" placeholder="ex: Statuts 2024" />
              @if (uploadMode() === 'fichier' && uploadExtension) {
                <span matSuffix class="ext-suffix">.{{ uploadExtension }}</span>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="field-dossier">
              <mat-label>Dossier *</mat-label>
              <mat-select [(ngModel)]="uploadDossier">
                @for (d of dossiers(); track d.id) {
                  <mat-option [value]="d.nom">{{ d.nom }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          @if (uploadProgress() > 0 && uploadProgress() < 100) {
            <mat-progress-bar mode="determinate" [value]="uploadProgress()" />
          }

          <div class="upload-actions">
            <button mat-button (click)="resetUploadForm()">Annuler</button>
            <button
              mat-raised-button
              color="primary"
              (click)="uploadMode() === 'lien' ? uploadAsLink() : upload()"
              [disabled]="uploading() || (uploadMode() === 'fichier'
                ? (!uploadFile() || !uploadNomBase.trim() || !uploadDossier)
                : (!isValidUrl(uploadLien) || !uploadNomBase.trim() || !uploadDossier))"
            >
              @if (uploading()) {
                <mat-icon>hourglass_empty</mat-icon>
              } @else if (uploadMode() === 'lien') {
                <mat-icon>add_link</mat-icon>
              } @else {
                <mat-icon>cloud_upload</mat-icon>
              }
              {{ uploadMode() === 'lien' ? 'Ajouter' : 'Uploader' }}
            </button>
          </div>
        </div>
      }

      <!-- Filtres -->
      <div class="folder-chips">
        <button
          class="chip"
          [class.active]="selectedDossier() === null"
          (click)="selectedDossier.set(null)"
        >
          Tous ({{ documents().length }})
        </button>
        @for (d of dossiers(); track d.id) {
          <button
            class="chip"
            [class.active]="selectedDossier() === d.nom"
            (click)="selectedDossier.set(d.nom)"
          >
            {{ d.nom }} ({{ countForDossier(d.nom) }})
          </button>
        }
      </div>
      <div class="filter-bar">
        <div class="search-wrap">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            class="search-input"
            type="text"
            placeholder="Rechercher par nom…"
            [value]="searchText()"
            (input)="searchText.set($any($event.target).value)"
          />
          @if (searchText()) {
            <button class="search-clear" (click)="searchText.set('')" aria-label="Effacer">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
        <div class="filter-right">
          <button class="chip" [class.active]="showMine()" (click)="showMine.set(!showMine())">
            <mat-icon class="chip-icon">person</mat-icon>
            Mes documents
          </button>
          <button
            class="sort-btn"
            (click)="sortDir.set(sortDir() === 'desc' ? 'asc' : 'desc')"
            [matTooltip]="sortDir() === 'desc' ? 'Plus récent en premier' : 'Plus ancien en premier'"
          >
            <mat-icon>{{ sortDir() === 'desc' ? 'arrow_downward' : 'arrow_upward' }}</mat-icon>
            Date {{ sortDir() === 'desc' ? '↓' : '↑' }}
          </button>
        </div>
      </div>

      <!-- Liste documents -->
      @if (filteredDocuments().length === 0) {
        <div class="empty">
          <mat-icon>folder_open</mat-icon>
          <p>Aucun document dans ce dossier.</p>
        </div>
      }

      <div class="doc-list">
        @for (doc of filteredDocuments(); track doc.id) {
          <div class="doc-card">
            <div class="doc-row">
              <!-- Icône extension -->
              <div class="doc-icon-wrap">
                <mat-icon [style.color]="getExtMeta(doc.extension).color" class="doc-icon">
                  {{ getExtMeta(doc.extension).icon }}
                </mat-icon>
                <span class="ext-badge" [style.background]="getExtMeta(doc.extension).color">
                  {{ getExtMeta(doc.extension).label }}
                </span>
              </div>

              <!-- Infos -->
              <div class="doc-info">
                <span class="doc-nom">{{ doc.nom }}</span>
                <div class="doc-meta">
                  <span class="meta-tag">{{ doc.dossier }}</span>
                  <span>{{ doc.uploadeurNom }}</span>
                  @if (doc.taille > 0) {
                    <span>{{ formatTaille(doc.taille) }}</span>
                  }
                  <span
                    [matTooltip]="doc.dateMiseAJour
                      ? 'Mis à jour (créé le ' + (doc.dateCreation | date: 'd MMM yyyy' : '' : 'fr') + ')'
                      : ''"
                  >
                    {{ dateEffective(doc) | date: 'd MMM yyyy' : '' : 'fr' }}
                    @if (doc.dateMiseAJour) {
                      <span class="meta-updated">✎</span>
                    }
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="doc-actions">
                @if (canEdit(doc)) {
                  <button mat-icon-button matTooltip="Modifier" (click)="openReplace(doc)">
                    <mat-icon>edit</mat-icon>
                  </button>
                }
                @if (canDelete(doc)) {
                  <button mat-icon-button matTooltip="Supprimer" color="warn" (click)="deleteDoc(doc)">
                    <mat-icon>delete</mat-icon>
                  </button>
                }
                @if (doc.url) {
                  <a
                    [href]="doc.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    mat-icon-button
                    [matTooltip]="doc.lien ? 'Ouvrir le lien' : 'Télécharger'"
                  >
                    <mat-icon>{{ doc.lien ? 'open_in_new' : 'download' }}</mat-icon>
                  </a>
                }
              </div>
            </div>

            <!-- Formulaire de modification inline -->
            @if (expandedDocId() === doc.id) {
              <div class="replace-panel">
                <div class="replace-fields">
                  <mat-form-field appearance="outline" class="field-replace-nom">
                    <mat-label>Nom</mat-label>
                    <input matInput [(ngModel)]="replaceNom" />
                    @if (!doc.lien && replaceExtension) {
                      <span matSuffix class="ext-suffix">.{{ replaceExtension }}</span>
                    }
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="field-replace-dossier">
                    <mat-label>Dossier</mat-label>
                    <mat-select [(ngModel)]="replaceDossier">
                      @for (d of dossiers(); track d.id) {
                        <mat-option [value]="d.nom">{{ d.nom }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>

                @if (doc.lien) {
                  <!-- Modification URL pour un lien -->
                  <mat-form-field appearance="outline" class="field-replace-lien">
                    <mat-label>URL du lien</mat-label>
                    <input matInput type="url" [(ngModel)]="replaceLien" placeholder="https://…" />
                  </mat-form-field>
                  @if (replaceLien.trim() && !isValidUrl(replaceLien)) {
                    <span class="lien-msg error"><mat-icon>error_outline</mat-icon> URL invalide</span>
                  }
                } @else {
                  <!-- Remplacement fichier -->
                  <div class="replace-file-row">
                    <button mat-stroked-button (click)="triggerReplaceInput()">
                      <mat-icon>attach_file</mat-icon>
                      {{ replaceFile() ? replaceFile()!.name : 'Remplacer le fichier (optionnel)' }}
                    </button>
                    <input
                      id="replace-input"
                      type="file"
                      style="display:none"
                      (change)="onReplaceFileSelected($event)"
                    />
                    @if (replaceProgress() > 0 && replaceProgress() < 100) {
                      <mat-progress-bar mode="determinate" [value]="replaceProgress()" class="replace-progress" />
                    }
                  </div>
                }

                <div class="replace-actions">
                  <button mat-button (click)="expandedDocId.set(null)">Annuler</button>
                  <button
                    mat-raised-button
                    color="primary"
                    [disabled]="replacing() || !replaceNom.trim() || !replaceDossier
                      || (!!doc.lien && (!replaceLien.trim() || !isValidUrl(replaceLien)))"
                    (click)="replace(doc)"
                  >
                    @if (replacing()) {
                      <mat-icon>hourglass_empty</mat-icon>
                    } @else {
                      <mat-icon>save</mat-icon>
                    }
                    Enregistrer
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .page-wrap {
        max-width: 860px;
        margin: 0 auto;
        padding: 24px 16px;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
      }
      .page-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 1.4rem;
        font-weight: 600;
      }

      /* Upload panel */
      .upload-panel {
        background: var(--bg-surface-alt);
        border: 1px solid var(--border-medium);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
      }

      /* Mode toggle */
      .mode-toggle {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border-medium);
      }
      .mode-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 16px;
        border-radius: 8px;
        border: 1px solid var(--border-medium);
        background: var(--bg-surface);
        cursor: pointer;
        font-size: 0.88rem;
        color: var(--text-secondary);
        transition: all 0.15s;
      }
      .mode-btn:hover {
        border-color: #1976d2;
        color: #1976d2;
      }
      .mode-btn.active {
        background: #1976d2;
        color: #fff;
        border-color: #1976d2;
      }
      .mode-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      /* Lien web section */
      .lien-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 8px;
      }
      .lien-input-row {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      .field-lien {
        flex: 1;
      }
      .verify-btn {
        flex-shrink: 0;
        margin-top: 4px;
      }
      .lien-msg {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.8rem;
      }
      .lien-msg mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .lien-msg.ok { color: #2e7d32; }
      .lien-msg.warn { color: #f57c00; }
      .lien-msg.error { color: #d32f2f; }
      .lien-ext-preview {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.82rem;
        color: var(--text-secondary);
        margin-top: 2px;
      }
      .lien-ext-preview mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .lien-ext-label {
        color: var(--text-muted);
        font-style: italic;
      }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .spin { animation: spin 1s linear infinite; display: inline-block; }

      .upload-fields {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 12px;
        margin-bottom: 12px;
      }
      .field-nom,
      .field-dossier {
        width: 100%;
      }
      .file-drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 2px dashed var(--border-strong);
        border-radius: 10px;
        padding: 28px;
        cursor: pointer;
        color: var(--text-muted);
        transition:
          border-color 0.2s,
          color 0.2s,
          background 0.2s;
        margin-bottom: 8px;
      }
      .file-drop:hover,
      .file-drop.dragging {
        border-color: #1976d2;
        color: #1976d2;
        background: rgba(25, 118, 210, 0.08);
      }
      .file-drop mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
      .file-icon-large {
        font-size: 40px;
        width: 40px;
        height: 40px;
      }
      .file-name {
        font-weight: 500;
        font-size: 0.95rem;
        word-break: break-all;
        text-align: center;
      }
      .file-size {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      .upload-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 12px;
      }
      .ext-suffix {
        color: var(--text-muted);
        font-size: 0.9rem;
        padding-right: 4px;
      }

      /* Folder chips */
      .folder-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .filter-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .search-wrap {
        flex: 1;
        min-width: 160px;
        max-width: 320px;
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--border-medium);
        border-radius: 20px;
        padding: 5px 10px 5px 12px;
        background: var(--bg-surface);
        transition: border-color 0.15s;
      }
      .search-wrap:focus-within {
        border-color: #1976d2;
      }
      .search-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 0.85rem;
        color: var(--text-primary);
        background: transparent;
        min-width: 0;
      }
      .search-clear {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        color: var(--text-muted);
        line-height: 1;
      }
      .search-clear mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .search-clear:hover {
        color: var(--text-secondary);
      }
      .filter-right {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
      }
      .chip {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid var(--border-medium);
        background: var(--bg-surface);
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--text-secondary);
        transition:
          background 0.15s,
          color 0.15s,
          border-color 0.15s;
      }
      .chip:hover {
        border-color: #1976d2;
        color: #1976d2;
      }
      .chip.active {
        background: #1976d2;
        color: #fff;
        border-color: #1976d2;
      }
      .chip-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .sort-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--border-medium);
        background: var(--bg-surface);
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--text-secondary);
        transition:
          background 0.15s,
          color 0.15s;
      }
      .sort-btn:hover {
        background: var(--bg-surface-raised);
        color: #1976d2;
      }
      .sort-btn mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      /* Empty state */
      .empty {
        text-align: center;
        padding: 48px 0;
        color: var(--text-muted);
      }
      .empty mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 8px;
      }
      .empty p {
        margin: 0;
        font-size: 0.95rem;
      }

      /* Document list */
      .doc-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .doc-card {
        border: 1px solid var(--border-medium);
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg-surface);
      }
      .doc-row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
      }
      .doc-icon-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        flex-shrink: 0;
      }
      .doc-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }
      .ext-badge {
        font-size: 0.65rem;
        font-weight: 700;
        color: #fff;
        padding: 1px 5px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .doc-info {
        flex: 1;
        min-width: 0;
      }
      .doc-nom {
        font-weight: 500;
        font-size: 0.95rem;
        display: block;
        word-break: break-all;
      }
      .doc-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        margin-top: 4px;
        font-size: 0.78rem;
        color: var(--text-secondary);
        align-items: center;
      }
      .meta-tag {
        background: var(--bg-surface-raised);
        padding: 2px 8px;
        border-radius: 10px;
        color: var(--text-secondary);
        font-weight: 500;
      }
      .meta-updated {
        color: #f57c00;
        font-size: 0.8rem;
      }
      .doc-actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      /* Replace panel */
      .replace-panel {
        border-top: 1px solid var(--border-medium);
        background: var(--bg-surface-alt);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .replace-fields {
        display: grid;
        grid-template-columns: 1fr 200px;
        gap: 12px;
      }
      .field-replace-nom,
      .field-replace-dossier,
      .field-replace-lien {
        width: 100%;
      }
      .replace-file-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .replace-progress {
        flex: 1;
      }
      .replace-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      @media (max-width: 560px) {
        .upload-fields {
          grid-template-columns: 1fr;
        }
        .lien-input-row {
          flex-direction: column;
        }
        .verify-btn {
          align-self: flex-start;
        }
        .doc-actions {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class Documents implements OnInit {
  private documentService = inject(DocumentService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private notifService = inject(NotificationService);
  private snackBar = inject(MatSnackBar);

  currentUid = signal(auth.currentUser?.uid ?? '');
  private profile = toSignal(this.authService.currentUserProfile$);

  dossiers = signal<DocumentDossier[]>([]);
  documents = signal<ClubDocument[]>([]);

  async ngOnInit() {
    const [dossiers, documents] = await Promise.all([
      firstValueFrom(this.documentService.getDossiersOnce()),
      firstValueFrom(this.documentService.getDocumentsOnce()),
    ]);
    this.dossiers.set(dossiers);
    this.documents.set(documents);
  }

  selectedDossier = signal<string | null>(null);
  showMine = signal(false);
  sortDir = signal<'asc' | 'desc'>('desc');
  searchText = signal('');
  showUploadForm = signal(false);
  expandedDocId = signal<string | null>(null);

  // Fichier upload
  uploadNomBase = '';
  uploadExtension = '';
  uploadDossier = '';
  uploadFile = signal<File | null>(null);
  uploadProgress = signal(0);
  uploading = signal(false);
  isDragging = signal(false);

  // Lien web
  uploadMode = signal<'fichier' | 'lien'>('fichier');
  uploadLien = '';
  uploadLienExtension = signal('lien');
  lienCheckStatus = signal<'idle' | 'checking' | 'ok' | 'error'>('idle');

  // Replace
  replaceNom = '';
  replaceDossier = '';
  replaceExtension = '';
  replaceFile = signal<File | null>(null);
  replaceProgress = signal(0);
  replacing = signal(false);
  replaceLien = '';

  isAdmin = computed(() => this.profile()?.role === 'admin');

  dateEffective(doc: ClubDocument): string {
    return doc.dateMiseAJour ?? doc.dateCreation;
  }

  filteredDocuments = computed(() => {
    const dossier = this.selectedDossier();
    const mine = this.showMine();
    const dir = this.sortDir();
    const uid = this.currentUid();
    const search = this.searchText().toLowerCase().trim();

    let docs = this.documents();
    if (dossier) docs = docs.filter((d) => d.dossier === dossier);
    if (mine) docs = docs.filter((d) => d.uploadeurUid === uid);
    if (search) docs = docs.filter((d) => d.nom.toLowerCase().includes(search));

    const sign = dir === 'asc' ? 1 : -1;
    return [...docs].sort(
      (a, b) => sign * this.dateEffective(a).localeCompare(this.dateEffective(b)),
    );
  });

  countForDossier(nom: string): number {
    return this.documents().filter((d) => d.dossier === nom).length;
  }

  getExtMeta(ext: string) {
    return getExtensionMeta(ext);
  }
  extractExt(filename: string) {
    return extractExtension(filename);
  }

  formatTaille(bytes: number): string {
    if (bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  canEdit(doc: ClubDocument): boolean {
    return doc.uploadeurUid === this.currentUid() || this.isAdmin();
  }

  canDelete(doc: ClubDocument): boolean {
    return doc.uploadeurUid === this.currentUid() || this.isAdmin();
  }

  isValidUrl(url: string): boolean {
    try {
      const u = new URL(url.trim());
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }

  setMode(mode: 'fichier' | 'lien') {
    this.uploadMode.set(mode);
    this.lienCheckStatus.set('idle');
  }

  onLienInput(url: string) {
    this.uploadLien = url;
    this.lienCheckStatus.set('idle');
    if (this.isValidUrl(url)) {
      this.uploadLienExtension.set(extractExtFromUrl(url));
      if (!this.uploadNomBase.trim()) {
        try {
          const pathname = new URL(url).pathname;
          const last = pathname.split('/').filter(Boolean).pop() ?? '';
          if (last) {
            const dotIdx = last.lastIndexOf('.');
            this.uploadNomBase = dotIdx > 0 ? last.slice(0, dotIdx) : last;
          }
        } catch {}
      }
    } else {
      this.uploadLienExtension.set('lien');
    }
  }

  async verifyLien() {
    const url = this.uploadLien.trim();
    if (!this.isValidUrl(url)) return;
    this.lienCheckStatus.set('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeout);
      this.lienCheckStatus.set('ok');
    } catch {
      this.lienCheckStatus.set('error');
    }
  }

  toggleUploadForm() {
    this.showUploadForm.update((v) => !v);
    if (!this.showUploadForm()) this.resetUploadForm();
  }

  onUploadFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setUploadFile(file);
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(true);
  }
  onDragLeave() {
    this.isDragging.set(false);
  }
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.setUploadFile(file);
  }

  private setUploadFile(file: File) {
    this.uploadFile.set(file);
    const ext = extractExtension(file.name);
    this.uploadExtension = ext;
    if (!this.uploadNomBase) {
      this.uploadNomBase = ext ? file.name.slice(0, -(ext.length + 1)) : file.name;
    }
  }

  async upload() {
    const file = this.uploadFile();
    const profile = this.profile();
    if (!file || !this.uploadNomBase.trim() || !this.uploadDossier || !profile) return;

    this.uploading.set(true);
    this.uploadProgress.set(0);
    try {
      const docId = this.documentService.generateDocId();
      const extension = extractExtension(file.name);

      const filename = extension
        ? `${this.uploadNomBase.trim()}.${extension}`
        : this.uploadNomBase.trim();
      const { url, storagePath } = await this.documentService.uploadFile(
        docId,
        file,
        filename,
        (pct) => this.uploadProgress.set(pct),
      );

      await this.documentService.createDocument(docId, {
        nom: this.uploadNomBase.trim(),
        extension,
        taille: file.size,
        dossier: this.uploadDossier,
        storagePath,
        url,
        uploadeurUid: profile.uid,
        uploadeurNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        dateCreation: new Date().toISOString(),
      });

      await this.documentService.incrementStorage(profile.uid, file.size);
      await this.notifService
        .broadcast('document', `Nouveau document : ${this.uploadNomBase.trim()}`, {
          lien: '/membre/documents',
          sourceNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        })
        .catch(() => {});
      this.documents.update((list) => [
        ...list,
        {
          id: docId,
          nom: this.uploadNomBase.trim(),
          extension,
          taille: file.size,
          dossier: this.uploadDossier,
          storagePath,
          url,
          uploadeurUid: profile.uid,
          uploadeurNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
          dateCreation: new Date().toISOString(),
        },
      ]);
      this.resetUploadForm();
      this.snackBar.open('Document uploadé', '', { duration: 3000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open("Erreur lors de l'upload", '', { duration: 4000 });
    } finally {
      this.uploading.set(false);
    }
  }

  async uploadAsLink() {
    const profile = this.profile();
    const url = this.uploadLien.trim();
    if (!url || !this.isValidUrl(url) || !this.uploadNomBase.trim() || !this.uploadDossier || !profile) return;

    this.uploading.set(true);
    try {
      const docId = this.documentService.generateDocId();
      const extension = this.uploadLienExtension();
      const doc: Omit<ClubDocument, 'id'> = {
        nom: this.uploadNomBase.trim(),
        extension,
        taille: 0,
        dossier: this.uploadDossier,
        storagePath: '',
        url,
        lien: url,
        uploadeurUid: profile.uid,
        uploadeurNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        dateCreation: new Date().toISOString(),
      };
      await this.documentService.createDocument(docId, doc);
      await this.notifService
        .broadcast('document', `Nouveau document : ${this.uploadNomBase.trim()}`, {
          lien: '/membre/documents',
          sourceNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        })
        .catch(() => {});
      this.documents.update((list) => [...list, { id: docId, ...doc }]);
      this.resetUploadForm();
      this.snackBar.open('Lien ajouté', '', { duration: 3000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open("Erreur lors de l'ajout du lien", '', { duration: 4000 });
    } finally {
      this.uploading.set(false);
    }
  }

  resetUploadForm() {
    this.uploadNomBase = '';
    this.uploadExtension = '';
    this.uploadDossier = '';
    this.uploadFile.set(null);
    this.uploadProgress.set(0);
    this.showUploadForm.set(false);
    this.isDragging.set(false);
    this.uploadMode.set('fichier');
    this.uploadLien = '';
    this.uploadLienExtension.set('lien');
    this.lienCheckStatus.set('idle');
  }

  openReplace(doc: ClubDocument) {
    this.expandedDocId.set(doc.id!);
    this.replaceNom = doc.nom;
    this.replaceDossier = doc.dossier;
    this.replaceExtension = doc.extension;
    this.replaceFile.set(null);
    this.replaceProgress.set(0);
    this.replaceLien = doc.lien ?? '';
  }

  triggerReplaceInput() {
    document.getElementById('replace-input')?.click();
  }

  onReplaceFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.replaceFile.set(file);
      this.replaceExtension = extractExtension(file.name);
    }
  }

  async replace(doc: ClubDocument) {
    const profile = this.profile();
    if (!this.replaceNom.trim() || !this.replaceDossier || !profile) return;

    this.replacing.set(true);
    this.replaceProgress.set(0);
    try {
      if (doc.lien !== undefined) {
        // Lien web — mise à jour URL + métadonnées
        const url = this.replaceLien.trim();
        if (!url || !this.isValidUrl(url)) return;
        await this.documentService.updateDocument(doc.id!, {
          nom: this.replaceNom.trim(),
          dossier: this.replaceDossier,
          url,
          lien: url,
        });
        this.documents.update((list) =>
          list.map((d) =>
            d.id === doc.id
              ? { ...d, nom: this.replaceNom.trim(), dossier: this.replaceDossier, url, lien: url, dateMiseAJour: new Date().toISOString() }
              : d,
          ),
        );
      } else {
        const file = this.replaceFile();
        if (file) {
          const extension = extractExtension(file.name);
          const filename = extension
            ? `${this.replaceNom.trim()}.${extension}`
            : this.replaceNom.trim();
          const { url, storagePath } = await this.documentService.uploadFile(
            doc.id!,
            file,
            filename,
            (pct) => this.replaceProgress.set(pct),
          );
          await this.documentService.updateDocument(doc.id!, {
            nom: this.replaceNom.trim(),
            dossier: this.replaceDossier,
            extension,
            taille: file.size,
            url,
            storagePath,
          });
          const diff = file.size - doc.taille;
          if (diff > 0) await this.documentService.incrementStorage(doc.uploadeurUid, diff);
          else if (diff < 0) await this.documentService.decrementStorage(doc.uploadeurUid, -diff);
          await this.notifService
            .broadcast('document', `Document mis à jour : ${this.replaceNom.trim()}`, {
              lien: '/membre/documents',
              sourceNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
            })
            .catch(() => {});
          this.documents.update((list) =>
            list.map((d) =>
              d.id === doc.id
                ? { ...d, nom: this.replaceNom.trim(), dossier: this.replaceDossier, extension, taille: file.size, url, storagePath, dateMiseAJour: new Date().toISOString() }
                : d,
            ),
          );
        } else {
          const filename = doc.extension
            ? `${this.replaceNom.trim()}.${doc.extension}`
            : this.replaceNom.trim();
          await this.documentService.updateDocument(doc.id!, {
            nom: this.replaceNom.trim(),
            dossier: this.replaceDossier,
          });
          await this.documentService.updateFileMetadata(doc.storagePath, filename);
          this.documents.update((list) =>
            list.map((d) =>
              d.id === doc.id
                ? { ...d, nom: this.replaceNom.trim(), dossier: this.replaceDossier, dateMiseAJour: new Date().toISOString() }
                : d,
            ),
          );
        }
      }
      this.expandedDocId.set(null);
      this.snackBar.open('Document mis à jour', '', { duration: 3000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Erreur lors de la mise à jour', '', { duration: 4000 });
    } finally {
      this.replacing.set(false);
    }
  }

  async deleteDoc(doc: ClubDocument) {
    const ok = await this.confirmService.confirm(`Supprimer "${doc.nom}" définitivement ?`);
    if (!ok) return;
    try {
      await this.documentService.deleteDocument(doc.id!, doc.storagePath);
      const profile = this.profile();
      if (profile?.uid === doc.uploadeurUid && doc.taille > 0) {
        await this.documentService.decrementStorage(profile.uid, doc.taille);
      }
      this.documents.update((list) => list.filter((d) => d.id !== doc.id));
      this.snackBar.open('Document supprimé', '', { duration: 3000 });
    } catch {
      this.snackBar.open('Erreur lors de la suppression', '', { duration: 4000 });
    }
  }
}
