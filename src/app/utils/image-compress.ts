export function compressToJpeg(file: File): Promise<File> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 3840;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const name = file.name.replace(/\.[^.]+$/, '.jpg');
      const toBlob = (q: number) => new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', q));
      (async () => {
        let quality = 0.85;
        let blob = await toBlob(quality);
        while (blob && blob.size > 5 * 1024 * 1024 && quality > 0.65) {
          quality -= 0.15;
          blob = await toBlob(quality);
        }
        resolve(blob ? new File([blob], name, { type: 'image/jpeg' }) : file);
      })().catch(() => resolve(file));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
