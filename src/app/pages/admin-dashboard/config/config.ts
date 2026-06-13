import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConfigService, CategorieConfig } from '../../../services/config.service';
import { ConfirmService } from '../../../services/confirm.service';
import { PHOTO_CATEGORIES } from '../../../models/photo.model';

function toSlug(label: string): string {
  return label.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Component({
  selector: 'app-admin-config',
  imports: [FormsModule],
  templateUrl: './config.html',
  styleUrl: './config.css',
})
export class AdminConfig implements OnInit {
  private configService = inject(ConfigService);
  private confirmService = inject(ConfirmService);

  categories = signal<CategorieConfig[]>([]);
  sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }))
  );
  saving = signal(false);
  newLabel = '';
  errorMsg = '';
  confirmReset = signal(false);

  ngOnInit() {
    this.configService.getCategories().subscribe(cats => this.categories.set(cats));
  }

  addCategorie() {
    const label = this.newLabel.trim();
    if (!label) return;
    const value = toSlug(label);
    if (!value) { this.errorMsg = 'Nom invalide.'; return; }
    if (this.categories().some(c => c.value === value)) {
      this.errorMsg = 'Cette catégorie existe déjà.';
      return;
    }
    this.categories.update(list => [...list, { value, label }]);
    this.newLabel = '';
    this.errorMsg = '';
    this.save();
  }

  async deleteCategorie(cat: CategorieConfig) {
    const ok = await this.confirmService.confirm(`Supprimer la catégorie « ${cat.label} » ?`);
    if (!ok) return;
    this.categories.update(list => list.filter(c => c.value !== cat.value));
    this.save();
  }

  async save() {
    this.saving.set(true);
    await this.configService.saveCategories(this.categories());
    this.saving.set(false);
  }

  resetDefaut() {
    this.categories.set(PHOTO_CATEGORIES as CategorieConfig[]);
    this.confirmReset.set(false);
    this.save();
  }
}
