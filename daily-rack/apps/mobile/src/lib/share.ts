import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/** Opens the share sheet with a link, or copies it where sharing is not available. */
export async function shareLink({ title, message, url }: { title: string; message: string; url: string }): Promise<'shared' | 'copied' | 'dismissed'> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text: message, url });
        return 'shared';
      } catch {
        // Fall through to copying when the sheet is closed or blocked.
      }
    }
    await Clipboard.setStringAsync(url);
    return 'copied';
  }
  const result = await Share.share(Platform.OS === 'ios' ? { message, url, title } : { message: `${message} ${url}`, title });
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
