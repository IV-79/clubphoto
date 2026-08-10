import ExifReader from 'exifreader';
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

type RawTag = { value: unknown; description: string };

function str(tag: RawTag | undefined): string | undefined {
  const s = tag?.description?.trim();
  return s || undefined;
}

// Lit un nombre depuis un tag EXIF : rationnel [num, den], number direct, ou description string
function rational(tag: RawTag | undefined): number | undefined {
  if (!tag) return undefined;
  const v = tag.value;
  if (Array.isArray(v) && v.length >= 2 && (v as number[])[1] !== 0) {
    return (v as number[])[0] / (v as number[])[1];
  }
  if (typeof v === 'number') return v;
  const n = parseFloat(tag.description);
  return isNaN(n) ? undefined : n;
}

export async function readExif(file: File): Promise<PhotoExif> {
  try {
    const [result, dims] = await Promise.all([
      // async: true = chunks à la demande, gère les grands offsets EXIF (ex. JPEG-XT Lightroom 15.5+)
      // expanded: true = GPS décimal prêt à l'emploi, tags EXIF/XMP séparés
      ExifReader.load(file, { async: true, expanded: true }),
      getImageDimensions(file),
    ]);

    const ex  = (result as { exif?: Record<string, RawTag> }).exif  ?? {};
    const xmp = (result as { xmp?:  Record<string, RawTag> }).xmp   ?? {};
    const gps = (result as { gps?:  { Latitude?: number; Longitude?: number } }).gps;

    const out: PhotoExif = {};

    const make  = str(ex['Make']);
    const model = str(ex['Model']);
    if (make || model) out.appareil = [make, model].filter(Boolean).join(' ');

    // LensModel en EXIF, puis fallback XMP aux:Lens
    const lens = str(ex['LensModel']) ?? str(xmp['Lens']) ?? str(ex['Lens']);
    if (lens) out.objectif = lens;

    // FocalLength : rationnel [num, den] → mm
    const focal = rational(ex['FocalLength']);
    if (focal != null) out.focale = Math.round(focal);

    // FNumber en priorité (f-number direct), sinon ApertureValue APEX → f = 2^(apex/2)
    const fnum = rational(ex['FNumber']);
    if (fnum != null) {
      out.ouverture = Math.round(fnum * 10) / 10;
    } else {
      const apex = rational(ex['ApertureValue']);
      if (apex != null) out.ouverture = Math.round(Math.pow(2, apex / 2) * 10) / 10;
    }

    // ExposureTime : rationnel [1, 125] → "1/125" ou "2"
    const et = rational(ex['ExposureTime']);
    if (et != null && et > 0) {
      out.vitesse = et < 1 ? `1/${Math.round(1 / et)}` : String(et);
    }

    // ISO — plusieurs noms de tag selon version EXIF
    const isoTag = ex['ISOSpeedRatings'] ?? ex['PhotographicSensitivity'];
    if (isoTag) {
      const v = isoTag.value;
      out.iso = Array.isArray(v) ? (v as number[])[0] : Number(v);
    }

    // Date EXIF format "YYYY:MM:DD HH:MM:SS" → normaliser pour Date()
    const dateDesc = str(ex['DateTimeOriginal']) ?? str(ex['DateTimeDigitized']) ?? str(ex['DateTime']);
    if (dateDesc) {
      const normalized = dateDesc.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const d = new Date(normalized);
      if (!isNaN(d.getTime())) {
        out.dateCapture = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }

    if (gps?.Latitude != null && gps?.Longitude != null) {
      out.gps = { lat: gps.Latitude, lng: gps.Longitude };
    }

    if (dims?.largeur && dims?.hauteur) {
      out.largeur = dims.largeur;
      out.hauteur = dims.hauteur;
    }

    return out;
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
