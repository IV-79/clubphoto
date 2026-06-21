import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { take } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ArticleService } from '../../../services/article.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Article, ArticleType, ArticleStatut, ArticlePortee, ARTICLE_TYPES } from '../../../models/article.model';

@Component({
  selector: 'app-article-form',
  imports: [
    FormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, MatIconModule,
    MatProgressBarModule, MatDatepickerModule,
  ],
  template: `
    <div class="form-wrap">
      <div class="form-header">
        <button mat-icon-button (click)="goBack()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h2 class="form-title">{{ articleId() ? "Modifier l'article" : 'Nouvel article' }}</h2>
        @if (articleId()) {
          <button mat-icon-button color="warn" (click)="deleteArticle()" [disabled]="deleteLoading()" title="Supprimer">
            <mat-icon>delete</mat-icon>
          </button>
        }
      </div>

      <!-- Couverture -->
      <div class="cover-section">
        @if (previewUrl() || couvertureUrl()) {
          <div class="cover-preview">
            <img [src]="previewUrl() || couvertureUrl()" alt="Couverture" />
            <button class="remove-cover" (click)="removeCouverture()" mat-icon-button color="warn" title="Supprimer la couverture">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        } @else {
          <label class="cover-drop" for="cover-input"
            [class.dragging]="isDragging()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave()"
            (drop)="onDrop($event)">
            <mat-icon>add_photo_alternate</mat-icon>
            <span>Glisser une image ici ou cliquer pour choisir</span>
          </label>
        }
        <input id="cover-input" type="file" accept="image/*" style="display:none" (change)="onFileSelected($event)" />
        @if (uploadPct() > 0 && uploadPct() < 100) {
          <mat-progress-bar mode="determinate" [value]="uploadPct()" />
        }
      </div>

      <div class="fields">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Titre *</mat-label>
          <input matInput [(ngModel)]="titre" placeholder="Titre de l'article" />
        </mat-form-field>

        <div class="row-2">
          <mat-form-field appearance="outline">
            <mat-label>Type</mat-label>
            <mat-select [(ngModel)]="type">
              @for (t of types; track t.value) {
                <mat-option [value]="t.value">{{ t.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Statut</mat-label>
            <mat-select [(ngModel)]="statut">
              <mat-option value="brouillon">Brouillon</mat-option>
              <mat-option value="publie">Publié</mat-option>
              <mat-option value="expire">Expiré</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="row-2">
          <mat-form-field appearance="outline">
            <mat-label>Portée</mat-label>
            <mat-select [(ngModel)]="portee">
              <mat-option value="public">Public</mat-option>
              <mat-option value="membre">Membres uniquement</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Date de l'événement</mat-label>
            <input matInput [matDatepicker]="pickerDate" [(ngModel)]="dateObj" />
            <mat-datepicker-toggle matIconSuffix [for]="pickerDate" />
            <mat-datepicker #pickerDate />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Lieu</mat-label>
          <input matInput [(ngModel)]="lieu" placeholder="Lieu de l'événement" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Description</mat-label>
          <textarea matInput [(ngModel)]="description" rows="6"
            placeholder="Contenu de l'article..."></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Lien externe</mat-label>
          <input matInput [(ngModel)]="lienExterne" placeholder="https://..." type="url" />
          <mat-icon matSuffix>link</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date d'expiration</mat-label>
          <input matInput [matDatepicker]="pickerExp" [(ngModel)]="dateExpirationObj" />
          <mat-datepicker-toggle matIconSuffix [for]="pickerExp" />
          <mat-datepicker #pickerExp />
          <mat-hint>Laisser vide = pas d'expiration</mat-hint>
        </mat-form-field>

        <div class="checkbox-row">
          <mat-checkbox [(ngModel)]="epingle">
            <mat-icon style="vertical-align:middle;font-size:18px">push_pin</mat-icon>
            Épingler cet article en haut
          </mat-checkbox>
        </div>
      </div>

      <div class="actions">
        <button mat-button (click)="goBack()">Annuler</button>
        <button mat-raised-button color="primary" (click)="save()"
          [disabled]="saving() || uploading() || !titre.trim()">
          @if (saving() || uploading()) {
            <mat-icon>hourglass_empty</mat-icon>
          } @else {
            <mat-icon>save</mat-icon>
          }
          {{ articleId() ? 'Enregistrer' : "Créer l'article" }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .form-wrap { max-width: 760px; margin: 0 auto; padding: 24px; }
    .form-header { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; }
    .form-title { margin: 0; font-size: 1.3rem; font-weight: 600; flex: 1; }
    .cover-section { margin-bottom: 24px; }
    .cover-preview {
      position: relative; aspect-ratio: 16/9; border-radius: 10px;
      overflow: hidden; max-width: 500px; background: #f0f0f0;
    }
    .cover-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .remove-cover { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,.5); }
    .cover-drop {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; border: 2px dashed #bbb; border-radius: 10px; padding: 40px;
      cursor: pointer; color: #999; max-width: 500px;
      transition: border-color .2s, color .2s, background .2s;
    }
    .cover-drop:hover, .cover-drop.dragging {
      border-color: #1976d2; color: #1976d2; background: #e3f0ff;
    }
    .cover-drop mat-icon { font-size: 40px; width: 40px; height: 40px; }
    mat-progress-bar { margin-top: 8px; max-width: 500px; }
    .fields { display: flex; flex-direction: column; gap: 4px; }
    .full { width: 100%; }
    .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .checkbox-row { padding: 8px 0 16px; }
    .actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }

    @media (max-width: 560px) { .row-2 { grid-template-columns: 1fr; } }
  `]
})
export class ArticleForm implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private location       = inject(Location);
  private articleService = inject(ArticleService);
  private authService    = inject(AuthService);
  private snackBar       = inject(MatSnackBar);
  private confirmService = inject(ConfirmService);

  types = ARTICLE_TYPES;

  articleId     = signal<string | null>(null);
  saving        = signal(false);
  uploading     = signal(false);
  uploadPct     = signal(0);
  deleteLoading = signal(false);
  isDragging    = signal(false);

  titre          = '';
  type: ArticleType   = 'info';
  statut: ArticleStatut = 'brouillon';
  portee: ArticlePortee = 'public';
  dateObj: Date | null         = null;
  dateExpirationObj: Date | null = null;
  lieu        = '';
  description = '';
  lienExterne = '';
  epingle     = false;

  couvertureUrl         = signal('');
  couvertureStoragePath = signal('');
  pendingFile           = signal<File | null>(null);
  previewUrl            = signal('');
  removePendingCover    = signal(false);

  private profile = toSignal(this.authService.currentUserProfile$);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.articleId.set(id);
    this.articleService.getAllArticles().pipe(take(1)).subscribe(list => {
      const a = list.find(x => x.id === id);
      if (!a) return;
      this.titre             = a.titre;
      this.type              = a.type;
      this.statut            = a.statut;
      this.portee            = a.portee;
      this.dateObj           = a.date ? new Date(a.date) : null;
      this.dateExpirationObj = a.dateExpiration ? new Date(a.dateExpiration) : null;
      this.lieu              = a.lieu ?? '';
      this.description       = a.description ?? '';
      this.lienExterne       = a.lienExterne ?? '';
      this.epingle           = a.epingle;
      this.couvertureUrl.set(a.couvertureUrl ?? '');
      this.couvertureStoragePath.set(a.couvertureStoragePath ?? '');
    });
  }

  private handleFile(file: File) {
    this.pendingFile.set(file);
    const reader = new FileReader();
    reader.onload = e => this.previewUrl.set(e.target!.result as string);
    reader.readAsDataURL(file);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.handleFile(file);
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
    if (file?.type.startsWith('image/')) this.handleFile(file);
  }

  goBack() { this.location.back(); }

  private dateToString(d: Date | null): string | undefined {
    if (!d) return undefined;
    return d.toISOString().split('T')[0];
  }

  async save() {
    const profile = this.profile();
    if (!profile || !this.titre.trim()) return;
    this.saving.set(true);
    try {
      const fields = {
        titre:          this.titre.trim(),
        type:           this.type,
        statut:         this.statut,
        portee:         this.portee,
        date:           this.dateToString(this.dateObj),
        lieu:           this.lieu.trim() || undefined,
        description:    this.description.trim() || undefined,
        lienExterne:    this.lienExterne.trim() || undefined,
        dateExpiration: this.dateToString(this.dateExpirationObj),
        epingle:        this.epingle,
        auteurUid:      profile.uid,
        auteurNom:      `${profile.prenom ?? ''} ${profile.nom}`.trim(),
      };

      let id = this.articleId();
      if (!id) {
        id = await this.articleService.addArticle({
          ...fields,
          dateCreation: new Date().toISOString(),
        });
        this.articleId.set(id);
      } else {
        await this.articleService.updateArticle(id, fields);
      }

      if (this.removePendingCover() && !this.pendingFile()) {
        const oldPath = this.couvertureStoragePath();
        if (oldPath) {
          await this.articleService.deleteCouverture(oldPath);
          await this.articleService.updateArticle(id!, { couvertureUrl: undefined, couvertureStoragePath: undefined });
          this.couvertureStoragePath.set('');
        }
        this.removePendingCover.set(false);
      }

      if (this.pendingFile()) {
        this.saving.set(false);
        this.uploading.set(true);
        if (this.couvertureStoragePath()) {
          await this.articleService.deleteCouverture(this.couvertureStoragePath());
        }
        const { url, storagePath } = await this.articleService.uploadCouverture(
          id!, this.pendingFile()!, pct => this.uploadPct.set(pct)
        );
        await this.articleService.updateArticle(id!, { couvertureUrl: url, couvertureStoragePath: storagePath });
        this.pendingFile.set(null);
        this.previewUrl.set('');
        this.couvertureUrl.set(url);
        this.couvertureStoragePath.set(storagePath);
        this.removePendingCover.set(false);
        this.uploading.set(false);
      }

      this.snackBar.open(this.articleId() ? 'Article mis à jour' : 'Article créé', '', { duration: 3000 });
      this.location.back();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Erreur lors de la sauvegarde', '', { duration: 4000 });
    } finally {
      this.saving.set(false);
      this.uploading.set(false);
    }
  }

  async deleteArticle() {
    const ok = await this.confirmService.confirm('Supprimer cet article définitivement ?');
    if (!ok) return;
    this.deleteLoading.set(true);
    try {
      await this.articleService.deleteArticle(
        this.articleId()!,
        this.couvertureStoragePath() || undefined
      );
      this.location.back();
    } catch {
      this.snackBar.open('Erreur lors de la suppression', '', { duration: 4000 });
    } finally {
      this.deleteLoading.set(false);
    }
  }

  removeCouverture() {
    if (this.pendingFile()) {
      // Annule juste la sélection locale — restaure la vraie couverture Firestore
      this.pendingFile.set(null);
      this.previewUrl.set('');
      return;
    }
    // Suppression différée : sera effective uniquement à l'enregistrement
    this.removePendingCover.set(true);
    this.couvertureUrl.set('');
  }
}
