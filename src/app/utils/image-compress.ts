export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

export interface CompressOptions {
  maxLong?: number; // scale so longest side ≤ this
  maxWidth?: number; // then scale so width  ≤ this
  maxHeight?: number; // then scale so height ≤ this
  quality?: number; // initial WebP quality (0–1), default 0.85
  fallbackLong?: number; // if still > 5 MB at quality floor, restart at this size
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export const imageExt = (f: Blob) => (f.type === 'image/jpeg' ? 'jpg' : 'webp');

// ── Presets ──────────────────────────────────────────────────────────────────
export const COMPRESS_PORTFOLIO: CompressOptions = { maxLong: 3840, fallbackLong: 2048 }; // 4K → 2K cascade
export const COMPRESS_EVENT: CompressOptions = { maxLong: 2048 }; // 2K  — oneshot / sortie / défi
export const COMPRESS_THEME: CompressOptions = { maxLong: 2048 }; // 2K  — soumissions thème du mois
export const COMPRESS_COUVERTURE: CompressOptions = { maxWidth: 1280, maxHeight: 720 }; // 720p — hero événement
export const COMPRESS_ACTUALITE: CompressOptions = { maxWidth: 1200 }; // 1200px — image article
export const COMPRESS_AVATAR: CompressOptions = { maxWidth: 512, maxHeight: 512 }; // 512px — photo de profil
export const COMPRESS_BANDEAU: CompressOptions = { maxWidth: 1920, maxHeight: 480 }; // 1920×480 — bandeau membre
export const COMPRESS_HERO: CompressOptions = { maxLong: 1920 }; // 1920px — image hero config site
export const COMPRESS_THUMB: CompressOptions = { maxLong: 600 }; //  600px — miniature grilles de cartes
export const COMPRESS_LOGO: CompressOptions = { maxWidth: 400, maxHeight: 200, quality: 0.92 }; // logo partenaire

// ── WebP support detection (cached, Safari/iOS fall back to PNG silently) ─────
let webpSupport: boolean | undefined;
async function supportsWebp(): Promise<boolean> {
  if (webpSupport !== undefined) return webpSupport;
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp'));
  return (webpSupport = b?.type === 'image/webp');
}

// ── Core ─────────────────────────────────────────────────────────────────────
export function compressImage(
  file: File,
  opts: CompressOptions = COMPRESS_PORTFOLIO,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth,
        h = img.naturalHeight;

      const { maxLong, maxWidth, maxHeight } = opts;
      if (maxLong && (w > maxLong || h > maxLong)) {
        if (w >= h) {
          h = Math.round((h * maxLong) / w);
          w = maxLong;
        } else {
          w = Math.round((w * maxLong) / h);
          h = maxLong;
        }
      }
      if (maxWidth && w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      if (maxHeight && h > maxHeight) {
        w = Math.round((w * maxHeight) / h);
        h = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

      (async () => {
        const mime = (await supportsWebp()) ? 'image/webp' : 'image/jpeg';
        const ext = mime === 'image/webp' ? '.webp' : '.jpg';
        const name = file.name.replace(/\.[^.]+$/, ext);
        const encodeCanvas = (cnv: HTMLCanvasElement, q: number) =>
          new Promise<Blob | null>((r) => cnv.toBlob(r, mime, q));

        const q0 = opts.quality ?? 0.85;
        const SIZE_LIMIT = 5 * 1024 * 1024;
        const Q_FLOOR = 0.70;

        let blob = await encodeCanvas(canvas, q0);
        if (blob && blob.size > SIZE_LIMIT) {
          blob = await encodeCanvas(canvas, Q_FLOOR);
        }

        if (blob && blob.size > SIZE_LIMIT && opts.fallbackLong && Math.max(w, h) > opts.fallbackLong) {
          const scale = opts.fallbackLong / Math.max(w, h);
          const fw = Math.round(w * scale);
          const fh = Math.round(h * scale);
          const fc = document.createElement('canvas');
          fc.width = fw;
          fc.height = fh;
          fc.getContext('2d')!.drawImage(canvas, 0, 0, fw, fh);
          let q2 = q0;
          blob = await encodeCanvas(fc, q2);
          while (blob && blob.size > SIZE_LIMIT && q2 > 0.4) {
            q2 = Math.max(0.4, q2 - 0.15);
            blob = await encodeCanvas(fc, q2);
          }
        }

        if (!blob || blob.type !== mime) {
          reject(new ImageDecodeError(`Impossible d'encoder l'image : ${file.name}`));
          return;
        }
        resolve(new File([blob], name, { type: mime }));
      })().catch((e) =>
        reject(e instanceof ImageDecodeError ? e : new ImageDecodeError(`Erreur de compression : ${file.name}`)),
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageDecodeError(`Format non lisible : ${file.name}`));
    };
    img.src = url;
  });
}

export async function compressForUpload(
  file: File,
  opts: CompressOptions,
  onError: (msg: string) => void,
  maxMB = 20,
): Promise<File | null> {
  try {
    const compressed = await compressImage(file, opts);
    if (compressed.size > maxMB * 1024 * 1024) {
      onError('Fichier trop volumineux après compression.');
      return null;
    }
    return compressed;
  } catch (e) {
    onError(
      e instanceof ImageDecodeError
        ? 'Format non supporté. Exportez la photo en JPEG puis réessayez.'
        : "Erreur lors du traitement de l'image.",
    );
    return null;
  }
}
