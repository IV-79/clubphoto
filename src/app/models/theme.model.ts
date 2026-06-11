export type ThemeStatut = 'brouillon' | 'ouvert' | 'ferme';

export interface ThemeMensuel {
  id: string;
  titre: string;
  description: string;
  moisAnnee: string;
  statut: ThemeStatut;
  dateCreation: string;
  dateOuverture?: string;
  dateFermeture?: string;
}
