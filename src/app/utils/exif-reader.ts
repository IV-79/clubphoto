import exifr from 'exifr';
import { PhotoExif } from '../models/photo.model';
import { GpsConsentService } from '../services/gps-consent.service';

function getImageDimensions(file: File): Promise<{ largeur: number; hauteur: number } | undefined> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ largeur: img.naturalWidth, hauteur: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(undefined); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export async function readExif(file: File): Promise<PhotoExif> {
  try {
    const [raw, gps, dims] = await Promise.all([
      exifr.parse(file, {
        pick: ['Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'DateTimeOriginal'],
      }),
      exifr.gps(file).catch(() => undefined),
      getImageDimensions(file),
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
    if (dims?.largeur && dims?.hauteur) {
      exif.largeur = dims.largeur;
      exif.hauteur = dims.hauteur;
    }

    return exif;
  } catch {
    return {};
  }
}

export async function readExifWithConsent(file: File, gpsService: GpsConsentService): Promise<PhotoExif> {
  const exif = await readExif(file);
  if (exif.gps) {
    const keep = await gpsService.requestConsent();
    if (!keep) delete exif.gps;
  }
  return exif;
}

export function hasExif(exif?: PhotoExif): boolean {
  if (!exif) return false;
  return Object.values(exif).some(v => v != null && v !== '');
}
