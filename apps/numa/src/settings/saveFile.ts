import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes text to the app's cache and opens the share sheet, so the person can save it to Files or send it on. */
export async function saveTextFile(name: string, text: string, mime = 'application/json'): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name, UTI: 'public.json' });
}
