import { UserSubscriptions } from './notification.model';

export interface UserProfile {
  uid: string;
  email: string;
  nom: string;
  prenom?: string;
  role: 'admin' | 'contributeur' | 'membre';
  isSuspended?: boolean;
  derniereConnexion?: string;
  storageUsed?: { portfolio: number; themes: number; oneshots: number; documents?: number };
  subscriptions?: UserSubscriptions;
  dateAdhesion: string;
  bio?: string;
  appareil?: string;
  stylesPhoto?: string[];
  instagram?: string;
  facebook?: string;
  px500?: string;
  flickr?: string;
  siteWeb?: string;
  visibilite?: 'public' | 'membre';
  photoCount?: number;
  charteAccepteeVersion?: number;
  cguAccepteeVersion?: number;
  photoProfilUrl?: string;
  photoBandeauUrl?: string;
}

export const STYLES_PHOTO = [
  'Portrait', 'Paysage', 'Nature / Faune', 'Architecture / Urbain',
  'Rue / Street', 'Macro / Gros plan', 'Sport / Action',
  'Voyage / Reportage', 'Noir & Blanc', 'Abstrait / Expérimental'
];
