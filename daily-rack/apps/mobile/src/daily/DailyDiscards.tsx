import { useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { DAILY_SEAT, DAILY_TURNS, HOUSE_CARD, dailyDiscards, isJoker, keyOf, playDiscards, type DiscardTurn, type Seat } from '@daily-rack/core/mahjong';
import type { ResultResponse } from '../lib/api.ts';
import type { DiscardsSave } from '../lib/storage.ts';
import { playSound } from '../lib/sounds.ts';
import { track } from '../lib/analytics.ts';
import { celebrateHaptic } from '../lib/celebrate.ts';
import { Body, Button, Card, Notice, Row } from '../components/ui.tsx';
import { PipSays } from '../components/Pip.tsx';
import { Confetti } from '../components/Confetti.tsx';
import { useAfterFirstRender } from '../components/Arrive.tsx';
import { useLayout } from '../lib/layout.ts';
import { Rack, type RackItem } from '../game/Rack.tsx';
import { Pattern } from '../game/CardView.tsx';
import { tileName, tileShort } from '../game/tiles.ts';
import { DailyBoard, Status, TableFrame, barStyles, dailyView, feel, playerName, useDailyRack, useDailyTable } from './DailyTable.tsx';
import { RankList } from './RankList.tsx';
import { colors, fonts } from '../theme.ts';

// The daily discards: the rack's deal played on for three turns, the same for everyone.
// Pip passes the strong three, three tiles come in from your left, and on each turn you
// draw and throw at the table. After each throw, every throw you could have made is
// ranked, best in green, before play moves on.

const keyFor = (tile: number) => (isJoker(tile) ? 'JOKER' : keyOf(tile));
const orList = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
const andList = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export function DailyDiscards({
  result,
  save,
  header,
  shareLine,
  shareNote,
  onSave,
  onShare,
  onBack,
}: {
  result: ResultResponse;
  save: DiscardsSave;
  header: ReactNode;
  shareLine: string;
  shareNote: string | null;
  onSave: (save: DiscardsSave) => void;
  onShare: () => void;
  onBack: () => void;
}) {
  const { puzzle, suggestion } = result;
  const drill = useMemo(() => dailyDiscards(puzzle.tiles, suggestion.tileInstanceIds, puzzle.revisionId), [puzzle, suggestion]);
  const turns = useMemo(() => playDiscards(HOUSE_CARD, drill, save.picks), [drill, save.picks]);
  // Throws that still make sense for this deal (all of them, unless storage was meddled with).
  const played = turns.filter((t) => t.pick !== null).length;
  const done = played >= DAILY_TURNS;
  // The turn whose ranking is on show after a throw; null while you're playing (or at the end).
  const [showing, setShowing] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [jokerWarned, setJokerWarned] = useState(false);
  const [burst, setBurst] = useState(0);
  const sizes = useDailyTable();
  const { wide } = useLayout();
  const ready = useAfterFirstRender();

  const index = showing ?? Math.min(played, DAILY_TURNS - 1);
  const turn = turns[index]!;
  const playing = showing === null && !done;
  const pick = turn.pick;
  const hand = playing || pick === null ? turn.hand : turn.hand.filter((t) => t !== pick);
  const rack = useDailyRack(puzzle.revisionId, hand, playing ? turn.drawn : null);
  const received = new Set(index === 0 && playing ? drill.received : []);
  const score = save.best.filter(Boolean).length;

  const choose = (tile: number) => {
    if (!playing) return;
    feel('pick');
    playSound('tap');
    setJokerWarned(false);
    setSelected((s) => (s === tile ? null : tile));
  };

  const discard = () => {
    if (selected === null || !playing) return;
    if (isJoker(selected) && !jokerWarned) {
      setJokerWarned(true);
      return;
    }
    const picks = [...save.picks.slice(0, played), selected];
    const now = playDiscards(HOUSE_CARD, drill, picks)[played]!;
    const best = now.best ?? false;
    onSave({ picks, best: [...save.best.slice(0, played), best] });
    setShowing(played);
    setSelected(null);
    setJokerWarned(false);
    feel('place');
    playSound('place');
    AccessibilityInfo.announceForAccessibility(best ? 'One of the best throws.' : `The best throw was ${orList(bestTiles(now).map(tileName))}.`);
    if (picks.length === DAILY_TURNS) {
      const total = [...save.best.slice(0, played), best].filter(Boolean).length;
      track('discards_finished', { revisionId: puzzle.revisionId, best: total });
      if (total === DAILY_TURNS) {
        setBurst((b) => b + 1);
        celebrateHaptic();
      }
    }
  };

  // After a throw: on to the next turn, or the score once all three are played.
  const next = () => setShowing(showing !== null && showing + 1 < played ? showing + 1 : null);

  const table = playing || pick === null ? turn.table : [...turn.table, { seat: DAILY_SEAT, tile: pick }];
  const board = (
    <DailyBoard
      view={dailyView({
        hand,
        drawn: playing ? turn.drawn : null,
        table,
        wallCount: turn.wallCount,
        phase: { kind: 'turn', seat: (playing ? DAILY_SEAT : (DAILY_SEAT + 1) % 4) as Seat, drew: playing },
      })}
      caption={`${puzzle.title} · Daily discards · Turn ${index + 1} of ${DAILY_TURNS}`}
      width={sizes.boardWidth}
      large={sizes.large}
    />
  );
  const before = drill.before[index] ?? [];
  const log = (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`Before your turn: ${before.map((d) => `${playerName(d.seat)} threw ${tileName(d.tile)}`).join('. ')}`}>
      {before.map((d, i) => (
        <Text key={i} style={barStyles.log}>
          {index === 0 && d.seat === 0 ? `${playerName(d.seat)}, East, opened with ${tileShort(d.tile)}.` : `${playerName(d.seat)} drew and threw ${tileShort(d.tile)}.`}
        </Text>
      ))}
    </View>
  );

  const items: RackItem[] = rack.tiles.map((tile) => ({
    tile,
    label: `${tileName(tile)}${playing && turn.drawn === tile ? ', just drawn' : ''}${received.has(tile) ? ', just passed to you' : ''}`,
    selected: selected === tile,
    highlight: playing && (turn.drawn === tile || received.has(tile)) && selected !== tile,
    badge: received.has(tile) ? 'New' : playing && turn.drawn === tile ? 'Drew' : undefined,
  }));
  const rackView = (
    <>
      <Row style={{ justifyContent: 'space-between' }} gap={4}>
        <Text style={barStyles.mine}>
          You · South{done ? ` · ${score} of ${DAILY_TURNS} best` : ''}
        </Text>
        <Button variant="text" compact icon="sort" title={rack.label} hint="Changes the order of your tiles" onPress={rack.nextOrder} testID="rack-order" />
      </Row>
      {rack.hint && playing && <Text style={styles.arrangeHint}>Drag tiles to arrange them.</Text>}
      <Rack items={items} tileWidth={sizes.tileWidth} tapsDisabled={!playing} animate={ready} onTap={choose} onArrange={rack.arrange} onLift={() => feel('pick')} />
    </>
  );

  let bar: ReactNode;
  let top: ReactNode = null;
  if (playing) {
    const joker = selected !== null && isJoker(selected);
    bar = (
      <View style={{ gap: 8 }}>
        <Status testID="table-status">
          Turn {index + 1} of {DAILY_TURNS} · You drew {tileShort(turn.drawn)}
        </Status>
        {index === 0 && (
          <Text style={styles.received} testID="discards-intro">
            Pip passed the strong three, so everyone plays on from the same hand. {playerName(0)} passed you {andList(drill.received.map(tileShort))}. They’re marked New.
          </Text>
        )}
        {jokerWarned && <Notice tone="warn">Jokers fill any group of 3 or more, so throwing one away is rarely right. Tap again to discard it anyway.</Notice>}
        <Button
          variant={joker && jokerWarned ? 'secondary' : 'primary'}
          title={selected === null ? 'Tap a tile to discard' : joker && jokerWarned ? 'Yes, discard the joker' : `Discard ${tileShort(selected)}`}
          disabled={selected === null}
          onPress={discard}
          testID="action-discard"
        />
        {rackView}
      </View>
    );
  } else if (showing !== null && pick !== null) {
    const last = showing + 1 >= DAILY_TURNS;
    bar = (
      <View style={{ gap: 8 }}>
        <Status testID="table-status" detail={turn.best ? 'One of the best throws.' : `The best throw was ${bestShort(turn)}.`}>
          Turn {showing + 1} of {DAILY_TURNS} · You threw {tileShort(pick)}
        </Status>
        <Button title={last ? 'See how you did' : 'Next turn'} icon="arrow" onPress={next} testID="next-turn" />
        {wide && rackView}
      </View>
    );
    top = <TurnReview turn={turn} pick={pick} />;
  } else {
    bar = (
      <View style={{ gap: 8 }}>
        <Status testID="table-status" detail="Same tiles for everyone today. Share how you did!">
          Daily discards · {score} of {DAILY_TURNS} best
        </Status>
        <Row gap={10}>
          <Button style={{ flex: 1 }} title="Share" icon="share" onPress={onShare} testID="share-result" />
          <Button style={{ flex: 1 }} title="Your review" variant="secondary" onPress={onBack} testID="back-to-review" />
        </Row>
        {shareNote && (
          <Text style={barStyles.tip} testID="share-copied">
            {shareNote}
          </Text>
        )}
        {wide && rackView}
      </View>
    );
    top = <Summary turns={turns} score={score} shareLine={shareLine} onTurn={setShowing} />;
  }

  return (
    <>
      {/* On a phone, once you've thrown, your rack moves up beside the table to make room for the ranking. */}
      <TableFrame header={header} top={top} board={board} left={playing ? log : wide ? null : <View style={{ gap: 8 }}>{rackView}</View>} bar={bar} large={sizes.large} />
      <Confetti run={burst} />
    </>
  );
}

const bestTiles = (turn: DiscardTurn) => turn.ranking.filter((c) => c.best).map((c) => c.tile);
/** The best throws, short: "8 Bam or 1 Dot", or "Flower, 8 Bam or 2 more". */
const bestShort = (turn: DiscardTurn) => {
  const tiles = bestTiles(turn);
  return tiles.length <= 2 ? orList(tiles.map(tileShort)) : `${tiles.slice(0, 2).map(tileShort).join(', ')} or ${tiles.length - 2} more`;
};

/** One turn's throws, ranked, with a word from Pip. */
function TurnReview({ turn, pick }: { turn: DiscardTurn; pick: number }) {
  const mine = turn.ranking.find((c) => c.key === keyFor(pick));
  const best = turn.ranking[0]!;
  const base = best.distance;
  return (
    <Card testID="discard-ranking">
      <PipSays mood={turn.best ? 'cheer' : 'think'} size={52}>
        {turn.best
          ? `Lovely! That keeps you ${best.distance} away, with ${best.helpers} useful tiles still out there.`
          : `So close! ${bestShort(turn)} would keep you ${best.distance} away with ${best.helpers} useful tiles.`}
      </PipSays>
      {mine?.nearest && (
        <View style={{ gap: 2 }}>
          <Body small muted>
            Your closest hand on the card now
          </Body>
          <Pattern pattern={mine.nearest.pattern} />
        </View>
      )}
      <RankList
        title="Every discard, ranked"
        intro="Away: tiles you’d still need for your nearest hand. Useful: unseen tiles that would bring it closer. Green is best."
        verb="throw"
        rows={turn.ranking.map((choice) => ({ key: choice.key, choice, base, mine: choice.key === keyFor(pick) }))}
      />
    </Card>
  );
}

/** The day's three throws, scored, with the line to share. */
function Summary({ turns, score, shareLine, onTurn }: { turns: DiscardTurn[]; score: number; shareLine: string; onTurn: (turn: number) => void }) {
  return (
    <Card tone="sage" testID="discards-summary">
      <Text style={styles.score} accessibilityRole="header">
        {score} of {DAILY_TURNS} best
      </Text>
      <PipSays mood={score === DAILY_TURNS ? 'proud' : score > 0 ? 'happy' : 'think'} size={52}>
        {score === DAILY_TURNS
          ? 'Three for three! You played that hand like a regular.'
          : score > 0
            ? 'Nicely played. Have a look at the turn that got away, then come back tomorrow.'
            : 'Every hand teaches something. Tap a turn to see the throws I’d have made.'}
      </PipSays>
      {turns.map((turn, i) =>
        turn.pick === null ? null : (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Turn ${i + 1}: you threw ${tileName(turn.pick)}, ${turn.best ? 'one of the best' : `the best was ${orList(bestTiles(turn).map(tileName))}`}. Tap to see the ranking.`}
            onPress={() => onTurn(i)}
            style={({ pressed }) => [styles.turn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.square}>{turn.best ? '🟩' : '⬜'}</Text>
            <Body style={{ flex: 1 }}>
              Turn {i + 1}: {tileShort(turn.pick)}
              {turn.best ? ', one of the best' : `. Best: ${bestShort(turn)}`}
            </Body>
            <Text style={styles.see}>See</Text>
          </Pressable>
        ),
      )}
      <Text style={styles.share} testID="share-text" selectable>
        {shareLine}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  received: { fontSize: 13, lineHeight: 18, color: colors.ink, backgroundColor: '#FFF2CC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  arrangeHint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  score: { fontFamily: fonts.serif, fontSize: 30, color: colors.ink },
  turn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  square: { fontSize: 18 },
  see: { color: colors.primary, fontWeight: '700' },
  share: { fontSize: 15, fontWeight: '600', color: colors.ink, backgroundColor: colors.surface, borderRadius: 10, padding: 10 },
});
