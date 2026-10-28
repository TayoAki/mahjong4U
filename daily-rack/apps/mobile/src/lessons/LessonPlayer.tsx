import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { spokenLabel } from '@daily-rack/core';
import { HOUSE_CARD } from '@daily-rack/core/mahjong';
import { Tile, TileButton } from '../components/Tile.tsx';
import { Body, Button, Card, Display, Eyebrow, Icon, Row, Screen, TopBar } from '../components/ui.tsx';
import { Pattern } from '../game/CardView.tsx';
import { Pip } from '../components/Pip.tsx';
import { Confetti } from '../components/Confetti.tsx';
import { celebrateHaptic } from '../lib/celebrate.ts';
import { colors } from '../theme.ts';
import type { CheckResult, Face, Lesson, Option, Step, Visual } from './content.ts';

// Plays one lesson a step at a time: read a little, then answer a quick check. A check
// has to be answered right before Next unlocks, with as many tries as it takes. Lesson
// tiles are face codes, so labels come from spokenLabel (what tileName uses for engine ids).

type ChooseStep = Extract<Step, { kind: 'choose' }>;
type PickStep = Extract<Step, { kind: 'pick' }>;

interface Answer {
  /** Options tapped so far; the last one is the current answer. */
  tried: number[];
  /** Rack positions picked. */
  picked: number[];
  /** Verdict from the last Check. */
  result: CheckResult | null;
  /** A passing hint, such as "jokers can't be passed". */
  note: string | null;
}

const EMPTY: Answer = { tried: [], picked: [], result: null, note: null };
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const GROUP_GAP = 8;

function isSolved(step: Step, answer: Answer): boolean {
  if (step.kind === 'read') return true;
  if (step.kind === 'choose') {
    const current = answer.tried.at(-1);
    return current !== undefined && step.options[current]?.correct === true;
  }
  return answer.result?.ok === true;
}

/** Width of the content column inside Screen: 20 px gutters, 560 px at most. */
function useColumnWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, 560) - 40;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** "Two dot, 4 tiles; Flower, 2 tiles" for screen readers. */
function describeGroups(groups: Face[][]): string {
  return groups
    .map((g) => {
      const names = g.map(spokenLabel);
      return names.length > 1 && names.every((n) => n === names[0]) ? `${names[0]}, ${names.length} tiles` : names.join(', ');
    })
    .join('; ');
}

/** "F F, 2 2 2 2, 4 4" so a screen reader doesn't read 2222 as a number. */
function spokenPattern(pattern: string): string {
  const digits: Record<string, string> = { x: '1', y: '2', z: '3', u: '4', v: '5' };
  return pattern
    .split(' ')
    .map((token) => [...token.replace(/[abc]$/, '').replace(/[xyzuv]/g, (ch) => digits[ch]!)].join(' '))
    .join(', ');
}

// ------------------------------------------------------------------ pictures

/** Widest tile that fits one row of groups. */
function groupRowWidth(row: Face[][], avail: number): number {
  const count = row.reduce((n, g) => n + g.length, 0);
  const gaps = (row.length - 1) * GROUP_GAP + (count - row.length);
  return Math.floor((avail - gaps) / Math.max(1, count));
}

/**
 * A hand laid out group by group. A whole hand in one row gets too small to read on a
 * phone, so it splits into two rows at the group break that keeps the tiles largest.
 */
function TileGroups({ groups, avail }: { groups: Face[][]; avail: number }) {
  let rows = [groups];
  let width = groupRowWidth(groups, avail);
  if (width < 28 && groups.length > 1) {
    for (let i = 1; i < groups.length; i++) {
      const split = Math.min(groupRowWidth(groups.slice(0, i), avail), groupRowWidth(groups.slice(i), avail));
      if (split > width) {
        width = split;
        rows = [groups.slice(0, i), groups.slice(i)];
      }
    }
  }
  const size = clamp(width, 18, 40);
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`Tiles: ${describeGroups(groups)}`}>
      {rows.map((row, r) => (
        <View key={r} style={styles.groups}>
          {row.map((g, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 1 }}>
              {g.map((face, j) => (
                <Tile key={j} face={face} width={size} flat />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Loose tiles. Up to 7 a row in even rows (13 tiles sit 7 + 6), or one small left-aligned
 * row when `compact`, as inside an answer.
 */
function TileRow({ faces, avail, compact }: { faces: Face[]; avail: number; compact?: boolean }) {
  const gap = compact ? 2 : 6;
  const perRow = compact ? faces.length : Math.ceil(faces.length / Math.ceil(faces.length / 7));
  const width = clamp(Math.floor((avail - (perRow - 1) * gap) / Math.max(1, perRow)), compact ? 16 : 22, compact ? 30 : 48);
  return (
    <View
      style={[styles.row, { gap }, compact ? { justifyContent: 'flex-start' } : { width: perRow * width + (perRow - 1) * gap, alignSelf: 'center' }]}
      accessible
      accessibilityLabel={`Tiles: ${faces.map(spokenLabel).join(', ')}`}
    >
      {faces.map((face, i) => (
        <Tile key={i} face={face} width={width} flat />
      ))}
    </View>
  );
}

/** One line of the house card: section, pattern in suit colors, note, X or C and points. */
function CardLine({ id, compact }: { id: string; compact?: boolean }) {
  const hand = HOUSE_CARD.hands.find((h) => h.id === id);
  if (!hand) return null;
  const section = HOUSE_CARD.sections.find((s) => s.id === hand.section)?.label ?? '';
  return (
    <View
      style={[styles.cardLine, compact && styles.cardLineCompact]}
      accessible={!compact}
      accessibilityLabel={`Card hand, ${section}: ${spokenPattern(hand.pattern)}. ${hand.note ? `${hand.note}. ` : ''}${hand.concealed ? 'C, concealed' : 'X, may be exposed'}, ${hand.value} points.`}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {!compact && <Text style={styles.cardSection}>{section}</Text>}
        <Pattern pattern={hand.pattern} size={compact ? 16 : 18} />
        {hand.note ? (
          <Body small muted>
            {hand.note}
          </Body>
        ) : null}
      </View>
      <Text style={styles.cardValue}>
        {hand.concealed ? 'C' : 'X'} {hand.value}
      </Text>
    </View>
  );
}

function Visuals({ visual }: { visual: Visual }) {
  const column = useColumnWidth();
  const hasTiles = (visual.tiles?.length ?? 0) > 0 || (visual.groups?.length ?? 0) > 0;
  if (!visual.hand && !hasTiles) return null;
  const avail = column - 28;
  return (
    <View style={styles.visual}>
      {visual.hand ? <CardLine id={visual.hand} /> : null}
      {visual.caption && hasTiles ? <Text style={styles.caption}>{visual.caption}</Text> : null}
      {visual.groups?.length ? <TileGroups groups={visual.groups} avail={avail} /> : null}
      {visual.tiles?.length ? <TileRow faces={visual.tiles} avail={avail} /> : null}
    </View>
  );
}

const RIGHT = ['That’s right!', 'Nailed it!', 'Pip approves!', 'Exactly right!'];
const WRONG = ['Not quite. Try again.', 'Almost! Give it another go.', 'So close. Have another look.'];

function Feedback({ result }: { result: CheckResult }) {
  // A different cheer each time, chosen from the message so it stays put on re-render.
  const pick = (list: string[]) => list[result.message.length % list.length]!;
  return (
    <View style={[styles.feedback, result.ok ? styles.feedbackRight : styles.feedbackWrong]} accessibilityLiveRegion="polite">
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <Pip mood={result.ok ? 'cheer' : 'oops'} size={46} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.feedbackTitle, { color: result.ok ? colors.online : colors.warnInk }]}>{pick(result.ok ? RIGHT : WRONG)}</Text>
          <Text style={styles.feedbackText}>{result.message}</Text>
        </View>
      </Row>
    </View>
  );
}

const announce = (result: CheckResult) => AccessibilityInfo.announceForAccessibility(`${result.ok ? 'That’s right.' : 'Not quite.'} ${result.message}`);

// ------------------------------------------------------------------ steps

function ReadView({ step }: { step: Extract<Step, { kind: 'read' }> }) {
  return (
    <View style={{ gap: 14 }}>
      <Display size={28}>{step.title}</Display>
      {step.body.split('\n\n').map((paragraph, i) => (
        <Body key={i}>{paragraph}</Body>
      ))}
      <Visuals visual={step} />
    </View>
  );
}

function OptionButton({ option, index, state, locked, onPress }: { option: Option; index: number; state: 'idle' | 'right' | 'wrong' | 'tried'; locked: boolean; onPress: () => void }) {
  const column = useColumnWidth();
  const marked = state !== 'idle';
  const tiles = option.tiles ?? [];
  const inline = tiles.length > 0 && tiles.length <= 2;
  return (
    <Pressable
      testID={`lesson-option-${index}`}
      accessibilityRole="button"
      accessibilityLabel={`${option.label}${state === 'right' ? ', right answer' : marked ? ', not right' : ''}`}
      accessibilityState={{ selected: state === 'right' || state === 'wrong', disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        pressed && styles.optionPressed,
        state === 'right' && styles.optionRight,
        state === 'wrong' && styles.optionWrong,
        state === 'tried' && styles.optionTried,
      ]}
    >
      <View style={[styles.mark, state === 'right' && { backgroundColor: colors.online }, (state === 'wrong' || state === 'tried') && { backgroundColor: colors.warnInk }]}>
        {state === 'right' ? (
          <Icon name="check" size={16} color="#fff" />
        ) : marked ? (
          <Icon name="close" size={14} color="#fff" />
        ) : (
          <Text style={styles.markText}>{LETTERS[index] ?? index + 1}</Text>
        )}
      </View>
      {/* A tile or two sits beside the words; a longer row goes under them. */}
      {inline ? (
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {tiles.map((face, i) => (
            <Tile key={i} face={face} width={30} flat />
          ))}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 8 }}>
        {option.hand ? <CardLine id={option.hand} compact /> : <Text style={styles.optionText}>{option.label}</Text>}
        {tiles.length > 0 && !inline ? <TileRow faces={tiles} avail={column - 28 - 28 - 12} compact /> : null}
      </View>
    </Pressable>
  );
}

function ChooseView({ step, answer, onChange }: { step: ChooseStep; answer: Answer; onChange: (a: Answer) => void }) {
  const current = answer.tried.at(-1);
  const picked = current === undefined ? undefined : step.options[current];
  const solved = picked?.correct === true;
  const choose = (i: number) => {
    const option = step.options[i];
    if (solved || !option) return;
    onChange({ ...answer, tried: [...answer.tried.filter((t) => t !== i), i] });
    announce({ ok: option.correct, message: option.why });
  };
  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.prompt} accessibilityRole="header">
        {step.prompt}
      </Text>
      <Visuals visual={step} />
      <View style={{ gap: 10 }}>
        {step.options.map((option, i) => (
          <OptionButton
            key={i}
            option={option}
            index={i}
            state={i === current ? (option.correct ? 'right' : 'wrong') : answer.tried.includes(i) ? 'tried' : 'idle'}
            locked={solved}
            onPress={() => choose(i)}
          />
        ))}
      </View>
      {picked ? <Feedback result={{ ok: picked.correct, message: picked.why }} /> : null}
    </View>
  );
}

function PickView({ step, answer, onChange }: { step: PickStep; answer: Answer; onChange: (a: Answer) => void }) {
  const column = useColumnWidth();
  const solved = answer.result?.ok === true;
  // Up to 7 tiles a row, in even rows: 13 tiles sit 7 + 6, 8 tiles sit 4 + 4.
  const perRow = Math.ceil(step.rack.length / Math.ceil(step.rack.length / 7));
  const gap = 6;
  const tileWidth = clamp(Math.floor((column - 28 - (perRow - 1) * gap) / perRow), 30, 52);
  const left = step.count - answer.picked.length;

  const toggle = (i: number) => {
    if (solved) return;
    if (step.passing && step.rack[i] === 'JOKER') {
      const note = 'Jokers can’t be passed. Choose another tile.';
      onChange({ ...answer, note });
      AccessibilityInfo.announceForAccessibility(note);
      return;
    }
    const was = answer.picked;
    const picked = was.includes(i) ? was.filter((p) => p !== i) : step.count === 1 ? [i] : was.length < step.count ? [...was, i] : [...was.slice(1), i];
    // A new choice clears the last verdict, so the next Check reads the new tiles.
    onChange({ ...answer, picked, result: null, note: null });
  };

  const check = () => {
    const result = step.check(answer.picked.map((i) => step.rack[i]!));
    onChange({ ...answer, result, note: null });
    announce(result);
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.prompt} accessibilityRole="header">
        {step.prompt}
      </Text>
      <Visuals visual={step} />
      <View style={styles.felt}>
        <View style={styles.feltHead}>
          <Text style={styles.feltLabel}>YOUR TILES</Text>
          <Text style={styles.feltCount}>
            {answer.picked.length} of {step.count} chosen
          </Text>
        </View>
        <View style={[styles.rack, { gap, width: perRow * tileWidth + (perRow - 1) * gap }]}>
          {step.rack.map((face, i) => {
            const keep = step.passing === true && face === 'JOKER';
            return (
              <TileButton
                key={i}
                testID={`lesson-pick-${i}`}
                face={face}
                width={tileWidth}
                label={`${spokenLabel(face)}${keep ? ', cannot be passed' : ''}`}
                badge={keep ? 'Keep' : undefined}
                selected={answer.picked.includes(i)}
                disabled={solved}
                onPress={() => toggle(i)}
              />
            );
          })}
        </View>
        {!solved && <Text style={styles.feltHint}>{answer.note ?? 'Tap a tile to choose it. Tap it again to change your mind.'}</Text>}
      </View>
      {answer.result ? <Feedback result={answer.result} /> : null}
      {!solved && <Button title={left > 0 ? `Choose ${left} more` : 'Check'} disabled={left > 0} onPress={check} testID="lesson-check" />}
    </View>
  );
}

// ------------------------------------------------------------------ the player

function StepProgress({ index, total, check }: { index: number; total: number; check: boolean }) {
  const label = `Step ${index + 1} of ${total}${check ? ' · Quick check' : ''}`;
  return (
    <View style={{ gap: 6 }} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 1, max: total, now: index + 1 }}>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, i <= index && styles.segmentOn]} />
        ))}
      </View>
      <Text style={styles.stepCount}>{label}</Text>
    </View>
  );
}

function Finished({ lesson, number, onExit, onPractice, next, onNext }: { lesson: Lesson; number: number; onExit: () => void; onPractice?: () => void; next?: Lesson; onNext?: () => void }) {
  const practice = lesson.practice === 'table' && onPractice;
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    setBurst(1);
    celebrateHaptic();
  }, []);
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <Confetti run={burst} />
      <View style={{ alignItems: 'center' }} testID="lesson-finished">
        <Pip mood="cheer" size={120} />
      </View>
      <View style={{ gap: 6, alignItems: 'center' }}>
        <Eyebrow>Lesson {number} done</Eyebrow>
        <Display size={32} center>
          Nicely done!
        </Display>
        <Body muted center>
          You finished “{lesson.title}.” Pip is very proud. It’s ticked off on this device.
        </Body>
      </View>
      {practice ? (
        <Card tone="felt" style={{ gap: 12 }}>
          <Text style={styles.feltTitle}>Try it at the table</Text>
          <Text style={styles.feltBody}>Three computer players fill the table. Take as long as you like on every move.</Text>
          <Button title="Practice against the computer" icon="play" onPress={onPractice} testID="lesson-practice" />
        </Card>
      ) : null}
      {next && onNext ? <Button title={`Next: ${next.title}`} icon="arrow" variant={practice ? 'secondary' : 'primary'} onPress={onNext} testID="lesson-next-lesson" /> : null}
      <Button title="Back to lessons" variant={next ? 'text' : 'secondary'} onPress={onExit} testID="lesson-done" />
    </View>
  );
}

export function LessonPlayer({
  lesson,
  number,
  onComplete,
  onExit,
  onPractice,
  next,
  onNext,
}: {
  lesson: Lesson;
  /** Position in the list, from 1. */
  number: number;
  /** Called once, when the last step is finished. */
  onComplete: (id: string) => void;
  onExit: () => void;
  /** Shown at the end when the lesson has `practice: 'table'`. */
  onPractice?: () => void;
  next?: Lesson;
  onNext?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => lesson.steps.map(() => EMPTY));
  const total = lesson.steps.length;
  const step = lesson.steps[index];
  const answer = answers[index] ?? EMPTY;
  const update = (a: Answer) => setAnswers((list) => list.map((x, i) => (i === index ? a : x)));
  const canGoOn = step ? isSolved(step, answer) : false;
  const last = index === total - 1;

  const goNext = () => {
    if (!canGoOn) return;
    if (last) onComplete(lesson.id);
    setIndex(index + 1);
  };

  if (!step) {
    return (
      <Screen>
        <TopBar title={lesson.title} onBack={onExit} />
        <Finished lesson={lesson} number={number} onExit={onExit} onPractice={onPractice} next={next} onNext={onNext} />
      </Screen>
    );
  }

  // Keyed by step so each one opens scrolled to the top.
  return (
    <Screen
      key={index}
      footer={
        <Row gap={10}>
          {index > 0 ? <Button title="Back" variant="secondary" onPress={() => setIndex(index - 1)} testID="lesson-back" style={{ paddingHorizontal: 22 }} /> : null}
          <Button
            title={last ? 'Finish' : 'Next'}
            icon={last ? 'check' : undefined}
            disabled={!canGoOn}
            hint={canGoOn ? undefined : 'Answer the question to go on'}
            onPress={goNext}
            testID="lesson-next"
            style={{ flex: 1 }}
          />
        </Row>
      }
    >
      <TopBar title={lesson.title} onBack={onExit} />
      <StepProgress index={index} total={total} check={step.kind !== 'read'} />
      {step.kind === 'read' ? (
        <ReadView step={step} />
      ) : step.kind === 'choose' ? (
        <ChooseView step={step} answer={answer} onChange={update} />
      ) : (
        <PickView step={step} answer={answer} onChange={update} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
  segmentOn: { backgroundColor: colors.primary },
  stepCount: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  prompt: { fontSize: 19, lineHeight: 26, fontWeight: '700', color: colors.ink },
  visual: { backgroundColor: colors.sage, borderRadius: 16, padding: 14, gap: 12 },
  caption: { fontSize: 13, fontWeight: '700', color: colors.muted, textAlign: 'center', marginBottom: -4 },
  groups: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GROUP_GAP, rowGap: 8, justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, justifyContent: 'center' },
  cardLine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  cardLineCompact: { backgroundColor: 'transparent', padding: 0 },
  cardSection: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.primary },
  cardValue: { fontSize: 14, fontWeight: '700', color: colors.muted, minWidth: 44, textAlign: 'right' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 14 },
  optionPressed: { backgroundColor: colors.sage },
  optionRight: { borderColor: colors.online, backgroundColor: colors.sage },
  optionWrong: { borderColor: colors.warnInk, backgroundColor: colors.warnBg },
  optionTried: { opacity: 0.6 },
  optionText: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink },
  mark: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 14, fontWeight: '800', color: colors.ink },
  feedback: { borderRadius: 14, padding: 14, gap: 6 },
  feedbackRight: { backgroundColor: colors.sage },
  feedbackWrong: { backgroundColor: colors.warnBg },
  feedbackTitle: { fontSize: 16, fontWeight: '800' },
  feedbackText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  felt: { backgroundColor: colors.felt, borderRadius: 20, padding: 14, gap: 14 },
  feltHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feltLabel: { color: colors.feltText, fontSize: 13, fontWeight: '700', letterSpacing: 1.6 },
  feltCount: { color: colors.feltText, fontSize: 14 },
  rack: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, alignSelf: 'center', paddingTop: 6 },
  feltHint: { color: '#D8E3DC', textAlign: 'center', fontSize: 14 },
  feltTitle: { fontSize: 20, fontWeight: '700', color: colors.feltText },
  feltBody: { fontSize: 15, lineHeight: 21, color: 'rgba(244,239,227,0.88)' },
});
