import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLayout } from '../../lib/layout.ts';
import { useFocusEffect, useRouter } from 'expo-router';
import { FEATURES } from '@daily-rack/core';
import { api, type Daily } from '../../lib/api.ts';
import { useSession } from '../../lib/session.tsx';
import { track } from '../../lib/analytics.ts';
import { LESSONS, type Lesson } from '../../lessons/content.ts';
import { useLessonProgress } from '../../lessons/progress.ts';
import { Body, Button, Card, Display, ErrorPanel, Eyebrow, Icon, Screen, Sheet, type IconName } from '../../components/ui.tsx';
import { LinkCard } from '../../components/LinkCard.tsx';
import { Pip, PipSays } from '../../components/Pip.tsx';
import { CardView } from '../../game/CardView.tsx';
import { HowToPlay } from '../../game/HowToPlay.tsx';
import { colors, fonts } from '../../theme.ts';

// Learn to play: a friendly path from the very first tile to a whole game, with Pip as the
// guide. Lessons and practice alternate; everything is open, and Pip points at what's next.

interface Practice {
  id: string;
  title: string;
  detail: string;
  icon: IconName;
  go: 'rack' | 'easy' | 'steady';
}

interface Unit {
  title: string;
  blurb: string;
  lessons: string[];
  practice?: Practice;
}

const UNITS: Unit[] = [
  { title: 'Meet the tiles', blurb: 'What’s in the set, and how to read the card.', lessons: ['tiles', 'card'] },
  {
    title: 'Before play begins',
    blurb: 'The deal, the Charleston and the courtesy pass.',
    lessons: ['deal', 'charleston', 'courtesy'],
    practice: FEATURES.dailyRack
      ? { id: 'practice-rack', title: 'Pass three tiles', detail: 'Today’s rack is a Charleston pass. About a minute.', icon: 'flame', go: 'rack' }
      : undefined,
  },
  {
    title: 'Your turn',
    blurb: 'Drawing, discarding, calling, and the magic of jokers.',
    lessons: ['calling', 'jokers', 'exposed'],
    practice: { id: 'practice-easy', title: 'A gentle practice game', detail: 'Easy computer players. Take all the time you like.', icon: 'play', go: 'easy' },
  },
  {
    title: 'Playing to win',
    blurb: 'Picking a hand, scoring, and keeping out of trouble.',
    lessons: ['choosing', 'scoring'],
    practice: { id: 'practice-steady', title: 'Your first full game', detail: 'Steady computer players, start to finish. You’ve got this!', icon: 'card', go: 'steady' },
  },
];

const byId = new Map(LESSONS.map((l, i) => [l.id, { lesson: l, number: i + 1 }]));
/** The winding path: how far each node sits from the middle, as a share of the half-width. */
const WIND = [0, 0.42, 0.62, 0.42, 0, -0.42, -0.62, -0.42];

function Pulse({ size, color }: { size: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 4,
        borderColor: color,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}

function Node({
  state,
  label,
  icon,
  number,
  onPress,
  testID,
  a11y,
  pip,
}: {
  pip?: { side: 'left' | 'right'; text: string };
  state: 'done' | 'next' | 'open' | 'practice';
  label: string;
  icon?: IconName;
  number?: number;
  onPress: () => void;
  testID?: string;
  a11y: string;
}) {
  const fill = state === 'done' ? colors.gold : state === 'next' ? colors.primary : state === 'practice' ? colors.felt : '#E9E4D8';
  const edge = state === 'done' ? '#C99A2E' : state === 'next' ? colors.primaryPressed : state === 'practice' ? colors.feltDark : '#D3CCBC';
  const ink = state === 'open' ? colors.muted : '#fff';
  return (
    <View style={styles.nodeWrap}>
      {pip && <NextPip side={pip.side} text={pip.text} />}
      <View style={styles.nodeHit}>
        {state === 'next' && <Pulse size={NODE} color={colors.primary} />}
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          testID={testID}
          style={({ pressed }) => [styles.node, { backgroundColor: fill, borderBottomColor: edge, transform: [{ translateY: pressed ? 4 : 0 }], borderBottomWidth: pressed ? 2 : 6 }]}
        >
          {state === 'done' ? (
            <Icon name="check" size={30} color={ink} />
          ) : icon ? (
            <Icon name={icon} size={28} color={ink} />
          ) : (
            <Text style={[styles.nodeNumber, { color: ink }]}>{number}</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.nodeLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export default function LearnScreen() {
  const router = useRouter();
  const { contentWidth } = useLayout();
  const { profile, offline } = useSession();
  const { done, loaded } = useLessonProgress();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [sheet, setSheet] = useState<'card' | 'words' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const fill = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      if (!FEATURES.dailyRack) return;
      api
        .daily()
        .then(setDaily)
        .catch(() => undefined);
    }, []),
  );

  const finished = LESSONS.filter((l) => done.has(l.id)).length;
  const next: Lesson | undefined = LESSONS.find((l) => !done.has(l.id));
  useEffect(() => {
    if (!loaded) return;
    Animated.timing(fill, { toValue: finished / LESSONS.length, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [finished, loaded, fill]);

  const practise = async (p: Practice) => {
    track('learn_practice', { kind: p.go });
    if (p.go === 'rack') return router.push(daily?.attemptId ? `/result/${daily.attemptId}` : '/rack');
    if (offline) return router.push('/offline');
    setStarting(p.id);
    setError(null);
    try {
      const level = p.go === 'easy' ? 'easy' : 'normal';
      const created = await api.createTable({ mode: 'turn', seats: [{ type: 'bot', level }, { type: 'bot', level }, { type: 'bot', level }] });
      router.push(`/table/${created.table.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(null);
    }
  };

  const half = Math.min(contentWidth, 520) / 2 - NODE / 2 - 8;
  const first = profile?.name && !/^Player [0-9A-F]{4}$/i.test(profile.name) ? profile.name.split(' ')[0] : null;
  const greeting = !loaded
    ? ' '
    : finished === 0
      ? `Hi${first ? ` ${first}` : ''}! I’m Pip. Mahjong means “sparrow,” so I’m the right bird to teach you. Let’s start with the tiles!`
      : next
        ? `Welcome back${first ? `, ${first}` : ''}! Next up: “${next.title}.” It takes about ${next.minutes} minutes.`
        : `You’ve learned the whole game! Keep your skills sharp with ${FEATURES.dailyRack ? 'today’s rack and ' : ''}a game or two.`;

  let index = 0;
  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <Eyebrow>Learn to play</Eyebrow>
        <Display size={38}>Learn with Pip</Display>
      </View>

      <Card tone="sage" style={{ gap: 12 }}>
        <PipSays mood={finished === 0 ? 'wave' : next ? 'happy' : 'proud'} testID="learn-greeting">
          {greeting}
        </PipSays>
        <View style={styles.progressRow}>
          <View
            style={styles.bar}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${finished} of ${LESSONS.length} lessons done`}
            accessibilityValue={{ min: 0, max: LESSONS.length, now: finished }}
          >
            <Animated.View style={[styles.barFill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
          <Text style={styles.progressText} testID="lessons-count">
            {loaded ? `${finished}/${LESSONS.length}` : ' '}
          </Text>
        </View>
        {loaded && next && (
          <Button
            title={finished === 0 ? 'Start lesson 1' : `Continue: ${next.title}`}
            icon="arrow"
            onPress={() => router.push(`/lessons/${next.id}`)}
            testID="lessons-continue"
          />
        )}
      </Card>

      {daily?.puzzle && (
        <LinkCard
          icon="flame"
          title={daily.attemptId ? 'Today’s rack: done!' : 'Daily practice: today’s rack'}
          body={daily.attemptId ? `${daily.progress?.streak ?? 1}-day streak. See how others passed.` : 'Pick three tiles to pass. About a minute.'}
          onPress={() => router.push(daily.attemptId ? `/result/${daily.attemptId}` : '/rack')}
          testID="learn-daily"
        />
      )}
      {error && <ErrorPanel message={error} />}

      {UNITS.map((unit, u) => (
        <View key={unit.title} style={{ gap: 14 }}>
          <View style={[styles.unit, { backgroundColor: UNIT_COLORS[u % UNIT_COLORS.length] }]}>
            <Text style={styles.unitEyebrow}>Unit {u + 1}</Text>
            <Text style={styles.unitTitle}>{unit.title}</Text>
            <Text style={styles.unitBlurb}>{unit.blurb}</Text>
          </View>
          {unit.lessons.map((id) => {
            const entry = byId.get(id);
            if (!entry) return null;
            const { lesson, number } = entry;
            const isNext = next?.id === id;
            const offset = WIND[index++ % WIND.length]! * half;
            const state = done.has(id) ? 'done' : isNext ? 'next' : 'open';
            return (
              <View key={id} style={[styles.row, { transform: [{ translateX: offset }] }]}>
                <Node
                  state={state}
                  number={number}
                  label={lesson.title}
                  onPress={() => router.push(`/lessons/${id}`)}
                  testID={`lesson-row-${id}`}
                  a11y={`Lesson ${number}: ${lesson.title}. ${lesson.summary} ${lesson.minutes} minutes.${state === 'done' ? ' Done.' : isNext ? ' Up next.' : ''}`}
                  pip={isNext ? { side: offset >= 0 ? 'left' : 'right', text: finished === 0 ? 'Start here!' : 'Up next!' } : undefined}
                />
              </View>
            );
          })}
          {unit.practice && (
            <View style={[styles.row, { transform: [{ translateX: WIND[index++ % WIND.length]! * half }] }]}>
              <Node
                state="practice"
                icon={unit.practice.icon}
                label={starting === unit.practice.id ? 'Setting up…' : unit.practice.title}
                onPress={() => void practise(unit.practice!)}
                testID={unit.practice.id}
                a11y={`Practice: ${unit.practice.title}. ${unit.practice.detail}`}
              />
            </View>
          )}
        </View>
      ))}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Eyebrow>Keep handy</Eyebrow>
        <LinkCard icon="card" title="The house card" body="Every winning hand, with what each one is worth." onPress={() => setSheet('card')} testID="learn-card" />
        <LinkCard icon="help" title="Words you’ll hear" body="Charleston, pung, joker swap and friends, in plain English." onPress={() => setSheet('words')} />
      </View>
      <Body small muted center>
        Lessons work offline, and your progress stays on this phone.
      </Body>

      <Sheet visible={sheet === 'card'} title="House card" onClose={() => setSheet(null)}>
        <CardView />
      </Sheet>
      <HowToPlay visible={sheet === 'words'} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function NextPip({ side, text }: { side: 'left' | 'right'; text: string }) {
  return (
    <View style={[styles.nextPip, side === 'left' ? { right: 112 } : { left: 112 }]} pointerEvents="none">
      <Pip mood="wave" size={58} />
      <View style={styles.startTag}>
        <Text style={styles.startText}>{text}</Text>
      </View>
    </View>
  );
}

const NODE = 72;
const UNIT_COLORS = ['#2E8B57', colors.primary, '#1B4F9C', '#B9773F'];

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { flex: 1, height: 14, borderRadius: 7, backgroundColor: '#fff', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 7 },
  progressText: { fontSize: 15, fontWeight: '800', color: colors.ink, minWidth: 40, textAlign: 'right' },
  unit: { borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  unitEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  unitTitle: { color: '#fff', fontFamily: fonts.serif, fontSize: 24 },
  unitBlurb: { color: 'rgba(255,255,255,0.92)', fontSize: 15 },
  row: { alignItems: 'center', justifyContent: 'center' },
  nodeWrap: { alignItems: 'center', width: 132, gap: 6 },
  nodeHit: { width: NODE, height: NODE + 6, alignItems: 'center', justifyContent: 'flex-start' },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 6 },
  nodeNumber: { fontSize: 24, fontWeight: '800' },
  nodeLabel: { fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  nextPip: { position: 'absolute', top: 0, alignItems: 'center', width: 80 },
  startTag: { backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: -2 },
  startText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
