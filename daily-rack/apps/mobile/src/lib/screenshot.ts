import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { captureRaw } from './capture';

// Screenshots for "Report a problem": what's on screen right now (phones only), or one
// picked from Photos. Either way it's shrunk to a small JPEG before it's shown or sent.

export interface Screenshot {
  /** For showing it in the report sheet. */
  uri: string;
  type: 'image/jpeg';
  /** Base64 JPEG, ready to send. */
  data: string;
  width: number;
  height: number;
}

const MAX_WIDTH = 720;

async function shrink(uri: string, width: number): Promise<Screenshot | null> {
  const context = ImageManipulator.manipulate(uri);
  if (width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  const data = (saved.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
  return data ? { uri: saved.uri, type: 'image/jpeg', data, width: saved.width, height: saved.height } : null;
}

/** A picture of the screen as it is now, or null where that isn't possible (the web). */
export async function captureCurrentScreen(): Promise<Screenshot | null> {
  try {
    const raw = await captureRaw();
    if (!raw) return null;
    const shot = await shrink(raw.uri, raw.width);
    raw.release();
    return shot;
  } catch {
    return null;
  }
}

/** A screenshot the player picks from their photos, or null if they back out. */
export async function pickScreenshot(): Promise<Screenshot | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? shrink(asset.uri, asset.width) : null;
}
