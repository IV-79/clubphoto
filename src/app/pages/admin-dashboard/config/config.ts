import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfigService, CategorieConfig, SiteConfig } from '../../../services/config.service';
import { ConfirmService } from '../../../services/confirm.service';
import { PHOTO_CATEGORIES } from '../../../models/photo.model';

function toSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Component({
  selector: 'app-admin-config',
  imports: [FormsModule],
  templateUrl: './config.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './config.css',
})
export class AdminConfig implements OnInit {
  private configService = inject(ConfigService);
  private confirmService = inject(ConfirmService);

  // Catégories
  categories = signal<CategorieConfig[]>([]);
  sortedCategories = computed(() =>
    [...this.categories()].sort((a, b) =>
      a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
    ),
  );
  saving = signal(false);
  newLabel = '';
  errorMsg = '';
  confirmReset = signal(false);
  editingCatValue = signal<string | null>(null);
  editCatLabel = '';

  // Limites
  portfolioLimit = signal(20);
  portfolioLimitSaving = signal(false);
  joursAvantEvent = signal(7);
  joursApresEvent = signal(7);
  eventWindowSaving = signal(false);

  // Image page d'accueil
  private siteConfigSignal = signal<SiteConfig>({});
  heroCurrentUrl = computed(() => this.siteConfigSignal().heroImageUrl ?? '');
  heroSource = computed<'manuel' | 'theme_du_mois'>(
    () => this.siteConfigSignal().heroSource ?? 'manuel',
  );
  heroPreview = signal<string | null>(null);
  heroFile = signal<File | null>(null);
  heroUploading = signal(false);
  heroError = signal('');
  isDragging = signal(false);

  async ngOnInit() {
    const [cfg, cats] = await Promise.all([
      firstValueFrom(this.configService.getSiteConfigOnce()),
      firstValueFrom(this.configService.getCategoriesOnce()),
    ]);
    this.siteConfigSignal.set(cfg);
    this.portfolioLimit.set(cfg.maxPhotosPortfolio ?? 20);
    this.joursAvantEvent.set(cfg.joursAvantEvenement ?? 7);
    this.joursApresEvent.set(cfg.joursApresEvenement ?? 7);
    this.categories.set(cats);
  }

  // ---- Limites ----
  async savePortfolioLimit() {
    const val = this.portfolioLimit();
    if (val < 1 || val > 500) return;
    this.portfolioLimitSaving.set(true);
    await this.configService.saveSiteConfig({ maxPhotosPortfolio: val });
    this.portfolioLimitSaving.set(false);
  }

  async saveEventWindow() {
    const avant = this.joursAvantEvent();
    const apres = this.joursApresEvent();
    if (avant < 0 || avant > 365 || apres < 0 || apres > 365) return;
    this.eventWindowSaving.set(true);
    await this.configService.saveSiteConfig({ joursAvantEvenement: avant, joursApresEvenement: apres });
    this.eventWindowSaving.set(false);
  }

  // ---- Catégories ----
  addCategorie() {
    const label = this.newLabel.trim();
    if (!label) return;
    const value = toSlug(label);
    if (!value) {
      this.errorMsg = 'Nom invalide.';
      return;
    }
    if (this.categories().some((c) => c.value === value)) {
      this.errorMsg = 'Cette catégorie existe déjà.';
      return;
    }
    this.categories.update((list) => [...list, { value, label }]);
    this.newLabel = '';
    this.errorMsg = '';
    this.save();
  }

  startEditCat(cat: CategorieConfig) {
    this.editingCatValue.set(cat.value);
    this.editCatLabel = cat.label;
  }

  saveEditCat(cat: CategorieConfig) {
    const label = this.editCatLabel.trim();
    if (!label) return;
    this.categories.update((list) =>
      list.map((c) => (c.value === cat.value ? { ...c, label } : c)),
    );
    this.editingCatValue.set(null);
    this.save();
  }

  cancelEditCat() {
    this.editingCatValue.set(null);
  }

  async deleteCategorie(cat: CategorieConfig) {
    const ok = await this.confirmService.confirm(`Supprimer la catégorie « ${cat.label} » ?`);
    if (!ok) return;
    this.categories.update((list) => list.filter((c) => c.value !== cat.value));
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

  // ---- Source hero ----
  async setHeroSource(source: 'manuel' | 'theme_du_mois') {
    await this.configService.saveSiteConfig({ heroSource: source });
    this.siteConfigSignal.update((c) => ({ ...c, heroSource: source }));
  }

  // ---- Image hero (mode manuel) ----
  private handleHeroFile(file: File) {
    this.heroFile.set(file);
    this.heroError.set('');
    const reader = new FileReader();
    reader.onload = (e) => this.heroPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  onHeroSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.handleHeroFile(file);
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      this.isDragging.set(false);
    }
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.handleHeroFile(file);
  }

  cancelHero() {
    this.heroFile.set(null);
    this.heroPreview.set(null);
    this.heroError.set('');
  }

  async saveHero() {
    const file = this.heroFile();
    if (!file) return;
    this.heroUploading.set(true);
    this.heroError.set('');
    try {
      const { url, storagePath } = await this.configService.uploadHeroImage(file);
      await this.configService.saveSiteConfig({
        heroImageUrl: url,
        heroImageStoragePath: storagePath,
      });
      this.siteConfigSignal.update((c) => ({ ...c, heroImageUrl: url, heroImageStoragePath: storagePath }));
      this.heroFile.set(null);
      this.heroPreview.set(null);
    } catch {
      this.heroError.set("Erreur lors de l'upload.");
    } finally {
      this.heroUploading.set(false);
    }
  }

  async deleteHero() {
    const ok = await this.confirmService.confirm("Supprimer l'image de la page d'accueil ?");
    if (!ok) return;
    const cfg = this.siteConfigSignal();
    if (cfg?.heroImageStoragePath) {
      await this.configService.deleteHeroImage(cfg.heroImageStoragePath).catch(() => {});
    }
    await this.configService.saveSiteConfig({ heroImageUrl: '', heroImageStoragePath: '' });
    this.siteConfigSignal.update((c) => ({ ...c, heroImageUrl: undefined, heroImageStoragePath: undefined }));
  }
}
