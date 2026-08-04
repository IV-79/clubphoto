export type ThemeStatut = 'en_attente' | 'ouvert' | 'vote' | 'resultats';

export interface ThemeMensuel {
  id: string;
  titre: string;
  description?: string;
  mois: string;        // "2026-07"
  dateFinVote: string; // "2026-08-10" — stockée directement en Firestore
  maxPhotos: number;
  maxVotes: number;
  dateCreation: string;
  createdBy: string;
  photoCouvertureUrl?:  string;
  photoCouverturePath?: string;
  nbSoumissions?:  number;
  nbParticipants?: number;
}

export function getThemeDates(theme: ThemeMensuel): {
  dateOuverture: string; dateCloture: string; dateFinVote: string;
} {
  const [year, month] = theme.mois.split('-').map(Number);
  const lastDay       = new Date(year, month, 0).getDate();
  const dateOuverture = `${theme.mois}-01`;
  const dateCloture   = `${theme.mois}-${String(lastDay).padStart(2, '0')}`;
  return { dateOuverture, dateCloture, dateFinVote: theme.dateFinVote ?? dateCloture };
}

export function computeThemeStatut(theme: ThemeMensuel): ThemeStatut {
  const now = new Date().toISOString().slice(0, 10);
  const { dateOuverture, dateCloture, dateFinVote } = getThemeDates(theme);
  if (now < dateOuverture) return 'en_attente';
  if (now <= dateCloture)  return 'ouvert';
  if (now <= dateFinVote)  return 'vote';
  return 'resultats';
}

export const THEME_STATUT_LABELS: Record<ThemeStatut, string> = {
  en_attente: 'À venir',
  ouvert:     'Ouvert',
  vote:       'Vote en cours',
  resultats:  'Résultats',
};

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
  thumbnailUrl?:  string;
  thumbnailPath?: string;
}

export interface ThemeVote {
  id?: string;
  voterUid: string;
  soumissionId: string;
  votedAt: string;
}
