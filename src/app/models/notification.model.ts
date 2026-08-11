export type NotifType =
  | 'oneshot'
  | 'sortie'
  | 'article'
  | 'reunion'
  | 'document'
  | 'defi'
  | 'exposition'
  | 'like'
  | 'comment'
  | 'admin';

export interface AppNotification {
  id: string;
  type: NotifType;
  message: string;
  lien?: string | null;
  lu: boolean;
  createdAt: string;
  sourceNom: string;
  sourceUid?: string;
}

export interface UserSubscriptions {
  oneshots?: boolean;
  sorties?: boolean;
  articles?: boolean;
  reunions?: boolean;
  documents?: boolean;
  defis?: boolean;
  expositions?: boolean;
  likes?: boolean;
  comments?: boolean;
  admin?: boolean; // undefined = toujours livré, pas d'opt-out exposé en UI
}

const TYPE_TO_SUB: Record<NotifType, keyof UserSubscriptions> = {
  oneshot: 'oneshots',
  sortie: 'sorties',
  article: 'articles',
  reunion: 'reunions',
  document: 'documents',
  defi: 'defis',
  exposition: 'expositions',
  like: 'likes',
  comment: 'comments',
  admin: 'admin',
};

export function isSubscribed(
  subs: UserSubscriptions | undefined,
  type: NotifType | keyof UserSubscriptions,
): boolean {
  const key = (
    type in TYPE_TO_SUB ? TYPE_TO_SUB[type as NotifType] : type
  ) as keyof UserSubscriptions;
  if (!subs || subs[key] === undefined) return true;
  return !!subs[key];
}

export const NOTIF_ICONS: Record<NotifType, string> = {
  oneshot: '📸',
  sortie: '🚶',
  article: '📰',
  reunion: '📅',
  document: '📁',
  defi: '🏅',
  exposition: '🖼️',
  like: '♥',
  comment: '💬',
  admin: '🛡️',
};

export const NOTIF_LABELS: Record<NotifType, string> = {
  oneshot: 'OneShot',
  sortie: 'Sortie photo',
  article: 'Actualité',
  reunion: 'Réunion',
  document: 'Documents',
  defi: 'Défi',
  exposition: 'Exposition',
  like: "J'aime",
  comment: 'Commentaire',
  admin: 'Administration',
};
