import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PartenairesService } from '../../../services/partenaires.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Partenaire } from '../../../models/partenaire.model';
import { compressImage, COMPRESS_LOGO } from '../../../utils/image-compress';

@Component({
  selector: 'app-admin-partenaires',
  imports: [FormsModule],
  templateUrl: './admin-partenaires.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './admin-partenaires.css',
})
export class AdminPartenaires implements OnInit {
  private service = inject(PartenairesService);
  private confirmService = inject(ConfirmService);

  partenaires = signal<Partenaire[]>([]);
  loading = signal(true);

  // ── Formulaire ajout ──────────────────────────────────────────
  showAddForm = signal(false);
  addNom = '';
  addLien = '';
  addFile: File | null = null;
  addPreview = signal<string | null>(null);
  addUploading = signal(false);
  addProgress = signal(0);

  // ── Formulaire édition ────────────────────────────────────────
  editingId = signal<string | null>(null);
  editNom = '';
  editLien = '';
  editFile: File | null = null;
  editPreview = signal<string | null>(null);
  editUploading = signal(false);
  editProgress = signal(0);

  async ngOnInit() {
    await this.charger();
  }

  private async charger() {
    this.loading.set(true);
    const list = await firstValueFrom(this.service.getPartenaires());
    this.partenaires.set(list);
    this.loading.set(false);
  }

  // ── Ajout ─────────────────────────────────────────────────────
  openAddForm() {
    this.addNom = '';
    this.addLien = '';
    this.addFile = null;
    this.addPreview.set(null);
    this.addProgress.set(0);
    this.showAddForm.set(true);
    this.editingId.set(null);
  }

  cancelAdd() {
    this.showAddForm.set(false);
  }

  addDragging = signal(false);
  editDragging = signal(false);

  private setAddFile(file: File) {
    this.addFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.addPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  private setEditFile(file: File) {
    this.editFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.editPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  onAddFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setAddFile(file);
  }

  onDragOver(event: DragEvent, form: 'add' | 'edit') {
    event.preventDefault();
    event.stopPropagation();
    if (form === 'add') this.addDragging.set(true);
    else this.editDragging.set(true);
  }

  onDragLeave(event: DragEvent, form: 'add' | 'edit') {
    event.stopPropagation();
    if (form === 'add') this.addDragging.set(false);
    else this.editDragging.set(false);
  }

  onDrop(event: DragEvent, form: 'add' | 'edit') {
    event.preventDefault();
    event.stopPropagation();
    if (form === 'add') this.addDragging.set(false);
    else this.editDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (form === 'add') this.setAddFile(file);
    else this.setEditFile(file);
  }

  async ajouter() {
    const nom = this.addNom.trim();
    const lien = this.addLien.trim();
    if (!nom || !this.addFile || this.addUploading()) return;

    this.addUploading.set(true);
    try {
      const compressed = await compressImage(this.addFile, COMPRESS_LOGO);
      const id = this.service.generateId();
      let logoUrl = '';
      let logoPath = '';

      await new Promise<void>((resolve, reject) => {
        this.service.uploadLogo(compressed, id).subscribe({
          next: (state) => {
            this.addProgress.set(state.progress);
            if (state.done && state.url && state.path) {
              logoUrl = state.url;
              logoPath = state.path;
            }
          },
          error: reject,
          complete: resolve,
        });
      });

      await this.service.creerPartenaire(id, {
        nom,
        ...(lien ? { lien } : {}),
        logoUrl,
        logoPath,
        ordre: this.partenaires().length,
        actif: true,
        dateCreation: new Date().toISOString(),
      });

      this.showAddForm.set(false);
      await this.charger();
    } finally {
      this.addUploading.set(false);
      this.addProgress.set(0);
    }
  }

  // ── Édition ───────────────────────────────────────────────────
  startEdit(p: Partenaire) {
    this.showAddForm.set(false);
    this.editNom = p.nom;
    this.editLien = p.lien ?? '';
    this.editFile = null;
    this.editPreview.set(null);
    this.editProgress.set(0);
    this.editingId.set(p.id);
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  onEditFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setEditFile(file);
  }

  async sauvegarder(p: Partenaire) {
    const nom = this.editNom.trim();
    const lien = this.editLien.trim();
    if (!nom || this.editUploading()) return;

    this.editUploading.set(true);
    try {
      const updates: Partial<Omit<Partenaire, 'id'>> = {
        nom,
        lien: lien || undefined,
      };

      if (this.editFile) {
        const compressed = await compressImage(this.editFile, COMPRESS_LOGO);
        await new Promise<void>((resolve, reject) => {
          this.service.uploadLogo(compressed, p.id).subscribe({
            next: (state) => {
              this.editProgress.set(state.progress);
              if (state.done && state.url && state.path) {
                updates.logoUrl = state.url;
                updates.logoPath = state.path;
              }
            },
            error: reject,
            complete: resolve,
          });
        });
      }

      await this.service.modifierPartenaire(p.id, updates);
      this.editingId.set(null);
      await this.charger();
    } finally {
      this.editUploading.set(false);
      this.editProgress.set(0);
    }
  }

  // ── Actif toggle ──────────────────────────────────────────────
  async toggleActif(p: Partenaire) {
    await this.service.modifierPartenaire(p.id, { actif: !p.actif });
    this.partenaires.update((list) =>
      list.map((x) => (x.id === p.id ? { ...x, actif: !p.actif } : x)),
    );
  }

  // ── Réordonnancement ──────────────────────────────────────────
  async monter(index: number) {
    if (index === 0) return;
    const list = [...this.partenaires()];
    const a = list[index - 1];
    const b = list[index];
    await Promise.all([
      this.service.modifierPartenaire(a.id, { ordre: b.ordre }),
      this.service.modifierPartenaire(b.id, { ordre: a.ordre }),
    ]);
    await this.charger();
  }

  async descendre(index: number) {
    const list = this.partenaires();
    if (index >= list.length - 1) return;
    const a = list[index];
    const b = list[index + 1];
    await Promise.all([
      this.service.modifierPartenaire(a.id, { ordre: b.ordre }),
      this.service.modifierPartenaire(b.id, { ordre: a.ordre }),
    ]);
    await this.charger();
  }

  // ── Suppression ───────────────────────────────────────────────
  async supprimer(p: Partenaire) {
    const ok = await this.confirmService.confirm(
      `Supprimer le partenaire « ${p.nom} » et son logo définitivement ?`,
    );
    if (!ok) return;
    await this.service.supprimerPartenaire(p.id, p.logoPath);
    await this.charger();
  }
}
