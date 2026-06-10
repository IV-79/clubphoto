export interface Article {
  id?: string;
  titre: string;
  contenu: string;
  extrait: string;
  imageUrl?: string;
  datePublication: string;
  auteur: string;
  categorie: 'actualite' | 'evenement' | 'galerie' | 'divers';
  publie: boolean;
}
