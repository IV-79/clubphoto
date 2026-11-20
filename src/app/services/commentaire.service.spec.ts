// In-memory Firestore fake — shared between vi.mock factories and test assertions.
// Using vi.hoisted so the fake exists before the hoisted vi.mock factories run.
const fake = vi.hoisted(() => {
  const docs: Record<string, Record<string, unknown>> = {};
  let seq = 0;

  function collDocs(collPath: string) {
    return Object.entries(docs)
      .filter(([k]) => {
        const rest = k.slice(collPath.length + 1);
        return k.startsWith(collPath + '/') && !rest.includes('/');
      })
      .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => ({ ...v }) }));
  }

  return {
    docs,
    reset() {
      for (const k of Object.keys(docs)) delete docs[k];
      seq = 0;
    },
    collection: vi.fn((_db: unknown, path: string) => path),
    doc: vi.fn((_db: unknown, path: string, id: string) => `${path}/${id}`),
    addDoc: vi.fn((collPath: string, data: Record<string, unknown>) => {
      const id = `d${++seq}`;
      docs[`${collPath}/${id}`] = { ...data };
      return Promise.resolve({ id });
    }),
    deleteDoc: vi.fn((docPath: string) => {
      delete docs[docPath];
      return Promise.resolve();
    }),
    updateDoc: vi.fn((docPath: string, updates: Record<string, unknown>) => {
      docs[docPath] ??= {};
      const cur = docs[docPath];
      for (const [k, v] of Object.entries(updates)) {
        const op = v as { __op?: string; val?: unknown };
        if (op?.__op === 'union') {
          const arr: unknown[] = Array.isArray(cur[k]) ? [...(cur[k] as unknown[])] : [];
          if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(op.val))) arr.push(op.val);
          cur[k] = arr;
        } else if (op?.__op === 'remove') {
          const arr: unknown[] = Array.isArray(cur[k]) ? [...(cur[k] as unknown[])] : [];
          cur[k] = arr.filter((x) => JSON.stringify(x) !== JSON.stringify(op.val));
        } else {
          cur[k] = v;
        }
      }
      return Promise.resolve();
    }),
    query: vi.fn((coll: string, ...constraints: unknown[]) => ({
      __coll: coll,
      __c: constraints,
    })),
    orderBy: vi.fn((field: string, dir = 'asc') => ({ __orderBy: { field, dir } })),
    getDocs: vi.fn((q: { __coll: string; __c: unknown[] }) => {
      let result = collDocs(q.__coll);
      const ob = (q.__c as Array<{ __orderBy?: { field: string; dir: string } }>).find(
        (c) => c.__orderBy,
      );
      if (ob?.__orderBy) {
        const { field, dir } = ob.__orderBy;
        result = [...result].sort((a, b) => {
          const av = String(a.data()[field] ?? '');
          const bv = String(b.data()[field] ?? '');
          return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
        });
      }
      return Promise.resolve({ docs: result });
    }),
    arrayUnion: vi.fn((val: unknown) => ({ __op: 'union', val })),
    arrayRemove: vi.fn((val: unknown) => ({ __op: 'remove', val })),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: fake.collection,
  doc: fake.doc,
  addDoc: fake.addDoc,
  deleteDoc: fake.deleteDoc,
  updateDoc: fake.updateDoc,
  query: fake.query,
  orderBy: fake.orderBy,
  getDocs: fake.getDocs,
  arrayUnion: fake.arrayUnion,
  arrayRemove: fake.arrayRemove,
}));

vi.mock('../utils/firebase', () => ({ db: {} }));

import { firstValueFrom } from 'rxjs';
import { CommentaireService } from './commentaire.service';

describe('CommentaireService', () => {
  let service: CommentaireService;

  beforeEach(() => {
    fake.reset();
    vi.clearAllMocks();
    service = new CommentaireService('photos');
  });

  // ─── addCommentaire ───────────────────────────────────────────────────────

  describe('addCommentaire', () => {
    it('writes a document with the correct fields', async () => {
      await service.addCommentaire('photo-1', {
        texte: 'Nice shot!',
        auteurUid: 'u1',
        nomAuteur: 'Alice',
      });

      const docs = Object.values(fake.docs);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        texte: 'Nice shot!',
        auteurUid: 'u1',
        nomAuteur: 'Alice',
        likes: [],
        replies: [],
      });
      expect(typeof docs[0]['createdAt']).toBe('string');
      expect(new Date(docs[0]['createdAt'] as string).toISOString()).toBe(docs[0]['createdAt']);
    });

    it('writes to ${basePath}/${photoId}/commentaires', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      expect(Object.keys(fake.docs)[0]).toMatch(/^photos\/photo-1\/commentaires\//);
    });
  });

  // ─── getCommentaires ──────────────────────────────────────────────────────

  describe('getCommentaires', () => {
    it('returns documents ordered by createdAt ascending', async () => {
      await service.addCommentaire('photo-1', { texte: 'B', auteurUid: 'u1', nomAuteur: 'A' });
      await service.addCommentaire('photo-1', { texte: 'A', auteurUid: 'u2', nomAuteur: 'B' });

      const keys = Object.keys(fake.docs);
      fake.docs[keys[0]]['createdAt'] = '2024-01-01T10:00:00.000Z';
      fake.docs[keys[1]]['createdAt'] = '2024-01-01T11:00:00.000Z';

      const comments = await firstValueFrom(service.getCommentaires('photo-1'));
      expect(comments[0].texte).toBe('B');
      expect(comments[1].texte).toBe('A');
    });

    it('includes the Firestore document id in each result', async () => {
      await service.addCommentaire('photo-1', { texte: 'hi', auteurUid: 'u1', nomAuteur: 'A' });
      const comments = await firstValueFrom(service.getCommentaires('photo-1'));
      expect(typeof comments[0].id).toBe('string');
      expect(comments[0].id.length).toBeGreaterThan(0);
    });
  });

  // ─── deleteCommentaire ────────────────────────────────────────────────────

  describe('deleteCommentaire', () => {
    it('removes the document; getCommentaires no longer returns it', async () => {
      await service.addCommentaire('photo-1', { texte: 'hi', auteurUid: 'u1', nomAuteur: 'A' });
      const [comment] = await firstValueFrom(service.getCommentaires('photo-1'));

      await service.deleteCommentaire('photo-1', comment.id);

      const after = await firstValueFrom(service.getCommentaires('photo-1'));
      expect(after).toHaveLength(0);
    });
  });

  // ─── toggleLikeCommentaire ────────────────────────────────────────────────

  describe('toggleLikeCommentaire', () => {
    async function getDocLikes(commentId: string): Promise<unknown[]> {
      const path = Object.keys(fake.docs).find((k) => k.endsWith(`/${commentId}`))!;
      return (fake.docs[path]['likes'] as unknown[]) ?? [];
    }

    it('adds uid when currentlyLiked is false', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const [c] = await firstValueFrom(service.getCommentaires('photo-1'));

      await service.toggleLikeCommentaire('photo-1', c.id, 'u2', false);
      expect(await getDocLikes(c.id)).toContain('u2');
    });

    it('removes uid when currentlyLiked is true', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const [c] = await firstValueFrom(service.getCommentaires('photo-1'));

      await service.toggleLikeCommentaire('photo-1', c.id, 'u2', false);
      await service.toggleLikeCommentaire('photo-1', c.id, 'u2', true);
      expect(await getDocLikes(c.id)).not.toContain('u2');
    });

    it('does not affect a different uid in likes', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const [c] = await firstValueFrom(service.getCommentaires('photo-1'));

      await service.toggleLikeCommentaire('photo-1', c.id, 'u2', false);
      await service.toggleLikeCommentaire('photo-1', c.id, 'u3', false);
      await service.toggleLikeCommentaire('photo-1', c.id, 'u2', true);

      const likes = await getDocLikes(c.id);
      expect(likes).not.toContain('u2');
      expect(likes).toContain('u3');
    });
  });

  // ─── addReply ─────────────────────────────────────────────────────────────

  describe('addReply', () => {
    async function getReplies(commentId: string) {
      const path = Object.keys(fake.docs).find((k) => k.endsWith(`/${commentId}`))!;
      return (fake.docs[path]['replies'] as Array<Record<string, unknown>>) ?? [];
    }

    it('appends a reply with a generated id', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const [c] = await firstValueFrom(service.getCommentaires('photo-1'));

      await service.addReply('photo-1', c.id, {
        texte: 'my reply',
        auteurUid: 'u2',
        nomAuteur: 'Bob',
        createdAt: new Date().toISOString(),
      });

      const replies = await getReplies(c.id);
      expect(replies).toHaveLength(1);
      expect(replies[0]['texte']).toBe('my reply');
      expect(typeof replies[0]['id']).toBe('string');
      expect((replies[0]['id'] as string).length).toBeGreaterThan(0);
    });

    it('does not overwrite existing replies', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const [c] = await firstValueFrom(service.getCommentaires('photo-1'));
      const ts = new Date().toISOString();

      await service.addReply('photo-1', c.id, { texte: 'first', auteurUid: 'u2', nomAuteur: 'B', createdAt: ts });
      await service.addReply('photo-1', c.id, { texte: 'second', auteurUid: 'u3', nomAuteur: 'C', createdAt: ts });

      const replies = await getReplies(c.id);
      expect(replies).toHaveLength(2);
      expect(replies.map((r) => r['texte'])).toContain('first');
      expect(replies.map((r) => r['texte'])).toContain('second');
    });
  });

  // ─── deleteReply ──────────────────────────────────────────────────────────

  describe('deleteReply', () => {
    it('removes the targeted reply and leaves others intact', async () => {
      await service.addCommentaire('photo-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const [c] = await firstValueFrom(service.getCommentaires('photo-1'));
      const ts = new Date().toISOString();

      await service.addReply('photo-1', c.id, { texte: 'keep', auteurUid: 'u2', nomAuteur: 'B', createdAt: ts });
      await service.addReply('photo-1', c.id, { texte: 'remove', auteurUid: 'u3', nomAuteur: 'C', createdAt: ts });

      const path = Object.keys(fake.docs).find((k) => k.endsWith(`/${c.id}`))!;
      const before = (fake.docs[path]['replies'] as Array<{ id: string; texte: string }>).slice();
      const target = before.find((r) => r.texte === 'remove')!;

      await service.deleteReply('photo-1', c.id, target.id, before);

      const after = fake.docs[path]['replies'] as Array<{ id: string; texte: string }>;
      expect(after).toHaveLength(1);
      expect(after[0].texte).toBe('keep');
    });
  });

  // ─── basePath isolation ───────────────────────────────────────────────────

  describe('basePath isolation', () => {
    it('two services with different basePaths write to separate Firestore paths', async () => {
      const portfolio = new CommentaireService('photos');
      const sortie = new CommentaireService('sorties/sortie-1/photos');
      const data = { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' };

      await portfolio.addCommentaire('photo-1', data);
      await sortie.addCommentaire('photo-1', data);

      const paths = Object.keys(fake.docs);
      expect(paths.some((p) => p.startsWith('photos/photo-1/commentaires/'))).toBe(true);
      expect(paths.some((p) => p.startsWith('sorties/sortie-1/photos/photo-1/commentaires/'))).toBe(true);
    });

    it('theme basePath writes to themes/{id}/soumissions/{soumissionId}/commentaires', async () => {
      const theme = new CommentaireService('themes/theme-1/soumissions');
      await theme.addCommentaire('soum-1', { texte: 'x', auteurUid: 'u1', nomAuteur: 'A' });
      const paths = Object.keys(fake.docs);
      expect(paths.some((p) => p.startsWith('themes/theme-1/soumissions/soum-1/commentaires/'))).toBe(true);
    });
  });
});
