import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMatchmaking } from '../lib/matchmaking.tsx';
import { usePlus } from '../lib/plus.tsx';
import { Body, Button, Card, ErrorPanel, Heading, Icon, Row } from '../components/ui.tsx';
import { colors } from '../theme.ts';
import { formatSeconds } from './useCountdown.ts';

/** Play strangers online: a casual quick match or a ranked game, with the wait shown live. */
export function OnlineCard({ rating }: { rating: number | null }) {
  const router = useRouter();
  const { queue, busy, error, find, cancel } = useMatchmaking();
  const { plus, openPlus } = usePlus();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!queue) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [queue]);

  const waited = queue ? Math.max(0, Math.floor((now - new Date(queue.since).getTime()) / 1000)) : 0;
  const fillIn = queue ? Math.max(0, Math.ceil((new Date(queue.fillAt).getTime() - now) / 1000)) : 0;

  return (
    <Card style={{ gap: 12 }}>
      <Row>
        <Icon name="users" />
        <Heading>Play people online</Heading>
      </Row>
      {queue ? (
        <View style={styles.waiting} testID="match-waiting" accessibilityLiveRegion="polite">
          <Text style={styles.waitTitle}>Finding {queue.mode === 'ranked' ? 'a ranked game' : 'players'}… {formatSeconds(waited)}</Text>
          <Body small muted>
            {queue.waiting > 1 ? `${queue.waiting} people are waiting. ` : ''}
            {fillIn > 0 ? `If nobody else turns up, computer players fill the empty seats in ${fillIn}s.` : 'Filling the empty seats with computer players…'} You can look around while you wait.
          </Body>
          <Button title="Stop searching" variant="secondary" compact onPress={cancel} testID="match-cancel" />
        </View>
      ) : (
        <>
          <Body muted>Live games with other players, one hand each. Chat uses quick phrases, so it stays friendly.</Body>
          <Row gap={10}>
            <Button style={{ flex: 1 }} title="Quick match" icon="play" onPress={() => find('casual')} loading={busy} testID="match-casual" />
            <Button
              style={{ flex: 1 }}
              title={plus ? 'Ranked' : 'Ranked · Plus'}
              variant="secondary"
              onPress={() => (plus ? find('ranked') : openPlus('ranked'))}
              disabled={busy}
              testID="match-ranked"
            />
          </Row>
        </>
      )}
      {error && <ErrorPanel message={error} />}
      <Row style={{ justifyContent: 'space-between' }}>
        <Body small muted>
          {rating !== null ? `Your rating: ${rating}` : 'Ranked games build your rating.'}
        </Body>
        <Button title="Leaderboard" variant="text" compact icon="chevron" onPress={() => router.push('/leaderboard')} testID="open-leaderboard" />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  waiting: { gap: 8, backgroundColor: colors.sage, borderRadius: 14, padding: 12 },
  waitTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
