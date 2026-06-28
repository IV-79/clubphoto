import { PhotoExif } from './photo.model';

export type DefiStatut = 'a_venir' | 'soumission' | 'vote' | 'resultats';

export const DEFI_STATUT_LABELS: Record<DefiStatut, string> = {
  a_venir:    'À venir',
  soumission: 'Soumissions',
  vote:       'Vote en cours',
  resultats:  'Résultats',
};

export interface Defi {
  id: string;
  titre: string;
  description: string;
  theme: string;
  photoCouvertureUrl?: string;
  photoCouverturePath?: string;
  maxPhotos: number;
  maxVotes: number;
  dateDebutSoumission: string; // YYYY-MM-DD
  dateFinSoumission: string;
  dateCloturVotes: string;
  visibilite: 'public' | 'membre';
  organisateurUid: string;
  organisateurNom: string;
  nbInscrits: number;
  dateCreation: string;
}

export function getDefiStatut(defi: Defi): DefiStatut {
  const now = new Date();
  if (now < new Date(defi.dateDebutSoumission + 'T00:00:00')) return 'a_venir';
  if (now <= new Date(defi.dateFinSoumission + 'T23:59:59'))  return 'soumission';
  if (now <= new Date(defi.dateCloturVotes + 'T23:59:59'))    return 'vote';
  return 'resultats';
}

export interface DefiInscription {
  uid: string;
  nom: string;
  prenom?: string;
  dateInscription: string;
}

export interface DefiPhoto {
  id: string;
  membreUid: string;
  membreNom: string;
  membrePrenom?: string;
  url: string;
  storagePath: string;
  fileSize: number;
  exif?: PhotoExif;
  uploadedAt: string;
  thumbnailUrl?:  string;
  thumbnailPath?: string;
}

export interface DefiVote {
  voterUid: string;
  photoIds: string[];
}

export interface DefiPhotoResult extends DefiPhoto {
  voteCount: number;
  rank: number;
}
