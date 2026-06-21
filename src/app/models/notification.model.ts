export type NotifType = 'oneshot' | 'sortie' | 'article' | 'like' | 'comment';

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
  likes?: boolean;
  comments?: boolean;
}

const TYPE_TO_SUB: Record<NotifType, keyof UserSubscriptions> = {
  oneshot: 'oneshots',
  sortie:  'sorties',
  article: 'articles',
  like:    'likes',
  comment: 'comments',
};

export function isSubscribed(
  subs: UserSubscriptions | undefined,
  type: NotifType | keyof UserSubscriptions
): boolean {
  const key = (type in TYPE_TO_SUB ? TYPE_TO_SUB[type as NotifType] : type) as keyof UserSubscriptions;
  if (!subs || subs[key] === undefined) return true;
  return !!subs[key];
}

export const NOTIF_ICONS: Record<NotifType, string> = {
  oneshot: '📸',
  sortie:  '🚶',
  article: '📰',
  like:    '♥',
  comment: '💬',
};

export const NOTIF_LABELS: Record<NotifType, string> = {
  oneshot: 'OneShot',
  sortie:  'Sortie photo',
  article: 'Actualité',
  like:    'J\'aime',
  comment: 'Commentaire',
};
