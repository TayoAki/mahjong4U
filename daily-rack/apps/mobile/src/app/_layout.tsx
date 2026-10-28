import { useState, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { SessionProvider, useSession } from '../lib/session.tsx';
import { RealtimeProvider } from '../lib/realtime.tsx';
import { SafetyProvider } from '../lib/safety.tsx';
import { MatchmakingProvider } from '../lib/matchmaking.tsx';
import { Body, Button, ErrorPanel, Loading, Screen } from '../components/ui.tsx';
import { OfflineGameView } from '../offline/OfflineGameView.tsx';
import { colors } from '../theme.ts';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSerifDisplay_400Regular, Anton_400Regular });
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <RealtimeProvider>
          <SessionGate ready={fontsLoaded}>
            <SafetyProvider>
              <MatchmakingProvider>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
              </MatchmakingProvider>
            </SafetyProvider>
          </SessionGate>
        </RealtimeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Holds the app until fonts are loaded and the guest session exists. */
function SessionGate({ ready, children }: { ready: boolean; children: ReactNode }) {
  const session = useSession();
  const [offline, setOffline] = useState(false);
  if (session.error && ready) {
    // First launch with no connection: the app can't set up yet, but a game can still be played.
    if (offline) return <OfflineGameView me="You" onExit={() => setOffline(false)} />;
    return (
      <Screen>
        <ErrorPanel message={session.error} onRetry={session.retry} />
        <Body muted center>
          No connection? You can still play the computer on this phone.
        </Body>
        <Button title="Play offline" icon="play" variant="secondary" onPress={() => setOffline(true)} testID="gate-offline" />
      </Screen>
    );
  }
  if (!ready || !session.ready) return <Loading label="Setting up the table" />;
  return <>{children}</>;
}
