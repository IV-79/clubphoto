export type ExpoStatut = 'ideation' | 'nettoyage' | 'votation' | 'soumission' | 'cloture';

export const EXPO_STATUT_LABELS: Record<ExpoStatut, string> = {
  ideation:   'Idéation',
  nettoyage:  'Nettoyage',
  votation:   'Votation',
  soumission: 'Soumission',
  cloture:    'Clôturé',
};

export interface Exposition {
  id: string;
  titre: string;
  description?: string;
  statut: ExpoStatut;
  organisateurUid: string;
  nomOrganisateur: string;
  maxPhotosParMembre: number;
  dateDebutIdeation?: string;      // YYYY-MM-DD — ouverture idéation (optionnel ; si futur → "à venir" dans la liste)
  dateFinIdeation: string;         // YYYY-MM-DD — fin de la phase d'idéation
  dateFinVote?: string;            // set at nettoyage→votation
  nombreVotesParMembre?: number;   // set at nettoyage→votation
  themeChoisi?: string;            // set at nettoyage→soumission
  dateFinSoumission?: string;      // set at nettoyage→soumission
  dateExposition?: string;         // YYYY-MM-DD — date physique de l'expo (après+7j → "terminée" dans la liste)
  dateOuverturePublic?: string;    // YYYY-MM-DD — visibilité publique (non-membres, indépendant de la catégorisation)
  photoCouvertureUrl?: string;
  photoCouverturePath?: string;
  dateCreation: string;
}

export interface ExpoSuggestion {
  id: string;
  texte: string;
  actif: boolean;
  source: 'membre' | 'admin';
}

export interface ExpoVoteDoc {
  themeIds: string[];
}

import { PhotoExif } from './photo.model';

export interface ExpoPhoto {
  id: string;
  url: string;
  storagePath: string;
  fileSize: number;
  uid: string;
  nomAuteur: string;
  uploadedAt: string;
  exif?: PhotoExif | null;
}
