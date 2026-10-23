import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { SheetTab } from './spreadsheet';

const TYPES = [
  'text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet', 'public.comma-separated-values-text', 'public.spreadsheet',
];

/** Opens Files (iCloud, Google Drive, Downloads…) and reads the chosen spreadsheet. Null when cancelled. */
export async function pickSpreadsheet(): Promise<{ file: string; tabs: SheetTab[] } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const bytes = asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : await new File(asset.uri).bytes();
  // Spreadsheet parsing is needed only after a file is chosen, not at sign-in.
  const { readSpreadsheet } = await import('./spreadsheet');
  return { file: asset.name, tabs: readSpreadsheet(asset.name, bytes) };
}
