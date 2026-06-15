export type ThemeStatut = 'en_attente' | 'ouvert' | 'vote' | 'resultats';

export interface ThemeMensuel {
  id: string;
  titre: string;
  description?: string;
  mois: string;          // "2026-07"
  dateOuverture: string; // "2026-07-01" (YYYY-MM-DD)
  dateCloture: string;   // "2026-07-31"
  dateFinVote: string;   // "2026-08-15"
  maxPhotos: number;
  maxVotes: number;
  dateCreation: string;
  createdBy: string;
}

import { PhotoExif } from './photo.model';

export interface ThemeSoumission {
  id: string;
  membreUid: string;
  nomMembre: string;
  url: string;
  storagePath: string;
  fileSize?: number;
  uploadedAt: string;
  likes?: string[];
  exif?: PhotoExif;
}

export interface ThemeVote {
  id?: string;
  voterUid: string;
  soumissionId: string;
  votedAt: string;
}

export function computeThemeStatut(theme: ThemeMensuel): ThemeStatut {
  const now = new Date().toISOString().slice(0, 10);
  if (now < theme.dateOuverture) return 'en_attente';
  if (now <= theme.dateCloture) return 'ouvert';
  if (now <= theme.dateFinVote) return 'vote';
  return 'resultats';
}

export const THEME_STATUT_LABELS: Record<ThemeStatut, string> = {
  en_attente: 'À venir',
  ouvert:     'Ouvert',
  vote:       'Vote en cours',
  resultats:  'Résultats',
};
