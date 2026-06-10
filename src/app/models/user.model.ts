export interface UserProfile {
  uid: string;
  email: string;
  nom: string;
  role: 'admin' | 'membre';
  dateAdhesion: string;
}
