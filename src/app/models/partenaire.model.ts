export interface Partenaire {
  id: string;
  nom: string;
  logoUrl: string;
  logoPath: string;
  lien?: string;
  ordre: number;
  actif: boolean;
  dateCreation: string;
}
