import { useState } from 'react';
import { useRouter } from 'expo-router';
import { api } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { usePlus } from '../lib/plus.tsx';
import { Body, Button, Card, ErrorPanel, Heading, Icon, Row } from '../components/ui.tsx';
import { HowToPlay } from './HowToPlay.tsx';
import { TwoPlayerRules } from './TwoPlayerRules.tsx';

/** The Play tab's way in to two-player games: against the computer straight away, or with a friend. */
export function TwoPlayerCard() {
  const router = useRouter();
  const { handlePlusError } = usePlus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'rules' | 'basics' | null>(null);

  const playComputer = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createTable({ mode: 'turn', variant: 'two-player', seats: [{ type: 'bot', level: 'normal' }] });
      track('table_created', { mode: 'turn', vsComputer: true, players: 2 });
      router.push(`/table/${created.table.id}`);
    } catch (e) {
      if (!handlePlusError(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }} testID="two-player-card">
      <Row>
        <Icon name="users" />
        <Heading>Two-player</Heading>
      </Row>
      <Body muted>Just the two of you? You each build two hands at once from the same card. Play a friend, or practise against the computer.</Body>
      {error && <ErrorPanel message={error} />}
      <Row gap={8}>
        <Button style={{ flex: 1 }} compact title="Play the computer" onPress={playComputer} loading={busy} testID="two-player-computer" />
        <Button style={{ flex: 1 }} compact variant="secondary" title="Play a friend" onPress={() => router.push('/table/new?players=2')} testID="two-player-friend" />
      </Row>
      <Button title="Two-player rules" variant="text" compact icon="help" onPress={() => setSheet('rules')} style={{ alignSelf: 'flex-start' }} testID="two-player-rules" />
      <TwoPlayerRules
        visible={sheet === 'rules'}
        onClose={() => setSheet(null)}
        onBasics={() => setSheet('basics')}
        onLesson={() => {
          setSheet(null);
          router.push('/lessons/two-player');
        }}
      />
      <HowToPlay visible={sheet === 'basics'} onClose={() => setSheet(null)} />
    </Card>
  );
}
