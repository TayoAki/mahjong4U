import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { HOUSE_CARD } from '@daily-rack/core/mahjong';
import { api, type Stats } from '../lib/api.ts';
import { syncOfflineResults } from '../offline/results.ts';
import { Body, Button, Card, ErrorPanel, Heading, Loading, Row, Screen, TopBar } from '../components/ui.tsx';
import { Pattern } from '../game/CardView.tsx';
import { colors, fonts } from '../theme.ts';

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Your record: hands, wins, streaks, rating, and which hands on the card you've made. */
export default function StatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    // Hands played offline join your stats the next time you're connected.
    void syncOfflineResults()
      .catch(() => undefined)
      .then(() => api.stats())
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/play'));
  if (error && !stats) {
    return (
      <Screen>
        <TopBar title="Your stats" onBack={back} />
        <ErrorPanel message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!stats) return <Loading label="Adding up your games" />;
  const made = new Map(stats.card.completed.map((c) => [c.handId, c.times]));

  return (
    <Screen>
      <TopBar title="Your stats" onBack={back} />
      {stats.hands === 0 ? (
        <Card tone="sage" testID="stats-empty">
          <Heading>No hands yet</Heading>
          <Body>Play a hand against the computer, with friends or online, and your stats start here.</Body>
          <Button title="Play a game" icon="play" onPress={() => router.replace('/play')} />
        </Card>
      ) : (
        <View style={styles.grid} testID="stats-summary">
          <Tile label="Hands played" value={stats.hands} />
          <Tile label={`Won · ${stats.winRate}%`} value={stats.wins} />
          <Tile label={`Win streak · best ${stats.streak.best}`} value={stats.streak.current} />
          <Tile label="Self-drawn wins" value={stats.selfDrawn} />
          <Tile label="Jokerless wins" value={stats.jokerless} />
          <Tile label="Points overall" value={formatScore(stats.points)} />
        </View>
      )}

      <Card style={{ gap: 8 }}>
        <Heading>Ranked</Heading>
        {stats.ranked.games === 0 ? (
          <Body muted>Play a ranked game from the Play tab to get a rating. Everyone starts at 1200.</Body>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.big}>{stats.ranked.rating}</Text>
              <Body muted>{stats.ranked.rank ? `#${stats.ranked.rank} on the leaderboard` : 'On the leaderboard after 3 ranked games'}</Body>
            </Row>
            <Body small muted>
              {stats.ranked.games} ranked {stats.ranked.games === 1 ? 'game' : 'games'}, {stats.ranked.wins} won
            </Body>
          </>
        )}
        <Button title="Leaderboard" variant="text" compact icon="chevron" onPress={() => router.push('/leaderboard')} />
      </Card>

      {stats.biggest && (
        <Card style={{ gap: 6 }}>
          <Heading>Biggest hand</Heading>
          {stats.biggest.pattern && <Pattern pattern={stats.biggest.pattern} />}
          <Body muted>{stats.biggest.value} points</Body>
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <Heading>The card</Heading>
        <Body small muted>
          You’ve made {made.size} of the {stats.card.total} hands on the house card. Tap a section to see which.
        </Body>
        <View style={styles.bar} accessibilityLabel={`${made.size} of ${stats.card.total} hands made`}>
          <View style={[styles.barFill, { width: `${Math.round((made.size / stats.card.total) * 100)}%` }]} />
        </View>
        {stats.card.sections.map((section) => (
          <View key={section.id} style={{ gap: 6 }}>
            <Button
              variant="text"
              compact
              title={`${section.label} · ${section.completed} of ${section.total}`}
              icon={open === section.id ? 'check' : 'chevron'}
              onPress={() => setOpen(open === section.id ? null : section.id)}
              style={{ alignSelf: 'flex-start' }}
            />
            {open === section.id &&
              HOUSE_CARD.hands
                .filter((h) => h.section === section.id)
                .map((h) => (
                  <Row key={h.id} style={styles.handRow}>
                    <View style={{ flex: 1 }}>
                      <Pattern pattern={h.pattern} size={15} />
                    </View>
                    <Text style={[styles.made, !made.has(h.id) && { color: colors.muted }]}>{made.has(h.id) ? `Made ×${made.get(h.id)}` : 'Not yet'}</Text>
                  </Row>
                ))}
          </View>
        ))}
      </Card>

      {stats.recent.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Heading>Recent hands</Heading>
          {stats.recent.map((r, i) => (
            <Row key={`${r.playedAt}-${i}`} style={styles.handRow}>
              <View style={{ flex: 1, gap: 2 }}>
                {r.won && r.pattern ? <Pattern pattern={r.pattern} size={14} /> : <Body small>{r.wallGame ? 'Wall game' : 'Didn’t win'}</Body>}
                <Body small muted>
                  {new Date(r.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {r.ranked ? ' · ranked' : ''}
                  {r.offline ? ' · offline' : ''}
                </Body>
              </View>
              <Text style={[styles.made, { color: r.payment > 0 ? colors.online : r.payment < 0 ? colors.danger : colors.muted }]}>{formatScore(r.payment)}</Text>
            </Row>
          ))}
          {stats.offline.hands > 0 && (
            <Body small muted>
              Includes {stats.offline.hands} {stats.offline.hands === 1 ? 'hand' : 'hands'} played offline.
            </Body>
          )}
        </Card>
      )}
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '46%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  tileValue: { fontFamily: fonts.serif, fontSize: 30, color: colors.primary },
  tileLabel: { fontSize: 13, color: colors.muted },
  big: { fontFamily: fonts.serif, fontSize: 40, color: colors.primary },
  bar: { height: 10, borderRadius: 5, backgroundColor: '#EBE8DF', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
  handRow: { justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  made: { fontSize: 14, fontWeight: '700', color: colors.online },
});
