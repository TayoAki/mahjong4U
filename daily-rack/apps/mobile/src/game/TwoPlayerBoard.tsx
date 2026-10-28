import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HAND_SLOTS, TWO_PLAYER_WINDS, arrangeWin, otherSeat, type HandSlot, type TwoPlayerView, type TwoSeat } from '@daily-rack/core/mahjong';
import type { TableSeat } from '../lib/api.ts';
import { useActiveCard } from '../lib/cards.tsx';
import { useLayout } from '../lib/layout.ts';
import { Arrive, useAfterFirstRender } from '../components/Arrive.tsx';
import { Avatar } from '../components/ui.tsx';
import { Tile, TileFromBehind } from '../components/Tile.tsx';
import { colors, table } from '../theme.ts';
import { Exposures } from './TableBoard.tsx';
import { faceOf, tileName } from './tiles.ts';

// A two-player table from your chair: the other player across the felt with their tiles
// held up, backs toward you, and their two hands' exposures in front of them; each
// player's discards in rows facing their owner; and the console in the middle with the
// latest discard, the wall and lights for whose move it is. Your own two hands sit below
// the felt with your racks.

interface Props {
  view: TwoPlayerView;
  caption: string;
  seatInfo: (seat: number) => TableSeat;
  scoreOf: (seat: number) => number;
  nameOf: (seat: number) => string;
  onPlayer: (seat: TableSeat) => void;
  active: (seat: TwoSeat) => boolean;
  large?: boolean;
  width?: number;
}

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));
const RIM = 7;
const PAD = 8;

/** Height of a tile lying face up, including the edge that shows its thickness. */
function lyingHeight(width: number): number {
  const layer = Math.max(2, Math.round(width * 0.09));
  return width * 1.3 + Math.max(1, layer - 1) + layer;
}

/** One hand's tiles as the table shows them: a declared hand laid out group by group, or its exposures. */
export function HandTiles({ view, seat, slot, width }: { view: TwoPlayerView; seat: TwoSeat; slot: HandSlot; width: number }) {
  const card = useActiveCard();
  const hand = view.players[seat]!.hands[slot]!;
  const mahjong = view.mahjongs.find((m) => m.seat === seat && m.hand === slot);
  if (hand.shown && mahjong) {
    const groups = arrangeWin(card, mahjong.handId, mahjong.assignment, hand.shown, hand.exposures) ?? [[...hand.shown, ...hand.exposures.flatMap((e) => e.tiles)]];
    return (
      <View style={styles.groups} accessible accessibilityLabel={`Mahjong: ${groups.map((g) => g.map(tileName).join(', ')).join('; ')}`}>
        {groups.map((g, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 1 }}>
            {g.map((t) => (
              <Tile key={t} face={faceOf(t)} width={width} flat />
            ))}
          </View>
        ))}
      </View>
    );
  }
  return <Exposures exposures={hand.exposures} width={width} depth="lying" align="flex-start" />;
}

export function TwoPlayerBoard({ view, caption, seatInfo, scoreOf, nameOf, onPlayer, active, large = false, width: boardWidth }: Props) {
  const { contentWidth, tablet } = useLayout();
  const width = boardWidth ?? contentWidth;
  const ready = useAfterFirstRender();
  const me = view.seat;
  const opp = otherSeat(me);
  const result = view.result;
  const display = (seat: number) => (seat === me ? 'You' : nameOf(seat));
  const inner = width - RIM * 2 - PAD * 2;
  const discardsOf = (seat: TwoSeat) => view.discards.map((d, i) => ({ ...d, i })).filter((d) => d.seat === seat);
  const most = Math.max(...[me, opp].map((s) => discardsOf(s).length));
  // Discards start big and shrink as the rows fill, so the felt stays a steady size.
  const budget = large ? 220 : tablet ? 190 : 120;
  let t = Math.min(tablet ? 40 : 30, Math.floor((inner + 1) / 12) - 1);
  const perRow = (w: number) => Math.floor((inner + 1) / (w + 1));
  while (t > 14 && Math.ceil(most / perRow(t)) * (lyingHeight(t) + 2) > budget) t -= 1;
  // No room is kept for discards until there are some.
  const rows = Math.ceil(most / perRow(t));
  const last = view.discards.length - 1;
  const lastTile = view.discards[last];
  const boxWidth = (inner - 8) / 2;
  const expo = Math.max(10, Math.min(tablet ? 22 : 16, Math.floor((boxWidth - 16) / 15)));
  const opponent = view.players[opp]!;

  const info = seatInfo(opp);
  const chipLabel = `${info.name}, across from you, ${TWO_PLAYER_WINDS[opp]} wind, ${opponent.concealedCount} tiles hidden, score ${scoreOf(opp)}${active(opp) ? ', to play' : ''}`;
  const chipBody = (
    <View style={[styles.chip, active(opp) && styles.chipActive]}>
      <Avatar name={info.name} color={info.color} size={26} online={info.kind === 'human' ? info.online : undefined} />
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.chipName} numberOfLines={1}>
          {nameOf(opp)}
        </Text>
        <Text style={styles.chipMeta} numberOfLines={1}>
          {TWO_PLAYER_WINDS[opp]} · {formatScore(scoreOf(opp))} · {opponent.concealedCount} tiles
        </Text>
      </View>
    </View>
  );

  const handBox = (slot: HandSlot) => {
    const hand = opponent.hands[slot]!;
    const mahjong = view.mahjongs.find((m) => m.seat === opp && m.hand === slot);
    const state = hand.shown ? `Mahjong · ${mahjong?.value ?? ''}` : hand.dead ? 'Dead hand' : hand.exposures.length === 0 ? 'Nothing exposed' : null;
    return (
      <View
        key={slot}
        style={[styles.box, { width: boxWidth }, hand.shown && styles.boxWon]}
        accessible
        accessibilityLabel={`${nameOf(opp)}’s hand ${slot + 1}: ${hand.shown ? `Mahjong, ${mahjong?.value ?? 0} points` : hand.dead ? `dead, ${hand.dead.text}` : hand.exposures.length === 0 ? 'nothing exposed' : `${hand.exposures.length} exposed ${hand.exposures.length === 1 ? 'group' : 'groups'}`}`}
        testID={`opponent-hand-${slot}`}
      >
        <View style={styles.boxHead}>
          <Text style={styles.boxTitle}>Hand {slot + 1}</Text>
          {state && <Text style={[styles.boxState, hand.dead && !hand.shown && styles.boxDead, hand.shown && styles.boxWonText]}>{state}</Text>}
        </View>
        <HandTiles view={view} seat={opp} slot={slot} width={expo} />
      </View>
    );
  };

  const river = (seat: TwoSeat) => {
    const tiles = discardsOf(seat);
    return (
      <View
        style={[styles.river, { minHeight: rows * (lyingHeight(t) + 2), transform: seat === opp ? [{ rotate: '180deg' }] : undefined }]}
        accessible
        accessibilityLabel={`${seat === me ? 'Your' : `${nameOf(seat)}’s`} discards: ${tiles.length ? tiles.map((d) => tileName(d.tile)).join(', ') : 'none'}`}
      >
        {tiles.map((d) => (
          <Arrive key={d.tile} from={{ y: 22 }} animate={ready}>
            <Tile face={faceOf(d.tile)} width={t} depth="lying" highlight={d.i === last && !result} />
          </Arrive>
        ))}
      </View>
    );
  };

  const winner = result?.winner ?? null;
  const consoleLabel = result
    ? result.kind === 'wall'
      ? 'Wall game'
      : `${display(winner!)} won the game`
    : `${view.wallCount} tiles left in the wall${lastTile ? `. ${display(lastTile.seat)} threw ${tileName(lastTile.tile)}` : ''}`;

  return (
    <View style={[styles.rim, !large && { transform: [{ perspective: 1100 }, { rotateX: '12deg' }, { scale: 0.98 }] }]} testID="two-player-board">
      <View style={styles.felt}>
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
        <View style={{ alignItems: 'center' }}>
          {info.kind === 'human' && info.principalId ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${chipLabel}. Options to report or block`} onPress={() => onPlayer(info)}>
              {chipBody}
            </Pressable>
          ) : (
            <View accessible accessibilityLabel={chipLabel}>
              {chipBody}
            </View>
          )}
        </View>
        <View style={styles.backs} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: opponent.concealedCount }, (_, i) => (
            <TileFromBehind key={i} width={Math.max(7, Math.min(tablet ? 20 : 13, Math.floor((inner - 30) / Math.max(14, opponent.concealedCount)) - 1))} />
          ))}
        </View>
        <View style={styles.hands}>{HAND_SLOTS.map(handBox)}</View>
        {river(opp)}
        <View style={styles.console} accessible accessibilityLabel={consoleLabel} accessibilityLiveRegion="polite">
          <View style={[styles.light, active(opp) && styles.lightOn]} />
          <View style={styles.consoleRow}>
            <Text style={styles.wall}>{view.wallCount} left</Text>
            <View style={styles.consoleCenter}>
              {result ? (
                <Text style={styles.consoleText}>{result.kind === 'wall' ? 'Wall game' : 'Mahjong!'}</Text>
              ) : lastTile ? (
                <>
                  <Tile face={faceOf(lastTile.tile)} width={Math.round(t * 1.25)} depth="lying" highlight={view.phase.kind === 'claim'} />
                  <Text style={styles.consoleSmall} numberOfLines={1}>
                    {display(lastTile.seat)} threw
                  </Text>
                </>
              ) : (
                <Text style={styles.consoleSmall}>East starts</Text>
              )}
            </View>
            <Text style={styles.turn} numberOfLines={2}>
              {result ? '' : active(me) ? 'Your move' : `${nameOf(opp)}’s move`}
            </Text>
          </View>
          <View style={[styles.light, active(me) && styles.lightOn]} />
        </View>
        {river(me)}
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`You, ${TWO_PLAYER_WINDS[me]} wind, score ${scoreOf(me)}${active(me) ? ', to play' : ''}`}>
          <View style={[styles.chip, active(me) && styles.chipActive]}>
            <Avatar name={seatInfo(me).name} color={seatInfo(me).color} size={22} />
            <Text style={styles.chipName}>You</Text>
            <Text style={styles.chipMeta}>
              {TWO_PLAYER_WINDS[me]} · {formatScore(scoreOf(me))}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rim: { backgroundColor: table.rim, borderRadius: 24, padding: RIM, borderBottomWidth: 5, borderBottomColor: table.rimDark },
  felt: { backgroundColor: table.felt, borderRadius: 18, padding: PAD, paddingTop: 4, gap: 8, borderWidth: 1, borderColor: table.feltDark },
  caption: { color: 'rgba(243,247,242,0.65)', fontSize: 11, textAlign: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.16)', borderRadius: 999, padding: 3, paddingHorizontal: 8, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { borderColor: table.light, backgroundColor: 'rgba(242,193,78,0.22)' },
  chipName: { color: table.text, fontWeight: '700', fontSize: 13 },
  chipMeta: { color: 'rgba(243,247,242,0.75)', fontSize: 11 },
  backs: { flexDirection: 'row', justifyContent: 'center', gap: 1 },
  hands: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: { backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 12, padding: 6, gap: 4 },
  boxWon: { backgroundColor: 'rgba(242,193,78,0.2)', borderWidth: 1, borderColor: table.light },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  boxTitle: { color: table.text, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  boxState: { color: 'rgba(243,247,242,0.7)', fontSize: 10, fontWeight: '600', flexShrink: 1 },
  boxDead: { color: '#FFD3C9', fontWeight: '800' },
  boxWonText: { color: table.light, fontWeight: '800' },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  river: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 1, rowGap: 2, alignContent: 'flex-start', justifyContent: 'flex-start' },
  console: { backgroundColor: table.console, borderRadius: 14, borderWidth: 3, borderColor: table.consoleEdge, paddingHorizontal: 10, paddingVertical: 3, gap: 3 },
  consoleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40 },
  consoleCenter: { alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1 },
  consoleText: { color: table.text, fontSize: 15, fontWeight: '800' },
  consoleSmall: { color: 'rgba(243,247,242,0.8)', fontSize: 10, fontWeight: '600' },
  light: { alignSelf: 'center', width: 54, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  lightOn: { backgroundColor: table.light, shadowColor: table.light, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  wall: { color: colors.gold, fontSize: 12, fontWeight: '700', width: 64 },
  turn: { color: 'rgba(243,247,242,0.8)', fontSize: 11, fontWeight: '700', width: 64, textAlign: 'right' },
});
