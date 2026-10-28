import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLayout } from '../../lib/layout.ts';
import { useFocusEffect, useRouter } from 'expo-router';
import { FEATURES, spokenLabel } from '@daily-rack/core';
import { DAILY_TURNS } from '@daily-rack/core/mahjong';
import { api, type Daily, type NightSummary, type TableSummary } from '../../lib/api.ts';
import { formatWhen } from '../../lib/dates.ts';
import { discardsKey, draftKey, readJson, type DiscardsSave, type Draft } from '../../lib/storage.ts';
import { Badge, Body, Button, Card, Columns, Display, ErrorPanel, Eyebrow, Icon, Loading, Screen, type IconName } from '../../components/ui.tsx';
import { Tile } from '../../components/Tile.tsx';
import { LinkCard } from '../../components/LinkCard.tsx';
import { PipSays } from '../../components/Pip.tsx';
import { LESSONS } from '../../lessons/content.ts';
import { useLessonProgress } from '../../lessons/progress.ts';
import { colors, fonts } from '../../theme.ts';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** A friendly-looking hand for the Today hero while the daily rack is switched off. */
const SAMPLE_RACK = ['FLOWER_1', 'FLOWER_2', 'BAMBOO_2', 'DRAGON_WHITE', 'BAMBOO_2', 'BAMBOO_6', 'CHARACTER_2', 'CHARACTER_2', 'CHARACTER_2', 'DOT_6', 'DOT_6', 'DOT_6', 'JOKER'];

export default function TodayScreen() {
  const router = useRouter();
  const layout = useLayout();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [discards, setDiscards] = useState<DiscardsSave | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<TableSummary[]>([]);
  const [night, setNight] = useState<NightSummary | null>(null);
  const lessons = useLessonProgress();

  const load = useCallback(() => {
    setError(null);
    // Games waiting on you and the next game night. Today still works if these fail.
    api
      .tables()
      .then((r) => setWaiting(r.tables.filter((t) => t.yourMove || t.invited).slice(0, 3)))
      .catch(() => undefined);
    api
      .nights()
      .then((r) => {
        const now = Date.now();
        const upcoming = r.nights
          .filter((n) => n.status === 'confirmed' && n.when && new Date(n.when).getTime() > now && n.myRsvp !== 'no')
          .sort((a, b) => a.when!.localeCompare(b.when!));
        setNight(upcoming[0] ?? r.nights.find((n) => n.status === 'polling') ?? null);
      })
      .catch(() => undefined);
    if (!FEATURES.dailyRack) return;
    api
      .daily()
      .then(async (d) => {
        // Everyone lands here, new players included: the rack sits next to Pip's lessons.
        if (d.puzzle) {
          setHasDraft(((await readJson<Draft | null>(draftKey(d.puzzle.revisionId), null))?.selected.length ?? 0) > 0);
          const saved = await readJson<DiscardsSave | null>(discardsKey(d.puzzle.revisionId), null);
          setDiscards(Array.isArray(saved?.picks) && Array.isArray(saved.best) ? saved : null);
        }
        setDaily(d);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  if (error) {
    return (
      <Screen>
        <Wordmark streak={0} />
        <ErrorPanel message={error} onRetry={load} />
      </Screen>
    );
  }
  if (FEATURES.dailyRack && !daily) return <Loading label="Dealing today's rack" />;

  const streak = daily?.progress?.streak ?? 0;
  const puzzle = daily?.puzzle;
  // On a wide screen the rack sits in the left of two columns.
  const rackSpace = layout.wide ? (layout.wideColumn - 56 - 22) / 2 : layout.contentWidth;
  const tileWidth = Math.min(44, Math.floor((rackSpace - 28 - 12 * 2) / 13));
  const played = discards?.picks.length ?? 0;
  const action = daily?.attemptId ? (played === 0 ? 'Play it on: three discards' : played < DAILY_TURNS ? 'Finish your discards' : 'See your result') : hasDraft ? 'Resume your rack' : "Play today's rack";
  const go = () => (daily?.attemptId ? router.push(`/result/${daily.attemptId}${played < DAILY_TURNS ? '?play=discards' : ''}`) : router.push('/rack'));

  return (
    <Screen wide>
      <Wordmark streak={streak} onStreak={() => router.push('/you')} />
      <Columns
        left={
          <>
            {!daily ? (
              <>
                <View>
                  <Eyebrow>Welcome to the table</Eyebrow>
                  <Display size={40}>Pull up a chair</Display>
                  <Body>Play the computer, a quick match, or a game with friends.</Body>
                </View>
                <View style={styles.hero}>
                  <View style={styles.rack} accessible={false} importantForAccessibility="no-hide-descendants">
                    {SAMPLE_RACK.map((face, i) => (
                      <Tile key={i} face={face} width={tileWidth} flat />
                    ))}
                  </View>
                  <Button title="Play a game" icon="arrow" onPress={() => router.push('/play')} testID="today-primary" />
                </View>
              </>
            ) : puzzle ? (
              <>
                <View>
                  <Eyebrow>Today's rack</Eyebrow>
                  <Display size={40}>{puzzle.title}</Display>
                  <Body>The first Charleston is about to pass. Pick three, then play on for three discards.</Body>
                </View>
                <View style={styles.hero} testID="today-rack">
                  <View style={styles.rack} accessible accessibilityLabel={`Today's deal: ${puzzle.tiles.map((t) => spokenLabel(t.faceCode)).join(', ')}`}>
                    {puzzle.tiles.map((t) => (
                      <Tile key={t.instanceId} face={t.faceCode} width={tileWidth} flat />
                    ))}
                  </View>
                  {daily?.attemptId && discards && played > 0 && (
                    <Text style={styles.heroNote} testID="today-discards">
                      {played < DAILY_TURNS
                        ? `${played} of ${DAILY_TURNS} discards played. Your hand is waiting.`
                        : `Discards ${discards.best.map((b) => (b ? '🟩' : '⬜')).join('')}  ${discards.best.filter(Boolean).length} of ${DAILY_TURNS} best`}
                    </Text>
                  )}
                  <Button title={action} icon="arrow" onPress={go} testID="today-primary" />
                </View>
              </>
            ) : (
              <Card>
                <Display size={28}>The next rack is on its way</Display>
                <Body muted>
                  It lands {new Date(daily.nextPublicationAt).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.
                </Body>
              </Card>
            )}

            {lessons.loaded && lessons.done.size < LESSONS.length && (
              <Pressable onPress={() => router.push('/learn')} accessibilityRole="button" accessibilityLabel="Learn to play with Pip" testID="today-learn">
                <Card tone="sage">
                  <PipSays mood={lessons.done.size === 0 ? 'wave' : 'happy'}>
                    {lessons.done.size === 0
                      ? 'New to mahjong? I’ll teach you, one small step at a time. Tap to start!'
                      : `You’re ${lessons.done.size} of ${LESSONS.length} lessons in. Tap to keep going!`}
                  </PipSays>
                </Card>
              </Pressable>
            )}
          </>
        }
        right={
          <>
            {(waiting.length > 0 || night) && (
              <View style={{ gap: 10 }} testID="today-waiting">
                <Eyebrow>Waiting on you</Eyebrow>
                {waiting.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.yourMove ? 'Your move' : 'Invitation'}: table with ${t.players.join(', ')}`}
                    onPress={() => router.push(`/table/${t.id}`)}
                    style={({ pressed }) => [styles.linkCard, pressed && { backgroundColor: colors.sage }]}
                  >
                    <View style={styles.linkIcon}>
                      <Icon name="play" color={colors.ink} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkTitle} numberOfLines={1}>
                        {t.players.filter((p) => p !== 'Open seat').map((p) => p.replace(' (computer)', '')).join(' · ')}
                      </Text>
                      <Body small muted>
                        {t.kind === 'public' ? (t.ranked ? 'Ranked' : 'Quick match') : t.mode === 'live' ? 'Live' : 'Turn-based'} · {t.status === 'lobby' ? 'Waiting to start' : `Hand ${t.handNumber}`}
                      </Body>
                    </View>
                    <Badge label={t.yourMove ? 'Your move' : 'Invited'} tone={t.yourMove ? 'pink' : 'ink'} />
                  </Pressable>
                ))}
                {night && (
                  <LinkCard
                    icon="calendar"
                    title={night.title}
                    body={night.status === 'confirmed' && night.when ? `${formatWhen(night.when, night.timeZone, 'short')} · ${night.going} going` : 'Still picking a time. Vote on the dates that work.'}
                    onPress={() => router.push(`/night/${night.id}`)}
                  />
                )}
              </View>
            )}

            {daily?.progress && (
              <Card>
                <Text style={styles.cardTitle}>This week's rhythm</Text>
                <View style={styles.week}>
                  {daily.progress.week.map((d, i) => {
                    const today = d.day === daily.contentDay;
                    return (
                      <View
                        key={d.day}
                        style={[styles.day, d.done && styles.dayDone, today && styles.dayToday]}
                        accessible
                        accessibilityLabel={`${new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long' })}: ${d.done ? 'played' : 'not played'}`}
                      >
                        <Text style={[styles.dayText, today && { color: '#fff' }]}>{LETTERS[i]}</Text>
                        <View style={[styles.dot, d.done && { backgroundColor: today ? '#fff' : colors.ink }]} />
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {daily && <LinkCard icon="play" title="Play a game" body="Sit down at a table with friends or the computer." onPress={() => router.push('/play')} />}
            <LinkCard icon="leaf" title="Practice round with Pip" body="An untimed hand where Pip coaches every move. Ready before your group is." onPress={() => router.push('/practice')} testID="today-practice" />
            <LinkCard icon="calendar" title="Plan a game night" body="Find a date that works for your group." onPress={() => router.push('/nights')} />
          </>
        }
      />
    </Screen>
  );
}

function Wordmark({ streak, onStreak }: { streak: number; onStreak?: () => void }) {
  return (
    <View style={styles.wordmarkRow}>
      <Text style={styles.wordmark} accessibilityRole="header">
        Daily Rack
      </Text>
      {streak > 0 && (
        <Pressable onPress={onStreak} accessibilityRole="button" accessibilityLabel={`${streak} day streak`} style={styles.streak}>
          <Icon name="flame" size={16} color={colors.primary} />
          <Text style={styles.streakText}>{streak} day streak</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmarkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  wordmark: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  streakText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  hero: { backgroundColor: colors.felt, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 14, gap: 22 },
  heroNote: { color: colors.feltText, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  rack: { flexDirection: 'row', justifyContent: 'center', gap: 2, backgroundColor: '#B07E4A', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 6, borderBottomColor: '#8A5D30' },
  cardTitle: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  week: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1EFE8' },
  dayDone: { backgroundColor: colors.sage },
  dayToday: { backgroundColor: colors.primary },
  dayText: { fontWeight: '600', color: colors.muted, fontSize: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CFD5CF' },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 72 },
  linkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
