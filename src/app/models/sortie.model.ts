export type { Commentaire as SortieCommentaire, Reponse as SortieReply } from './commentaire.model';
import { PhotoExif } from './photo.model';

export interface Sortie {
  id: string;
  titre: string;
  description?: string;
  date: string; // YYYY-MM-DD
  lieu?: string;
  maxParticipants?: number;
  inscriptionObligatoire: boolean;
  uploadParticipantsOnly: boolean;
  organisateurUid: string;
  nomOrganisateur: string;
  photoCouvertureUrl?: string;
  dateCreation: string;
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
  exif?: PhotoExif;
}
