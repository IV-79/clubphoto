export type PhotoCategorie =
  'portrait' | 'paysage' | 'nature' | 'architecture' |
  'rue' | 'macro' | 'sport' | 'voyage' | 'noir-blanc' | 'abstrait' | 'autre';

export const PHOTO_CATEGORIES: { value: PhotoCategorie; label: string }[] = [
  { value: 'portrait',      label: 'Portrait' },
  { value: 'paysage',       label: 'Paysage' },
  { value: 'nature',        label: 'Nature / Faune' },
  { value: 'architecture',  label: 'Architecture / Urbain' },
  { value: 'rue',           label: 'Rue / Street' },
  { value: 'macro',         label: 'Macro / Gros plan' },
  { value: 'sport',         label: 'Sport / Action' },
  { value: 'voyage',        label: 'Voyage / Reportage' },
  { value: 'noir-blanc',    label: 'Noir & Blanc' },
  { value: 'abstrait',      label: 'Abstrait / Expérimental' },
  { value: 'autre',         label: 'Autre' },
];

export type PhotoVisibilite = 'public' | 'membre';

export interface PhotoGps {
  lat: number;
  lng: number;
  alt?: number;
}

export interface PhotoExif {
  appareil?: string;
  objectif?: string;
  focale?: number;
  ouverture?: number;
  vitesse?: string;
  iso?: number;
  dateCapture?: string;
  gps?: PhotoGps;
}

export interface Photo {
  id: string;
  uid: string;
  nomMembre: string;
  titre: string;
  description: string;
  url: string;
  visibilite: PhotoVisibilite;
  dateUpload: string;
  storagePath: string;
  categorie?: PhotoCategorie;
  exif?: PhotoExif;
  likes?: string[];
}

export interface UploadState {
  state: 'uploading' | 'done';
  progress: number;
  photo?: Photo;
}
