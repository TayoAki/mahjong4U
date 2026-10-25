import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, type NightSummary } from '../../lib/api.ts';
import { formatWhen } from '../../lib/dates.ts';
import { useRealtimeMessages } from '../../lib/realtime.tsx';
import { Badge, Body, Button, Card, Display, ErrorPanel, Eyebrow, Heading, Icon, Row, Screen } from '../../components/ui.tsx';
import { colors } from '../../theme.ts';

const RSVP_LABEL = { pending: 'Not answered', yes: 'You’re going', maybe: 'Maybe', no: 'Can’t make it' } as const;

export default function NightsScreen() {
  const router = useRouter();
  const [nights, setNights] = useState<NightSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .nights()
      .then((r) => {
        setNights(r.nights);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);
  useRealtimeMessages((m) => {
    if (m.type === 'night') load();
  });

  const upcoming = (nights ?? []).filter((n) => !n.when || new Date(n.when).getTime() > Date.now() - 6 * 3600_000);
  const past = (nights ?? []).filter((n) => !upcoming.includes(n));

  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <Eyebrow>Around a real table</Eyebrow>
        <Display size={38}>Game Night</Display>
        <Body muted>Pick a few times, send one link, and let everyone vote. When it’s set, it goes straight into your calendar.</Body>
      </View>
      {error && <ErrorPanel message={error} onRetry={load} />}
      <Button title="Plan a game night" icon="plus" onPress={() => router.push('/night/new')} testID="plan-night" />

      <View style={{ gap: 10 }}>
        <Heading>Coming up</Heading>
        {nights && upcoming.length === 0 && (
          <Card tone="sage">
            <Body bold>No game nights yet</Body>
            <Body small muted>
              Can’t get everyone in one room? Every game night can also become an online table, with computer players filling empty seats.
            </Body>
          </Card>
        )}
        {upcoming.map((n) => (
          <NightRow key={n.id} night={n} onPress={() => router.push(`/night/${n.id}`)} />
        ))}
      </View>
      {past.length > 0 && (
        <View style={{ gap: 10 }}>
          <Heading>Earlier</Heading>
          {past.map((n) => (
            <NightRow key={n.id} night={n} onPress={() => router.push(`/night/${n.id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function NightRow({ night, onPress }: { night: NightSummary; onPress: () => void }) {
  const when = night.when ? formatWhen(night.when, night.timeZone, 'short') : `Voting on ${night.options.length} ${night.options.length === 1 ? 'time' : 'times'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${night.title}, ${when}, ${night.going} going, ${RSVP_LABEL[night.myRsvp]}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.sage }]}
    >
      <View style={styles.dateBox}>
        <Icon name="calendar" color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {night.title}
        </Text>
        <Body small muted>
          {when} · {night.going} going
        </Body>
        <Row gap={6}>
          <Badge label={night.status === 'confirmed' ? 'Confirmed' : 'Voting'} tone={night.status === 'confirmed' ? 'sage' : 'pink'} />
          {night.isHost && <Badge label="Host" tone="ink" />}
        </Row>
      </View>
      <Icon name="chevron" color={colors.muted} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  dateBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
