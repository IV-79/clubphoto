export type { Commentaire as SortieCommentaire, Reponse as SortieReply } from './commentaire.model';
import { PhotoExif } from './photo.model';

export type SortieType = 'sortie_photo' | 'sortie_club' | 'atelier';

export const SORTIE_TYPE_META: Record<SortieType, { label: string; emoji: string }> = {
  sortie_photo: { label: 'Sortie Photo', emoji: '📸' },
  sortie_club: { label: 'Sortie Club', emoji: '🚶' },
  atelier: { label: 'Atelier', emoji: '🎨' },
};

export function getSortieTypeLabel(type: SortieType | undefined): string {
  return type ? SORTIE_TYPE_META[type].label : 'Sortie Photo';
}

export interface Sortie {
  id: string;
  titre: string;
  description?: string;
  date: string; // YYYY-MM-DD
  lieu?: string;
  type: SortieType;
  maxParticipants?: number;
  nbInscrits?: number;
  inscriptionObligatoire: boolean;
  organisateurUid: string;
  nomOrganisateur: string;
  photoCouvertureUrl?: string;
  imageEvenementUrl?: string;
  imageEvenementPath?: string;
  dateCreation: string;
  visibilite?: 'public' | 'membre';
}

export interface SortieInscription {
  uid: string;
  nomMembre: string;
  dateInscription: string;
}

export interface SortieImage {
  id: string;
  url: string;
  storagePath: string;
  uploaderUid: string;
  nomUploader: string;
  likes: string[];
  uploadedAt: string;
  fileSize?: number;
  exif?: PhotoExif;
  thumbnailUrl?: string;
  thumbnailPath?: string;
}
