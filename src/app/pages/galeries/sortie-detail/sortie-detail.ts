import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
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
import { Sortie, SortieImage, SortieType, SORTIE_TYPE_META } from '../../../models/sortie.model';
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

@Component({
  selector: 'app-sortie-detail',
  imports: [
    PhotoLightbox, ImgRetryDirective, EventHero,
    ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatSelectModule, MatIconModule,
    DatePickerComponent,
  ],
  templateUrl: './sortie-detail.html',
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

  sortieId = this.route.snapshot.paramMap.get('id')!;
  profile = toSignal(this.authService.currentUserProfile$);

  private refreshTick = signal(0);
  private refresh() { this.refreshTick.update(n => n + 1); }

  private inscriptionsTrigger = computed(() => ({ profile: this.profile(), tick: this.refreshTick() }));

  sortie = toSignal(
    toObservable(this.refreshTick).pipe(switchMap(() => this.sortieService.getSortieOnce(this.sortieId))),
    { initialValue: null as Sortie | null }
  );

  photos = toSignal(
    toObservable(this.refreshTick).pipe(switchMap(() => this.sortieService.getPhotosOnce(this.sortieId))),
    { initialValue: [] as SortieImage[] }
  );

  inscriptions = toSignal(
    toObservable(this.inscriptionsTrigger).pipe(
      switchMap(({ profile }) => !profile ? of([]) :
        this.sortieService.getInscriptionsOnce(this.sortieId)
      )
    ),
    { initialValue: [] }
  );

  lightboxIndex      = signal<number | null>(null);
  uploads            = signal<UploadTask[]>([]);
  photoDragOver      = signal(false);
  inscribing         = signal(false);
  saving             = signal(false);
  editMode           = signal(false);
  addingMembre       = signal(false);
  selectedMembreUid  = signal('');
  coverUploading     = signal(false);
  coverDragOver      = signal(false);

  isOrganisateur = computed(() => {
    const s = this.sortie(); const p = this.profile();
    return !!s && !!p && s.organisateurUid === p.uid;
  });

  typeMeta = computed(() => SORTIE_TYPE_META[this.sortie()?.type ?? 'sortie_photo']);

  isAdmin = computed(() => this.profile()?.role === 'admin');
  canManage = computed(() => this.isOrganisateur() || this.isAdmin());

  typeBadgeHero = computed((): HeroBadge => {
    const s = this.sortie();
    const meta = SORTIE_TYPE_META[s?.type ?? 'sortie_photo'];
    return { text: `${meta.emoji} ${meta.label}`, css: 'event-type-badge badge-sortie' };
  });
  statusHero = computed((): HeroBadge => this.isAVenir()
    ? { text: 'À venir',           css: 'hero-status status-avenir' }
    : { text: 'Ouverte aux photos', css: 'hero-status status-photos' }
  );

  private allMembres$ = toObservable(this.canManage).pipe(
    switchMap(can => can ? this.authService.getAllMembersOnce() : of([] as UserProfile[]))
  );
  allMembres = toSignal(this.allMembres$, { initialValue: [] as UserProfile[] });

  form = new FormGroup({
    type:                   new FormControl<SortieType>('sortie_photo', { nonNullable: true }),
    titre:                  new FormControl('', { validators: [Validators.required, Validators.minLength(3)], nonNullable: true }),
    description:            new FormControl('', { nonNullable: true }),
    date:                   new FormControl('', { validators: [Validators.required], nonNullable: true }),
    lieu:                   new FormControl('', { nonNullable: true }),
    maxParticipants:        new FormControl<number | null>(null),
    inscriptionObligatoire: new FormControl(true, { nonNullable: true }),
    visibilite:             new FormControl<'public' | 'membre'>('public', { nonNullable: true }),
  });

  accessDenied = computed(() => {
    const s = this.sortie();
    return !!s && (s.visibilite ?? 'public') === 'membre' && !this.profile();
  });

  get inscriptionObligatoire() { return this.form.get('inscriptionObligatoire')!.value; }

  isAVenir = computed(() => {
    const s = this.sortie();
    if (!s) return true;
    return new Date(s.date + 'T00:00:00') > new Date();
  });

  isInscrit = computed(() => {
    const uid = this.profile()?.uid;
    if (!uid) return false;
    return this.inscriptions().some(i => i.uid === uid);
  });

  canInscrire = computed(() => {
    const s = this.sortie(); const p = this.profile();
    if (!s || !p || !s.inscriptionObligatoire) return false;
    if (this.isInscrit()) return false;
    if (s.maxParticipants && this.inscriptions().length >= s.maxParticipants) return false;
    return true;
  });

  canUpload = computed(() => {
    const s = this.sortie(); const p = this.profile();
    if (!s || !p || this.isAVenir()) return false;
    if (!s.inscriptionObligatoire) return true;
    return this.isInscrit() || this.isOrganisateur() || this.isAdmin();
  });

  membresDisponibles = computed(() => {
    const inscritUids = new Set(this.inscriptions().map(i => i.uid));
    return this.allMembres()
      .filter(m => !inscritUids.has(m.uid) && !m.isSuspended)
      .sort((a, b) => `${a.prenom ?? ''} ${a.nom}`.localeCompare(`${b.prenom ?? ''} ${b.nom}`));
  });

  userName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.prenom ?? ''} ${p.nom}`.trim();
  });

  lightboxPhotos = computed((): LightboxPhoto[] =>
    this.photos().map(p => ({
      id: p.id, url: p.url, nomAuteur: p.nomUploader,
      uploaderUid: p.uploaderUid, likes: p.likes,
      uploadedAt: p.uploadedAt, exif: p.exif,
    }))
  );

  lightboxCallbacks = computed((): PhotoLightboxCallbacks => {
    const sortieId = this.sortieId;
    const uid = this.profile()?.uid ?? '';
    return {
      toggleLike: (photoId, liked) =>
        this.sortieService.toggleLikePhoto(sortieId, photoId, uid, liked),
      getComments: (photoId) =>
        this.sortieService.getCommentaires(sortieId, photoId),
      addComment: (photoId, texte, auteurUid, nomAuteur) =>
        this.sortieService.addCommentaire(sortieId, photoId, { texte, auteurUid, nomAuteur }),
      deleteComment: (photoId, commentId) =>
        this.sortieService.deleteCommentaire(sortieId, photoId, commentId),
      toggleCommentLike: (photoId, commentId, cUid, liked) =>
        this.sortieService.toggleLikeCommentaire(sortieId, photoId, commentId, cUid, liked),
      addReply: (photoId, commentId, texte, auteurUid, nomAuteur) =>
        this.sortieService.addReply(sortieId, photoId, commentId, {
          texte, auteurUid, nomAuteur, createdAt: new Date().toISOString(),
        }),
      deleteReply: (photoId, commentId, replyId, allReplies) =>
        this.sortieService.deleteReply(sortieId, photoId, commentId, replyId, allReplies),
      canDeletePhoto: () => this.isAdmin(),
      deletePhoto: async (photo) => {
        const img = this.photos().find(p => p.id === photo.id)!;
        await this.sortieService.deletePhoto(sortieId, img, this.sortie()?.photoCouvertureUrl);
        const actor = this.profile();
        if (actor && img.uploaderUid !== actor.uid) {
          const titre = photo.titre ? ` « ${photo.titre} »` : '';
          this.notifService.sendToUser(
            img.uploaderUid, 'admin',
            `L'admin ${this.userName()} a supprimé votre photo${titre} dans l'événement « ${this.sortie()?.titre ?? ''} »`,
            { sourceNom: this.userName(), sourceUid: actor.uid }
          ).catch(() => {});
        }
        this.refresh();
      },
    };
  });

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
    });
    this.editMode.set(true);
  }

  cancelEdit() { this.editMode.set(false); }

  async saveEdit() {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const s = this.sortie()!;
      await this.sortieService.updateSortie(this.sortieId, {
        type: v.type,
        titre: v.titre.trim(),
        description: v.description.trim(),
        date: v.date,
        lieu: v.lieu.trim(),
        maxParticipants: v.maxParticipants ?? undefined,
        inscriptionObligatoire: v.inscriptionObligatoire,
        visibilite: v.visibilite,
      }, {
        oldDate: s.date,
        titre: s.titre,
        nomOrganisateur: s.nomOrganisateur,
        organisateurUid: s.organisateurUid,
      });
      this.editMode.set(false);
      this.refresh();
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSortie() {
    const s = this.sortie();
    const ok = await this.confirmService.confirm(
      `Supprimer « ${s?.titre ?? 'cet événement'} » et toutes ses photos définitivement ?`
    );
    if (!ok) return;
    await this.sortieService.deleteSortie(this.sortieId, s ? {
      titre: s.titre,
      nomOrganisateur: s.nomOrganisateur,
      organisateurUid: s.organisateurUid,
      imageEvenementPath: s.imageEvenementPath,
    } : undefined);
    this.router.navigate(['/galeries/sorties']);
  }

  async retirerInscrit(targetUid: string, targetNom: string) {
    const s = this.sortie(); const p = this.profile();
    if (!s || !p) return;
    const ok = await this.confirmService.confirm(`Désinscrire ${targetNom} de cet événement ?`);
    if (!ok) return;
    await this.sortieService.desinscrire(this.sortieId, targetUid);
    if (targetUid !== p.uid) {
      this.notifService.sendToUser(
        targetUid, 'sortie',
        `${this.userName()} vous a désinscrit(e) de l'événement « ${s.titre} »`,
        { lien: `/galeries/sorties/${this.sortieId}`, sourceNom: this.userName(), sourceUid: p.uid }
      ).catch(() => {});
    }
    this.refresh();
  }

  async inscrireSelected() {
    const uid = this.selectedMembreUid();
    if (!uid) return;
    const s = this.sortie(); const p = this.profile();
    if (!s || !p) return;
    const membre = this.allMembres().find(m => m.uid === uid);
    if (!membre) return;
    const nom = `${membre.prenom ?? ''} ${membre.nom}`.trim();
    await this.sortieService.inscrire(this.sortieId, uid, nom);
    this.notifService.sendToUser(
      uid, 'sortie',
      `${this.userName()} vous a inscrit(e) à l'événement « ${s.titre} »`,
      { lien: `/galeries/sorties/${this.sortieId}`, sourceNom: this.userName(), sourceUid: p.uid }
    ).catch(() => {});
    this.selectedMembreUid.set('');
    this.addingMembre.set(false);
    this.refresh();
  }

  async toggleInscription() {
    const p = this.profile(); const s = this.sortie();
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

  onPhotosDrop(event: DragEvent) {
    event.preventDefault();
    this.photoDragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
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

    for (const file of files) {
      const id = Math.random().toString(36).slice(2);
      this.uploads.update(u => [...u, { id, name: file.name, progress: 0, done: false }]);
      try {
        const [exif, compressed] = await Promise.all([
          readExifWithConsent(file, this.gpsConsentService),
          compressImage(file, COMPRESS_EVENT),
        ]);
        this.sortieService.uploadPhoto(compressed, this.sortieId, {
          uploaderUid: p.uid,
          nomUploader: this.userName(),
          exif,
        }).subscribe({
          next: state => {
            this.uploads.update(u =>
              u.map(item => item.id === id ? { ...item, progress: state.progress, done: state.done } : item)
            );
            if (state.done) this.refresh();
          },
          error: () => {
            this.uploads.update(u =>
              u.map(item => item.id === id ? { ...item, error: 'Erreur lors de l\'upload' } : item)
            );
          },
        });
      } catch {
        this.uploads.update(u =>
          u.map(item => item.id === id ? { ...item, error: 'Erreur de compression' } : item)
        );
      }
    }
  }

  clearDoneUploads() {
    this.uploads.update(u => u.filter(item => !item.done && !item.error));
  }

  async supprimerPhoto(photo: SortieImage) {
    const ok = await this.confirmService.confirm('Supprimer cette photo définitivement ?');
    if (!ok) return;
    await this.sortieService.deletePhoto(this.sortieId, photo, this.sortie()?.photoCouvertureUrl);
    const actor = this.profile();
    if (actor && photo.uploaderUid !== actor.uid) {
      const role = this.isAdmin() ? "L'admin" : "L'organisateur";
      this.notifService.sendToUser(
        photo.uploaderUid, 'admin',
        `${role} ${this.userName()} a supprimé votre photo dans l'événement « ${this.sortie()?.titre ?? ''} »`,
        { sourceNom: this.userName(), sourceUid: actor.uid }
      ).catch(() => {});
    }
    this.refresh();
  }

  openLightbox(index: number) { this.lightboxIndex.set(index); }
  closeLightbox() { this.lightboxIndex.set(null); }

  isLikedPhoto(photo: SortieImage): boolean {
    return (photo.likes ?? []).includes(this.profile()?.uid ?? '');
  }

  async toggleLikeOnCard(photo: SortieImage, $event: MouseEvent) {
    $event.stopPropagation();
    const uid = this.profile()?.uid;
    if (!uid) return;
    await this.sortieService.toggleLikePhoto(this.sortieId, photo.id, uid, this.isLikedPhoto(photo));
    this.refresh();
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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
}
