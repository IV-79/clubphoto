export type EvenementType = 'reunion';

export interface Evenement {
  id: string;
  titre: string;
  type: EvenementType;
  date: string;
  lieu?: string;
  description?: string;
  dateCreation: string;
}

export const EVENEMENT_TYPES: { value: EvenementType; label: string }[] = [
  { value: 'reunion', label: 'Réunion' },
];
