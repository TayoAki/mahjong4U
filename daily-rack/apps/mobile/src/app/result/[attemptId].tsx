import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatRate, spokenLabel } from '@daily-rack/core';
import { ApiError, api, type ResultResponse } from '../../lib/api.ts';
import { FIRST_OPEN_KEY, writeJson } from '../../lib/storage.ts';
import { track } from '../../lib/analytics.ts';
import { Badge, Body, Button, Card, Display, ErrorPanel, Heading, Icon, Loading, Notice, Screen, TopBar } from '../../components/ui.tsx';
import { Tile } from '../../components/Tile.tsx';
import { colors, fonts } from '../../theme.ts';

export default function ResultScreen() {
  const { attemptId = '' } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .result(attemptId)
      .then((r) => {
        setResult(r);
        void writeJson(FIRST_OPEN_KEY, true);
        track('result_viewed', { attemptId, splitShown: r.split.minimumSampleMet });
      })
      .catch((e: Error) => setError(e instanceof ApiError && e.status === 404 ? 'That result is not available on this device.' : e.message));
  };
  useEffect(load, [attemptId]);

  const home = () => router.replace('/');
  if (error) {
    return (
      <Screen>
        <TopBar title="Your result" onBack={home} />
        <ErrorPanel message={error} onRetry={load} />
      </Screen>
    );
  }
  if (!result) return <Loading label="Comparing passes" />;

  const faceOf = new Map(result.puzzle.tiles.map((t) => [t.instanceId, t.faceCode]));
  const faces = (ids: string[]) => ids.map((id) => faceOf.get(id) ?? '');
  const { suggestion, split, progress } = result;
  const mine = new Set(result.attempt.tileInstanceIds);
  const shown = new Set([...result.attempt.tileInstanceIds, ...suggestion.tileInstanceIds]);
  const rows = split.rows.filter((r) => shown.has(r.tileInstanceId)).sort((a, b) => b.rate - a.rate);

  return (
    <Screen
      footer={
        <>
          <Button title="Make my clip" icon="arrow" onPress={() => router.push(`/clip/${result.attempt.id}`)} testID="make-clip" />
          {!result.attempt.isDaily && <Button title="Play today's rack" variant="secondary" onPress={home} />}
        </>
      }
    >
      <TopBar title="Your result" onBack={home} />
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Display center>{result.alignmentCopy}</Display>
        <Badge label={result.section.label} />
      </View>

      <View style={styles.compare}>
        <PassCard title="Your pass" faces={faces(result.attempt.tileInstanceIds)} />
        <PassCard title={suggestion.label} faces={faces(suggestion.tileInstanceIds)} note={result.section.id !== result.suggestedSection.id ? `aiming for ${result.suggestedSection.label}` : undefined} />
      </View>
      {result.poster && <PassCard title="The pass that was shared with you" faces={faces(result.poster.tileInstanceIds)} half />}

      <Card tone="sage">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Icon name="leaf" size={28} />
          <View style={{ flex: 1, gap: 4 }}>
            <Body bold style={{ fontSize: 17 }}>
              {suggestion.headline}
            </Body>
            <Body>{suggestion.explanation}</Body>
          </View>
        </View>
        {suggestion.tileInstanceIds.map((id) => (
          <View key={id} style={styles.reason} accessible accessibilityLabel={`${spokenLabel(faceOf.get(id) ?? '')}: ${suggestion.reasons[id]}`}>
            <Tile face={faceOf.get(id) ?? ''} width={34} flat />
            <Body style={{ flex: 1 }}>{suggestion.reasons[id]}</Body>
          </View>
        ))}
        {result.alternates[0] && (
          <Body small>
            <Text style={{ fontWeight: '700' }}>Also strong: </Text>
            {result.alternates[0].note}
          </Body>
        )}
      </Card>

      <View style={{ gap: 10 }}>
        <Heading>The community split</Heading>
        {split.minimumSampleMet ? (
          <>
            <Body small muted>
              Share of {split.eligibleAttemptCount} players passing each tile (counted separately)
            </Body>
            {rows.map((r) => (
              <View key={r.tileInstanceId} style={styles.splitRow} accessible accessibilityLabel={`${spokenLabel(faceOf.get(r.tileInstanceId) ?? '')}: ${formatRate(r.rate)} passed it${mine.has(r.tileInstanceId) ? ', you passed it too' : ''}`}>
                <Tile face={faceOf.get(r.tileInstanceId) ?? ''} width={30} flat />
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.round(r.rate * 100)}%`, backgroundColor: mine.has(r.tileInstanceId) ? colors.primary : '#B98BB5' }]} />
                </View>
                <Text style={styles.rate}>{formatRate(r.rate)}</Text>
              </View>
            ))}
            {split.syntheticAttemptCount > 0 && <Notice>Includes {split.syntheticAttemptCount} demo answers for testing.</Notice>}
          </>
        ) : (
          <Card>
            <Body bold>More players are weighing in.</Body>
            <Body small muted>
              {split.eligibleAttemptCount} {split.eligibleAttemptCount === 1 ? 'answer' : 'answers'} so far. The split appears once {split.threshold} players have passed.
            </Body>
          </Card>
        )}
      </View>

      {result.attempt.isDaily && progress.streak > 0 && (
        <Card tone="pink" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Icon name="flame" size={36} color="#D9475A" />
          <View style={{ flex: 1 }}>
            <Text style={styles.streak}>
              {progress.streak} {progress.streak === 1 ? 'day' : 'days'}. {progress.streak === 1 ? 'A fresh start.' : 'Nicely played.'}
            </Text>
            <Body small muted>
              {progress.milestone ? 'A milestone worth sharing.' : 'Keep the momentum going.'}
            </Body>
          </View>
        </Card>
      )}
      {!result.review.teacherReviewed && <Notice tone="warn">Practice rack: this suggestion has not been reviewed by a teacher yet.</Notice>}
    </Screen>
  );
}

function PassCard({ title, faces, note, half }: { title: string; faces: string[]; note?: string; half?: boolean }) {
  return (
    <Card style={[{ flex: half ? undefined : 1, padding: 12 }, half && { alignSelf: 'flex-start' }]}>
      <Text style={styles.passTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={`${title}: ${faces.map(spokenLabel).join(', ')}`}>
        {faces.map((f, i) => (
          <Tile key={`${f}-${i}`} face={f} width={40} flat />
        ))}
      </View>
      {note && (
        <Body small muted>
          {note}
        </Body>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  compare: { flexDirection: 'row', gap: 10 },
  passTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#EBE8DF', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  rate: { width: 48, textAlign: 'right', fontSize: 17, fontWeight: '700', color: colors.ink },
  streak: { fontFamily: fonts.serif, fontSize: 22, color: colors.primary },
});
