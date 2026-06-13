import { Observable } from 'rxjs';
import { PhotoExif } from './photo.model';

export interface Reponse {
  id: string;
  texte: string;
  auteurUid: string;
  nomAuteur: string;
  createdAt: string;
}

export interface Commentaire {
  id: string;
  texte: string;
  auteurUid: string;
  nomAuteur: string;
  likes: string[];
  replies: Reponse[];
  createdAt: string;
}

export interface LightboxPhoto {
  id: string;
  url: string;
  titre?: string;
  description?: string;
  nomAuteur: string;
  uploaderUid?: string;
  likes: string[];
  uploadedAt?: string;
  exif?: PhotoExif;
}

export interface PhotoLightboxCallbacks {
  toggleLike: (photoId: string, currentlyLiked: boolean) => Promise<void>;
  getComments: (photoId: string) => Observable<Commentaire[]>;
  addComment: (photoId: string, texte: string, auteurUid: string, nomAuteur: string) => Promise<void>;
  deleteComment: (photoId: string, commentId: string) => Promise<void>;
  toggleCommentLike: (photoId: string, commentId: string, uid: string, currentlyLiked: boolean) => Promise<void>;
  addReply: (photoId: string, commentId: string, texte: string, auteurUid: string, nomAuteur: string) => Promise<void>;
  deleteReply: (photoId: string, commentId: string, replyId: string, allReplies: Reponse[]) => Promise<void>;
  canDeletePhoto?: (photo: LightboxPhoto) => boolean;
  deletePhoto?: (photo: LightboxPhoto) => Promise<void>;
}
