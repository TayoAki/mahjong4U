import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { FEATURES } from '@daily-rack/core';
import { api, type Daily } from '../lib/api.ts';
import { RackPlay } from '../components/RackPlay.tsx';
import { Body, Button, Display, ErrorPanel, IconButton, Loading, Screen, Sheet, TopBar } from '../components/ui.tsx';

function RackScreen() {
  const router = useRouter();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const load = () => {
    setError(null);
    api
      .daily()
      .then((d) => {
        if (d.attemptId) {
          router.replace(`/result/${d.attemptId}`);
          return;
        }
        setDaily(d);
      })
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  const header = (
    <TopBar
      title="Today's rack"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      right={<IconButton icon="help" label="How to play" onPress={() => setHelp(true)} />}
    />
  );
  const sheet = <HelpSheet visible={help} onClose={() => setHelp(false)} />;

  if (daily?.puzzle) {
    return (
      <>
        <RackPlay
          puzzle={daily.puzzle}
          source="today"
          header={header}
          onSubmitted={(id) => router.replace(`/result/${id}`)}
        />
        {sheet}
      </>
    );
  }
  return (
    <Screen>
      {header}
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!error && !daily && <Loading label="Dealing today's rack" />}
      {daily && !daily.puzzle && (
        <View style={{ gap: 12 }}>
          <Display size={28}>The next rack is on its way</Display>
          <Button title="Back to Today" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      )}
      {sheet}
    </Screen>
  );
}

function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="How it works" onClose={onClose}>
      <Body>It’s the start of a game, and the first Charleston is about to pass right.</Body>
      <Body>1. Pick the section of the card you’d aim for with these tiles.</Body>
      <Body>2. Tap the three tiles you’d pass, then tap Pass. Drag tiles to arrange your rack, as at any game.</Body>
      <Body>3. See one strong pass with the reasoning, every tile ranked, and how everyone else passed.</Body>
      <Body>4. Play on for three discards: the same tiles for everyone, each one ranked.</Body>
      {FEATURES.clips && <Body>5. Turn your answer into a vertical clip to share.</Body>}
      <Body small muted>
        Jokers can never be passed. Everyone gets the same rack each day, and your first answer is the one that counts. Check hands against your own card.
      </Body>
      <Button title="Got it" onPress={onClose} />
    </Sheet>
  );
}

/** Switched off for now (FEATURES.dailyRack): old links and reminders land on Today. */
export default function RackRoute() {
  return FEATURES.dailyRack ? <RackScreen /> : <Redirect href="/" />;
}
