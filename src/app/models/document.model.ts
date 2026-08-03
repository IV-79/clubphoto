export interface DocumentDossier {
  id?: string;
  nom: string;
  ordre: number;
}

export type DocumentType = 'general' | 'reunion';

export interface ClubDocument {
  id?: string;
  nom: string;
  extension: string;
  taille: number;
  dossier: string;
  storagePath: string;
  url: string;
  uploadeurUid: string;
  uploadeurNom: string;
  dateCreation: string;
  dateMiseAJour?: string;
  type?: DocumentType;  // undefined = 'general' (rétrocompat)
  reunionId?: string;   // défini quand le doc est lié à une réunion
}

interface ExtensionMeta { icon: string; color: string; label: string; }

const EXT_MAP: Record<string, ExtensionMeta> = {
  pdf:  { icon: 'picture_as_pdf', color: '#e53935', label: 'PDF' },
  doc:  { icon: 'description',    color: '#1565c0', label: 'Word' },
  docx: { icon: 'description',    color: '#1565c0', label: 'Word' },
  xls:  { icon: 'table_chart',    color: '#2e7d32', label: 'Excel' },
  xlsx: { icon: 'table_chart',    color: '#2e7d32', label: 'Excel' },
  ppt:  { icon: 'slideshow',      color: '#e65100', label: 'PPT' },
  pptx: { icon: 'slideshow',      color: '#e65100', label: 'PPT' },
  jpg:  { icon: 'image',          color: '#6a1b9a', label: 'Image' },
  jpeg: { icon: 'image',          color: '#6a1b9a', label: 'Image' },
  png:  { icon: 'image',          color: '#6a1b9a', label: 'Image' },
  gif:  { icon: 'gif',            color: '#6a1b9a', label: 'GIF' },
  zip:  { icon: 'folder_zip',     color: '#795548', label: 'Archive' },
  rar:  { icon: 'folder_zip',     color: '#795548', label: 'Archive' },
  txt:  { icon: 'text_snippet',   color: '#546e7a', label: 'Texte' },
  csv:  { icon: 'table_rows',     color: '#2e7d32', label: 'CSV' },
};

const DEFAULT_META: ExtensionMeta = { icon: 'insert_drive_file', color: '#78909c', label: 'Fichier' };

export function getExtensionMeta(extension: string): ExtensionMeta {
  return EXT_MAP[extension.toLowerCase()] ?? DEFAULT_META;
}

export function extractExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
