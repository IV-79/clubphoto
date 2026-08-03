import { Component, inject, signal, computed } from '@angular/core';
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
import { Auth } from '@angular/fire/auth';
import { DocumentService } from '../../../services/document.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { NotificationService } from '../../../services/notification.service';
import { ClubDocument, getExtensionMeta, extractExtension } from '../../../models/document.model';

@Component({
  selector: 'app-documents',
  imports: [
    FormsModule, DatePipe,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressBarModule, MatTooltipModule,
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
          <mat-icon>upload_file</mat-icon>
          Nouveau document
        </button>
      </div>

      <!-- Formulaire upload -->
      @if (showUploadForm()) {
        <div class="upload-panel">
          <label class="file-drop" for="upload-input"
            [class.dragging]="isDragging()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave()"
            (drop)="onDrop($event)">
            @if (uploadFile()) {
              <mat-icon class="file-icon-large" [style.color]="getExtMeta(extractExt(uploadFile()!.name)).color">
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

          <div class="upload-fields">
            <mat-form-field appearance="outline" class="field-nom">
              <mat-label>Nom *</mat-label>
              <input matInput [(ngModel)]="uploadNomBase" placeholder="ex: Statuts 2024" />
              @if (uploadExtension) {
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
            <button mat-raised-button color="primary" (click)="upload()"
              [disabled]="uploading() || !uploadFile() || !uploadNomBase.trim() || !uploadDossier">
              @if (uploading()) { <mat-icon>hourglass_empty</mat-icon> } @else { <mat-icon>cloud_upload</mat-icon> }
              Uploader
            </button>
          </div>
        </div>
      }

      <!-- Filtres -->
      <div class="folder-chips">
        <button class="chip" [class.active]="selectedDossier() === null"
          (click)="selectedDossier.set(null)">
          Tous ({{ documents().length }})
        </button>
        @for (d of dossiers(); track d.id) {
          <button class="chip" [class.active]="selectedDossier() === d.nom"
            (click)="selectedDossier.set(d.nom)">
            {{ d.nom }} ({{ countForDossier(d.nom) }})
          </button>
        }
      </div>
      <div class="filter-bar">
        <div class="search-wrap">
          <mat-icon class="search-icon">search</mat-icon>
          <input class="search-input" type="text" placeholder="Rechercher par nom…"
            [value]="searchText()"
            (input)="searchText.set($any($event.target).value)" />
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
          <button class="sort-btn" (click)="sortDir.set(sortDir() === 'desc' ? 'asc' : 'desc')"
            [matTooltip]="sortDir() === 'desc' ? 'Plus récent en premier' : 'Plus ancien en premier'">
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
                  <span>{{ formatTaille(doc.taille) }}</span>
                  <span [matTooltip]="doc.dateMiseAJour ? 'Mis à jour (créé le ' + (doc.dateCreation | date:'d MMM yyyy':'':'fr') + ')' : ''">
                    {{ dateEffective(doc) | date:'d MMM yyyy':'':'fr' }}
                    @if (doc.dateMiseAJour) { <span class="meta-updated">✎</span> }
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="doc-actions">
                @if (canEdit(doc)) {
                  <button mat-icon-button matTooltip="Modifier"
                    (click)="openReplace(doc)">
                    <mat-icon>edit</mat-icon>
                  </button>
                }
                @if (canDelete(doc)) {
                  <button mat-icon-button matTooltip="Supprimer" color="warn"
                    (click)="deleteDoc(doc)">
                    <mat-icon>delete</mat-icon>
                  </button>
                }
                @if (doc.url) {
                  <a [href]="doc.url" target="_blank" rel="noopener noreferrer"
                    mat-icon-button matTooltip="Télécharger">
                    <mat-icon>download</mat-icon>
                  </a>
                }
              </div>
            </div>

            <!-- Formulaire de remplacement inline -->
            @if (expandedDocId() === doc.id) {
              <div class="replace-panel">
                <div class="replace-fields">
                  <mat-form-field appearance="outline" class="field-replace-nom">
                    <mat-label>Nom</mat-label>
                    <input matInput [(ngModel)]="replaceNom" />
                    @if (replaceExtension) {
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
                <div class="replace-file-row">
                  <button mat-stroked-button (click)="triggerReplaceInput()">
                    <mat-icon>attach_file</mat-icon>
                    {{ replaceFile() ? replaceFile()!.name : 'Remplacer le fichier (optionnel)' }}
                  </button>
                  <input id="replace-input" type="file" style="display:none"
                    (change)="onReplaceFileSelected($event)" />
                  @if (replaceProgress() > 0 && replaceProgress() < 100) {
                    <mat-progress-bar mode="determinate" [value]="replaceProgress()" class="replace-progress" />
                  }
                </div>
                <div class="replace-actions">
                  <button mat-button (click)="expandedDocId.set(null)">Annuler</button>
                  <button mat-raised-button color="primary"
                    [disabled]="replacing() || !replaceNom.trim() || !replaceDossier"
                    (click)="replace(doc)">
                    @if (replacing()) { <mat-icon>hourglass_empty</mat-icon> } @else { <mat-icon>save</mat-icon> }
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
  styles: [`
    .page-wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .page-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.4rem; font-weight: 600; }

    /* Upload panel */
    .upload-panel {
      background: var(--bg-surface-alt); border: 1px solid var(--border-medium); border-radius: 12px;
      padding: 20px; margin-bottom: 24px;
    }
    .upload-fields { display: grid; grid-template-columns: 1fr 220px; gap: 12px; margin-bottom: 12px; }
    .field-nom, .field-dossier { width: 100%; }
    .file-drop {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; border: 2px dashed var(--border-strong); border-radius: 10px; padding: 28px;
      cursor: pointer; color: var(--text-muted); transition: border-color .2s, color .2s, background .2s;
      margin-bottom: 8px;
    }
    .file-drop:hover, .file-drop.dragging { border-color: #1976d2; color: #1976d2; background: rgba(25,118,210,0.08); }
    .file-drop mat-icon { font-size: 32px; width: 32px; height: 32px; }
    .file-icon-large { font-size: 40px; width: 40px; height: 40px; }
    .file-name { font-weight: 500; font-size: .95rem; word-break: break-all; text-align: center; }
    .file-size { font-size: .8rem; color: var(--text-secondary); }
    .upload-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .ext-suffix { color: var(--text-muted); font-size: .9rem; padding-right: 4px; }

    /* Folder chips */
    .folder-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .search-wrap {
      flex: 1; min-width: 160px; max-width: 320px;
      display: flex; align-items: center; gap: 6px;
      border: 1px solid var(--border-medium); border-radius: 20px;
      padding: 5px 10px 5px 12px; background: var(--bg-surface);
      transition: border-color .15s;
    }
    .search-wrap:focus-within { border-color: #1976d2; }
    .search-icon { font-size: 18px; width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
    .search-input {
      flex: 1; border: none; outline: none; font-size: .85rem;
      color: var(--text-primary); background: transparent; min-width: 0;
    }
    .search-clear {
      display: flex; align-items: center; justify-content: center;
      background: none; border: none; cursor: pointer; padding: 0;
      color: var(--text-muted); line-height: 1;
    }
    .search-clear mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .search-clear:hover { color: var(--text-secondary); }
    .filter-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .chip {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border-medium);
      background: var(--bg-surface); cursor: pointer; font-size: .85rem; color: var(--text-secondary);
      transition: background .15s, color .15s, border-color .15s;
    }
    .chip:hover { border-color: #1976d2; color: #1976d2; }
    .chip.active { background: #1976d2; color: #fff; border-color: #1976d2; }
    .chip-icon { font-size: 16px; width: 16px; height: 16px; }
    .sort-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-medium);
      background: var(--bg-surface); cursor: pointer; font-size: .85rem; color: var(--text-secondary);
      transition: background .15s, color .15s;
    }
    .sort-btn:hover { background: var(--bg-surface-raised); color: #1976d2; }
    .sort-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }

    /* Empty state */
    .empty { text-align: center; padding: 48px 0; color: var(--text-muted); }
    .empty mat-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px; }
    .empty p { margin: 0; font-size: .95rem; }

    /* Document list */
    .doc-list { display: flex; flex-direction: column; gap: 8px; }
    .doc-card {
      border: 1px solid var(--border-medium); border-radius: 10px; overflow: hidden;
      background: var(--bg-surface);
    }
    .doc-row {
      display: flex; align-items: center; gap: 14px; padding: 14px 16px;
    }
    .doc-icon-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; flex-shrink: 0; }
    .doc-icon { font-size: 28px; width: 28px; height: 28px; }
    .ext-badge {
      font-size: .65rem; font-weight: 700; color: #fff;
      padding: 1px 5px; border-radius: 4px; text-transform: uppercase;
    }
    .doc-info { flex: 1; min-width: 0; }
    .doc-nom { font-weight: 500; font-size: .95rem; display: block; word-break: break-all; }
    .doc-meta {
      display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px;
      font-size: .78rem; color: var(--text-secondary); align-items: center;
    }
    .meta-tag {
      background: var(--bg-surface-raised); padding: 2px 8px; border-radius: 10px;
      color: var(--text-secondary); font-weight: 500;
    }
    .meta-updated { color: #f57c00; font-size: .8rem; }
    .doc-actions { display: flex; align-items: center; flex-shrink: 0; }

    /* Replace panel */
    .replace-panel {
      border-top: 1px solid var(--border-medium); background: var(--bg-surface-alt);
      padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
    }
    .replace-fields { display: grid; grid-template-columns: 1fr 200px; gap: 12px; }
    .field-replace-nom, .field-replace-dossier { width: 100%; }
    .replace-file-row { display: flex; align-items: center; gap: 12px; }
    .replace-progress { flex: 1; }
    .replace-actions { display: flex; gap: 8px; justify-content: flex-end; }

    @media (max-width: 560px) {
      .upload-fields { grid-template-columns: 1fr; }
      .doc-actions { flex-direction: column; }
    }
  `]
})
export class Documents {
  private documentService  = inject(DocumentService);
  private authService      = inject(AuthService);
  private confirmService   = inject(ConfirmService);
  private notifService     = inject(NotificationService);
  private snackBar         = inject(MatSnackBar);
  private auth             = inject(Auth);

  currentUid = signal(this.auth.currentUser?.uid ?? '');
  private profile = toSignal(this.authService.currentUserProfile$);

  dossiers  = toSignal(this.documentService.getDossiers(), { initialValue: [] });
  documents = toSignal(this.documentService.getDocuments(), { initialValue: [] });

  selectedDossier = signal<string | null>(null);
  showMine        = signal(false);
  sortDir         = signal<'asc' | 'desc'>('desc');
  searchText      = signal('');
  showUploadForm  = signal(false);
  expandedDocId   = signal<string | null>(null);

  uploadNomBase     = '';
  uploadExtension   = '';
  uploadDossier = '';
  uploadFile    = signal<File | null>(null);
  uploadProgress = signal(0);
  uploading      = signal(false);
  isDragging     = signal(false);

  replaceNom       = '';
  replaceDossier   = '';
  replaceExtension = '';
  replaceFile     = signal<File | null>(null);
  replaceProgress = signal(0);
  replacing       = signal(false);

  isAdmin = computed(() => this.profile()?.role === 'admin');

  dateEffective(doc: ClubDocument): string {
    return doc.dateMiseAJour ?? doc.dateCreation;
  }

  filteredDocuments = computed(() => {
    const dossier = this.selectedDossier();
    const mine    = this.showMine();
    const dir     = this.sortDir();
    const uid     = this.currentUid();
    const search  = this.searchText().toLowerCase().trim();

    let docs = this.documents();
    if (dossier) docs = docs.filter(d => d.dossier === dossier);
    if (mine)    docs = docs.filter(d => d.uploadeurUid === uid);
    if (search)  docs = docs.filter(d => d.nom.toLowerCase().includes(search));

    const sign = dir === 'asc' ? 1 : -1;
    return [...docs].sort((a, b) =>
      sign * this.dateEffective(a).localeCompare(this.dateEffective(b))
    );
  });

  countForDossier(nom: string): number {
    return this.documents().filter(d => d.dossier === nom).length;
  }

  getExtMeta(ext: string) { return getExtensionMeta(ext); }
  extractExt(filename: string) { return extractExtension(filename); }

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

  toggleUploadForm() {
    this.showUploadForm.update(v => !v);
    if (!this.showUploadForm()) this.resetUploadForm();
  }

  onUploadFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setUploadFile(file);
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging.set(true); }
  onDragLeave() { this.isDragging.set(false); }
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

      const filename = extension ? `${this.uploadNomBase.trim()}.${extension}` : this.uploadNomBase.trim();
      const { url, storagePath } = await this.documentService.uploadFile(
        docId, file, filename, pct => this.uploadProgress.set(pct)
      );

      await this.documentService.createDocument(docId, {
        nom:          this.uploadNomBase.trim(),
        extension,
        taille:       file.size,
        dossier:      this.uploadDossier,
        storagePath,
        url,
        uploadeurUid: profile.uid,
        uploadeurNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        dateCreation: new Date().toISOString(),
      });

      await this.documentService.incrementStorage(profile.uid, file.size);
      await this.notifService.broadcast('document',
        `Nouveau document : ${this.uploadNomBase.trim()}`,
        { lien: '/membre/documents', sourceNom: `${profile.prenom ?? ''} ${profile.nom}`.trim() }
      ).catch(() => {});
      this.resetUploadForm();
      this.snackBar.open('Document uploadé', '', { duration: 3000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open("Erreur lors de l'upload", '', { duration: 4000 });
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
  }

  openReplace(doc: ClubDocument) {
    this.expandedDocId.set(doc.id!);
    this.replaceNom = doc.nom;
    this.replaceDossier = doc.dossier;
    this.replaceExtension = doc.extension;
    this.replaceFile.set(null);
    this.replaceProgress.set(0);
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
    const file = this.replaceFile();
    const profile = this.profile();
    if (!this.replaceNom.trim() || !profile) return;

    this.replacing.set(true);
    this.replaceProgress.set(0);
    try {
      if (file) {
        const extension = extractExtension(file.name);
        const filename = extension ? `${this.replaceNom.trim()}.${extension}` : this.replaceNom.trim();
        const { url, storagePath } = await this.documentService.uploadFile(
          doc.id!, file, filename, pct => this.replaceProgress.set(pct)
        );
        await this.documentService.updateDocument(doc.id!, {
          nom: this.replaceNom.trim(), dossier: this.replaceDossier,
          extension, taille: file.size, url, storagePath,
        });
        const diff = file.size - doc.taille;
        if (diff > 0) await this.documentService.incrementStorage(doc.uploadeurUid, diff);
        else if (diff < 0) await this.documentService.decrementStorage(doc.uploadeurUid, -diff);
        await this.notifService.broadcast('document',
          `Document mis à jour : ${this.replaceNom.trim()}`,
          { lien: '/membre/documents', sourceNom: `${profile.prenom ?? ''} ${profile.nom}`.trim() }
        ).catch(() => {});
      } else {
        const filename = doc.extension ? `${this.replaceNom.trim()}.${doc.extension}` : this.replaceNom.trim();
        await this.documentService.updateDocument(doc.id!, {
          nom: this.replaceNom.trim(), dossier: this.replaceDossier,
        });
        await this.documentService.updateFileMetadata(doc.storagePath, filename);
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
      if (profile?.uid === doc.uploadeurUid) {
        await this.documentService.decrementStorage(profile.uid, doc.taille);
      }
      this.snackBar.open('Document supprimé', '', { duration: 3000 });
    } catch {
      this.snackBar.open('Erreur lors de la suppression', '', { duration: 4000 });
    }
  }
}
