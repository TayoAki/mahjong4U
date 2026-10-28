import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { arrangeWin, type Card, type CardHand } from '@daily-rack/core/mahjong';
import { track } from '../lib/analytics.ts';
import { celebrateHaptic } from '../lib/celebrate.ts';
import { notePractice } from '../lib/reminders.ts';
import { Body, Button, Card as Panel, Eyebrow, Heading, Row, Screen, TopBar } from '../components/ui.tsx';
import { PipSays } from '../components/Pip.tsx';
import { Confetti } from '../components/Confetti.tsx';
import { Tile } from '../components/Tile.tsx';
import { Pattern } from '../game/CardView.tsx';
import { faceOf, tileShort } from '../game/tiles.ts';
import { colors, fonts } from '../theme.ts';
import { mySeat, reviewOf, type Choice, type Decision, type PracticeSave } from './PracticeRound.ts';

// The end of a practice round: how the hand went, what you were building, how often you
// and Pip agreed, and the one decision worth another look. Then another round, or a nudge
// toward a real table.

interface Props {
  save: PracticeSave;
  card: Card;
  /** Names by engine seat. */
  nameOf: (seat: number) => string;
  onExit: () => void;
  onAgain: () => void;
  onTable: () => void;
  onTakeBack: () => void;
  onSettings: () => void;
}

const CALL_WORDS = { mahjong: 'Mahjong', expose: 'Call it', pass: 'Let it go' } as const;

/** Endings already celebrated this session, so coming back from the final table doesn't repeat it. */
const celebrated = new Set<string>();

function HandLine({ hand, card }: { hand: CardHand; card: Card }) {
  const section = card.sections.find((s) => s.id === hand.section)?.label;
  return (
    <View style={{ gap: 2 }}>
      <Pattern pattern={hand.pattern} size={18} />
      <Body small muted>
        {[section, hand.note, `${hand.value} points`].filter(Boolean).join(' · ')}
      </Body>
    </View>
  );
}

function ChoiceRow({ label, choice, detail, highlight }: { label: string; choice: Choice; detail: string; highlight?: boolean }) {
  return (
    <View style={[styles.choice, highlight && styles.choiceBest]} accessible accessibilityLabel={`${label}: ${choice.tiles.map(tileShort).join(', ')}. ${detail}`}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.tiles}>
        {choice.tiles.map((t) => (
          <Tile key={t} face={faceOf(t)} width={30} flat />
        ))}
      </View>
      <Text style={[styles.choiceDetail, highlight && { color: colors.online }]}>{detail}</Text>
    </View>
  );
}

const away = (c: Choice) => (c.distance >= 99 ? 'no hand fits' : c.distance === 0 ? 'Mahjong!' : `${c.distance} away`);

/** The decision that cost the most, as your pick beside Pip's. */
function KeyMoment({ decision: d }: { decision: Decision }) {
  let mine = `${away(d.mine)} · ${d.mine.helpers} useful tiles`;
  let pip = `${away(d.pip)} · ${d.pip.helpers} useful tiles`;
  let why: string;
  if (d.call) {
    mine = `${CALL_WORDS[d.call.mine]} · ${away(d.mine)}`;
    pip = `${CALL_WORDS[d.call.pip]} · ${away(d.pip)}`;
    why =
      d.call.pip === 'mahjong'
        ? `The ${tileShort(d.call.tile)} would have won you the hand. When a discard finishes your hand, call it!`
        : d.call.pip === 'expose'
          ? `Calling the ${tileShort(d.call.tile)} would have put you ${d.mine.distance - d.pip.distance === 1 ? 'a tile' : `${d.mine.distance - d.pip.distance} tiles`} closer.`
          : 'That call didn’t bring you closer, and it showed everyone part of your hand.';
  } else if (d.mahjong) {
    pip = 'Mahjong!';
    why = 'Your tiles already made a hand on the card. When the Mahjong button shows up, tap it!';
  } else if (d.kind === 'pass') {
    why =
      d.mine.distance > d.pip.distance
        ? `Your pass left you ${d.mine.distance} tiles away. Pip’s would have left you ${d.pip.distance}.`
        : 'Both passes left you as close, but Pip’s kept more tiles that could help.';
  } else {
    why =
      d.mine.distance > d.pip.distance
        ? `Throwing the ${tileShort(d.mine.tiles[0] ?? 0)} left you ${d.mine.distance} tiles away. The ${tileShort(d.pip.tiles[0] ?? 0)} would have kept you at ${d.pip.distance}.`
        : `Both kept you ${d.mine.distance} away, but Pip’s choice left more tiles that could help.`;
  }
  return (
    <View style={{ gap: 8 }} testID="practice-key-moment">
      <Eyebrow>{d.when}</Eyebrow>
      <ChoiceRow label="Your pick" choice={d.mine} detail={mine} />
      <ChoiceRow label="Pip’s best" choice={d.pip} detail={pip} highlight />
      <Body small>{why}</Body>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel style={{ gap: 10 }}>
      <Heading>{title}</Heading>
      {children}
    </Panel>
  );
}

export function PracticeReview({ save, card, nameOf, onExit, onAgain, onTable, onTakeBack, onSettings }: Props) {
  const router = useRouter();
  const review = useMemo(() => reviewOf(save), [save]);
  const result = save.game.state.result;
  const [burst, setBurst] = useState(0);

  // Each ending once: a take-back and a new ending to the same hand counts again.
  const ending = `${save.game.gameId}:${save.takeBacks}`;
  useEffect(() => {
    if (celebrated.has(ending)) return;
    celebrated.add(ending);
    void notePractice();
    track('practice_finished', { won: review.won, matched: review.matched, decisions: review.total, takeBacks: review.takeBacks });
    if (review.won) {
      setBurst(1);
      celebrateHaptic();
    }
  }, [ending]);

  const winner = result?.winner ?? null;
  const title = !result || result.kind === 'wall' ? 'Wall game. Nobody won this one.' : review.won ? 'Mahjong! You won the hand.' : `${nameOf(winner!)} called Mahjong.`;
  const pip = review.won
    ? { mood: 'cheer' as const, text: 'You did it! Pip is doing a happy little dance for you.' }
    : result?.kind === 'wall'
      ? { mood: 'think' as const, text: 'The wall ran out before anyone finished. Here’s what this hand showed.' }
      : { mood: 'happy' as const, text: 'Every hand teaches something. Here’s what this one showed.' };
  const winning = result?.kind === 'mahjong' && !review.won ? card.hands.find((h) => h.id === result.handId) : undefined;
  // Your winning tiles, group by group, the way the hand reads on the card.
  const me = save.game.state.players[mySeat(save)]!;
  const groups = review.won && result?.handId ? arrangeWin(card, result.handId, result.assignment ?? '', me.hand, me.exposures) : null;
  const share = review.total === 0 ? 0 : review.matched / review.total;
  const agreement =
    review.total === 0
      ? 'You didn’t make many choices this time.'
      : review.matched === review.total
        ? 'You matched Pip every time. Wow!'
        : share >= 0.7
          ? 'You and Pip think alike.'
          : 'Pip saw a few things differently. That’s how you learn!';

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <TopBar title="How you did" onBack={onExit} />
        <Panel tone={review.won ? 'pink' : 'default'} testID="practice-review">
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <PipSays mood={pip.mood} size={56}>
            {pip.text}
          </PipSays>
          {winning && (
            <View style={{ gap: 4 }}>
              <Body small muted>
                {nameOf(winner!)}’s hand
              </Body>
              <HandLine hand={winning} card={card} />
            </View>
          )}
        </Panel>

        <Section title="What you went for">
          {review.aim ? <HandLine hand={review.aim} card={card} /> : <Body muted>You kept your options open.</Body>}
          {review.nearest && (
            <Body small>
              {review.won
                ? review.nearest.hand.id === review.aim?.id
                  ? 'And you made it!'
                  : 'Then you switched, and won with this one:'
                : review.nearest.hand.id === review.aim?.id
                  ? `At the end you were ${review.nearest.distance === 1 ? 'one tile' : `${review.nearest.distance} tiles`} away.`
                  : `At the end you were closest to a different hand, ${review.nearest.distance === 1 ? 'one tile' : `${review.nearest.distance} tiles`} away:`}
            </Body>
          )}
          {review.nearest && review.nearest.hand.id !== review.aim?.id && <HandLine hand={review.nearest.hand} card={card} />}
          {groups && (
            <View style={styles.groups} accessible accessibilityLabel={`Your winning hand: ${groups.map((g) => g.map(tileShort).join(', ')).join('; ')}`}>
              {groups.map((g, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 1 }}>
                  {g.map((t) => (
                    <Tile key={t} face={faceOf(t)} width={22} flat />
                  ))}
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title="You and Pip">
          <Row gap={10}>
            <Stat value={`${review.matched} of ${review.total}`} label="choices matched Pip" />
            <Stat value={String(review.takeBacks)} label={review.takeBacks === 1 ? 'take-back' : 'take-backs'} />
          </Row>
          <Body small>{agreement} A choice counts as matching when it was Pip’s, or just as good.</Body>
        </Section>

        <Section title="The key moment">
          {review.key ? (
            <KeyMoment decision={review.key} />
          ) : (
            <PipSays mood="proud" size={48}>
              No big slips: every choice kept you as close as Pip’s would have.
            </PipSays>
          )}
        </Section>

        <View style={{ gap: 10 }}>
          <Button title="Practice again" icon="arrow" onPress={onAgain} testID="practice-again" />
          <Row gap={8} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button title="See the final table" variant="text" compact onPress={onTable} testID="practice-final-table" />
            {save.history.length > 0 && <Button title="Take back my last move" variant="text" compact icon="undo" onPress={onTakeBack} testID="practice-review-take-back" />}
          </Row>
        </View>

        <Panel tone="felt" style={{ gap: 12 }}>
          <Text style={styles.feltTitle}>Ready for a real table?</Text>
          <Text style={styles.feltBody}>
            Practice hands stay between you and Pip. When you’re ready, play a hand with friends, or plan a Game Night around a real table.
          </Text>
          <Button title="Play with friends" variant="light" icon="users" onPress={() => router.push('/table/new')} testID="practice-real-table" />
          <Button title="Plan a Game Night" variant="light" icon="calendar" onPress={() => router.push('/nights')} testID="practice-game-night" />
        </Panel>
        <Button title="Change the practice settings" variant="text" compact onPress={onSettings} testID="practice-settings" />
        <Body small muted center>
          Practice rounds don’t count in your stats.
        </Body>
      </Screen>
      <Confetti run={burst} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 31, color: colors.ink },
  choice: { gap: 6, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10 },
  choiceBest: { backgroundColor: '#E2F2E6', borderColor: 'transparent' },
  choiceLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  choiceDetail: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: { flex: 1, backgroundColor: colors.sage, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  statValue: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink },
  statLabel: { fontSize: 13, color: colors.muted },
  feltTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.feltText },
  feltBody: { fontSize: 15, lineHeight: 21, color: 'rgba(244,239,227,0.88)' },
});
