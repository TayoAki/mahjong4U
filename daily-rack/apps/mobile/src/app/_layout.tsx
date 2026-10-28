import { useEffect, useState, type ReactNode } from 'react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { SessionProvider, useSession } from '../lib/session.tsx';
import { RealtimeProvider } from '../lib/realtime.tsx';
import { SafetyProvider } from '../lib/safety.tsx';
import { MatchmakingProvider } from '../lib/matchmaking.tsx';
import { ReportProblemProvider, ReportProblemSheet } from '../lib/report-problem.tsx';
import { NotificationsProvider } from '../lib/notification-prompt.tsx';
import { installProblemCatcher, noteProblem } from '../lib/diagnostics.ts';
import { Body, Button, Display, ErrorPanel, Loading, Screen } from '../components/ui.tsx';
import { OfflineGameView } from '../offline/OfflineGameView.tsx';
import { colors } from '../theme.ts';

installProblemCatcher();

// Phones stay upright. iPads can already turn (app.json); Android tablets are let loose here.
if (Platform.OS === 'android') {
  void Device.getDeviceTypeAsync()
    .then((type) => (type === Device.DeviceType.TABLET ? ScreenOrientation.unlockAsync() : undefined))
    .catch(() => undefined);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSerifDisplay_400Regular, Anton_400Regular });
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <RealtimeProvider>
          <ReportProblemProvider>
            <SessionGate ready={fontsLoaded}>
              <SafetyProvider>
                <NotificationsProvider>
                  <MatchmakingProvider>
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
                  </MatchmakingProvider>
                </NotificationsProvider>
              </SafetyProvider>
            </SessionGate>
          </ReportProblemProvider>
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

/** Shown if a screen crashes: a way back in, and a way to tell us what happened. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const [reporting, setReporting] = useState(false);
  const [extra] = useState(() => ({ error: error.message.slice(0, 500), stack: (error.stack ?? '').split('\n').slice(0, 10).map((line) => line.trim().slice(0, 300)).filter(Boolean) }));
  useEffect(() => noteProblem(`Crash: ${error.message}`), [error]);
  return (
    <SafeAreaProvider>
      <Screen>
        <Display size={30} style={{ marginTop: 32 }}>
          Something went wrong
        </Display>
        <Body>Sorry, the app hit a problem it couldn’t recover from. Try again, and if it keeps happening, please tell us what you were doing.</Body>
        <Button title="Try again" icon="arrow" onPress={() => void retry()} testID="crash-retry" />
        <Button title="Report this problem" variant="secondary" icon="flag" onPress={() => setReporting(true)} testID="crash-report" />
      </Screen>
      <ReportProblemSheet visible={reporting} onClose={() => setReporting(false)} screen="Crash screen" extra={extra} />
    </SafeAreaProvider>
  );
}
