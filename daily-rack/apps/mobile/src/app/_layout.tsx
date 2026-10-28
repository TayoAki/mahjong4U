import type { ReactNode } from 'react';
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
import { ErrorPanel, Loading, Screen } from '../components/ui.tsx';
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
  if (session.error) {
    return (
      <Screen>
        <ErrorPanel message={session.error} onRetry={session.retry} />
      </Screen>
    );
  }
  if (!ready || !session.ready) return <Loading label="Setting up the table" />;
  return <>{children}</>;
}
