import { Dimensions, PixelRatio } from 'react-native';
import { captureScreen, releaseCapture } from 'react-native-view-shot';

/** Takes a picture of the whole screen: a temporary file, its width in pixels, and a way to delete it. */
export async function captureRaw(): Promise<{ uri: string; width: number; release: () => void }> {
  const uri = await captureScreen({ format: 'jpg', quality: 0.9, result: 'tmpfile' });
  return { uri, width: PixelRatio.getPixelSizeForLayoutSize(Dimensions.get('window').width), release: () => releaseCapture(uri) };
}
