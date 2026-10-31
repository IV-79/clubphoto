import {
  Component,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ViewChild,
  ElementRef,
  HostListener,
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
import { ConfirmService, TripleChoice } from '../../../services/confirm.service';
import {
  Exposition,
  ExpoSuggestion,
  ExpoVoteDoc,
  ExpoPhoto,
  ExpoStatut,
  ExpoParticipant,
  ExpoEvaluation,
  EXPO_PARTICIPANT_STATUT_LABELS,
  getExpoStatut,
} from '../../../models/exposition.model';
import { UserProfile } from '../../../models/user.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { EventHero, HeroBadge } from '../../../components/event-hero/event-hero';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { compressImage, COMPRESS_EVENT, ImageDecodeError } from '../../../utils/image-compress';
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
  readonly participantStatutLabels = EXPO_PARTICIPANT_STATUT_LABELS;

  profile = toSignal(this.authService.currentUserProfile$);
  uid = computed(() => this.profile()?.uid ?? null);

  // ── Data signals ─────────────────────────────────────────────────────────────

  expo = signal<Exposition | null>(null);
  notFound = signal(false);
  suggestions = signal<ExpoSuggestion[]>([]);
  tousVotes = signal<ExpoVoteDoc[]>([]);
  photos = signal<ExpoPhoto[]>([]); // cloture phase (all photos)

  // Soumission phase — participants dashboard
  participants = signal<ExpoParticipant[]>([]);
  mesPhotos = signal<ExpoPhoto[]>([]); // current user's photos (soumission phase)
  mesEvaluations = signal<ExpoEvaluation[]>([]); // evaluations received for current user's dossier

  // Per-participant drill-down (lazy loaded)
  selectedParticipantUid = signal<string | null>(null);
  photosParMembre = signal<ExpoPhoto[]>([]);
  loadingParticipant = signal(false);
  evaluations = signal<ExpoEvaluation[]>([]); // all evaluations (responsable view)
  monEvaluation = signal<ExpoEvaluation | null>(null); // my evaluation as committee member
  evaluationDraft = signal<string[]>([]); // working ordered list
  activeComiteTab = signal<'participants' | 'comite' | 'responsable'>('participants');

  // Unsaved evaluation tracking — signal + getter for CanDeactivate guard
  private _evaluationDraftDirty = signal(false);
  readonly evaluationDraftDirty = this._evaluationDraftDirty.asReadonly();

  // Unsaved selection tracking (photo selection for clôture)
  private _selectionDirty = signal(false);
  readonly selectionDirty = this._selectionDirty.asReadonly();
  savingSelection = signal(false);

  /** Called by CanDeactivate guard */
  readonly evaluationDraftDirtyFn = () =>
    this._evaluationDraftDirty() || this._selectionDirty();

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this._evaluationDraftDirty() || this._selectionDirty()) {
      event.preventDefault();
    }
  }

  // Committee close-member flow
  showClotureMembre = signal<string | null>(null); // participantUid being closed
  selectedPourCloture = signal<Set<string>>(new Set());
  evaluationSaving = signal(false);
  closingMembre = signal(false);

  // Comité management
  allMembres = signal<UserProfile[]>([]);
  editComite = signal(false);
  comiteSaving = signal(false);
  draftResponsableUid = signal('');
  draftComiteUids = signal<string[]>([]);

  private loaded = signal(false);

  private participantCache = new Map<string, {
    photos: ExpoPhoto[];
    evaluations: ExpoEvaluation[];
    monEvaluation: ExpoEvaluation | null;
  }>();

  // ── Permissions ──────────────────────────────────────────────────────────────

  isOrganisateur = computed(() => !!this.uid() && this.uid() === this.expo()?.organisateurUid);
  isAdmin = computed(() => this.profile()?.role === 'admin');
  canManage = computed(() => this.isOrganisateur() || this.isAdmin());
  isMembre = computed(() => !!this.profile());
  photosPubliques = computed(() => !!this.expo()?.photosPubliques);
  visibilitePublique = computed(() => this.expo()?.visibilite === 'public');
  isResponsableComite = computed(
    () => !!this.uid() && this.uid() === this.expo()?.responsableComiteUid,
  );
  isMembreComite = computed(() => {
    const uid = this.uid();
    const comiteUids = this.expo()?.comiteUids ?? [];
    return !!uid && comiteUids.includes(uid);
  });

  // ── Statut calculé ───────────────────────────────────────────────────────────

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

  // ── Soumission phase computed ─────────────────────────────────────────────────

  monParticipant = computed(() => this.participants().find((p) => p.uid === this.uid()) ?? null);
  monStatutSoumission = computed(() => this.monParticipant()?.statut ?? null);
  canUploadEnSoumission = computed(() => {
    const s = this.monStatutSoumission();
    if (s !== null && s !== 'soumission') return false;
    return this.mesPhotos().length < (this.expo()?.maxPhotosParMembre ?? 0);
  });

  totalPhotosSelectionnees = computed(() =>
    this.participants().reduce((sum, p) => sum + (p.selectedPhotoIds?.length ?? 0), 0),
  );

  // Filtres tableau de bord
  filtreNonEvalues = signal(false);   // comité : participants pas encore classés par moi
  filtreNonClotures = signal(false);  // responsable : participants pas encore clôturés

  participantsFiltres = computed(() => {
    let list = this.participants();
    const uid = this.uid();
    if (this.filtreNonEvalues() && uid) {
      list = list.filter(
        (p) => p.statut === 'evaluation' && !(p.comiteUidsEvalues ?? []).includes(uid),
      );
    }
    if (this.filtreNonClotures()) {
      list = list.filter((p) => p.statut !== 'clos');
    }
    return list;
  });

  photosRetenuesIds = computed((): Set<string> => {
    const ids = this.participants().flatMap((p) => p.selectedPhotoIds ?? []);
    return new Set(ids);
  });

  photosAfficheesCloture = computed(() => {
    const all = this.photos();
    const retenues = all.filter((p) => this.photosRetenuesIds().has(p.id));
    const source = retenues.length ? retenues : all;
    return [...source].sort((a, b) => {
      const ka = a.nomAuteur.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
      const kb = b.nomAuteur.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
      return ka.localeCompare(kb);
    });
  });

  // Photos sélectionnées du membre courant (pour affichage étoile dans son propre dossier)
  mesPhotosSelectionnees = computed((): Set<string> =>
    new Set(this.monParticipant()?.selectedPhotoIds ?? []),
  );

  depasseObjectifExpo = computed(() => {
    const target = this.expo()?.nbPhotosExposition;
    if (!target) return false;
    return this.totalPhotosSelectionnees() > target;
  });

  // Aggregate score per photo from all evaluations (lower = better, starts at 1)
  aggregateScores = computed(() => {
    const evals = this.evaluations();
    if (!evals.length) return {} as Record<string, number>;
    const scores: Record<string, number> = {};
    for (const ev of evals) {
      ev.orderedPhotoIds.forEach((id, idx) => {
        scores[id] = (scores[id] ?? 0) + idx + 1;
      });
    }
    return scores;
  });

  photosParMembreTriees = computed(() => {
    const photos = [...this.photosParMembre()];
    const scores = this.aggregateScores();
    if (!Object.keys(scores).length) return photos;
    return photos.sort((a, b) => (scores[a.id] ?? 999) - (scores[b.id] ?? 999));
  });

  // Scores reçus sur le propre dossier du membre courant
  mesAggregateScores = computed(() => {
    const evals = this.mesEvaluations();
    if (!evals.length) return {} as Record<string, number>;
    const scores: Record<string, number> = {};
    for (const ev of evals) {
      ev.orderedPhotoIds.forEach((id, idx) => {
        scores[id] = (scores[id] ?? 0) + idx + 1;
      });
    }
    return scores;
  });

  mesPhotosAffichees = computed(() => {
    const photos = this.mesPhotos();
    const scores = this.mesAggregateScores();
    if (!Object.keys(scores).length) return photos;
    return [...photos].sort((a, b) => (scores[a.id] ?? 999) - (scores[b.id] ?? 999));
  });

  constructor() {
    effect(() => {
      const p = this.profile();
      if (p === undefined) return;
      if (this.loaded()) return;
      untracked(() => {
        this.loaded.set(true);
        this.charger(p?.uid ?? null);
      });
    });

    effect(() => {
      if (this.expoStatut() !== 'nettoyage') return;
      const secondPasse = this.suggestions().some((s) => !s.actif);
      untracked(() => {
        if (!this.formVotation.get('nombreVotesParMembre')?.dirty) {
          this.formVotation.patchValue({ nombreVotesParMembre: secondPasse ? 1 : 3 });
        }
      });
    });

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

    if (s === 'soumission') {
      loads.push(
        this.expoService.getParticipantsOnce(this.expoId).then((p) => this.participants.set(p)),
      );
      if (uid) {
        loads.push(
          this.expoService
            .getPhotosParMembre(this.expoId, uid)
            .then((p) => this.mesPhotos.set(p)),
        );
      }
      // Load allMembres only for old data that doesn't have comiteNoms stored yet
      const needsMembresForDisplay =
        ((expoData.comiteUids?.length ?? 0) > 0 && !expoData.comiteNoms?.length) ||
        (!!expoData.responsableComiteUid && !expoData.responsableComiteNom);
      if (needsMembresForDisplay) {
        loads.push(
          firstValueFrom(this.authService.getAllMembersOnce()).then((membres) => {
            const sorted = membres
              .filter((m) => !m.isSuspended)
              .sort((a, b) => {
                const na = `${a.nom} ${a.prenom ?? ''}`.normalize('NFD').toLowerCase();
                const nb = `${b.nom} ${b.prenom ?? ''}`.normalize('NFD').toLowerCase();
                return na < nb ? -1 : na > nb ? 1 : 0;
              });
            this.allMembres.set(sorted);
          }),
        );
      }
    }

    if (s === 'cloture') {
      loads.push(this.expoService.getPhotosOnce(this.expoId).then((p) => this.photos.set(p)));
      loads.push(
        this.expoService.getParticipantsOnce(this.expoId).then((p) => this.participants.set(p)),
      );
    }

    await Promise.all(loads);

    // Load evaluations received on the current user's own dossier (once submitted)
    if (s === 'soumission' && uid) {
      const me = this.participants().find((p) => p.uid === uid);
      if (me && (me.statut === 'evaluation' || me.statut === 'clos')) {
        const evals = await this.expoService.getEvaluationsOnce(this.expoId, uid);
        this.mesEvaluations.set(evals);
      }
    }
  }

  // ── Suggestions ──────────────────────────────────────────────────────────────

  newSuggestion = signal('');
  newSuggestionAdmin = signal('');
  savingSugg = signal(false);
  editingSuggId = signal<string | null>(null);
  editingSuggTexte = signal('');

  suggestionsActives = computed(() => this.suggestions().filter((s) => s.actif));

  sortMode = signal<'alpha' | 'votes'>('alpha');

  themeVainqueur = computed(() => {
    const all = this.suggestions();
    if (all.length === 0) return null;
    const scores = this.scoreParSuggestion();
    const maxScore = Math.max(...all.map((s) => scores[s.id] ?? 0));
    if (maxScore === 0) return null;
    const winners = all.filter((s) => (scores[s.id] ?? 0) === maxScore);
    return winners.length === 1 ? winners[0] : null;
  });

  maxScoreVote = computed(() => {
    const all = this.suggestions();
    if (all.length === 0) return 0;
    const scores = this.scoreParSuggestion();
    return Math.max(0, ...all.map((s) => scores[s.id] ?? 0));
  });

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
    this.tousVotes.set([]);
    this.localVoteMap.set({});
    const moi = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
    this.notifService
      .broadcast(
        'exposition',
        `Le thème « ${themeChoisi.trim()} » est choisi — les soumissions sont ouvertes pour l'exposition « ${this.expo()?.titre ?? '' } » !`,
        { lien: `/galeries/expositions/${this.expoId}`, sourceNom: moi, excludeUid: this.uid() ?? undefined },
      )
      .catch(() => {});
    // Load initial state for soumission
    const uid = this.uid();
    const [participantsData, mesPhotosData] = await Promise.all([
      this.expoService.getParticipantsOnce(this.expoId),
      uid ? this.expoService.getPhotosParMembre(this.expoId, uid) : Promise.resolve([]),
    ]);
    this.participants.set(participantsData);
    this.mesPhotos.set(mesPhotosData);
    this.savingTransition.set(false);
  }

  async cloturerManuellement() {
    const total = this.totalPhotosSelectionnees();
    const target = this.expo()?.nbPhotosExposition;
    const warningTxt =
      target && total !== target
        ? ` ⚠️ Attention : ${total} photo(s) sélectionnée(s) pour un objectif de ${target}.`
        : '';
    const ok = await this.confirmService.confirm(
      `La sélection sera figée et l'exposition passera en phase « En exposition ». Les photos retenues seront visibles par les membres.${warningTxt}`,
      'Clôturer la sélection',
      'Clôturer',
      false,
    );
    if (!ok) return;
    this.savingTransition.set(true);
    await this.expoService.cloture(this.expoId);
    this.expo.update((e) => (e ? { ...e, statut: 'cloture' } : e));
    const expo = this.expo();
    const moi = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
    this.notifService
      .broadcast(
        'exposition',
        `L'exposition « ${expo?.titre ?? ''} » est maintenant accessible — découvrez les photos sélectionnées !`,
        { lien: `/galeries/expositions/${this.expoId}`, sourceNom: moi, excludeUid: this.uid() ?? undefined },
      )
      .catch(() => {});
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
    const votes = await this.expoService.getTousVotesOnce(this.expoId);
    this.tousVotes.set(votes);
  }

  // ── Photos — lightbox (cloture phase) ───────────────────────────────────────

  lightboxIndex = signal<number | null>(null);
  lightboxIndexMembre = signal<number | null>(null);
  lightboxIndexMes = signal<number | null>(null);

  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.photosAfficheesCloture().map((p) => ({
      id: p.id,
      url: p.url,
      nomAuteur: p.nomAuteur,
      uploaderUid: p.uid,
      likes: [],
      uploadedAt: p.uploadedAt,
      exif: p.exif ?? undefined,
    })),
  );

  lightboxPhotosMes = computed((): LightboxPhoto[] =>
    this.mesPhotosAffichees().map((p) => ({
      id: p.id,
      url: p.url,
      nomAuteur: p.nomAuteur,
      uploaderUid: p.uid,
      likes: [],
      uploadedAt: p.uploadedAt,
      exif: p.exif ?? undefined,
    })),
  );

  lightboxPhotosMembre = computed((): LightboxPhoto[] =>
    this.photosParMembreTriees().map((p) => ({
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
    getComments: (photoId) => this.expoService.getCommentaires(this.expoId, photoId),
    addComment: (photoId, texte, auteurUid, nomAuteur) =>
      this.expoService.addCommentaire(this.expoId, photoId, { texte, auteurUid, nomAuteur }),
    deleteComment: (photoId, commentId) =>
      this.expoService.deleteCommentaire(this.expoId, photoId, commentId),
    toggleCommentLike: (photoId, commentId, uid, currentlyLiked) =>
      this.expoService.toggleLikeCommentaire(this.expoId, photoId, commentId, uid, currentlyLiked),
    addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
      this.expoService.addReply(this.expoId, photoId, commentId, {
        texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
      }),
    deleteReply: (photoId, commentId, replyId, allReplies) =>
      this.expoService.deleteReply(this.expoId, photoId, commentId, replyId, allReplies),
    canDeletePhoto: (photo) => photo.uploaderUid === this.uid() || this.canManage(),
    deletePhoto: async (photo) => {
      const p = this.photos().find((x) => x.id === photo.id);
      if (!p) return;
      await this.supprimerPhotoClotureInternal(p);
      if (this.photos().length === 0) this.lightboxIndex.set(null);
    },
  }));

  lightboxCallbacksMes = computed((): PhotoLightboxCallbacks => ({
    toggleLike: async () => {},
    getComments: (photoId) => this.expoService.getCommentaires(this.expoId, photoId),
    addComment: (photoId, texte, auteurUid, nomAuteur) =>
      this.expoService.addCommentaire(this.expoId, photoId, { texte, auteurUid, nomAuteur }),
    deleteComment: (photoId, commentId) =>
      this.expoService.deleteCommentaire(this.expoId, photoId, commentId),
    toggleCommentLike: (photoId, commentId, uid, currentlyLiked) =>
      this.expoService.toggleLikeCommentaire(this.expoId, photoId, commentId, uid, currentlyLiked),
    addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
      this.expoService.addReply(this.expoId, photoId, commentId, {
        texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
      }),
    deleteReply: (photoId, commentId, replyId, allReplies) =>
      this.expoService.deleteReply(this.expoId, photoId, commentId, replyId, allReplies),
    canDeletePhoto: (photo) =>
      photo.uploaderUid === this.uid() && this.monStatutSoumission() === 'soumission',
    deletePhoto: async (photo) => {
      const p = this.mesPhotos().find((x) => x.id === photo.id);
      if (!p) return;
      await this.supprimerPhoto(p);
      if (this.mesPhotos().length === 0) this.lightboxIndexMes.set(null);
    },
  }));

  lightboxCallbacksMembre = computed((): PhotoLightboxCallbacks => ({
    toggleLike: async () => {},
    getComments: (photoId) => this.expoService.getCommentaires(this.expoId, photoId),
    addComment: (photoId, texte, auteurUid, nomAuteur) =>
      this.expoService.addCommentaire(this.expoId, photoId, { texte, auteurUid, nomAuteur }),
    deleteComment: (photoId, commentId) =>
      this.expoService.deleteCommentaire(this.expoId, photoId, commentId),
    toggleCommentLike: (photoId, commentId, uid, currentlyLiked) =>
      this.expoService.toggleLikeCommentaire(this.expoId, photoId, commentId, uid, currentlyLiked),
    addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
      this.expoService.addReply(this.expoId, photoId, commentId, {
        texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
      }),
    deleteReply: (photoId, commentId, replyId, allReplies) =>
      this.expoService.deleteReply(this.expoId, photoId, commentId, replyId, allReplies),
    canDeletePhoto: () => false,
    deletePhoto: async () => {},
  }));

  // ── Upload (soumission phase) ────────────────────────────────────────────────

  uploading = signal(false);
  uploadProgress = signal(0);
  uploadCurrent = signal(0);
  uploadTotal = signal(0);
  dragOver = signal(false);
  uploadError = signal('');
  deletingPhoto = signal<string | null>(null);

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    const files = [...(event.dataTransfer?.files ?? [])].filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length) this.uploadMultiple(files);
  }

  onFileSelected(event: Event) {
    const files = [...((event.target as HTMLInputElement).files ?? [])].filter((f) =>
      f.type.startsWith('image/'),
    );
    (event.target as HTMLInputElement).value = '';
    if (files.length) this.uploadMultiple(files);
  }

  private async uploadMultiple(files: File[]) {
    if (this.uploading()) return;
    const maxPhotos = this.expo()?.maxPhotosParMembre ?? 0;
    const toUpload = files.slice(0, Math.max(0, maxPhotos - this.mesPhotos().length));
    if (!toUpload.length) return;

    this.uploading.set(true);
    this.uploadError.set('');
    this.uploadTotal.set(toUpload.length);

    for (let i = 0; i < toUpload.length; i++) {
      if (!this.canUploadEnSoumission()) break;
      this.uploadCurrent.set(i + 1);
      await this.uploadOne(toUpload[i]);
    }

    this.uploading.set(false);
    this.uploadProgress.set(0);
    this.uploadTotal.set(0);
    this.uploadCurrent.set(0);
  }

  private uploadOne(file: File): Promise<void> {
    return new Promise((resolve) => {
      const uid = this.uid()!;
      const nom = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
      Promise.all([
        readExifWithConsent(file, this.gpsConsentService),
        compressImage(file, COMPRESS_EVENT),
      ]).then(([exif, compressed]) => {
        this.expoService.uploadPhoto(compressed, this.expoId, { uid, nomAuteur: nom, exif }).subscribe({
          next: (state) => {
            this.uploadProgress.set(state.progress);
            if (state.done && state.photo) {
              this.mesPhotos.update((ps) => [...ps, state.photo!]);
              this.participantCache.delete(uid);
              this.participants.update((ps) => {
                const exists = ps.some((p) => p.uid === uid);
                if (exists) return ps.map((p) => (p.uid === uid ? { ...p, nbPhotos: p.nbPhotos + 1 } : p));
                const newP: ExpoParticipant = { uid, nom, nbPhotos: 1, statut: 'soumission' };
                return [...ps, newP];
              });
            }
          },
          error: () => {
            this.uploadError.set("Erreur lors de l'envoi. Réessayez.");
            resolve();
          },
          complete: () => resolve(),
        });
      }).catch((e) => {
        this.uploadError.set(
          e instanceof ImageDecodeError
            ? 'Format non supporté. Exportez la photo en JPEG puis réessayez.'
            : "Erreur lors de l'envoi. Réessayez.",
        );
        resolve();
      });
    });
  }

  async supprimerPhoto(photo: ExpoPhoto) {
    if (this.monStatutSoumission() !== 'soumission') return;
    const ok = await this.confirmService.confirm('Supprimer cette photo ?');
    if (!ok) return;
    this.deletingPhoto.set(photo.id);
    await this.expoService.deletePhoto(this.expoId, photo);
    const uid = this.uid();
    this.mesPhotos.update((ps) => ps.filter((p) => p.id !== photo.id));
    this.participants.update((ps) =>
      ps.map((p) =>
        p.uid === photo.uid ? { ...p, nbPhotos: Math.max(0, p.nbPhotos - 1) } : p,
      ),
    );
    this.participantCache.delete(photo.uid);
    this.deletingPhoto.set(null);

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

  private async supprimerPhotoClotureInternal(photo: ExpoPhoto) {
    const ok = await this.confirmService.confirm('Supprimer cette photo ?');
    if (!ok) return;
    this.deletingPhoto.set(photo.id);
    await this.expoService.deletePhoto(this.expoId, photo);
    this.photos.update((ps) => ps.filter((p) => p.id !== photo.id));
    this.participantCache.delete(photo.uid);
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

  // ── Soumission au comité ──────────────────────────────────────────────────────

  async soumettreAuComite() {
    const uid = this.uid();
    if (!uid) return;
    if (this.mesPhotos().length === 0) return;
    const ok = await this.confirmService.confirm(
      'Vos photos seront soumises au comité d\'évaluation. Vous ne pourrez plus les modifier.',
      'Soumettre au comité',
      'Confirmer',
      false,
    );
    if (!ok) return;
    await this.expoService.soumettreAuComite(this.expoId, uid);
    this.participants.update((ps) =>
      ps.map((p) =>
        p.uid === uid ? { ...p, statut: 'evaluation', soumisAt: new Date().toISOString() } : p,
      ),
    );

    const expo = this.expo();
    const nom = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
    const comiteUids = expo?.comiteUids ?? [];
    comiteUids
      .filter((cuid) => cuid !== uid)
      .forEach((cuid) => {
        const msg =
          cuid === expo?.responsableComiteUid
            ? `${nom} a soumis ses photos au comité pour l'exposition « ${expo?.titre ?? ''} ».`
            : `${nom} a soumis son dossier — disponible pour évaluation dans l'exposition « ${expo?.titre ?? ''} ».`;
        this.notifService
          .sendToUser(cuid, 'admin', msg, {
            lien: `/galeries/expositions/${this.expoId}`,
            sourceNom: nom,
            sourceUid: uid,
          })
          .catch(() => {});
      });
  }

  // ── Drill-down participant ────────────────────────────────────────────────────

  closeParticipantPanel() {
    this._evaluationDraftDirty.set(false);
    this._selectionDirty.set(false);
    this.selectedParticipantUid.set(null);
    this.photosParMembre.set([]);
    this.evaluations.set([]);
    this.monEvaluation.set(null);
    this.evaluationDraft.set([]);
    this.showClotureMembre.set(null);
    this.selectedPourCloture.set(new Set());
  }

  private async checkUnsavedBeforeSwitch(): Promise<boolean> {
    const evalDirty = this._evaluationDraftDirty();
    const selDirty = this._selectionDirty();
    if (!evalDirty && !selDirty) return true;

    const participantUid = this.selectedParticipantUid();
    const participant = participantUid
      ? this.participants().find((p) => p.uid === participantUid)
      : null;
    const nom = participant?.nom ?? 'ce participant';
    const whatDirty =
      evalDirty && selDirty
        ? 'le classement et la sélection de photos'
        : evalDirty
          ? 'le classement'
          : 'la sélection de photos';

    const choice = await this.confirmService.confirmTriple(
      `Modification non sauvegardée : ${whatDirty} pour « ${nom} ». Que souhaitez-vous faire ?`,
      'Modifications non sauvegardées',
      'Sauvegarder',
      'Ignorer les modifications',
    );
    if (choice === 'cancel') return false;
    if (choice === 'primary') {
      if (evalDirty) await this.sauvegarderEvaluation();
      if (selDirty && participantUid) await this.sauvegarderSelectionLocale(participantUid);
    }
    return true;
  }

  async selectParticipant(participantUid: string) {
    if (this.selectedParticipantUid() === participantUid) {
      if (!(await this.checkUnsavedBeforeSwitch())) return;
      this.closeParticipantPanel();
      return;
    }
    if (!(await this.checkUnsavedBeforeSwitch())) return;
    this._evaluationDraftDirty.set(false);
    this._selectionDirty.set(false);
    this.selectedParticipantUid.set(participantUid);
    setTimeout(() => {
      document
        .getElementById(`participant-row-eval-${participantUid}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
    this.photosParMembre.set([]);
    this.evaluations.set([]);
    this.monEvaluation.set(null);
    this.evaluationDraft.set([]);
    this.showClotureMembre.set(null);

    const uid = this.uid();
    const cached = this.participantCache.get(participantUid);

    if (cached) {
      this.photosParMembre.set(cached.photos);
      this.evaluations.set(cached.evaluations);
      this.monEvaluation.set(cached.monEvaluation);
    } else {
      this.loadingParticipant.set(true);
      const loads: Promise<void>[] = [
        this.expoService
          .getPhotosParMembre(this.expoId, participantUid)
          .then((p) => this.photosParMembre.set(p)),
      ];
      const participantStatut = this.participants().find((p) => p.uid === participantUid)?.statut;
      if (participantStatut === 'evaluation' || participantStatut === 'clos') {
        loads.push(
          this.expoService
            .getEvaluationsOnce(this.expoId, participantUid)
            .then((e) => this.evaluations.set(e)),
        );
      }
      if (this.isMembreComite() && uid) {
        loads.push(
          this.expoService.getMonEvaluation(this.expoId, participantUid, uid).then((ev) => {
            this.monEvaluation.set(ev);
          }),
        );
      }
      await Promise.all(loads);
      this.participantCache.set(participantUid, {
        photos: this.photosParMembre(),
        evaluations: this.evaluations(),
        monEvaluation: this.monEvaluation(),
      });
      this.loadingParticipant.set(false);
    }

    if (this.isMembreComite()) {
      const allIds = this.photosParMembre().map((p) => p.id);
      const ev = this.monEvaluation();
      if (ev) {
        const allSet = new Set(allIds);
        const ordered = ev.orderedPhotoIds.filter((id) => allSet.has(id));
        const newIds = allIds.filter((id) => !ordered.includes(id));
        this.evaluationDraft.set([...ordered, ...newIds]);
      } else {
        this.evaluationDraft.set(allIds);
      }
    }

    if (participantUid === uid && !this.evaluations().length && this.mesEvaluations().length) {
      this.evaluations.set(this.mesEvaluations());
    }
  }

  // ── Evaluation (committee) ────────────────────────────────────────────────────

  moveUp(index: number) {
    if (index === 0) return;
    this.evaluationDraft.update((ids) => {
      const copy = [...ids];
      [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
      return copy;
    });
    this._evaluationDraftDirty.set(true);
  }

  moveDown(index: number) {
    const draft = this.evaluationDraft();
    if (index >= draft.length - 1) return;
    this.evaluationDraft.update((ids) => {
      const copy = [...ids];
      [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
      return copy;
    });
    this._evaluationDraftDirty.set(true);
  }

  async sauvegarderEvaluation() {
    const uid = this.uid();
    const participantUid = this.selectedParticipantUid();
    if (!uid || !participantUid || this.evaluationSaving()) return;
    this.evaluationSaving.set(true);
    const orderedPhotoIds = this.evaluationDraft();
    await this.expoService.saveEvaluation(this.expoId, participantUid, uid, orderedPhotoIds);
    this._evaluationDraftDirty.set(false);
    const updated: ExpoEvaluation = { comiteUid: uid, orderedPhotoIds, updatedAt: new Date().toISOString() };
    this.monEvaluation.set(updated);
    // Update comiteUidsEvalues in participant if first evaluation
    this.participants.update((ps) =>
      ps.map((p) => {
        if (p.uid !== participantUid) return p;
        const already = p.comiteUidsEvalues?.includes(uid);
        if (already) return p;
        return { ...p, comiteUidsEvalues: [...(p.comiteUidsEvalues ?? []), uid] };
      }),
    );
    const entry = this.participantCache.get(participantUid);
    if (entry) {
      const updatedEvals = entry.evaluations.some((e) => e.comiteUid === uid)
        ? entry.evaluations.map((e) => (e.comiteUid === uid ? updated : e))
        : [...entry.evaluations, updated];
      this.participantCache.set(participantUid, {
        ...entry,
        evaluations: updatedEvals,
        monEvaluation: updated,
      });
    }
    this.evaluationSaving.set(false);
  }

  getPhotoById(id: string): ExpoPhoto | undefined {
    return this.photosParMembre().find((p) => p.id === id);
  }

  getPhotoIndexMembre(photoId: string): number {
    return this.photosParMembreTriees().findIndex((p) => p.id === photoId);
  }

  // ── Clôture d'un membre (responsable) ────────────────────────────────────────

  async openCloturePourMembre(participantUid: string) {
    if (this.selectedParticipantUid() !== participantUid) {
      this.selectedParticipantUid.set(participantUid);
      this.photosParMembre.set([]);
      this.evaluations.set([]);
      this.monEvaluation.set(null);
      this.evaluationDraft.set([]);
      this.showClotureMembre.set(null);
      const cached = this.participantCache.get(participantUid);
      if (cached) {
        this.photosParMembre.set(cached.photos);
        this.evaluations.set(cached.evaluations);
        this.monEvaluation.set(cached.monEvaluation);
      } else {
        this.loadingParticipant.set(true);
        await Promise.all([
          this.expoService
            .getPhotosParMembre(this.expoId, participantUid)
            .then((p) => this.photosParMembre.set(p)),
          this.expoService
            .getEvaluationsOnce(this.expoId, participantUid)
            .then((e) => this.evaluations.set(e)),
        ]);
        this.participantCache.set(participantUid, {
          photos: this.photosParMembre(),
          evaluations: this.evaluations(),
          monEvaluation: null,
        });
        this.loadingParticipant.set(false);
      }
    } else if (!this.evaluations().length) {
      const cached = this.participantCache.get(participantUid);
      if (cached?.evaluations.length) {
        this.evaluations.set(cached.evaluations);
      } else {
        const evals = await this.expoService.getEvaluationsOnce(this.expoId, participantUid);
        this.evaluations.set(evals);
        const entry = this.participantCache.get(participantUid);
        if (entry) this.participantCache.set(participantUid, { ...entry, evaluations: evals });
      }
    }
    this.ouvrirClotureMembre(participantUid);
  }

  ouvrirClotureMembre(participantUid: string) {
    const participant = this.participants().find((p) => p.uid === participantUid);
    if (!participant) return;
    // Pre-select photos that were previously selected
    const preselect = new Set(participant.selectedPhotoIds ?? []);
    this.selectedPourCloture.set(preselect);
    this.showClotureMembre.set(participantUid);
  }

  fermerClotureMembre() {
    this._selectionDirty.set(false);
    this.showClotureMembre.set(null);
    this.selectedPourCloture.set(new Set());
  }

  toggleSelectPourCloture(photoId: string) {
    this.selectedPourCloture.update((set) => {
      const copy = new Set(set);
      copy.has(photoId) ? copy.delete(photoId) : copy.add(photoId);
      return copy;
    });
    this._selectionDirty.set(true);
  }

  isSelectedPourCloture(photoId: string): boolean {
    return this.selectedPourCloture().has(photoId);
  }

  async toggleParticipantTab3(participantUid: string) {
    if (this.selectedParticipantUid() === participantUid) {
      if (!(await this.checkUnsavedBeforeSwitch())) return;
      this.closeParticipantPanel();
      return;
    }
    if (!(await this.checkUnsavedBeforeSwitch())) return;
    this._evaluationDraftDirty.set(false);
    this._selectionDirty.set(false);
    setTimeout(() => {
      document
        .getElementById(`participant-row-resp-${participantUid}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
    await this.openCloturePourMembre(participantUid);
  }

  async sauvegarderSelectionLocale(participantUid: string) {
    if (this.savingSelection()) return;
    this.savingSelection.set(true);
    const selectedIds = [...this.selectedPourCloture()];
    await this.expoService.sauvegarderSelectionMembre(this.expoId, participantUid, selectedIds);
    this.participants.update((ps) =>
      ps.map((p) => (p.uid === participantUid ? { ...p, selectedPhotoIds: selectedIds } : p)),
    );
    this._selectionDirty.set(false);
    this.savingSelection.set(false);
  }

  async confirmerClotureMembre(directUid?: string) {
    const participantUid = directUid ?? this.showClotureMembre();
    if (!participantUid || this.closingMembre()) return;
    const selectedIds = [...this.selectedPourCloture()];
    const ok = await this.confirmService.confirm(
      `Clôturer le dossier avec ${selectedIds.length} photo(s) sélectionnée(s) ?`,
      'Clôturer le dossier',
      'Clôturer',
      false,
    );
    if (!ok) return;
    this.closingMembre.set(true);
    await this.expoService.cloturerMembre(this.expoId, participantUid, selectedIds);
    this.participants.update((ps) =>
      ps.map((p) =>
        p.uid === participantUid
          ? { ...p, statut: 'clos', closAt: new Date().toISOString(), selectedPhotoIds: selectedIds }
          : p,
      ),
    );
    // Notify member
    const expo = this.expo();
    const moi = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
    this.notifService
      .sendToUser(
        participantUid,
        'admin',
        `Votre dossier pour l'exposition « ${expo?.titre ?? ''} » a été clôturé — ${selectedIds.length} photo(s) retenue(s).`,
        { lien: `/galeries/expositions/${this.expoId}`, sourceNom: moi, sourceUid: this.uid()! },
      )
      .catch(() => {});
    this.closingMembre.set(false);
    this.fermerClotureMembre();
  }

  async doRouvrirMembre(participantUid: string) {
    const ok = await this.confirmService.confirm(
      'Ré-ouvrir en évaluation ? Le comité pourra à nouveau classer les photos, mais le membre ne peut plus modifier son dossier.',
      'Ré-ouvrir pour évaluation',
      'Ré-ouvrir',
      false,
    );
    if (!ok) return;
    await this.expoService.rouvrirMembre(this.expoId, participantUid);
    this.participants.update((ps) =>
      ps.map((p) =>
        p.uid === participantUid
          ? { ...p, statut: 'evaluation', closAt: undefined, selectedPhotoIds: undefined, comiteUidsEvalues: undefined }
          : p,
      ),
    );
    this.participantCache.delete(participantUid);
  }

  async doRouvrirMembreASoumission(participantUid: string) {
    const ok = await this.confirmService.confirm(
      'Ré-ouvrir en soumission ? Le membre pourra à nouveau modifier ses photos (ajout / suppression).',
      'Ré-ouvrir pour soumission',
      'Ré-ouvrir',
      false,
    );
    if (!ok) return;
    await this.expoService.rouvrirMembreASoumission(this.expoId, participantUid);
    this.participants.update((ps) =>
      ps.map((p) =>
        p.uid === participantUid
          ? { ...p, statut: 'soumission', soumisAt: undefined, closAt: undefined, selectedPhotoIds: undefined, comiteUidsEvalues: undefined }
          : p,
      ),
    );
    this.participantCache.delete(participantUid);
    const expo = this.expo();
    const moi = `${this.profile()?.prenom ?? ''} ${this.profile()?.nom ?? ''}`.trim();
    this.notifService
      .sendToUser(
        participantUid,
        'admin',
        `Votre dossier pour l'exposition « ${expo?.titre ?? ''} » a été rouvert — vous pouvez à nouveau modifier vos photos et re-soumettre.`,
        { lien: `/galeries/expositions/${this.expoId}`, sourceNom: moi, sourceUid: this.uid()! },
      )
      .catch(() => {});
  }

  // ── Comité management ────────────────────────────────────────────────────────

  async openEditComite() {
    const expo = this.expo();
    this.draftResponsableUid.set(expo?.responsableComiteUid ?? '');
    this.draftComiteUids.set([...(expo?.comiteUids ?? [])]);
    if (!this.allMembres().length) {
      const membres = await firstValueFrom(this.authService.getAllMembersOnce());
      const sorted = membres
        .filter((m) => !m.isSuspended)
        .sort((a, b) => {
          const na = `${a.nom} ${a.prenom ?? ''}`.normalize('NFD').toLowerCase();
          const nb = `${b.nom} ${b.prenom ?? ''}`.normalize('NFD').toLowerCase();
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
      this.allMembres.set(sorted);
    }
    this.editComite.set(true);
  }

  cancelEditComite() {
    this.editComite.set(false);
  }

  setResponsable(uid: string) {
    this.draftResponsableUid.set(uid);
  }

  toggleDraftComiteMembre(uid: string) {
    this.draftComiteUids.update((ids) =>
      ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid],
    );
  }

  membreNom(uid: string): string {
    const m = this.allMembres().find((x) => x.uid === uid);
    if (!m) return uid;
    return `${m.prenom ?? ''} ${m.nom}`.trim();
  }

  async saveComite() {
    if (this.comiteSaving()) return;
    this.comiteSaving.set(true);
    const responsable = this.draftResponsableUid() || null;
    const comiteUids = this.draftComiteUids();
    const responsableNom = responsable ? this.membreNom(responsable) : undefined;
    const comiteNoms = comiteUids.map((uid) => this.membreNom(uid));

    // Detect removed committee members and delete their evaluations
    const oldComite = this.expo()?.comiteUids ?? [];
    const removedUids = oldComite.filter((uid) => !comiteUids.includes(uid));
    await Promise.all(
      removedUids.map((uid) =>
        this.expoService.removeComiteMembreEvaluations(this.expoId, uid).catch(() => {}),
      ),
    );

    await this.expoService.updateComite(this.expoId, responsable, comiteUids, responsableNom, comiteNoms);
    this.expo.update((e) => {
      if (!e) return e;
      const updated = { ...e, comiteUids, comiteNoms };
      if (responsable) {
        updated.responsableComiteUid = responsable;
        updated.responsableComiteNom = responsableNom;
      } else {
        delete updated.responsableComiteUid;
        delete updated.responsableComiteNom;
      }
      return updated;
    });
    this.comiteSaving.set(false);
    this.editComite.set(false);
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
    nbPhotosExposition: new FormControl<number | null>(null),
    visibilite: new FormControl<'public' | 'membre'>('membre', { nonNullable: true }),
    dateDebutIdeation: new FormControl('', { nonNullable: true }),
    dateFinIdeation: new FormControl('', { nonNullable: true }),
    dateFinVote: new FormControl('', { nonNullable: true }),
    dateFinSoumission: new FormControl('', { nonNullable: true }),
    dateExposition: new FormControl('', { nonNullable: true }),
    dateFinExposition: new FormControl('', { nonNullable: true }),
  });

  private editThemeSignal = toSignal(this.editForm.get('themeChoisi')!.valueChanges, {
    initialValue: this.editForm.get('themeChoisi')!.value,
  });

  get datesLocked(): boolean {
    return !!this.editThemeSignal()?.trim();
  }

  get datesChronoError(): string | null {
    const v = this.editForm.getRawValue();
    const chain = [
      { label: 'Début idéation', val: v.dateDebutIdeation },
      { label: 'Fin idéation', val: v.dateFinIdeation },
      { label: 'Fin vote', val: v.dateFinVote },
      { label: 'Fin soumission', val: v.dateFinSoumission },
      { label: "Date d'exposition", val: v.dateExposition },
      { label: "Fin d'exposition", val: v.dateFinExposition },
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
      nbPhotosExposition: e.nbPhotosExposition ?? null,
      visibilite: e.visibilite ?? 'membre',
      dateDebutIdeation: e.dateDebutIdeation ?? '',
      dateFinIdeation: e.dateFinIdeation,
      dateFinVote: e.dateFinVote ?? '',
      dateFinSoumission: e.dateFinSoumission ?? '',
      dateExposition: e.dateExposition ?? '',
      dateFinExposition: e.dateFinExposition ?? '',
    });
    if (e.themeChoisi) {
      this.editForm.get('themeChoisi')!.disable({ emitEvent: false });
    }
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editForm.get('themeChoisi')!.enable({ emitEvent: false });
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
        nbPhotosExposition: v.nbPhotosExposition ?? undefined,
        visibilite: v.visibilite,
        dateDebutIdeation: v.dateDebutIdeation || undefined,
        dateFinIdeation: v.dateFinIdeation,
        dateFinVote: v.dateFinVote || undefined,
        dateFinSoumission: v.dateFinSoumission || undefined,
        dateExposition: v.dateExposition || undefined,
        dateFinExposition: v.dateFinExposition || undefined,
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
        if (v.nbPhotosExposition) updated.nbPhotosExposition = v.nbPhotosExposition;
        else delete updated.nbPhotosExposition;
        if (v.dateDebutIdeation) updated.dateDebutIdeation = v.dateDebutIdeation;
        else delete updated.dateDebutIdeation;
        if (v.dateFinVote) updated.dateFinVote = v.dateFinVote;
        else delete updated.dateFinVote;
        if (v.dateFinSoumission) updated.dateFinSoumission = v.dateFinSoumission;
        else delete updated.dateFinSoumission;
        if (v.dateExposition) updated.dateExposition = v.dateExposition;
        else delete updated.dateExposition;
        if (v.dateFinExposition) updated.dateFinExposition = v.dateFinExposition;
        else delete updated.dateFinExposition;
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
      this.editForm.get('themeChoisi')!.enable({ emitEvent: false });
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

  formatDatetime(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  today = new Date().toISOString().slice(0, 10);
}
