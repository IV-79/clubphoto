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
} from '../../../models/exposition.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { EventHero, HeroBadge } from '../../../components/event-hero/event-hero';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { compressImage, COMPRESS_EVENT } from '../../../utils/image-compress';
import { readExifWithConsent } from '../../../utils/exif-reader';
import { GpsConsentService } from '../../../services/gps-consent.service';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-exposition-detail',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
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
  isPublic = computed(() => {
    const d = this.expo()?.dateOuverturePublic;
    return !!d && new Date(d + 'T00:00:00') <= new Date();
  });

  // ── Statut helpers ───────────────────────────────────────────────────────────

  typeBadgeHero = computed((): HeroBadge => ({ text: '🖼 Exposition', css: 'badge-expo' }));
  statusHero = computed((): HeroBadge => {
    const labels: Record<string, { text: string; css: string }> = {
      ideation: { text: 'Idéation', css: 'status-ideation' },
      nettoyage: { text: 'Nettoyage', css: 'status-nettoyage' },
      votation: { text: 'Vote', css: 'status-votation' },
      soumission: { text: 'Soumission', css: 'status-soumission' },
      cloture: { text: 'Clôturé', css: 'status-cloture' },
    };
    return labels[this.expo()?.statut ?? 'ideation'] ?? labels['ideation'];
  });

  // ── Auto-transition (canManage, dates dépassées) ─────────────────────────────

  private autoTransitioned = signal(false);

  constructor() {
    // Charge les données une seule fois quand l'état d'auth est connu
    effect(() => {
      const p = this.profile();
      if (p === undefined) return; // auth pas encore résolu
      if (this.loaded()) return;
      untracked(() => {
        this.loaded.set(true);
        this.charger(p?.uid ?? null);
      });
    });

    // Pré-remplir nombreVotesParMembre : 3 au 1er passage, 1 aux suivants
    effect(() => {
      if (this.expo()?.statut !== 'nettoyage') return;
      const secondPasse = this.suggestions().some((s) => !s.actif);
      untracked(() => {
        if (!this.formVotation.get('nombreVotesParMembre')?.dirty) {
          this.formVotation.patchValue({ nombreVotesParMembre: secondPasse ? 1 : 3 });
        }
      });
    });

    // Pré-remplir themeChoisi avec le vainqueur clair (si pas ex-aequo)
    effect(() => {
      if (this.expo()?.statut !== 'nettoyage') return;
      const winner = this.themeVainqueur();
      if (!winner) return;
      untracked(() => {
        if (!this.formSoumission.get('themeChoisi')?.value) {
          this.formSoumission.patchValue({ themeChoisi: winner.texte });
        }
      });
    });

    // Auto-transition si les dates sont dépassées (canManage seulement)
    effect(() => {
      if (this.autoTransitioned()) return;
      const e = this.expo();
      if (!e || !this.canManage()) return;
      const now = new Date();
      let triggered = false;

      if (e.statut === 'ideation' && new Date(e.dateFinIdeation + 'T23:59:59') < now) {
        triggered = true;
        untracked(() =>
          this.expoService.passerNettoyage(this.expoId).then(() => {
            this.expo.update((ex) => (ex ? { ...ex, statut: 'nettoyage' } : ex));
            this.sortMode.set('votes');
          }),
        );
      } else if (
        e.statut === 'votation' &&
        e.dateFinVote &&
        new Date(e.dateFinVote + 'T23:59:59') < now
      ) {
        triggered = true;
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
            // tousVotes conservé pour trier par score en nettoyage
            this.localVoteMap.set({});
            this.sortMode.set('votes');
            const suggs = await this.expoService.getSuggestionsOnce(this.expoId);
            this.suggestions.set(suggs);
          }),
        );
      } else if (
        e.statut === 'soumission' &&
        e.dateFinSoumission &&
        new Date(e.dateFinSoumission + 'T23:59:59') < now
      ) {
        triggered = true;
        untracked(() =>
          this.expoService
            .cloture(this.expoId)
            .then(() => this.expo.update((ex) => (ex ? { ...ex, statut: 'cloture' } : ex))),
        );
      }

      if (triggered) untracked(() => this.autoTransitioned.set(true));
    });
  }

  private async charger(uid: string | null) {
    const expoData = await firstValueFrom(this.expoService.getExpositionOnce(this.expoId));
    if (!expoData) {
      this.notFound.set(true);
      return;
    }
    this.expo.set(expoData);
    this.sortMode.set(expoData.statut === 'nettoyage' ? 'votes' : 'alpha');

    const s = expoData.statut;
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
      // Photos visibles anonymes aussi (règles Firestore : cloture = public)
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
    const statut = this.expo()?.statut;
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

  async terminerIdeation() {
    const ok = await this.confirmService.confirm(
      "La phase d'idéation sera clôturée. Vous pourrez ensuite sélectionner et affiner les suggestions avant de lancer le vote.",
      "Terminer l'idéation",
      'Terminer',
      false,
    );
    if (!ok) return;
    this.savingTransition.set(true);
    await this.expoService.passerNettoyage(this.expoId);
    this.expo.update((e) => (e ? { ...e, statut: 'nettoyage' } : e));
    this.sortMode.set('votes');
    this.autoTransitioned.set(true);
    this.savingTransition.set(false);
  }

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
    this.autoTransitioned.set(true);
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
    this.savingTransition.set(true);
    await this.expoService.passerSoumission(this.expoId, themeChoisi, dateFinSoumission);
    this.expo.update((e) =>
      e
        ? {
            ...e,
            statut: 'soumission',
            themeChoisi: themeChoisi.trim(),
            dateFinSoumission,
          }
        : e,
    );
    this.tousVotes.set([]); // votes non nécessaires en soumission
    this.localVoteMap.set({});
    const photosData = await this.expoService.getPhotosOnce(this.expoId);
    this.photos.set(photosData);
    this.savingTransition.set(false);
  }

  async cloturerManuellement() {
    const ok = await this.confirmService.confirm(
      "Plus aucune photo ne pourra être soumise. L'exposition passera en mode clôturé.",
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

  lightboxCallbacks = computed(
    (): PhotoLightboxCallbacks => ({
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
    }),
  );

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
    maxPhotosParMembre: new FormControl(1, {
      validators: [Validators.required, Validators.min(1)],
      nonNullable: true,
    }),
    dateDebutIdeation: new FormControl('', { nonNullable: true }),
    dateFinIdeation: new FormControl('', { nonNullable: true }),
    dateFinVote: new FormControl('', { nonNullable: true }),
    dateFinSoumission: new FormControl('', { nonNullable: true }),
    dateExposition: new FormControl('', { nonNullable: true }),
    dateOuverturePublic: new FormControl('', { nonNullable: true }),
  });

  enterEdit() {
    const e = this.expo();
    if (!e) return;
    this.editForm.patchValue({
      titre: e.titre,
      description: e.description ?? '',
      maxPhotosParMembre: e.maxPhotosParMembre,
      dateDebutIdeation: e.dateDebutIdeation ?? '',
      dateFinIdeation: e.dateFinIdeation,
      dateFinVote: e.dateFinVote ?? '',
      dateFinSoumission: e.dateFinSoumission ?? '',
      dateExposition: e.dateExposition ?? '',
      dateOuverturePublic: e.dateOuverturePublic ?? '',
    });
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
    this.clearCover();
  }

  async saveEdit() {
    if (this.editForm.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const e = this.expo()!;
      const v = this.editForm.getRawValue();

      const firestoreUpdate: Record<string, unknown> = {
        titre: v.titre.trim(),
        description: v.description.trim() || undefined,
        dateDebutIdeation: v.dateDebutIdeation || undefined,
        dateExposition: v.dateExposition || undefined,
        dateOuverturePublic: v.dateOuverturePublic || undefined,
      };
      if (e.statut === 'ideation') {
        firestoreUpdate['maxPhotosParMembre'] = v.maxPhotosParMembre;
        firestoreUpdate['dateFinIdeation'] = v.dateFinIdeation;
      } else if (e.statut === 'nettoyage') {
        firestoreUpdate['maxPhotosParMembre'] = v.maxPhotosParMembre;
      } else if (e.statut === 'votation') {
        firestoreUpdate['dateFinVote'] = v.dateFinVote;
      } else if (e.statut === 'soumission') {
        firestoreUpdate['maxPhotosParMembre'] = v.maxPhotosParMembre;
        firestoreUpdate['dateFinSoumission'] = v.dateFinSoumission;
      }
      await this.expoService.update(this.expoId, firestoreUpdate);

      // Applique localement sans re-fetch
      this.expo.update((ex) => {
        if (!ex) return ex;
        const updated: Exposition = { ...ex };
        updated.titre = v.titre.trim();
        if (v.description.trim()) updated.description = v.description.trim();
        else delete updated.description;
        if (v.dateDebutIdeation) updated.dateDebutIdeation = v.dateDebutIdeation;
        else delete updated.dateDebutIdeation;
        if (v.dateExposition) updated.dateExposition = v.dateExposition;
        else delete updated.dateExposition;
        if (v.dateOuverturePublic) updated.dateOuverturePublic = v.dateOuverturePublic;
        else delete updated.dateOuverturePublic;
        if (e.statut === 'ideation') {
          updated.maxPhotosParMembre = v.maxPhotosParMembre;
          updated.dateFinIdeation = v.dateFinIdeation;
        } else if (e.statut === 'nettoyage') {
          updated.maxPhotosParMembre = v.maxPhotosParMembre;
        } else if (e.statut === 'votation' && v.dateFinVote) {
          updated.dateFinVote = v.dateFinVote;
        } else if (e.statut === 'soumission') {
          updated.maxPhotosParMembre = v.maxPhotosParMembre;
          if (v.dateFinSoumission) updated.dateFinSoumission = v.dateFinSoumission;
        }
        return updated;
      });

      if (this.pendingCoverFile()) {
        if (e.photoCouverturePath)
          await this.expoService.removeCouverture(this.expoId, e.photoCouverturePath);
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
