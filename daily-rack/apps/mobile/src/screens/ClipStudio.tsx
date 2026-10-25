import { useRef, useState, type ComponentType, type Ref } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { getBearer } from '../lib/api.ts';
import { API_BASE } from '../lib/config.ts';
import { ErrorPanel, Screen, TopBar } from '../components/ui.tsx';

// Native clip studio. The renderer and MP4 encoder are web code (canvas + WebCodecs), so
// they run in a WebView of the web build; the finished file comes back in base64 chunks,
// is written to the cache, and handed to the share sheet or saved to Photos.

// The package's class typing intersects props with `undefined` by default, which is `never`.
const BridgeView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView<object>> }>;

type Incoming =
  | { type: 'clip-begin'; name: string; intent: 'share' | 'save'; count: number; text: string }
  | { type: 'clip-chunk'; index: number; data: string }
  | { type: 'clip-end' };

export function ClipStudio({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const web = useRef<WebView<object>>(null);
  const pending = useRef<{ file: File; intent: 'share' | 'save'; next: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = (status: string) => web.current?.injectJavaScript(`window.__clipStatus && window.__clipStatus(${JSON.stringify(status)}); true;`);

  const onMessage = async (event: WebViewMessageEvent) => {
    let message: Incoming;
    try {
      message = JSON.parse(event.nativeEvent.data) as Incoming;
    } catch {
      return;
    }
    try {
      if (message.type === 'clip-begin') {
        const file = new File(Paths.cache, message.name.replace(/[^A-Za-z0-9._-]/g, '_'));
        if (file.exists) file.delete();
        file.create();
        pending.current = { file, intent: message.intent, next: 0, text: message.text };
      } else if (message.type === 'clip-chunk' && pending.current) {
        if (message.index !== pending.current.next) throw new Error('Part of the video went missing. Try again.');
        await pending.current.file.write(message.data, { encoding: 'base64', append: true });
        pending.current.next += 1;
      } else if (message.type === 'clip-end' && pending.current) {
        const { file, intent, text } = pending.current;
        pending.current = null;
        if (intent === 'share') {
          if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
          await Sharing.shareAsync(file.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: text });
          report('Handed off to the app you picked.');
        } else {
          const permission = await requestPermissionsAsync(true);
          if (!permission.granted) throw new Error('Allow Daily Rack to add to Photos in Settings to save clips.');
          await Asset.create(file.uri);
          report('Saved to Photos.');
        }
      }
    } catch (e) {
      pending.current = null;
      report((e as Error).message);
    }
  };

  const token = getBearer();
  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <TopBar title="Make your clip" onBack={() => (router.canGoBack() ? router.back() : router.replace(`/result/${attemptId}`))} />
      </View>
      {error ? (
        <View style={{ padding: 20 }}>
          <ErrorPanel message={error} />
        </View>
      ) : (
        <BridgeView
          ref={web}
          style={{ flex: 1 }}
          source={{ uri: `${API_BASE}/clip/${encodeURIComponent(attemptId)}?embed=1` }}
          injectedJavaScriptBeforeContentLoaded={`window.__DR_TOKEN__ = ${JSON.stringify(token)}; true;`}
          onMessage={onMessage}
          onError={() => setError('The clip studio could not load. Check your connection and try again.')}
          mediaCapturePermissionGrantType="grant"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
        />
      )}
    </Screen>
  );
}
