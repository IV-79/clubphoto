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
        pick: [
          // Appareil
          'Make', 'Model', 'CameraModelName',
          // Objectif
          'LensModel', 'Lens', 'LensID', 'LensInfo',
          // Focale
          'FocalLength', 'FocalLengthIn35mmFilm',
          // Ouverture
          'FNumber', 'ApertureValue',
          // Vitesse
          'ExposureTime',
          // ISO — variantes EXIF 2.2 / 2.3 / XMP
          'ISO', 'ISOSpeedRatings', 'PhotographicSensitivity',
          // Date — variantes EXIF / XMP
          'DateTimeOriginal', 'CreateDate', 'DateTime',
        ],
      }),
      exifr.gps(file).catch(() => undefined),
      getImageDimensions(file),
    ]);
    if (!raw && !gps) return {};

    const exposureTime = raw?.ExposureTime;
    let vitesse: string | undefined;
    if (exposureTime) {
      vitesse = exposureTime < 1
        ? `1/${Math.round(1 / exposureTime)}`
        : `${exposureTime}`;
    }

    const exif: PhotoExif = {};
    const make  = raw?.Make;
    const model = raw?.Model ?? raw?.CameraModelName;
    if (make || model)  exif.appareil = [make, model].filter(Boolean).join(' ');

    const lens = raw?.LensModel ?? raw?.Lens ?? raw?.LensID ?? raw?.LensInfo;
    if (lens)           exif.objectif = Array.isArray(lens) ? lens.join('-') : String(lens);

    const focal = raw?.FocalLength ?? raw?.FocalLengthIn35mmFilm;
    if (focal != null)  exif.focale = Math.round(focal);

    const fnum = raw?.FNumber ?? raw?.ApertureValue;
    if (fnum != null)   exif.ouverture = fnum;

    if (vitesse)        exif.vitesse = vitesse;

    const iso = raw?.ISO ?? raw?.ISOSpeedRatings ?? raw?.PhotographicSensitivity;
    if (iso != null)    exif.iso = Array.isArray(iso) ? iso[0] : iso;

    const date = raw?.DateTimeOriginal ?? raw?.CreateDate ?? raw?.DateTime;
    if (date)           exif.dateCapture = new Date(date).toISOString().split('T')[0];

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
