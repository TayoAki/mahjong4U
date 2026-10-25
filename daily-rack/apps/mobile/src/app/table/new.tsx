import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, type FriendsOverview, type SeatChoice } from '../../lib/api.ts';
import { track } from '../../lib/analytics.ts';
import { Body, Button, Card, Chip, ErrorPanel, Heading, Row, Screen, Segmented, TopBar } from '../../components/ui.tsx';
import { LEVEL_LABEL, SeatSheet } from '../../game/Lobby.tsx';
import { colors } from '../../theme.ts';

const SIDES = ['On your right (South)', 'Across (West)', 'On your left (North)'];

/** Set up a table with friends: mode, who sits where, and the Charleston house rules. */
export default function NewTableScreen() {
  const router = useRouter();
  const { friend } = useLocalSearchParams<{ friend?: string }>();
  const [friends, setFriends] = useState<FriendsOverview['friends']>([]);
  const [mode, setMode] = useState<'live' | 'turn'>('turn');
  const [seats, setSeats] = useState<SeatChoice[]>([{ type: 'open' }, { type: 'bot', level: 'normal' }, { type: 'bot', level: 'normal' }]);
  const [secondCharleston, setSecondCharleston] = useState(true);
  const [courtesyPass, setCourtesyPass] = useState(true);
  const [skipCharleston, setSkipCharleston] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .friends()
      .then((f) => {
        setFriends(f.friends);
        if (friend && f.friends.some((x) => x.id === friend)) setSeats((s) => [{ type: 'friend', friendId: friend }, ...s.slice(1)]);
      })
      .catch(() => undefined);
  }, [friend]);

  const label = (seat: SeatChoice) =>
    seat.type === 'bot' ? `Computer · ${LEVEL_LABEL[seat.level]}` : seat.type === 'friend' ? `Held for ${friends.find((f) => f.id === seat.friendId)?.name ?? 'a friend'}` : 'Open: anyone with the code';

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createTable({ mode, seats, settings: { secondCharleston, courtesyPass, skipCharleston } });
      track('table_created', { mode, vsComputer: seats.every((s) => s.type === 'bot'), friends: seats.filter((s) => s.type === 'friend').length });
      router.replace(`/table/${created.table.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Open the table" icon="arrow" onPress={create} loading={busy} testID="create-table" />}>
      <TopBar title="New table" onBack={() => (router.canGoBack() ? router.back() : router.replace('/play'))} />
      {error && <ErrorPanel message={error} />}

      <View style={{ gap: 10 }}>
        <Heading>How do you want to play?</Heading>
        <Segmented
          label="Game pace"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'turn', label: 'Turn-based' },
          ]}
        />
        <Body small muted>
          {mode === 'live'
            ? 'Everyone plays at the same time. A timer keeps things moving; if someone steps away, the computer makes a safe move for them.'
            : 'Play at your own pace. Each player gets a nudge when it’s their move, and the game waits for them.'}
        </Body>
      </View>

      <View style={{ gap: 10 }}>
        <Heading>Seats</Heading>
        <View style={styles.seat}>
          <View style={{ flex: 1 }}>
            <Text style={styles.side}>You (East, deals first)</Text>
          </View>
        </View>
        {seats.map((seat, i) => (
          <View key={i} style={styles.seat}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.side}>{SIDES[i]}</Text>
              <Body small muted>
                {label(seat)}
              </Body>
            </View>
            <Button variant="text" compact title="Change" onPress={() => setEditing(i)} testID={`new-seat-${i + 1}`} />
          </View>
        ))}
        <Body small muted>
          Open seats need filling before the first hand. You can still change them in the lobby.
        </Body>
      </View>

      <Card style={{ gap: 10 }}>
        <Body bold>Charleston</Body>
        <Row gap={8}>
          <Chip label="Play the Charleston" selected={!skipCharleston} onPress={() => setSkipCharleston(false)} />
          <Chip label="Skip it" selected={skipCharleston} onPress={() => setSkipCharleston(true)} />
        </Row>
        {!skipCharleston && (
          <>
            <Row gap={8}>
              <Chip label="Second Charleston (if all agree)" selected={secondCharleston} onPress={() => setSecondCharleston(!secondCharleston)} />
            </Row>
            <Row gap={8}>
              <Chip label="Courtesy pass" selected={courtesyPass} onPress={() => setCourtesyPass(!courtesyPass)} />
            </Row>
          </>
        )}
      </Card>

      <SeatSheet
        position={editing}
        friends={friends}
        onClose={() => setEditing(null)}
        onPick={(choice) => {
          if (editing !== null) setSeats((s) => s.map((x, i) => (i === editing ? choice : x)));
          setEditing(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  seat: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, minHeight: 56 },
  side: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
