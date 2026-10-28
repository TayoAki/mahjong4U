import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isJoker, judgeRest, keyOf, rankPassTiles, type Card, type CardHand, type TileChoice } from '@daily-rack/core/mahjong';
import type { TablePayload } from '../lib/api.ts';
import type { CoachTable } from '../game/GameScreen.tsx';
import { Pip, type PipMood } from '../components/Pip.tsx';
import { Button, Notice, Sheet } from '../components/ui.tsx';
import { Tile } from '../components/Tile.tsx';
import { Pattern } from '../game/CardView.tsx';
import { faceOf, groupName, tileShort } from '../game/tiles.ts';
import { colors } from '../theme.ts';
import { asGood, pipPicks, type Advice } from './PracticeRound.ts';

// Pip at your elbow during a practice round: a few short lines about the move in front of
// you, drawn just above your moves so the table stays in view. Pip suggests, explains and
// gives a gentle heads-up; your moves are always yours to make.

interface Props {
  table: CoachTable;
  advice: Advice | null;
  card: Card;
  data: TablePayload;
  /** When you last moved, so Pip only mentions what's happened since. */
  movedAt: string;
  canTakeBack: boolean;
  onTakeBack: () => void;
}

const keyFor = (tile: number) => (isJoker(tile) ? 'JOKER' : keyOf(tile));
const sameTiles = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((t) => b.includes(t));
const listTiles = (tiles: readonly number[], joiner = 'and') =>
  tiles.length <= 1 ? tileShort(tiles[0] ?? 0) : `${tiles.slice(0, -1).map(tileShort).join(', ')} ${joiner} ${tileShort(tiles.at(-1)!)}`;

/** "3 tiles from FF 2222 44 66 8888", with the hand printed the way the card prints it. */
function Away({ distance, hand }: { distance: number; hand: CardHand | null }) {
  if (!hand || distance >= 99) return <>far from any hand on the card</>;
  return (
    <>
      {distance === 1 ? 'one tile' : `${distance} tiles`} from <Pattern pattern={hand.pattern} size={14} />
    </>
  );
}

export function CoachPanel({ table, advice, card, data, movedAt, canTakeBack, onTakeBack }: Props) {
  const [sheet, setSheet] = useState(false);
  const game = data.game!;
  const view = game.view;
  const prompt = view.prompt;
  const nameOf = (seat: number) => (data.table.seats[game.positions[seat] ?? 0]?.name ?? '').replace(' (computer)', '');

  let mood: PipMood = 'happy';
  let words: ReactNode = null;
  let buttons: ReactNode = null;
  let warn = false;
  let testID = 'coach';

  if (advice?.kind === 'pass') {
    testID = 'coach-pass';
    const { pip, after, before, count } = advice;
    const picked = sameTiles(table.selected, pip);
    const them = count === 1 ? 'it' : 'them';
    if (table.selected.length === count && !picked) {
      // A different pick: say how it compares, kindly. (Nothing is face up before play, so
      // no tiles count as seen.)
      const mine = judgeRest(card, view.hand, table.selected);
      if (mine.distance > after.distance) {
        const rows = new Map(rankPassTiles(card, view.hand).map((r) => [r.key, r]));
        const keep = table.selected.filter((t) => !pip.includes(t)).sort((a, b) => (rows.get(keyFor(b))?.distance ?? 0) - (rows.get(keyFor(a))?.distance ?? 0))[0]!;
        const closer = mine.distance - after.distance;
        mood = 'think';
        words = `Pip’s pick keeps you ${closer === 1 ? 'a tile' : `${closer} tiles`} closer. Pip would hold on to the ${tileShort(keep)}: your closest hand uses it.`;
      } else if (mine.distance === after.distance && mine.helpers < after.helpers) {
        words = 'That works too. Pip’s pick leaves a few more tiles that could help you.';
      } else {
        mood = 'proud';
        words = 'Nice! That’s just as good as Pip’s pick.';
      }
    } else {
      words = (
        <>
          Pip would pass {listTiles(pip)}.{' '}
          {after.nearest && after.distance <= before ? (
            <>
              Your closest hand, <Pattern pattern={after.nearest.pattern} size={14} />, doesn’t use {them}.
            </>
          ) : (
            `Your closest hands need ${them} least.`
          )}
        </>
      );
    }
    if (!picked) buttons = <Button variant="secondary" compact title="Use Pip’s pick" onPress={() => table.select(pip)} testID="coach-use-pick" />;
  } else if (advice?.kind === 'discard') {
    testID = 'coach-discard';
    const { rows, canMahjong } = advice;
    const picks = pipPicks(rows);
    const best = picks[0]!;
    const tile = table.selected[0];
    const row = tile === undefined ? undefined : rows.find((r) => r.key === keyFor(tile));
    if (canMahjong) {
      mood = 'cheer';
      words = 'That’s Mahjong! Your tiles make a hand on the card. Tap Mahjong to win.';
    } else if (tile !== undefined && row && (isJoker(tile) || row.distance > best.distance)) {
      // Clearly worse: it moves you further from every hand you're closest to. A joker
      // always gets a word, since Pip keeps them.
      warn = true;
      mood = 'think';
      words = isJoker(tile)
        ? 'Jokers can stand in for any tile in a group, so Pip keeps them. Throw it anyway?'
        : `That ${tileShort(tile)} is part of your closest hand. Throw it anyway?`;
      buttons = (
        <>
          <Button variant="secondary" compact title="Pick again" onPress={() => table.select([])} testID="coach-pick-again" />
          <Button variant="text" compact title="Throw it" onPress={() => table.send({ type: 'discard', tile })} testID="coach-throw-it" />
        </>
      );
    } else if (row && asGood(row, best)) {
      words = (
        <>
          Good pick: Pip agrees. You’ll be <Away distance={row.distance} hand={row.nearest} />.
        </>
      );
    } else if (row) {
      mood = 'think';
      words = `That works. Pip would throw the ${tileShort(best.tile)} instead: more of the tiles still out there would help you.`;
    } else {
      words = (
        <>
          Pip would throw the {listTiles(
            picks.map((p) => p.tile),
            'or',
          )}
          . You’d be <Away distance={best.distance} hand={best.nearest} />.
        </>
      );
    }
    if (!canMahjong && !warn) buttons = <Button variant="secondary" compact title="All discards" onPress={() => setSheet(true)} testID="coach-all-discards" />;
  } else if (advice?.kind === 'claim') {
    testID = 'coach-claim';
    const { advice: a, tile } = advice;
    const sizes = prompt?.type === 'claim' ? prompt.sizes : [];
    if (a.call === 'mahjong') {
      mood = 'cheer';
      words = `Call it! The ${tileShort(tile)} finishes your hand. Tap Mahjong!`;
    } else if (a.call === 'expose') {
      words = (
        <>
          Call it{sizes.length > 1 && a.size ? ` for a ${groupName(a.size)}` : ''}: you’d be <Away distance={a.after} hand={a.nearest} />.
          {a.givesUpConcealed ? ' Concealed hands are out once you call.' : ''}
        </>
      );
    } else {
      mood = 'think';
      words =
        a.givesUpConcealed && a.nearest?.concealed
          ? 'Let it go: your closest hand is concealed, and calling would rule it out.'
          : 'Let it go: it doesn’t help your closest hands.';
    }
  } else if (advice?.kind === 'vote') {
    mood = 'think';
    words = advice.again
      ? `Pip would pass again: you’re ${advice.distance} tiles from your closest hand, so swapping more can help.`
      : `Pip would stop here: you’re ${advice.distance} tiles from your closest hand, so keep what you have.`;
  } else if (advice?.kind === 'offer') {
    mood = 'think';
    words =
      advice.count === 0
        ? 'Pip would offer none: every tile helps your closest hand.'
        : `Pip would offer ${advice.count}: your closest hand doesn’t need ${advice.count === 1 ? 'one of your tiles' : `${advice.count} of your tiles`}.`;
  }

  // A word about what's happened since your last move: joker swaps and dead hands.
  const notes: string[] = [];
  const swap = prompt?.type === 'turn' ? prompt.exchanges[0] : undefined;
  if (swap) notes.push(`You can swap your ${tileShort(swap.tile)} for ${nameOf(swap.target)}’s joker. A joker fits any group, so it’s almost always worth it.`);
  const news = [...game.log].reverse().find((e) => e.at >= movedAt && e.position !== 0 && (e.event.type === 'exchange' || e.event.type === 'dead-hand'));
  if (news && news.position !== null) {
    const who = nameOf(game.positions.indexOf(news.position));
    notes.push(
      news.event.type === 'exchange'
        ? `${who} swapped a ${tileShort(news.event.tile ?? 0)} for a joker. You can too: on your turn, trade the real tile for a joker in any exposed group.`
        : `${who}’s hand is dead, so ${who} sits out the rest of the hand. A dead hand can’t win, but still pays the winner.`,
    );
  }
  if (view.players[view.seat]?.dead && canTakeBack && view.phase.kind !== 'ended') notes.push('This is practice: take back your last move to try another way.');

  const takeBack = canTakeBack ? <Button variant="text" compact icon="undo" title="Take back" onPress={onTakeBack} hint="Undo your last move" testID="practice-take-back" /> : null;
  const rows = advice?.kind === 'discard' ? advice.rows : [];
  const pipRank = pipPicks(rows)[0]?.rank;

  return (
    <View style={{ gap: 8 }}>
      {words || notes.length > 0 ? (
        <View style={[styles.panel, warn && styles.warn]} testID={testID}>
          {words ? (
            <View style={styles.says}>
              <Pip mood={mood} size={38} />
              <Text style={styles.words} accessibilityLiveRegion="polite" testID="coach-words">
                {words}
              </Text>
            </View>
          ) : null}
          {notes.map((note) => (
            <Text key={note} style={styles.note}>
              {note}
            </Text>
          ))}
          {buttons || takeBack ? (
            <View style={styles.buttons}>
              <View style={styles.left}>{buttons}</View>
              {takeBack}
            </View>
          ) : null}
        </View>
      ) : (
        takeBack && <View style={{ alignItems: 'flex-end' }}>{takeBack}</View>
      )}
      {!warn && table.moves}
      <AllDiscards visible={sheet} rows={rows} pipRank={pipRank} selected={table.selected[0]} onClose={() => setSheet(false)} onPick={(t) => table.select([t])} />
    </View>
  );
}

/**
 * Every tile you could throw, best first, the way a discard trainer lays them out: what
 * each one leaves you needing and how many unseen tiles would help. Tap one to pick it.
 */
function AllDiscards({
  visible,
  rows,
  pipRank,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  rows: TileChoice[];
  /** The rank of Pip's picks (see pipPicks). */
  pipRank: number | undefined;
  selected: number | undefined;
  onClose: () => void;
  onPick: (tile: number) => void;
}) {
  const mine = selected === undefined ? null : keyFor(selected);
  const isBest = (r: TileChoice) => r.key !== 'JOKER' && r.rank === pipRank;
  return (
    <Sheet visible={visible} title="All discards" onClose={onClose}>
      <Notice>Tiles away: how many more tiles your nearest hand would need after you throw it. Useful tiles: tiles you haven’t seen yet that would bring you a step closer. Pip’s best are green.</Notice>
      <View testID="all-discards">
        <View style={styles.headRow}>
          <Text style={[styles.head, { flex: 1 }]}>Throw</Text>
          <Text style={[styles.head, styles.num]}>Tiles away</Text>
          <Text style={[styles.head, styles.num]}>Useful tiles</Text>
        </View>
        {rows.map((r, i) => (
          <Pressable
            key={r.key}
            onPress={() => {
              onPick(r.tile);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${tileShort(r.tile)}: ${r.distance >= 99 ? 'no hand fits' : `${r.distance} away`}, ${r.helpers} useful tiles${isBest(r) ? ', Pip’s best' : ''}${r.key === mine ? ', your pick' : ''}`}
            style={({ pressed }) => [styles.row, isBest(r) && styles.rowBest, r.key === mine && styles.rowMine, pressed && { opacity: 0.7 }]}
            testID={`discard-row-${i}`}
          >
            <Tile face={faceOf(r.tile)} width={30} flat />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowName}>
                {tileShort(r.tile)}
                {r.key === mine ? <Text style={styles.mineTag}> · your pick</Text> : null}
              </Text>
              {r.key === 'JOKER' ? (
                <Text style={styles.rowNote}>Pip keeps jokers: they fill in for any tile in a group.</Text>
              ) : r.nearest && r.distance < 99 ? (
                <Pattern pattern={r.nearest.pattern} size={12} />
              ) : null}
            </View>
            <Text style={[styles.num, styles.value, isBest(r) && { color: colors.online }]}>{r.distance >= 99 ? '–' : r.distance}</Text>
            <Text style={[styles.num, styles.value]}>{r.helpers}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Close" variant="text" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.sage, borderRadius: 16, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, gap: 4 },
  warn: { backgroundColor: colors.warnBg },
  says: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  words: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.ink },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted, paddingLeft: 46 },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingBottom: 6, gap: 10 },
  head: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  num: { width: 62, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', marginBottom: 4, backgroundColor: colors.surface },
  rowBest: { backgroundColor: '#E2F2E6' },
  rowMine: { borderColor: colors.primary },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowNote: { fontSize: 12, color: colors.muted },
  mineTag: { fontSize: 13, fontWeight: '700', color: colors.primary },
  value: { fontSize: 17, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
});
