import { Component, inject, signal, computed } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { ReunionService } from '../../../services/reunion.service';
import { DocumentService } from '../../../services/document.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Reunion } from '../../../models/reunion.model';
import { ClubDocument, getExtensionMeta, extractExtension } from '../../../models/document.model';

const INIT = 8;
const PAGE = 8;

@Component({
  selector: 'app-reunions',
  imports: [
    SlicePipe, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule,
    DatePickerComponent,
  ],
  templateUrl: './reunions.html',
  styleUrl: './reunions.css',
})
export class Reunions {
  private service       = inject(ReunionService);
  private docService    = inject(DocumentService);
  private authService   = inject(AuthService);
  private confirmService = inject(ConfirmService);

  private readonly todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  reunions = toSignal(this.service.getReunions(), { initialValue: [] as Reunion[] });

  showPasses = signal(false);
  showCreateForm = signal(false);
  expandedId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  saving = signal(false);
  flashEdit = signal(false);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Documents ---
  docsByReunion   = signal<Record<string, ClubDocument[]>>({});
  uploadingFor    = signal<string | null>(null);
  uploadProgress  = signal<number>(0);
  pickerOpenFor   = signal<string | null>(null);
  pickerDocs      = signal<ClubDocument[]>([]);
  pickerLoading   = signal(false);
  pickerSearch    = signal('');
  liaisonLoading  = signal(false);
  private reunionDossierId: string | null = null;

  filteredPickerDocs = computed(() => {
    const q = this.pickerSearch().toLowerCase().trim();
    if (!q) return this.pickerDocs();
    return this.pickerDocs().filter(d =>
      d.nom.toLowerCase().includes(q) || d.extension.toLowerCase().includes(q)
    );
  });

  private limitAVenir = signal(INIT);
  private limitPasses = signal(INIT);

  private aVenirAll = computed(() =>
    this.reunions()
      .filter(r => r.date >= this.todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
  );
  private passesAll = computed(() =>
    this.reunions()
      .filter(r => r.date < this.todayStr)
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  aVenir        = computed(() => this.aVenirAll().slice(0, this.limitAVenir()));
  passes        = computed(() => this.passesAll().slice(0, this.limitPasses()));
  aVenirCount   = computed(() => this.aVenirAll().length);
  passesCount   = computed(() => this.passesAll().length);
  hasMoreAVenir = computed(() => this.limitAVenir() < this.aVenirAll().length);
  hasMorePasses = computed(() => this.limitPasses() < this.passesAll().length);

  createForm = this.buildForm();
  editForm   = this.buildForm();

  openCreate() {
    this.editingId.set(null);
    this.createForm.reset({ titre: '', date: '', lieu: '', description: '' });
    this.showCreateForm.set(true);
    this.expandedId.set(null);
  }

  cancelCreate() { this.showCreateForm.set(false); }

  async creer() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.createForm.getRawValue();
      await this.service.creer({
        titre: v.titre.trim(),
        date: v.date,
        ...(v.lieu.trim()        ? { lieu: v.lieu.trim() }               : {}),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      });
      this.showCreateForm.set(false);
      this.createForm.reset();
    } finally { this.saving.set(false); }
  }

  toggleExpand(id: string) {
    if (this.editingId() === id) { this.cancelEdit(); return; }
    if (this.editingId() !== null) { this.triggerFlash(); return; }
    const newId = this.expandedId() === id ? null : id;
    this.expandedId.set(newId);
    this.pickerOpenFor.set(null);
    if (newId) this.loadDocs(newId);
  }

  private triggerFlash() {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashEdit.set(false);
    setTimeout(() => {
      this.flashEdit.set(true);
      this.flashTimer = setTimeout(() => this.flashEdit.set(false), 600);
    }, 0);
  }

  startEdit(r: Reunion) {
    this.showCreateForm.set(false);
    this.editForm.reset({
      titre: r.titre,
      date: r.date,
      lieu: r.lieu ?? '',
      description: r.description ?? '',
    });
    this.editingId.set(r.id);
    this.expandedId.set(r.id);
  }

  cancelEdit() { this.editingId.set(null); }

  async sauvegarder(id: string) {
    if (this.editForm.invalid) return;
    this.saving.set(true);
    try {
      const v = this.editForm.getRawValue();
      const oldReunion = this.reunions().find(r => r.id === id);
      await this.service.modifier(id, {
        titre:       v.titre.trim(),
        date:        v.date,
        lieu:        v.lieu.trim(),
        description: v.description.trim(),
      }, oldReunion ? { oldDate: oldReunion.date, titre: v.titre.trim() } : undefined);
      this.editingId.set(null);
    } finally { this.saving.set(false); }
  }

  async supprimer(r: Reunion) {
    const ok = await this.confirmService.confirm(`Supprimer « ${r.titre} » définitivement ?`);
    if (!ok) return;
    await this.service.supprimer(r.id);
    if (this.editingId() === r.id) this.editingId.set(null);
    if (this.expandedId() === r.id) this.expandedId.set(null);
  }

  // --- Méthodes documents ---

  reunionDocs(reunionId: string): ClubDocument[] { return this.docsByReunion()[reunionId] ?? []; }

  extMeta(ext: string) { return getExtensionMeta(ext); }

  private async loadDocs(reunionId: string) {
    const docs = await firstValueFrom(this.docService.getDocumentsByReunion(reunionId));
    docs.sort((a, b) => a.dateCreation.localeCompare(b.dateCreation));
    this.docsByReunion.update(m => ({ ...m, [reunionId]: docs }));
  }

  async onFileSelected(event: Event, reunion: Reunion) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.uploadingFor()) return;
    input.value = '';

    const [profile, dossier] = await Promise.all([
      firstValueFrom(this.authService.currentUserProfile$),
      this.getOrCreateReunionDossier(),
    ]);
    if (!profile) return;

    this.uploadingFor.set(reunion.id);
    this.uploadProgress.set(0);
    try {
      const ext = extractExtension(file.name);
      const nom = file.name.slice(0, file.name.lastIndexOf('.')) || file.name;
      const docId = this.docService.generateDocId();
      const { url, storagePath } = await this.docService.uploadFile(
        docId, file, file.name,
        pct => this.uploadProgress.set(pct)
      );
      await this.docService.createDocument(docId, {
        nom, extension: ext, taille: file.size, dossier,
        storagePath, url,
        uploadeurUid: profile.uid,
        uploadeurNom: `${profile.prenom ?? ''} ${profile.nom}`.trim(),
        dateCreation: new Date().toISOString(),
        type: 'reunion',
        reunionId: reunion.id,
      });
      await this.docService.incrementStorage(profile.uid, file.size);
      await this.loadDocs(reunion.id);
    } finally {
      this.uploadingFor.set(null);
    }
  }

  private async getOrCreateReunionDossier(): Promise<string> {
    if (this.reunionDossierId) return this.reunionDossierId;
    const nom = 'Réunions';
    const dossiers = await firstValueFrom(this.docService.getDossiers());
    if (!dossiers.find(d => d.nom === nom)) {
      await this.docService.addDossier(nom, dossiers.length);
    }
    // dossier stocke le nom (pas l'id) — convention du composant documents
    this.reunionDossierId = nom;
    return nom;
  }

  async openPicker(reunionId: string) {
    if (this.pickerOpenFor() === reunionId) { this.pickerOpenFor.set(null); return; }
    this.pickerSearch.set('');
    this.pickerOpenFor.set(reunionId);
    this.pickerLoading.set(true);
    try {
      const all = await firstValueFrom(this.docService.getDocumentsOnce());
      this.pickerDocs.set(all.filter(d => !d.reunionId && (!d.type || d.type === 'general')));
    } finally {
      this.pickerLoading.set(false);
    }
  }

  async lierDoc(event: Event, reunionId: string, d: ClubDocument) {
    event.stopPropagation();
    if (this.liaisonLoading()) return;
    this.liaisonLoading.set(true);
    try {
      await this.docService.lierAReunion(d.id!, reunionId);
      this.pickerOpenFor.set(null);
      this.pickerSearch.set('');
      await this.loadDocs(reunionId);
    } finally {
      this.liaisonLoading.set(false);
    }
  }

  async retirerDoc(reunionId: string, d: ClubDocument) {
    const msg = d.type === 'reunion'
      ? `Supprimer définitivement « ${d.nom} » ?`
      : `Retirer le lien vers « ${d.nom} » ? Le document restera dans la bibliothèque.`;
    const ok = await this.confirmService.confirm(msg);
    if (!ok) return;
    if (d.type === 'reunion') {
      await this.docService.deleteDocument(d.id!, d.storagePath);
      await this.docService.decrementStorage(d.uploadeurUid, d.taille);
    } else {
      await this.docService.delierReunion(d.id!);
    }
    await this.loadDocs(reunionId);
  }

  loadMoreAVenir() { this.limitAVenir.update(n => n + PAGE); }
  loadMorePasses()  { this.limitPasses.update(n => n + PAGE); }

  monthOf(date: string): string { return date.slice(0, 7); }

  formatMonth(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  formatDateFull(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  mapsUrl(lieu: string): string {
    return `https://www.google.com/maps/search/?q=${encodeURIComponent(lieu)}`;
  }

  private buildForm() {
    return new FormGroup({
      titre:       new FormControl('', { validators: [Validators.required], nonNullable: true }),
      date:        new FormControl('', { validators: [Validators.required], nonNullable: true }),
      lieu:        new FormControl('', { nonNullable: true }),
      description: new FormControl('', { nonNullable: true }),
    });
  }
}
