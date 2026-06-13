import exifr from 'exifr';
import { PhotoExif } from '../models/photo.model';

export async function readExif(file: File): Promise<PhotoExif> {
  try {
    const [raw, gps] = await Promise.all([
      exifr.parse(file, {
        pick: ['Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'DateTimeOriginal'],
      }),
      exifr.gps(file).catch(() => undefined),
    ]);
    if (!raw && !gps) return {};

    let vitesse: string | undefined;
    if (raw?.ExposureTime) {
      vitesse = raw.ExposureTime < 1
        ? `1/${Math.round(1 / raw.ExposureTime)}`
        : `${raw.ExposureTime}`;
    }

    const exif: PhotoExif = {};
    if (raw?.Make || raw?.Model)       exif.appareil    = [raw.Make, raw.Model].filter(Boolean).join(' ');
    if (raw?.LensModel)                exif.objectif    = raw.LensModel;
    if (raw?.FocalLength != null)      exif.focale      = Math.round(raw.FocalLength);
    if (raw?.FNumber != null)          exif.ouverture   = raw.FNumber;
    if (vitesse)                       exif.vitesse     = vitesse;
    if (raw?.ISO != null)              exif.iso         = raw.ISO;
    if (raw?.DateTimeOriginal)         exif.dateCapture = new Date(raw.DateTimeOriginal).toISOString().split('T')[0];
    if (gps?.latitude != null && gps?.longitude != null) {
      exif.gps = { lat: gps.latitude, lng: gps.longitude };
    }

    return exif;
  } catch {
    return {};
  }
}

export function hasExif(exif?: PhotoExif): boolean {
  if (!exif) return false;
  return Object.values(exif).some(v => v != null && v !== '');
}
