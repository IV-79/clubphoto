export interface CompressOptions {
  maxLong?:   number;  // scale so longest side ≤ this
  maxWidth?:  number;  // then scale so width  ≤ this
  maxHeight?: number;  // then scale so height ≤ this
  quality?:   number;  // initial WebP quality (0–1), default 0.85
}

// ── Presets ──────────────────────────────────────────────────────────────────
export const COMPRESS_PORTFOLIO  : CompressOptions = { maxLong: 3840 };                    // 4K  — vitrine artistique
export const COMPRESS_EVENT      : CompressOptions = { maxLong: 2048 };                    // 2K  — oneshot / sortie / défi
export const COMPRESS_THEME      : CompressOptions = { maxLong: 2048 };                    // 2K  — soumissions thème du mois
export const COMPRESS_COUVERTURE : CompressOptions = { maxWidth: 1280, maxHeight: 720 };   // 720p — hero événement
export const COMPRESS_ACTUALITE  : CompressOptions = { maxWidth: 1200 };                   // 1200px — image article
export const COMPRESS_AVATAR     : CompressOptions = { maxWidth: 512,  maxHeight: 512 };   // 512px — photo de profil
export const COMPRESS_BANDEAU    : CompressOptions = { maxWidth: 1920, maxHeight: 480 };   // 1920×480 — bandeau membre
export const COMPRESS_HERO       : CompressOptions = { maxLong: 1920 };                    // 1920px — image hero config site

// ── Core ─────────────────────────────────────────────────────────────────────
export function compressImage(file: File, opts: CompressOptions = COMPRESS_PORTFOLIO): Promise<File> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;

      const { maxLong, maxWidth, maxHeight } = opts;
      if (maxLong && (w > maxLong || h > maxLong)) {
        if (w >= h) { h = Math.round(h * maxLong / w); w = maxLong; }
        else        { w = Math.round(w * maxLong / h); h = maxLong; }
      }
      if (maxWidth  && w > maxWidth)  { h = Math.round(h * maxWidth  / w); w = maxWidth; }
      if (maxHeight && h > maxHeight) { w = Math.round(w * maxHeight / h); h = maxHeight; }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

      const name = file.name.replace(/\.[^.]+$/, '.webp');
      const toBlob = (q: number) => new Promise<Blob | null>(r => canvas.toBlob(r, 'image/webp', q));
      (async () => {
        let quality = opts.quality ?? 0.85;
        let blob = await toBlob(quality);
        while (blob && blob.size > 5 * 1024 * 1024 && quality > 0.65) {
          quality -= 0.15;
          blob = await toBlob(quality);
        }
        resolve(blob ? new File([blob], name, { type: 'image/webp' }) : file);
      })().catch(() => resolve(file));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
