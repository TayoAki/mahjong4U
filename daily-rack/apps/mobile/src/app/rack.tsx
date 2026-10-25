import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, type Daily } from '../lib/api.ts';
import { FIRST_OPEN_KEY, PREFS_ASKED_KEY, PREFS_KEY, readJson, readPrefs, writeJson, type Preferences } from '../lib/storage.ts';
import { RackPlay } from '../components/RackPlay.tsx';
import { Body, Button, Chip, Display, ErrorPanel, IconButton, Loading, Screen, Sheet, TopBar } from '../components/ui.tsx';

export default function RackScreen() {
  const router = useRouter();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [firstOpen, setFirstOpen] = useState(false);
  const [askPrefs, setAskPrefs] = useState(false);

  const load = () => {
    setError(null);
    api
      .daily()
      .then(async (d) => {
        if (d.attemptId) {
          router.replace(`/result/${d.attemptId}`);
          return;
        }
        const first = !(await readJson<boolean>(FIRST_OPEN_KEY, false));
        setFirstOpen(first);
        setAskPrefs(first && !(await readJson<boolean>(PREFS_ASKED_KEY, false)));
        setDaily(d);
      })
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  return (
    <Screen>
      <TopBar
        title="Today's rack"
        onBack={firstOpen ? undefined : () => (router.canGoBack() ? router.back() : router.replace('/'))}
        right={<IconButton icon="help" label="How to play" onPress={() => setHelp(true)} />}
      />
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!error && !daily && <Loading label="Dealing today's rack" />}
      {daily && !daily.puzzle && (
        <View style={{ gap: 12 }}>
          <Display size={28}>The next rack is on its way</Display>
          <Button title="Back to Today" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      )}
      {daily?.puzzle && (
        <RackPlay puzzle={daily.puzzle} source={firstOpen ? 'first-open' : 'today'} onSubmitted={(id) => router.replace(`/result/${id}`)} />
      )}
      <HelpSheet visible={help} onClose={() => setHelp(false)} />
      <PreferencesSheet visible={askPrefs} onDone={() => setAskPrefs(false)} />
    </Screen>
  );
}

function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} title="How it works" onClose={onClose}>
      <Body>1. Pick the section of the card you would aim for with this rack.</Body>
      <Body>2. Choose the three tiles you would pass in the first Charleston.</Body>
      <Body>3. See one strong pass with the reasoning, and how everyone else passed.</Body>
      <Body>4. Turn your answer into a vertical clip to share.</Body>
      <Body small muted>
        Jokers can never be passed. Everyone gets the same rack each day, and your first answer is the one that counts. Check hands against your own card: this app never reproduces it.
      </Body>
      <Button title="Got it" onPress={onClose} />
    </Sheet>
  );
}

/** Two optional taps on first open. Skipping is always fine. */
function PreferencesSheet({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  useEffect(() => {
    readPrefs().then(setPrefs);
  }, []);
  const finish = async (save: boolean) => {
    if (save && prefs) await writeJson(PREFS_KEY, prefs);
    await writeJson(PREFS_ASKED_KEY, true);
    onDone();
  };
  if (!prefs) return null;
  return (
    <Sheet visible={visible} title="Quick question" onClose={() => finish(false)}>
      <Body bold>Which card do you play?</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="This year's card" selected={prefs.card === 'this-year'} onPress={() => setPrefs({ ...prefs, card: 'this-year' })} />
        <Chip label="I'm learning" selected={prefs.card === 'learning'} onPress={() => setPrefs({ ...prefs, card: 'learning' })} />
      </View>
      <Body bold>How often do you play?</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="I'm new" selected={prefs.frequency === 'new'} onPress={() => setPrefs({ ...prefs, frequency: 'new' })} />
        <Chip label="Weekly" selected={prefs.frequency === 'weekly'} onPress={() => setPrefs({ ...prefs, frequency: 'weekly' })} />
        <Chip label="I teach" selected={prefs.frequency === 'teach'} onPress={() => setPrefs({ ...prefs, frequency: 'teach' })} />
      </View>
      <Button title="Deal my rack" onPress={() => finish(true)} />
      <Button title="Skip" variant="text" onPress={() => finish(false)} />
    </Sheet>
  );
}
