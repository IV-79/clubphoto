import { PhotoExif } from './photo.model';

export type OneShotStatut =
  'preparation' | 'inscription' | 'fermeture_inscriptions' | 'vote' | 'resultats';

export const ONESHOT_STATUT_LABELS: Record<OneShotStatut, string> = {
  preparation: 'Préparation',
  inscription: 'Inscriptions ouvertes',
  fermeture_inscriptions: 'Inscriptions fermées',
  vote: 'Vote en cours',
  resultats: 'Résultats publiés',
};

export interface OneShot {
  id: string;
  titre: string;
  description?: string;
  creatorUid: string;
  nomCreateur: string;
  statut: OneShotStatut;
  dateCreation: string;
  date?: string; // YYYY-MM-DD, facultatif — si défini, apparaît dans le calendrier
  lieu?: string;
  nbInscrits?: number; // dénormalisé, mis à jour atomiquement
  nbThemes?: number; // dénormalisé, mis à jour atomiquement
  photoCouvertureUrl?: string;
  photoCouverturePath?: string;
  visibilite?: 'public' | 'membre';
  datePassageResultats?: string; // YYYY-MM-DD, positionné lors du passage au statut resultats
}

export interface OneShotTheme {
  id: string;
  nom: string;
  ordre: number;
}

export interface OneShotInscription {
  uid: string;
  nomMembre: string;
  dateInscription: string;
}

export interface OneShotPhoto {
  id: string;
  url: string;
  storagePath: string;
  fileSize?: number;
  titre?: string;
  membreUid: string;
  nomMembre: string;
  themeId: string;
  uploadedAt: string;
  likes?: string[];
  exif?: PhotoExif;
  thumbnailUrl?: string;
  thumbnailPath?: string;
}

export interface OneShotVote {
  voterUid: string;
  themeId: string;
  photoId: string;
  votedAt: string;
}
