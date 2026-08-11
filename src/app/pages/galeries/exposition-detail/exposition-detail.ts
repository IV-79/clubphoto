import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, of } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { ExpositionService } from '../../../services/exposition.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import {
  Exposition,
  ExpoSuggestion,
  ExpoVoteDoc,
  ExpoPhoto,
  ExpoStatut,
  getExpoStatut,
} from '../../../models/exposition.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { EventHero, HeroBadge } from '../../../components/event-hero/event-hero';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { compressImage, COMPRESS_EVENT } from '../../../utils/image-compress';
import { readExifWithConsent } from '../../../utils/exif-reader';
import { localDateISO } from '../../../utils/date';
import { GpsConsentService } from '../../../services/gps-consent.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-exposition-detail',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    DatePickerComponent,
    EventHero,
    PhotoLightbox,
  ],
  templateUrl: './exposition-detail.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './exposition-detail.css',
})
export class ExpositionDetail {
  @ViewChild('coverInput') coverInput!: ElementRef<HTMLInputElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expoService = inject(ExpositionService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private gpsConsentService = inject(GpsConsentService);
  private notifService = inject(NotificationService);
  private elRef = inject(ElementRef);

  readonly expoId = this.route.snapshot.paramMap.get('id')!;

  profile = toSignal(this.authService.currentUserProfile$);
  uid = computed(() => this.profile()?.uid ?? null);

  // ── Data signals (one-shot, mis à jour localement après mutations) ───────────

  expo = signal<Exposition | null>(null); // null = chargement en cours
  notFound = signal(false);
  suggestions = signal<ExpoSuggestion[]>([]);
  tousVotes = signal<ExpoVoteDoc[]>([]);
  photos = signal<ExpoPhoto[]>([]);

  private loaded = signal(false);

  // ── Permissions ──────────────────────────────────────────────────────────────

  isOrganisateur = computed(() => !!this.uid() && this.uid() === this.expo()?.organisateurUid);
  isAdmin = computed(() => this.profile()?.role === 'admin');
  canManage = computed(() => this.isOrganisateur() || this.isAdmin());
  isMembre = computed(() => !!this.profile());
  photosPubliques = computed(() => !!this.expo()?.photosPubliques);
  visibilitePublique = computed(() => this.expo()?.visibilite === 'public');

  // ── Statut calculé depuis les dates ─────────────────────────────────────────

  expoStatut = computed((): ExpoStatut => (this.expo() ? getExpoStatut(this.expo()!) : 'ideation'));

  typeBadgeHero = computed((): HeroBadge => ({ text: '🖼 Exposition', css: 'badge-expo' }));
  statusHero = computed((): HeroBadge => {
    const labels: Record<string, { text: string; css: string }> = {
      ideation: { text: 'Idéation', css: 'status-ideation' },
      nettoyage: { text: 'Nettoyage', css: 'status-nettoyage' },
      votation: { text: 'Vote', css: 'status-votation' },
      soumission: { text: 'Soumission', css: 'status-soumission' },
      cloture: { text: 'En exposition', css: 'status-cloture' },
    };
    return labels[this.expoStatut()] ?? labels['ideation'];
  });

  constructor() {
    // Charge les données une seule fois quand l'état d'auth est connu
    effect(() => {
      const p = this.profile();
      if (p === undefined) return;
      if (this.loaded()) return;
      untracked(() => {
        this.loaded.set(true);
        this.charger(p?.uid ?? null);
      });
    });

    // Pré-remplir nombreVotesParMembre : 3 au 1er passage, 1 aux suivants
    effect(() => {
      if (this.expoStatut() !== 'nettoyage') return;
      const secondPasse = this.suggestions().some((s) => !s.actif);
      untracked(() => {
        if (!this.formVotation.get('nombreVotesParMembre')?.dirty) {
          this.formVotation.patchValue({ nombreVotesParMembre: secondPasse ? 1 : 3 });
        }
      });
    });

    // Pré-remplir themeChoisi avec le vainqueur clair (si pas ex-aequo)
    effect(() => {
      if (this.expoStatut() !== 'nettoyage') return;
      const winner = this.themeVainqueur();
      if (!winner) return;
      untracked(() => {
        if (!this.formSoumission.get('themeChoisi')?.value) {
          this.formSoumission.patchValue({ themeChoisi: winner.texte });
        }
      });
    });

    // Verrouille les dates pré-soumission quand un thème est saisi dans le formulaire d'édition
    effect(() => {
      if (!this.editMode()) return;
      const locked = !!this.editThemeSignal()?.trim();
      untracked(() => {
        ['dateDebutIdeation', 'dateFinIdeation', 'dateFinVote'].forEach((name) => {
          const ctrl = this.editForm.get(name)!;
          locked ? ctrl.disable({ emitEvent: false }) : ctrl.enable({ emitEvent: false });
        });
      });
    });

    // Auto-transition votation→nettoyage uniquement (effets de bord sur suggestions/votes)
    effect(() => {
      const e = this.expo();
      if (!e || !this.canManage()) return;
      if (e.statut !== 'votation' || !e.dateFinVote) return;
      if (new Date(e.dateFinVote + 'T23:59:59') >= new Date()) return;
      untracked(() =>
        this.expoService.retourNettoyageDepuisVotation(this.expoId).then(async () => {
          this.expo.update((ex) =>
            ex
              ? {
                  ...ex,
                  statut: 'nettoyage',
                  dateFinVote: undefined,
                  nombreVotesParMembre: undefined,
                }
              : ex,
          );
          this.localVoteMap.set({});
          this.sortMode.set('votes');
          const suggs = await this.expoService.getSuggestionsOnce(this.expoId);
          this.suggestions.set(suggs);
        }),
      );
    });
  }

  private async charger(uid: string | null) {
    const expoData = await firstValueFrom(this.expoService.getExpositionOnce(this.expoId));
    if (!expoData) {
      this.notFound.set(true);
      return;
    }
    this.expo.set(expoData);
    const s = getExpoStatut(expoData);
    this.sortMode.set(s === 'nettoyage' ? 'votes' : 'alpha');

    const loads: Promise<void>[] = [];

    if (uid) {
      loads.push(
        this.expoService.getSuggestionsOnce(this.expoId).then((data) => this.suggestions.set(data)),
      );
    }

    if (s === 'votation' && uid) {
      loads.push(
        Promise.all([
          this.expoService.getTousVotesOnce(this.expoId),
          this.expoService.getMonVoteOnce(this.expoId, uid),
        ]).then(([votes, monVote]) => {
          this.tousVotes.set(votes);
          if (monVote) {
            const map: Record<string, number> = {};
            for (const id of monVote.themeIds) map[id] = (map[id] ?? 0) + 1;
            this.localVoteMap.set(map);
          }
        }),
      );
    }

    if (s === 'soumission' && uid) {
      loads.push(this.expoService.getPhotosOnce(this.expoId).then((p) => this.photos.set(p)));
    }

    if (s === 'cloture') {
      loads.push(this.expoService.getPhotosOnce(this.expoId).then((p) => this.photos.set(p)));
    }

    await Promise.all(loads);
  }

  // ── Suggestions ──────────────────────────────────────────────────────────────

  newSuggestion = signal('');
  newSuggestionAdmin = signal('');
  savingSugg = signal(false);
  editingSuggId = signal<string | null>(null);
  editingSuggTexte = signal('');

  suggestionsActives = computed(() => this.suggestions().filter((s) => s.actif));

  sortMode = signal<'alpha' | 'votes'>('alpha');

  // Vainqueur clair = 1 seul avec le max parmi tous (null si ex-aequo ou aucun vote)
  themeVainqueur = computed(() => {
    const all = this.suggestions();
    if (all.length === 0) return null;
    const scores = this.scoreParSuggestion();
    const maxScore = Math.max(...all.map((s) => scores[s.id] ?? 0));
    if (maxScore === 0) return null;
    const winners = all.filter((s) => (scores[s.id] ?? 0) === maxScore);
    return winners.length === 1 ? winners[0] : null;
  });

  // Score max parmi toutes les suggestions (0 si aucun vote)
  maxScoreVote = computed(() => {
    const all = this.suggestions();
    if (all.length === 0) return 0;
    const scores = this.scoreParSuggestion();
    return Math.max(0, ...all.map((s) => scores[s.id] ?? 0));
  });

  // Liste triée pour le sélecteur : gagnants (ex-aequo) en premier en alpha, puis le reste en alpha
  suggestionsPourSelection = computed(() => {
    const all = [...this.suggestions()];
    const scores = this.scoreParSuggestion();
    const max = this.maxScoreVote();
    return all.sort((a, b) => {
      const aWins = max > 0 && (scores[a.id] ?? 0) === max;
      const bWins = max > 0 && (scores[b.id] ?? 0) === max;
      if (aWins !== bWins) return aWins ? -1 : 1;
      return a.texte.localeCompare(b.texte, 'fr');
    });
  });

  suggestionsTriees = computed(() => {
    const statut = this.expoStatut();
    const mode = this.sortMode();
    const items = statut === 'nettoyage' ? [...this.suggestions()] : [...this.suggestionsActives()];
    if (mode === 'votes') {
      const scores = this.scoreParSuggestion();
      return items.sort((a, b) => {
        const diff = (scores[b.id] ?? 0) - (scores[a.id] ?? 0);
        return diff !== 0 ? diff : a.texte.localeCompare(b.texte, 'fr');
      });
    }
    return items.sort((a, b) => a.texte.localeCompare(b.texte, 'fr'));
  });

  async ajouterSuggestion(source: 'membre' | 'admin') {
    const texte = source === 'admin' ? this.newSuggestionAdmin() : this.newSuggestion();
    if (!texte.trim() || this.savingSugg()) return;
    this.savingSugg.set(true);
    const id = await this.expoService.addSuggestion(this.expoId, texte, source);
    this.suggestions.update((s) => [...s, { id, texte: texte.trim(), actif: true, source }]);
    source === 'admin' ? this.newSuggestionAdmin.set('') : this.newSuggestion.set('');
    this.savingSugg.set(false);
  }

  startEditSugg(s: ExpoSuggestion) {
    this.editingSuggId.set(s.id);
    this.editingSuggTexte.set(s.texte);
  }

  async saveEditSugg() {
    const id = this.editingSuggId();
    if (!id) return;
    const texte = this.editingSuggTexte();
    await this.expoService.updateSuggestion(this.expoId, id, { texte });
    this.suggestions.update((s) => s.map((x) => (x.id === id ? { ...x, texte } : x)));
    this.editingSuggId.set(null);
  }

  cancelEditSugg() {
    this.editingSuggId.set(null);
  }

  async toggleActif(s: ExpoSuggestion) {
    await this.expoService.updateSuggestion(this.expoId, s.id, { actif: !s.actif });
    this.suggestions.update((list) =>
      list.map((x) => (x.id === s.id ? { ...x, actif: !x.actif } : x)),
    );
  }

  async supprimerSuggestion(s: ExpoSuggestion) {
    const ok = await this.confirmService.confirm('Supprimer cette suggestion ?');
    if (!ok) return;
    await this.expoService.deleteSuggestion(this.expoId, s.id);
    this.suggestions.update((list) => list.filter((x) => x.id !== s.id));
  }

  // ── Transitions ──────────────────────────────────────────────────────────────

  formVotation = new FormGroup({
    dateFinVote: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    nombreVotesParMembre: new FormControl(1, {
      validators: [Validators.required, Validators.min(1)],
      nonNullable: true,
    }),
  });

  formSoumission = new FormGroup({
    themeChoisi: new FormControl('', {
      validators: [Validators.required, Validators.minLength(2)],
      nonNullable: true,
    }),
    dateFinSoumission: new FormControl('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
  });

  savingTransition = signal(false);

  async terminerVote() {
    const ok = await this.confirmService.confirm(
      'Les scores sont calculés et les thèmes ex-aequo restent présélectionnés. Les bulletins de vote sont ensuite réinitialisés pour un éventuel second tour.',
      'Terminer le vote',
      'Terminer',
      false,
    );
    if (!ok) return;
    this.savingTransition.set(true);
    await this.expoService.retourNettoyageDepuisVotation(this.expoId);
    this.expo.update((e) =>
      e
        ? {
            ...e,
            statut: 'nettoyage',
            dateFinVote: undefined,
            nombreVotesParMembre: undefined,
          }
        : e,
    );
    this.localVoteMap.set({});
    this.sortMode.set('votes');
    const suggs = await this.expoService.getSuggestionsOnce(this.expoId);
    this.suggestions.set(suggs);
    this.savingTransition.set(false);
  }

  async lancerVotation() {
    if (this.formVotation.invalid || this.savingTransition()) return;
    const { dateFinVote, nombreVotesParMembre } = this.formVotation.getRawValue();
    this.savingTransition.set(true);
    await this.expoService.passerVotation(this.expoId, dateFinVote, nombreVotesParMembre);
    this.expo.update((e) =>
      e ? { ...e, statut: 'votation', dateFinVote, nombreVotesParMembre } : e,
    );
    this.sortMode.set('alpha');
    // Charge les votes pour la nouvelle phase
    const uid = this.uid();
    if (uid) {
      const [votes, monVote] = await Promise.all([
        this.expoService.getTousVotesOnce(this.expoId),
        this.expoService.getMonVoteOnce(this.expoId, uid),
      ]);
      this.tousVotes.set(votes);
      if (monVote) {
        const map: Record<string, number> = {};
        for (const id of monVote.themeIds) map[id] = (map[id] ?? 0) + 1;
        this.localVoteMap.set(map);
      }
    }
    this.savingTransition.set(false);
  }

  async lancerSoumission() {
    if (this.formSoumission.invalid || this.savingTransition()) return;
    const { themeChoisi, dateFinSoumission } = this.formSoumission.getRawValue();
    const prenom = this.profile()?.prenom ?? 'Jean-Pierre';
    const ok = await this.confirmService.confirm(
      `Thème : « ${themeChoisi} » — soumissions ouvertes jusqu'au ${this.formatDate(dateFinSoumission)}. ` +
        `Une fois confirmé, les dates d'idéation et de vote seront verrouillées. ` +
        `C'est votre dernier mot, ${prenom} ? 😄`,
      "Définir le thème de l'expo",
      "C'est mon dernier mot !",
      false,
    );
    if (!ok) return;
    this.savingTransition.set(true);
    await this.expoService.passerSoumission(this.expoId, themeChoisi, dateFinSoumission);
    this.expo.update((e) => (e ? { ...e, themeChoisi: themeChoisi.trim(), dateFinSoumission } : e));
    this.tousVotes.set([]); // votes non nécessaires en soumission
    this.localVoteMap.set({});
    const photosData = await this.expoService.getPhotosOnce(this.expoId);
    this.photos.set(photosData);
    this.savingTransition.set(false);
  }

  async cloturerManuellement() {
    const ok = await this.confirmService.confirm(
      "Plus aucune photo ne pourra être soumise. L'exposition passera en phase « En exposition ».",
      'Clôturer la soumission',
      'Clôturer',
      false,
    );
    if (!ok) return;
    this.savingTransition.set(true);
    await this.expoService.cloture(this.expoId);
    this.expo.update((e) => (e ? { ...e, statut: 'cloture' } : e));
    this.savingTransition.set(false);
  }

  // ── Vote ─────────────────────────────────────────────────────────────────────

  localVoteMap = signal<Record<string, number>>({});

  nbMembresVote = computed(() => this.tousVotes().length);
  nbVotesUtilises = computed(() => this.tousVotes().reduce((sum, v) => sum + v.themeIds.length, 0));

  scoreParSuggestion = computed(() => {
    const scores: Record<string, number> = {};
    for (const v of this.tousVotes()) {
      for (const id of v.themeIds) scores[id] = (scores[id] ?? 0) + 1;
    }
    return scores;
  });

  jetonsRestants = computed(() => {
    const total = this.expo()?.nombreVotesParMembre ?? 1;
    const used = Object.values(this.localVoteMap()).reduce((a, b) => a + b, 0);
    return total - used;
  });

  toggleVote(suggId: string) {
    if ((this.localVoteMap()[suggId] ?? 0) > 0) {
      this.localVoteMap.update((m) => {
        const n = { ...m };
        delete n[suggId];
        return n;
      });
    } else {
      if (this.jetonsRestants() <= 0) return;
      this.localVoteMap.update((m) => ({ ...m, [suggId]: 1 }));
    }
    this.sauvegarderVote();
  }

  private async sauvegarderVote() {
    const uid = this.uid();
    if (!uid) return;
    const themeIds: string[] = [];
    for (const [id, count] of Object.entries(this.localVoteMap())) {
      for (let i = 0; i < count; i++) themeIds.push(id);
    }
    await this.expoService.voter(this.expoId, uid, themeIds);
    // Re-fetch scores pour refléter le vote enregistré
    const votes = await this.expoService.getTousVotesOnce(this.expoId);
    this.tousVotes.set(votes);
  }

  // ── Photos soumission ────────────────────────────────────────────────────────

  lightboxIndex = signal<number | null>(null);

  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.photos().map((p) => ({
      id: p.id,
      url: p.url,
      nomAuteur: p.nomAuteur,
      uploaderUid: p.uid,
      likes: [],
      uploadedAt: p.uploadedAt,
      exif: p.exif ?? undefined,
    })),
  );

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => ({
    toggleLike: async () => {},
    getComments: () => of([]),
    addComment: async () => {},
    deleteComment: async () => {},
    toggleCommentLike: async () => {},
    addReply: async () => {},
    deleteReply: async () => {},
    canDeletePhoto: (photo) => photo.uploaderUid === this.uid() || this.canManage(),
    deletePhoto: async (photo) => {
      const p = this.photos().find((x) => x.id === photo.id);
      if (!p) return;
      await this.supprimerPhoto(p);
      if (this.photos().length === 0) this.lightboxIndex.set(null);
    },
  }));

  openLightbox(index: number) {
    this.lightboxIndex.set(index);
  }
  closeLightbox() {
    this.lightboxIndex.set(null);
  }

  uploading = signal(false);
  uploadProgress = signal(0);
  dragOver = signal(false);
  uploadError = signal('');
  deletingPhoto = signal<string | null>(null);

  monPhotos = computed(() => {
    const uid = this.uid();
    return uid ? this.photos().filter((p) => p.uid === uid) : [];
  });

  canUploadMore = computed(() => {
    const max = this.expo()?.maxPhotosParMembre ?? 0;
    return this.monPhotos().length < max;
  });

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) this.uploadSingle(file);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (file) this.uploadSingle(file);
  }

  private async uploadSingle(file: File) {
    if (!this.canUploadMore() || this.uploading()) return;
    const uid = this.uid()!;
    const nom = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
    this.uploading.set(true);
    this.uploadError.set('');

    const [exif, compressed] = await Promise.all([
      readExifWithConsent(file, this.gpsConsentService),
      compressImage(file, COMPRESS_EVENT),
    ]);

    this.expoService.uploadPhoto(compressed, this.expoId, { uid, nomAuteur: nom, exif }).subscribe({
      next: (state) => {
        this.uploadProgress.set(state.progress);
        if (state.done && state.photo) this.photos.update((ps) => [...ps, state.photo!]);
      },
      error: () => {
        this.uploadError.set("Erreur lors de l'envoi. Réessayez.");
        this.uploading.set(false);
      },
      complete: () => {
        this.uploadProgress.set(0);
        this.uploading.set(false);
      },
    });
  }

  async supprimerPhoto(photo: ExpoPhoto) {
    const ok = await this.confirmService.confirm('Supprimer cette photo ?');
    if (!ok) return;
    this.deletingPhoto.set(photo.id);
    await this.expoService.deletePhoto(this.expoId, photo);
    this.photos.update((ps) => ps.filter((p) => p.id !== photo.id));
    this.deletingPhoto.set(null);

    const uid = this.uid();
    if (uid && photo.uid !== uid) {
      const expo = this.expo();
      const moi = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
      this.notifService
        .sendToUser(
          photo.uid,
          'admin',
          `Votre photo a été supprimée de l'exposition "${expo?.titre ?? ''}" par ${moi}.`,
          { lien: `/galeries/expositions/${this.expoId}`, sourceNom: moi, sourceUid: uid },
        )
        .catch(() => {});
    }
  }

  // ── Edit panel ───────────────────────────────────────────────────────────────

  savingVisibilite = signal(false);

  async toggleVisibilite() {
    const e = this.expo();
    if (!e || this.savingVisibilite()) return;
    this.savingVisibilite.set(true);
    const newVal: 'public' | 'membre' = e.visibilite === 'public' ? 'membre' : 'public';
    await this.expoService.setVisibilite(this.expoId, newVal);
    this.expo.update((ex) => (ex ? { ...ex, visibilite: newVal } : ex));
    this.savingVisibilite.set(false);
  }

  async togglePhotosPubliques() {
    const e = this.expo();
    if (!e) return;
    const newVal = !e.photosPubliques;
    await this.expoService.setPhotosPubliques(this.expoId, newVal);
    this.expo.update((ex) => (ex ? { ...ex, photosPubliques: newVal } : ex));
  }

  editMode = signal(false);
  saving = signal(false);
  pendingCoverFile = signal<File | null>(null);
  coverPreviewUrl = signal<string | null>(null);
  coverDragOver = signal(false);

  editForm = new FormGroup({
    titre: new FormControl('', {
      validators: [Validators.required, Validators.minLength(3)],
      nonNullable: true,
    }),
    description: new FormControl('', { nonNullable: true }),
    themeChoisi: new FormControl('', { nonNullable: true }),
    maxPhotosParMembre: new FormControl(1, {
      validators: [Validators.required, Validators.min(1)],
      nonNullable: true,
    }),
    visibilite: new FormControl<'public' | 'membre'>('membre', { nonNullable: true }),
    dateDebutIdeation: new FormControl('', { nonNullable: true }),
    dateFinIdeation: new FormControl('', { nonNullable: true }),
    dateFinVote: new FormControl('', { nonNullable: true }),
    dateFinSoumission: new FormControl('', { nonNullable: true }),
    dateExposition: new FormControl('', { nonNullable: true }),
  });

  // Suit la valeur de themeChoisi dans le formulaire d'édition (pour l'effet de verrouillage)
  private editThemeSignal = toSignal(this.editForm.get('themeChoisi')!.valueChanges, {
    initialValue: this.editForm.get('themeChoisi')!.value,
  });

  get datesLocked(): boolean {
    return !!this.editForm.get('themeChoisi')!.value?.trim();
  }

  get datesChronoError(): string | null {
    const v = this.editForm.getRawValue();
    const chain = [
      { label: 'Début idéation', val: v.dateDebutIdeation },
      { label: 'Fin idéation', val: v.dateFinIdeation },
      { label: 'Fin vote', val: v.dateFinVote },
      { label: 'Fin soumission', val: v.dateFinSoumission },
      { label: "Date d'exposition", val: v.dateExposition },
    ].filter((d) => d.val);
    for (let i = 1; i < chain.length; i++) {
      if (chain[i].val < chain[i - 1].val)
        return `« ${chain[i - 1].label} » doit être avant « ${chain[i].label} ».`;
    }
    return null;
  }

  async terminerIdeation() {
    const ok = await this.confirmService.confirm(
      "La date de fin d'idéation sera avancée à aujourd'hui — le nettoyage démarrera immédiatement.",
      "Terminer l'idéation",
      'Terminer',
      false,
    );
    if (!ok) return;
    this.savingTransition.set(true);
    // Mettre hier pour que today > dateFinIdeation soit vrai immédiatement
    const hier = localDateISO(new Date(Date.now() - 86400000));
    await this.expoService.update(this.expoId, { dateFinIdeation: hier });
    this.expo.update((e) => (e ? { ...e, dateFinIdeation: hier } : e));
    this.savingTransition.set(false);
  }

  enterEdit() {
    const e = this.expo();
    if (!e) return;
    this.editForm.patchValue({
      titre: e.titre,
      description: e.description ?? '',
      themeChoisi: e.themeChoisi ?? '',
      maxPhotosParMembre: e.maxPhotosParMembre,
      visibilite: e.visibilite ?? 'membre',
      dateDebutIdeation: e.dateDebutIdeation ?? '',
      dateFinIdeation: e.dateFinIdeation,
      dateFinVote: e.dateFinVote ?? '',
      dateFinSoumission: e.dateFinSoumission ?? '',
      dateExposition: e.dateExposition ?? '',
    });
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
    this.clearCover();
  }

  async saveEdit() {
    if (this.saving()) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      setTimeout(() => {
        const el = this.elRef.nativeElement.querySelector(
          'mat-form-field.ng-invalid, app-date-picker.ng-invalid',
        ) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    this.saving.set(true);
    try {
      const v = this.editForm.getRawValue();
      const themeChoisi = v.themeChoisi.trim() || undefined;

      await this.expoService.update(this.expoId, {
        titre: v.titre.trim(),
        description: v.description.trim() || undefined,
        themeChoisi,
        maxPhotosParMembre: v.maxPhotosParMembre,
        visibilite: v.visibilite,
        dateDebutIdeation: v.dateDebutIdeation || undefined,
        dateFinIdeation: v.dateFinIdeation,
        dateFinVote: v.dateFinVote || undefined,
        dateFinSoumission: v.dateFinSoumission || undefined,
        dateExposition: v.dateExposition || undefined,
      });

      this.expo.update((ex) => {
        if (!ex) return ex;
        const updated: Exposition = {
          ...ex,
          titre: v.titre.trim(),
          maxPhotosParMembre: v.maxPhotosParMembre,
          visibilite: v.visibilite,
          dateFinIdeation: v.dateFinIdeation,
        };
        if (v.description.trim()) updated.description = v.description.trim();
        else delete updated.description;
        if (themeChoisi) updated.themeChoisi = themeChoisi;
        else delete updated.themeChoisi;
        if (v.dateDebutIdeation) updated.dateDebutIdeation = v.dateDebutIdeation;
        else delete updated.dateDebutIdeation;
        if (v.dateFinVote) updated.dateFinVote = v.dateFinVote;
        else delete updated.dateFinVote;
        if (v.dateFinSoumission) updated.dateFinSoumission = v.dateFinSoumission;
        else delete updated.dateFinSoumission;
        if (v.dateExposition) updated.dateExposition = v.dateExposition;
        else delete updated.dateExposition;
        return updated;
      });

      if (this.pendingCoverFile()) {
        const currentExpo = this.expo();
        if (currentExpo?.photoCouverturePath)
          await this.expoService.removeCouverture(this.expoId, currentExpo.photoCouverturePath);
        const { url, path } = await this.expoService.setCouverture(
          this.expoId,
          this.pendingCoverFile()!,
        );
        this.expo.update((ex) =>
          ex ? { ...ex, photoCouvertureUrl: url, photoCouverturePath: path } : ex,
        );
        this.clearCover();
      }
      this.editMode.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteExpo() {
    const e = this.expo();
    if (!e) return;
    const ok = await this.confirmService.confirm(
      `Supprimer l'exposition « ${e.titre} » ? Cette action est irréversible.`,
    );
    if (!ok) return;
    await this.expoService.deleteExposition(this.expoId, e.photoCouverturePath);
    this.router.navigate(['/galeries/sorties']);
  }

  onCoverDrop(event: DragEvent) {
    event.preventDefault();
    this.coverDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) this.setCoverFile(file);
  }

  onCoverSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setCoverFile(file);
    (event.target as HTMLInputElement).value = '';
  }

  clearCover() {
    const prev = this.coverPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.pendingCoverFile.set(null);
    this.coverPreviewUrl.set(null);
  }

  async removeCover() {
    if (this.coverPreviewUrl()) {
      this.clearCover();
      return;
    }
    const expo = this.expo();
    if (expo?.photoCouverturePath) {
      await this.expoService.removeCouverture(this.expoId, expo.photoCouverturePath);
      this.expo.update((ex) =>
        ex ? { ...ex, photoCouvertureUrl: undefined, photoCouverturePath: undefined } : ex,
      );
    }
  }

  private setCoverFile(file: File) {
    const prev = this.coverPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.pendingCoverFile.set(file);
    this.coverPreviewUrl.set(URL.createObjectURL(file));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  formatDate(date?: string): string {
    if (!date) return '—';
    return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  today = new Date().toISOString().slice(0, 10);
}
