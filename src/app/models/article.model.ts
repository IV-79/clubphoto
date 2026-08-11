export type ArticleType = 'info' | 'encart' | 'expo' | 'evenement' | 'annonce';
export type ArticleStatut = 'brouillon' | 'publie' | 'expire';
export type ArticlePortee = 'public' | 'membre';

export interface Article {
  id?: string;
  titre: string;
  couvertureUrl?: string;
  couvertureStoragePath?: string;
  description?: string;
  type: ArticleType;
  lienExterne?: string;
  date?: string;
  lieu?: string;
  portee: ArticlePortee;
  statut: ArticleStatut;
  dateExpiration?: string;
  auteurUid: string;
  auteurNom: string;
  epingle: boolean;
  tags?: string[];
  dateCreation: string;
  dateMiseAJour?: string;
}

export const ARTICLE_TYPES: { value: ArticleType; label: string; color: string; icon: string }[] = [
  { value: 'info', label: 'Info', color: '#1976d2', icon: 'info' },
  { value: 'encart', label: 'Encart', color: '#7b1fa2', icon: 'campaign' },
  { value: 'expo', label: 'Exposition', color: '#e65100', icon: 'museum' },
  { value: 'evenement', label: 'Événement', color: '#2e7d32', icon: 'event' },
  { value: 'annonce', label: 'Annonce', color: '#f57c00', icon: 'announcement' },
];

export function getArticleTypeMeta(type: ArticleType) {
  return ARTICLE_TYPES.find((t) => t.value === type) ?? ARTICLE_TYPES[0];
}
