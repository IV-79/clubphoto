import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  getDocs,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { Observable, from, map } from 'rxjs';
import { db } from '../utils/firebase';
import { Commentaire, Reponse } from '../models/commentaire.model';
import { generateId } from '../utils/id';

export class CommentaireService {
  constructor(private readonly basePath: string) {}

  private path(photoId: string): string {
    return `${this.basePath}/${photoId}/commentaires`;
  }

  getCommentaires(photoId: string): Observable<Commentaire[]> {
    const q = query(collection(db, this.path(photoId)), orderBy('createdAt', 'asc'));
    return from(getDocs(q)).pipe(
      map((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commentaire)),
    );
  }

  async addCommentaire(
    photoId: string,
    data: { texte: string; auteurUid: string; nomAuteur: string },
  ): Promise<void> {
    await addDoc(collection(db, this.path(photoId)), {
      ...data,
      likes: [],
      replies: [],
      createdAt: new Date().toISOString(),
    });
  }

  async deleteCommentaire(photoId: string, commentaireId: string): Promise<void> {
    await deleteDoc(doc(db, this.path(photoId), commentaireId));
  }

  async toggleLikeCommentaire(
    photoId: string,
    commentaireId: string,
    uid: string,
    currentlyLiked: boolean,
  ): Promise<void> {
    await updateDoc(doc(db, this.path(photoId), commentaireId), {
      likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  }

  async addReply(
    photoId: string,
    commentaireId: string,
    reply: Omit<Reponse, 'id'>,
  ): Promise<void> {
    const replyWithId: Reponse = { ...reply, id: generateId() };
    await updateDoc(doc(db, this.path(photoId), commentaireId), {
      replies: arrayUnion(replyWithId),
    });
  }

  async deleteReply(
    photoId: string,
    commentaireId: string,
    replyId: string,
    allReplies: Reponse[],
  ): Promise<void> {
    await updateDoc(doc(db, this.path(photoId), commentaireId), {
      replies: allReplies.filter((r) => r.id !== replyId),
    });
  }
}
