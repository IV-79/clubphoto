import { todayISO } from '../utils/date';

export type ExpoStatut = 'ideation' | 'nettoyage' | 'votation' | 'soumission' | 'cloture';

export const EXPO_STATUT_LABELS: Record<ExpoStatut, string> = {
  ideation: 'Idéation',
  nettoyage: 'Nettoyage',
  votation: 'Votation',
  soumission: 'Soumission',
  cloture: 'En exposition',
};

/**
 * Statut calculé depuis les dates — `cloture` et `soumission` sont purement date-driven.
 * `nettoyage` et `votation` restent explicites (actions organisateur avec effets de bord).
 */
export function getExpoStatut(expo: Exposition): ExpoStatut {
  const today = todayISO();
  if (expo.dateFinSoumission && today > expo.dateFinSoumission) return 'cloture';
  if (expo.statut === 'cloture') return 'cloture'; // clôture manuelle avant deadline
  if (expo.themeChoisi && expo.dateFinSoumission) return 'soumission';
  if (expo.statut === 'votation') return 'votation'; // explicite, peut boucler plusieurs fois
  if (today > expo.dateFinIdeation) return 'nettoyage'; // auto quand deadline passée
  return 'ideation';
}

export interface Exposition {
  id: string;
  titre: string;
  description?: string;
  statut: ExpoStatut;
  visibilite?: 'public' | 'membre'; // qui voit l'expo dans la liste
  photosPubliques?: boolean; // photos accessibles aux non-membres (toggle manuel)
  organisateurUid: string;
  nomOrganisateur: string;
  maxPhotosParMembre: number;
  dateDebutIdeation?: string; // YYYY-MM-DD
  dateFinIdeation: string; // YYYY-MM-DD
  dateFinVote?: string;
  nombreVotesParMembre?: number;
  themeChoisi?: string;
  dateFinSoumission?: string; // YYYY-MM-DD
  dateExposition?: string; // YYYY-MM-DD
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
  thumbnailUrl?: string;
  thumbnailPath?: string;
  fileSize: number;
  uid: string;
  nomAuteur: string;
  uploadedAt: string;
  exif?: PhotoExif | null;
}
