import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LESSONS } from '../../lessons/content.ts';
import { useLessonProgress } from '../../lessons/progress.ts';
import { Body, Button, Card, Display, Eyebrow, Icon, Row, Screen, TopBar } from '../../components/ui.tsx';
import { colors } from '../../theme.ts';

// Every lesson in order, with ticks for the ones finished on this device. Works offline.

export default function LessonsScreen() {
  const router = useRouter();
  const { done, loaded } = useLessonProgress();
  const finished = LESSONS.filter((l) => done.has(l.id)).length;
  const nextUp = LESSONS.find((l) => !done.has(l.id));
  const minutes = LESSONS.reduce((n, l) => n + l.minutes, 0);

  return (
    <Screen>
      <TopBar title="Lessons" onBack={() => (router.canGoBack() ? router.back() : router.replace('/play'))} />
      <View>
        <Eyebrow>Learn American mahjong</Eyebrow>
        <Display size={34}>From the tiles to scoring</Display>
        <Body muted>Short lessons with a quick check in each. They work offline, and your progress stays on this device.</Body>
      </View>

      <Card tone="sage" style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.count} testID="lessons-count">
            {loaded ? `${finished} of ${LESSONS.length} done` : ' '}
          </Text>
          <Body small muted>
            About {minutes} minutes in all
          </Body>
        </Row>
        <View
          style={styles.bar}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${finished} of ${LESSONS.length} lessons done`}
          accessibilityValue={{ min: 0, max: LESSONS.length, now: finished }}
        >
          <View style={[styles.barFill, { width: `${(finished / LESSONS.length) * 100}%` }]} />
        </View>
        {loaded && nextUp ? (
          <Button
            title={finished === 0 ? 'Start with lesson 1' : `Continue: ${nextUp.title}`}
            icon="arrow"
            onPress={() => router.push(`/lessons/${nextUp.id}`)}
            testID="lessons-continue"
          />
        ) : null}
        {loaded && !nextUp ? <Body>All done. Replay any lesson whenever you like, or put it to work at the table.</Body> : null}
      </Card>

      <View style={{ gap: 10 }}>
        {LESSONS.map((lesson, i) => {
          const isDone = done.has(lesson.id);
          return (
            <Pressable
              key={lesson.id}
              testID={`lesson-row-${lesson.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Lesson ${i + 1}: ${lesson.title}. ${lesson.summary} ${lesson.minutes} minutes.${isDone ? ' Done.' : ''}`}
              onPress={() => router.push(`/lessons/${lesson.id}`)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.sage }]}
            >
              <View style={[styles.number, isDone && styles.numberDone]}>
                {isDone ? <Icon name="check" size={18} color="#fff" /> : <Text style={styles.numberText}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{lesson.title}</Text>
                <Body small muted>
                  {lesson.summary}
                </Body>
              </View>
              <View style={styles.meta}>
                <Text style={styles.minutes}>{lesson.minutes} min</Text>
                <Icon name="chevron" size={18} color={colors.muted} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {loaded && !nextUp ? <Button title="Play the computer" variant="secondary" icon="play" onPress={() => router.dismissTo('/play')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 17, fontWeight: '700', color: colors.ink },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  number: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  numberDone: { backgroundColor: colors.online },
  numberText: { fontSize: 15, fontWeight: '800', color: colors.ink },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  minutes: { fontSize: 13, fontWeight: '600', color: colors.muted },
});
