export interface Reunion {
  id: string;
  titre: string;
  type: 'reunion';
  date: string;
  lieu?: string;
  description?: string;
  dateCreation: string;
}

export const REUNION_TYPES = [
  { value: 'reunion' as const, label: 'Réunion' },
];
