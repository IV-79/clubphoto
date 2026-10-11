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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { DatePickerComponent } from '../../../components/date-picker/date-picker';
import { SortieService } from '../../../services/sortie.service';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { NotificationService } from '../../../services/notification.service';
import {
  Sortie,
  AtelierGroupe,
  SortieImage,
  SortieType,
  SORTIE_TYPE_META,
} from '../../../models/sortie.model';
import { UserProfile } from '../../../models/user.model';
import { LightboxPhoto, PhotoLightboxCallbacks } from '../../../models/commentaire.model';
import { PhotoLightbox } from '../../../components/photo-lightbox/photo-lightbox';
import { compressImage, COMPRESS_EVENT, COMPRESS_COUVERTURE } from '../../../utils/image-compress';
import { readExifWithConsent } from '../../../utils/exif-reader';
import { GpsConsentService } from '../../../services/gps-consent.service';
import { ImgRetryDirective } from '../../../directives/img-retry.directive';
import { EventHero, HeroBadge } from '../../../components/event-hero/event-hero';

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  done: boolean;
  error?: string;
}

export interface GroupePhotos {
  groupe: AtelierGroupe;
  photos: SortieImage[];
  photoChoisie: SortieImage | null;
}

export interface GalerieItem {
  gp: GroupePhotos;
  lightboxIndex: number | null; // index dans photosChoisiesLightbox, null si pas de photo choisie
}

@Component({
  selector: 'app-sortie-detail',
  imports: [
    PhotoLightbox,
    ImgRetryDirective,
    EventHero,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule,
    MatIconModule,
    DatePickerComponent,
  ],
  templateUrl: './sortie-detail.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './sortie-detail.css',
})
export class SortieDetail {
  @ViewChild('coverInput') coverInput!: ElementRef<HTMLInputElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sortieService = inject(SortieService);
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private notifService = inject(NotificationService);
  private gpsConsentService = inject(GpsConsentService);
  private elRef = inject(ElementRef);

  sortieId = this.route.snapshot.paramMap.get('id')!;
  profile = toSignal(this.authService.currentUserProfile$);

  private refreshTick = signal(0);
  private refresh() {
    this.refreshTick.update((n) => n + 1);
  }

  private inscriptionsTrigger = computed(() => ({
    profile: this.profile(),
    tick: this.refreshTick(),
  }));

  sortie = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() => this.sortieService.getSortieOnce(this.sortieId)),
    ),
    { initialValue: null as Sortie | null },
  );

  photos = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() => this.sortieService.getPhotosOnce(this.sortieId)),
    ),
    { initialValue: [] as SortieImage[] },
  );

  private groupesTrigger = computed(() => ({
    tick: this.refreshTick(),
    // Ne charge les groupes que si c'est un atelier en mode groupes
    // (sortie() peut être null au premier tick, on attend qu'elle soit chargée)
    load: this.sortie()?.type === 'atelier' && !!this.sortie()?.modeGroupes,
  }));

  groupes = toSignal(
    toObservable(this.groupesTrigger).pipe(
      switchMap(({ load }) =>
        load
          ? this.sortieService.getGroupesOnce(this.sortieId)
          : of([] as AtelierGroupe[]),
      ),
    ),
    { initialValue: [] as AtelierGroupe[] },
  );

  inscriptions = toSignal(
    toObservable(this.inscriptionsTrigger).pipe(
      switchMap(({ profile }) =>
        !profile ? of([]) : this.sortieService.getInscriptionsOnce(this.sortieId),
      ),
    ),
    { initialValue: [] },
  );

  // Photos optimistes : ajoutées immédiatement après upload, supprimées quand photos() les intègre
  private pendingPhotos = signal<SortieImage[]>([]);

  allPhotos = computed((): SortieImage[] => {
    const loaded = this.photos();
    const pending = this.pendingPhotos();
    if (pending.length === 0) return loaded;
    const loadedIds = new Set(loaded.map((p) => p.id));
    return [...loaded, ...pending.filter((p) => !loadedIds.has(p.id))];
  });

  private clearPendingEffect = effect(() => {
    const loadedIds = new Set(this.photos().map((p) => p.id));
    if (this.pendingPhotos().some((p) => loadedIds.has(p.id))) {
      untracked(() => {
        this.pendingPhotos.update((pp) => pp.filter((p) => !loadedIds.has(p.id)));
      });
    }
  });

  // ── UI state ───────────────────────────────────────────────────
  lightboxPhotos_signal = signal<LightboxPhoto[]>([]);
  lightboxCallbacks_signal = signal<PhotoLightboxCallbacks | null>(null);
  lightboxIndex = signal<number | null>(null);
  uploads = signal<UploadTask[]>([]);
  photoDragOver = signal(false);
  inscribing = signal(false);
  saving = signal(false);
  editMode = signal(false);
  addingMembre = signal(false);
  selectedMembreUid = signal('');
  coverUploading = signal(false);
  coverDragOver = signal(false);

  // ── Groupes UI state ──────────────────────────────────────────
  openGroupIds = signal<Set<string>>(new Set());
  newGroupeNom = signal('');
  editingGroupeId = signal<string | null>(null);
  editGroupeNom = signal('');
  savingGroupe = signal(false);
  joiningGroupeId = signal<string | null>(null);
  closingSubmissions = signal(false);
  uploadGroupeId = signal<string | null>(null); // groupe cible de l'upload courant
  galleryLightboxIndex = signal<number | null>(null);

  // ── Permissions ───────────────────────────────────────────────
  isOrganisateur = computed(() => {
    const s = this.sortie();
    const p = this.profile();
    return !!s && !!p && s.organisateurUid === p.uid;
  });

  typeMeta = computed(() => SORTIE_TYPE_META[this.sortie()?.type ?? 'sortie_photo']);

  isAdmin = computed(() => this.profile()?.role === 'admin');
  canManage = computed(() => this.isOrganisateur() || this.isAdmin());

  // ── Atelier groupes ───────────────────────────────────────────
  isAtelier = computed(() => this.sortie()?.type === 'atelier');
  modeGroupes = computed(() => this.isAtelier() && !!this.sortie()?.modeGroupes);

  estTermine = computed(() => {
    const s = this.sortie();
    if (!s) return false;
    if (s.soumissionsFermees) return true;
    if (!s.dateFinSoumission) return false;
    return new Date().toISOString().slice(0, 10) > s.dateFinSoumission;
  });

  monGroupe = computed((): AtelierGroupe | null => {
    const uid = this.profile()?.uid;
    if (!uid || !this.modeGroupes()) return null;
    return this.groupes().find((g) => g.membres.includes(uid)) ?? null;
  });

  photosParGroupe = computed((): GroupePhotos[] => {
    if (!this.modeGroupes()) return [];
    const allPhotos = this.allPhotos();

    return this.groupes().map((g) => {
      const photos = this.arePhotosVisible(g.id) ? allPhotos.filter((p) => p.groupeId === g.id) : [];
      const photoChoisie = g.photoChoisieId
        ? (photos.find((p) => p.id === g.photoChoisieId) ?? null)
        : null;
      return { groupe: g, photos, photoChoisie };
    });
  });

  // Items de la galerie post-fermeture avec index lightbox pré-calculé
  galerieItems = computed((): GalerieItem[] => {
    let lbIdx = 0;
    return this.photosParGroupe().map((gp) => ({
      gp,
      lightboxIndex: gp.photoChoisie ? lbIdx++ : null,
    }));
  });

  // Flat list des photos choisies pour la lightbox galerie
  photosChoisiesLightbox = computed((): LightboxPhoto[] =>
    this.photosParGroupe()
      .filter((gp) => gp.photoChoisie !== null)
      .map((gp) => ({
        id: gp.photoChoisie!.id,
        url: gp.photoChoisie!.url,
        nomAuteur: `${gp.photoChoisie!.nomUploader} — ${gp.groupe.nom}`,
        uploaderUid: gp.photoChoisie!.uploaderUid,
        likes: gp.photoChoisie!.likes,
        uploadedAt: gp.photoChoisie!.uploadedAt,
        exif: gp.photoChoisie!.exif,
      })),
  );

  isGroupeOpen(groupeId: string): boolean {
    return this.openGroupIds().has(groupeId);
  }

  // Les accordions sont toujours navigables — seules les photos sont restreintes
  isGroupeLocked(_groupeId: string): boolean {
    return false;
  }

  // Photos visibles : propre groupe pendant la phase active, tout le monde après clôture
  arePhotosVisible(groupeId: string): boolean {
    if (this.estTermine() || this.canManage()) return true;
    return this.monGroupe()?.id === groupeId;
  }

  toggleGroupe(groupeId: string) {
    this.openGroupIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(groupeId)) {
        next.delete(groupeId);
      } else {
        next.add(groupeId);
      }
      return next;
    });
  }

  // Auto-ouvre le groupe du membre au chargement
  private autoOpenEffect = effect(() => {
    const monGroupe = this.monGroupe();
    if (monGroupe) {
      untracked(() => {
        this.openGroupIds.update((ids) => {
          if (ids.has(monGroupe.id)) return ids;
          return new Set([...ids, monGroupe.id]);
        });
      });
    }
  });

  // ── Badges hero ───────────────────────────────────────────────
  typeBadgeHero = computed((): HeroBadge => {
    const s = this.sortie();
    const type = s?.type ?? 'sortie_photo';
    const meta = SORTIE_TYPE_META[type];
    const badgeCss = type === 'sortie_club' ? 'badge-sortie-club' : 'badge-sortie';
    return { text: `${meta.emoji} ${meta.label}`, css: `event-type-badge ${badgeCss}` };
  });

  uploadVerrouille = computed(() => {
    const s = this.sortie();
    if (!s) return false;
    if (s.soumissionsFermees) return true;
    if (!s.dateFinSoumission) return false;
    return new Date().toISOString().slice(0, 10) > s.dateFinSoumission;
  });

  statusHero = computed((): HeroBadge => {
    if (this.isAVenir()) return { text: 'À venir', css: 'hero-status status-avenir' };
    if (this.uploadVerrouille()) return { text: 'Photos clôturées', css: 'hero-status status-cloture' };
    return { text: 'Ouverte aux photos', css: 'hero-status status-photos' };
  });

  private allMembres$ = toObservable(this.canManage).pipe(
    switchMap((can) => (can ? this.authService.getAllMembersOnce() : of([] as UserProfile[]))),
  );
  allMembres = toSignal(this.allMembres$, { initialValue: [] as UserProfile[] });

  // ── Formulaire d'édition ──────────────────────────────────────
  form = new FormGroup({
    type: new FormControl<SortieType>('sortie_photo', { nonNullable: true }),
    titre: new FormControl('', {
      validators: [Validators.required, Validators.minLength(3)],
      nonNullable: true,
    }),
    description: new FormControl('', { nonNullable: true }),
    date: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    lieu: new FormControl('', { nonNullable: true }),
    maxParticipants: new FormControl<number | null>(null),
    inscriptionObligatoire: new FormControl(true, { nonNullable: true }),
    visibilite: new FormControl<'public' | 'membre'>('public', { nonNullable: true }),
    dateFinSoumission: new FormControl('', { nonNullable: true }),
    modeGroupes: new FormControl(false, { nonNullable: true }),
    maxPhotosParGroupe: new FormControl<number | null>(null),
  });

  // ── Computed basiques ─────────────────────────────────────────
  accessDenied = computed(() => {
    const s = this.sortie();
    return !!s && (s.visibilite ?? 'public') === 'membre' && !this.profile();
  });

  get inscriptionObligatoire() {
    return this.form.get('inscriptionObligatoire')!.value;
  }

  isAVenir = computed(() => {
    const s = this.sortie();
    if (!s) return true;
    return new Date(s.date + 'T00:00:00') > new Date();
  });

  isInscrit = computed(() => {
    const uid = this.profile()?.uid;
    if (!uid) return false;
    if (this.modeGroupes()) return !!this.monGroupe();
    return this.inscriptions().some((i) => i.uid === uid);
  });

  canInscrire = computed(() => {
    const s = this.sortie();
    const p = this.profile();
    if (!s || !p || !s.inscriptionObligatoire) return false;
    if (this.modeGroupes()) return false; // inscription via groupe uniquement
    if (this.isInscrit()) return false;
    if (s.maxParticipants && this.inscriptions().length >= s.maxParticipants) return false;
    return true;
  });

  canUpload = computed(() => {
    const s = this.sortie();
    const p = this.profile();
    if (!s || !p || this.isAVenir()) return false;
    if (this.uploadVerrouille()) return false;
    if (this.modeGroupes()) {
      const mg = this.monGroupe();
      if (!mg) return false;
      const max = s.maxPhotosParGroupe;
      if (max != null) {
        const groupePhotos = this.allPhotos().filter((ph) => ph.groupeId === mg.id);
        if (groupePhotos.length >= max) return false;
      }
      return true;
    }
    if (!s.inscriptionObligatoire) return true;
    return this.isInscrit() || this.isOrganisateur() || this.isAdmin();
  });

  canUploadForGroupe = computed(() => {
    // version pour le template groupe (indépendant du groupeId courant)
    return this.canUpload();
  });

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  membresDisponibles = computed(() => {
    const inscritUids = new Set(this.inscriptions().map((i) => i.uid));
    return this.allMembres()
      .filter((m) => !inscritUids.has(m.uid) && !m.isSuspended)
      .sort((a, b) => `${a.prenom ?? ''} ${a.nom}`.localeCompare(`${b.prenom ?? ''} ${b.nom}`));
  });

  // Membres non encore dans un groupe, disponibles pour ajout manuel (organisateur)
  membresDisponiblesPourGroupe = computed(() => {
    const dansUnGroupe = new Set(this.groupes().flatMap((g) => g.membres));
    return this.allMembres()
      .filter((m) => !dansUnGroupe.has(m.uid) && !m.isSuspended)
      .sort((a, b) => {
        const na = `${a.nom ?? ''} ${a.prenom ?? ''}`.toLowerCase().normalize('NFD');
        const nb = `${b.nom ?? ''} ${b.prenom ?? ''}`.toLowerCase().normalize('NFD');
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
  });

  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.allPhotos().map((p) => ({
      id: p.id,
      url: p.url,
      nomAuteur: p.nomUploader,
      uploaderUid: p.uploaderUid,
      likes: p.likes,
      uploadedAt: p.uploadedAt,
      exif: p.exif,
    })),
  );

  lightboxForGroupe(groupePhotos: SortieImage[]): LightboxPhoto[] {
    return groupePhotos.map((p) => ({
      id: p.id,
      url: p.url,
      nomAuteur: p.nomUploader,
      uploaderUid: p.uploaderUid,
      likes: p.likes,
      uploadedAt: p.uploadedAt,
      exif: p.exif,
    }));
  }

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const sortieId = this.sortieId;
    const uid = this.profile()?.uid ?? '';
    return this.buildCallbacks(sortieId, uid);
  });

  private buildCallbacks(sortieId: string, uid: string): PhotoLightboxCallbacks {
    return {
      toggleLike: (photoId, liked) =>
        this.sortieService.toggleLikePhoto(sortieId, photoId, uid, liked),
      getComments: (photoId) => this.sortieService.getCommentaires(sortieId, photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) =>
        this.sortieService.addCommentaire(sortieId, photoId, { texte, auteurUid, nomAuteur }),
      deleteComment: (photoId, commentId) =>
        this.sortieService.deleteCommentaire(sortieId, photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.sortieService.toggleLikeCommentaire(sortieId, photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.sortieService.addReply(sortieId, photoId, commentId, {
          texte,
          auteurUid,
          nomAuteur,
          createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.sortieService.deleteReply(sortieId, photoId, commentId, replyId, allReplies),
      canDeletePhoto: (photo) =>
        photo.uploaderUid === uid || this.isAdmin() || this.isOrganisateur(),
      deletePhoto: async (photo) => {
        const img = this.photos().find((p) => p.id === photo.id)!;
        await this.sortieService.deletePhoto(sortieId, img, this.sortie()?.photoCouvertureUrl);
        const actor = this.profile();
        if (actor && img.uploaderUid !== actor.uid) {
          const titre = photo.titre ? ` « ${photo.titre} »` : '';
          this.notifService
            .sendToUser(
              img.uploaderUid,
              'admin',
              `L'admin ${this.userName()} a supprimé votre photo${titre} dans l'événement « ${this.sortie()?.titre ?? ''} »`,
              { sourceNom: this.userName(), sourceUid: actor.uid },
            )
            .catch(() => {});
        }
        this.refresh();
      },
    };
  }

  // lightbox index par groupe (signaux séparés pour chaque groupe)
  private groupeLightboxIndex = signal<{ groupeId: string; index: number } | null>(null);

  openGroupeLightbox(groupeId: string, index: number) {
    this.groupeLightboxIndex.set({ groupeId, index });
  }
  closeGroupeLightbox() {
    this.groupeLightboxIndex.set(null);
  }
  getGroupeLightboxIndex(groupeId: string): number | null {
    const v = this.groupeLightboxIndex();
    if (!v || v.groupeId !== groupeId) return null;
    return v.index;
  }

  // ── Actions groupes (organisateur) ────────────────────────────
  async creerGroupe() {
    const nom = this.newGroupeNom().trim();
    if (!nom || this.savingGroupe()) return;
    this.savingGroupe.set(true);
    try {
      const ordre = this.groupes().length;
      await this.sortieService.createGroupe(this.sortieId, nom, ordre);
      this.newGroupeNom.set('');
      this.refresh();
    } finally {
      this.savingGroupe.set(false);
    }
  }

  startEditGroupe(g: AtelierGroupe) {
    this.editingGroupeId.set(g.id);
    this.editGroupeNom.set(g.nom);
  }

  cancelEditGroupe() {
    this.editingGroupeId.set(null);
    this.editGroupeNom.set('');
  }

  async saveEditGroupe(groupeId: string) {
    const nom = this.editGroupeNom().trim();
    if (!nom || this.savingGroupe()) return;
    this.savingGroupe.set(true);
    try {
      await this.sortieService.updateGroupeNom(this.sortieId, groupeId, nom);
      this.editingGroupeId.set(null);
      this.refresh();
    } finally {
      this.savingGroupe.set(false);
    }
  }

  async supprimerGroupe(g: AtelierGroupe) {
    if (g.nbMembres > 0) {
      await this.confirmService.confirm(
        `Impossible de supprimer « ${g.nom} » : ${g.nbMembres} membre(s) sont encore dans ce groupe. Retirez-les d'abord.`,
      );
      return;
    }
    const ok = await this.confirmService.confirm(`Supprimer le groupe « ${g.nom } » ?`);
    if (!ok) return;
    await this.sortieService.deleteGroupe(this.sortieId, g.id);
    this.refresh();
  }

  // Organisateur inscrit manuellement un membre dans un groupe
  async inscrireDansGroupe(groupeId: string, uid: string) {
    if (!uid) return;
    const membre = this.allMembres().find((m) => m.uid === uid);
    if (!membre) return;
    const nom = `${membre.prenom ?? ''} ${membre.nom}`.trim();
    const ancienGroupeId = this.groupes().find((g) => g.membres.includes(uid))?.id;
    await this.sortieService.rejoindreGroupe(this.sortieId, groupeId, uid, nom, ancienGroupeId);
    this.refresh();
  }

  // Organisateur retire un membre d'un groupe
  async retirerDuGroupe(groupeId: string, uid: string, nomMembre: string) {
    const ok = await this.confirmService.confirm(
      `Retirer ${nomMembre} du groupe ?`,
    );
    if (!ok) return;
    await this.sortieService.quitterGroupe(this.sortieId, groupeId, uid);
    this.refresh();
  }

  // ── Actions groupes (membre) ──────────────────────────────────
  async rejoindreGroupe(groupeId: string) {
    const p = this.profile();
    const s = this.sortie();
    if (!p || !s || this.joiningGroupeId()) return;

    const g = this.groupes().find((gr) => gr.id === groupeId);
    if (!g) return;
    if (s.maxParticipants && (g.nbMembres ?? 0) >= s.maxParticipants) return;

    const ancienGroupe = this.monGroupe();
    if (ancienGroupe) {
      const ok = await this.confirmService.confirm(
        `Vous êtes dans le groupe « ${ancienGroupe.nom} ». Rejoindre « ${g.nom} » à la place ?`,
        'Changer de groupe',
        'Changer de groupe',
        false,
      );
      if (!ok) return;
    }

    this.joiningGroupeId.set(groupeId);
    try {
      const nom = this.userName();
      await this.sortieService.rejoindreGroupe(this.sortieId, groupeId, p.uid, nom, ancienGroupe?.id);
      this.refresh();
    } finally {
      this.joiningGroupeId.set(null);
    }
  }

  async quitterGroupe() {
    const p = this.profile();
    const mg = this.monGroupe();
    if (!p || !mg) return;
    const ok = await this.confirmService.confirm(
      `Quitter le groupe « ${mg.nom} » ?`,
    );
    if (!ok) return;
    await this.sortieService.quitterGroupe(this.sortieId, mg.id, p.uid);
    this.openGroupIds.update((ids) => {
      const next = new Set(ids);
      next.delete(mg.id);
      return next;
    });
    this.refresh();
  }

  // ── Fermer / rouvrir soumissions ──────────────────────────────
  async fermerSoumissions() {
    const groupesSansPhoto = this.groupes().filter((g) => !g.photoChoisieId);
    let ok: boolean;
    if (groupesSansPhoto.length > 0) {
      const noms = groupesSansPhoto.map((g) => `« ${g.nom} »`).join(', ');
      ok = await this.confirmService.confirm(
        `${groupesSansPhoto.length} groupe(s) n'ont pas encore choisi de photo à présenter : ${noms}. Fermer quand même ?`,
        'Fermer les soumissions',
        'Fermer quand même',
        true,
      );
    } else {
      ok = await this.confirmService.confirm(
        'Tous les groupes ont choisi leur photo. Fermer les soumissions ?',
        'Fermer les soumissions',
        'Fermer',
        false,
      );
    }
    if (!ok) return;
    this.closingSubmissions.set(true);
    try {
      await this.sortieService.fermerSoumissions(this.sortieId);
      this.refresh();
    } finally {
      this.closingSubmissions.set(false);
    }
  }

  async choisirPhoto(groupeId: string, photoId: string, estDejaChoisie: boolean) {
    await this.sortieService.choisirPhotoGroupe(
      this.sortieId,
      groupeId,
      estDejaChoisie ? null : photoId,
    );
    this.refresh();
  }

  async rouvrirSoumissions() {
    const ok = await this.confirmService.confirm('Rouvrir les soumissions de photos ?');
    if (!ok) return;
    await this.sortieService.rouvrirSoumissions(this.sortieId);
    this.refresh();
  }

  // ── Edit ──────────────────────────────────────────────────────
  startEdit() {
    const s = this.sortie();
    if (!s) return;
    this.form.reset({
      type: s.type ?? 'sortie_photo',
      titre: s.titre,
      description: s.description ?? '',
      date: s.date ?? '',
      lieu: s.lieu ?? '',
      maxParticipants: s.maxParticipants ?? null,
      inscriptionObligatoire: s.inscriptionObligatoire,
      visibilite: s.visibilite ?? 'public',
      dateFinSoumission: s.dateFinSoumission ?? '',
      modeGroupes: s.modeGroupes ?? false,
      maxPhotosParGroupe: s.maxPhotosParGroupe ?? null,
    });
    this.editMode.set(true);
  }

  cancelEdit() {
    this.editMode.set(false);
  }

  async saveEdit() {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
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
      const v = this.form.getRawValue();
      const s = this.sortie()!;
      await this.sortieService.updateSortie(
        this.sortieId,
        {
          type: v.type,
          titre: v.titre.trim(),
          description: v.description.trim(),
          date: v.date,
          lieu: v.lieu.trim(),
          maxParticipants: v.maxParticipants ?? undefined,
          inscriptionObligatoire: v.inscriptionObligatoire,
          visibilite: v.visibilite,
          dateFinSoumission: v.dateFinSoumission,
          ...(v.type === 'atelier'
            ? {
                modeGroupes: v.modeGroupes,
                maxPhotosParGroupe: v.maxPhotosParGroupe ?? undefined,
              }
            : {}),
        },
        {
          oldDate: s.date,
          titre: s.titre,
          nomOrganisateur: s.nomOrganisateur,
          organisateurUid: s.organisateurUid,
        },
      );
      this.editMode.set(false);
      this.refresh();
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSortie() {
    const s = this.sortie();
    const ok = await this.confirmService.confirm(
      `Supprimer « ${s?.titre ?? 'cet événement'} » et toutes ses photos définitivement ?`,
    );
    if (!ok) return;
    await this.sortieService.deleteSortie(
      this.sortieId,
      s
        ? {
            titre: s.titre,
            nomOrganisateur: s.nomOrganisateur,
            organisateurUid: s.organisateurUid,
            imageEvenementPath: s.imageEvenementPath,
          }
        : undefined,
    );
    this.router.navigate(['/galeries/sorties']);
  }

  async retirerInscrit(targetUid: string, targetNom: string) {
    const s = this.sortie();
    const p = this.profile();
    if (!s || !p) return;
    const ok = await this.confirmService.confirm(`Désinscrire ${targetNom} de cet événement ?`);
    if (!ok) return;
    await this.sortieService.desinscrire(this.sortieId, targetUid);
    if (targetUid !== p.uid) {
      this.notifService
        .sendToUser(
          targetUid,
          'sortie',
          `${this.userName()} vous a désinscrit(e) de l'événement « ${s.titre} »`,
          {
            lien: `/galeries/sorties/${this.sortieId}`,
            sourceNom: this.userName(),
            sourceUid: p.uid,
          },
        )
        .catch(() => {});
    }
    this.refresh();
  }

  async inscrireSelected() {
    const uid = this.selectedMembreUid();
    if (!uid) return;
    const s = this.sortie();
    const p = this.profile();
    if (!s || !p) return;
    const membre = this.allMembres().find((m) => m.uid === uid);
    if (!membre) return;
    const nom = `${membre.prenom ?? ''} ${membre.nom}`.trim();
    await this.sortieService.inscrire(this.sortieId, uid, nom);
    this.notifService
      .sendToUser(
        uid,
        'sortie',
        `${this.userName()} vous a inscrit(e) à l'événement « ${s.titre} »`,
        {
          lien: `/galeries/sorties/${this.sortieId}`,
          sourceNom: this.userName(),
          sourceUid: p.uid,
        },
      )
      .catch(() => {});
    this.selectedMembreUid.set('');
    this.addingMembre.set(false);
    this.refresh();
  }

  async toggleInscription() {
    const p = this.profile();
    const s = this.sortie();
    if (!p || !s || this.inscribing()) return;
    this.inscribing.set(true);
    try {
      if (this.isInscrit()) {
        await this.sortieService.desinscrire(this.sortieId, p.uid);
      } else {
        await this.sortieService.inscrire(this.sortieId, p.uid, this.userName());
      }
      this.refresh();
    } finally {
      this.inscribing.set(false);
    }
  }

  // ── Upload ────────────────────────────────────────────────────
  onPhotosDrop(event: DragEvent) {
    event.preventDefault();
    this.photoDragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length) this.processPhotoFiles(files);
  }

  onPhotosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) this.processPhotoFiles(files);
  }

  private async processPhotoFiles(files: File[]) {
    const p = this.profile();
    if (!p) return;
    const groupeId = this.modeGroupes() ? (this.uploadGroupeId() ?? this.monGroupe()?.id) : undefined;

    for (const file of files) {
      const taskId = Math.random().toString(36).slice(2);
      this.uploads.update((u) => [...u, { id: taskId, name: file.name, progress: 0, done: false }]);
      try {
        const [exif, compressed] = await Promise.all([
          readExifWithConsent(file, this.gpsConsentService),
          compressImage(file, COMPRESS_EVENT),
        ]);
        // Pas d'await ici → uploads parallèles en cas de multi-drop
        this.sortieService
          .uploadPhoto(compressed, this.sortieId, {
            uploaderUid: p.uid,
            nomUploader: this.userName(),
            exif,
            groupeId,
          })
          .subscribe({
            next: (state) => {
              if (state.done && state.image) {
                // Photo disponible : affichage immédiat + suppression du task d'upload
                this.pendingPhotos.update((pp) => [...pp, state.image!]);
                this.uploads.update((u) => u.filter((t) => t.id !== taskId));
              } else {
                this.uploads.update((u) =>
                  u.map((t) => (t.id === taskId ? { ...t, progress: state.progress } : t)),
                );
              }
            },
            error: () => {
              this.uploads.update((u) =>
                u.map((t) =>
                  t.id === taskId ? { ...t, error: "Erreur lors de l'upload" } : t,
                ),
              );
            },
            complete: () => {
              this.refresh(); // synchro Firestore en arrière-plan
            },
          });
      } catch {
        this.uploads.update((u) =>
          u.map((item) =>
            item.id === taskId ? { ...item, error: "Erreur lors de l'upload" } : item,
          ),
        );
      }
    }
  }

  clearDoneUploads() {
    this.uploads.update((u) => u.filter((item) => !item.done && !item.error));
  }

  async supprimerPhoto(photo: SortieImage) {
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (!ok) return;
    await this.sortieService.deletePhoto(this.sortieId, photo, this.sortie()?.photoCouvertureUrl);
    const actor = this.profile();
    if (actor && photo.uploaderUid !== actor.uid) {
      const role = this.isAdmin() ? "L'admin" : "L'organisateur";
      this.notifService
        .sendToUser(
          photo.uploaderUid,
          'admin',
          `${role} ${this.userName()} a supprimé votre photo dans l'événement « ${this.sortie()?.titre ?? ''} »`,
          { sourceNom: this.userName(), sourceUid: actor.uid },
        )
        .catch(() => {});
    }
    this.refresh();
  }

  // ── Lightbox (mode standard) ──────────────────────────────────
  openLightbox(index: number) {
    this.lightboxIndex.set(index);
  }
  closeLightbox() {
    this.lightboxIndex.set(null);
  }

  isLikedPhoto(photo: SortieImage): boolean {
    return (photo.likes ?? []).includes(this.profile()?.uid ?? '');
  }

  async toggleLikeOnCard(photo: SortieImage, $event: MouseEvent) {
    $event.stopPropagation();
    const uid = this.profile()?.uid;
    if (!uid) return;
    await this.sortieService.toggleLikePhoto(
      this.sortieId,
      photo.id,
      uid,
      this.isLikedPhoto(photo),
    );
    this.refresh();
  }

  mapsUrl(lieu: string): string {
    return `https://maps.google.com/?q=${encodeURIComponent(lieu)}`;
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  onCoverDrop(event: DragEvent) {
    event.preventDefault();
    this.coverDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.uploadCoverFile(file);
  }

  async onCoverSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (file) this.uploadCoverFile(file);
  }

  private async uploadCoverFile(file: File) {
    this.coverUploading.set(true);
    try {
      const compressed = await compressImage(file, COMPRESS_COUVERTURE);
      await this.sortieService.setImageEvenement(this.sortieId, compressed);
      this.refresh();
    } finally {
      this.coverUploading.set(false);
    }
  }

  async removeCover(path: string) {
    this.coverUploading.set(true);
    try {
      await this.sortieService.removeImageEvenement(this.sortieId, path);
      this.refresh();
    } finally {
      this.coverUploading.set(false);
    }
  }

  // helpers template
  getNomMembre(uid: string): string {
    // inscriptions chargées pour tous les membres connectés (via règle Firestore isLoggedIn)
    const insc = this.inscriptions().find((i) => i.uid === uid);
    if (insc?.nomMembre) return insc.nomMembre;
    // fallback pour l'organisateur (allMembres chargé pour canManage)
    const m = this.allMembres().find((mb) => mb.uid === uid);
    if (m) return `${m.prenom ?? ''} ${m.nom}`.trim();
    return uid;
  }
}
