export interface UserProfile {
  uid: string;
  email: string;
  nom: string;
  prenom?: string;
  role: 'admin' | 'membre';
  isSuspended?: boolean;
  dateAdhesion: string;
  bio?: string;
  appareil?: string;
  stylesPhoto?: string[];
  instagram?: string;
  facebook?: string;
  px500?: string;
  flickr?: string;
  siteWeb?: string;
  photoProfilUrl?: string;
  photoBandeauUrl?: string;
}

export const STYLES_PHOTO = [
  'Portrait', 'Paysage', 'Nature / Faune', 'Architecture / Urbain',
  'Rue / Street', 'Macro / Gros plan', 'Sport / Action',
  'Voyage / Reportage', 'Noir & Blanc', 'Abstrait / Expérimental'
];
