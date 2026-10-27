import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SEAT_WINDS, isJoker, type Exposure, type PlayerView, type Seat } from '@daily-rack/core/mahjong';
import type { TableSeat } from '../lib/api.ts';
import { Avatar } from '../components/ui.tsx';
import { Tile, TileBack } from '../components/Tile.tsx';
import { colors, fonts } from '../theme.ts';
import { faceOf, groupName, tileName, tileShort } from './tiles.ts';

// The table seen from your chair: the player across at the top, the players on your left
// and right at the sides, each with their rack (tile backs) and exposed groups, and every
// player's discards in the middle. Hidden tiles stay hidden, as at a real table; everyone's
// hand is shown when the hand ends.

interface Props {
  view: PlayerView;
  caption: string;
  seatInfo: (seat: number) => TableSeat;
  scoreOf: (seat: number) => number;
  nameOf: (seat: number) => string;
  onPlayer: (seat: TableSeat) => void;
  active: (seat: Seat) => boolean;
}

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));

export function TableBoard({ view, caption, seatInfo, scoreOf, nameOf, onPlayer, active }: Props) {
  const { width } = useWindowDimensions();
  const me = view.seat;
  const at = (offset: number) => ((me + offset) % 4) as Seat;
  const right = at(1);
  const across = at(2);
  const left = at(3);
  const boardWidth = Math.min(width, 560) - 40 - 24;
  const sideWidth = Math.max(68, Math.min(92, Math.floor(boardWidth * 0.22)));
  const centerWidth = boardWidth - sideWidth * 2 - 12;
  const labelWidth = 40;
  const small = Math.max(13, Math.min(20, Math.floor((centerWidth - 16 - labelWidth - 6 - 8 * 2) / 9)));
  const last = view.discards[view.discards.length - 1];
  const claim = view.phase.kind === 'claim' ? view.phase : null;
  const result = view.result;
  const display = (seat: number) => (seat === me ? 'You' : nameOf(seat));

  const chip = (seat: Seat, vertical: boolean) => {
    const info = seatInfo(seat);
    const isActive = active(seat);
    const content = (
      <View style={[styles.chip, vertical && styles.chipVertical, isActive && styles.chipActive]}>
        <Avatar name={info.name} color={info.color} size={vertical ? 28 : 26} online={info.kind === 'human' ? info.online : undefined} />
        <View style={vertical ? { alignItems: 'center' } : { flexShrink: 1 }}>
          <Text style={[styles.chipName, vertical && { textAlign: 'center' }]} numberOfLines={1}>
            {nameOf(seat)}
          </Text>
          <Text style={[styles.chipMeta, vertical && { textAlign: 'center' }]} numberOfLines={1}>
            {SEAT_WINDS[seat]} · {formatScore(scoreOf(seat))}
          </Text>
        </View>
      </View>
    );
    const label = `${info.name}, ${SEAT_WINDS[seat]} wind, ${view.players[seat]!.handCount} tiles, score ${scoreOf(seat)}${isActive ? ', to play' : ''}`;
    return info.kind === 'human' && info.principalId ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Options to report or block`} onPress={() => onPlayer(info)}>
        {content}
      </Pressable>
    ) : (
      <View accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  };

  const backs = (seat: Seat, perRow: number, size: number) => {
    const count = view.players[seat]!.handCount;
    return (
      <View style={[styles.backs, { maxWidth: perRow * (size + 2) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: count }, (_, i) => (
          <TileBack key={i} width={size} />
        ))}
      </View>
    );
  };

  const exposures = (seat: Seat, size: number) => {
    const list = view.players[seat]!.exposures;
    if (list.length === 0) return null;
    return <Exposures exposures={list} width={size} />;
  };

  const discardsOf = (seat: Seat) => {
    const mine = view.discards.map((d, i) => ({ ...d, i })).filter((d) => d.seat === seat);
    return (
      <View
        style={styles.strip}
        key={seat}
        accessible
        accessibilityLabel={`${seat === me ? 'Your' : `${nameOf(seat)}’s`} discards: ${mine.length ? mine.map((d) => tileName(d.tile)).join(', ') : 'none'}`}
      >
        <Text style={[styles.stripLabel, { width: labelWidth }]} numberOfLines={1}>
          {display(seat)}
        </Text>
        <View style={styles.stripTiles}>
          {mine.length === 0 ? (
            <Text style={styles.none}>none yet</Text>
          ) : (
            mine.map((d) => <Tile key={`${d.tile}-${d.i}`} face={faceOf(d.tile)} width={small} flat highlight={d.i === view.discards.length - 1 && !result} />)
          )}
        </View>
      </View>
    );
  };

  const centre = (() => {
    if (result) {
      return (
        <Text style={styles.lastText}>
          {result.kind === 'wall' ? 'Wall game' : `${display(result.winner!)} won${result.from === null ? ', self-drawn' : ` on ${result.from === me ? 'your' : `${nameOf(result.from)}’s`} discard`}`}
        </Text>
      );
    }
    if (!last) return <Text style={styles.lastText}>No discards yet</Text>;
    return (
      <>
        <Tile face={faceOf(last.tile)} width={34} highlight={Boolean(claim)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.lastText} numberOfLines={2}>
            {display(last.seat)} threw {tileShort(last.tile)}
          </Text>
          {claim && <Text style={styles.calling}>Waiting for calls</Text>}
        </View>
      </>
    );
  })();

  return (
    <View style={styles.felt}>
      <Text style={styles.caption} numberOfLines={1}>
        {caption} · {view.wallCount} in the wall
      </Text>

      {/* Across */}
      <View style={styles.acrossRow}>
        {chip(across, false)}
        <View style={{ gap: 4, alignItems: 'center', flexShrink: 1 }}>
          {backs(across, 14, 9)}
          {exposures(across, 15)}
        </View>
      </View>

      <View style={styles.middle}>
        {/* Left */}
        <View style={[styles.side, { width: sideWidth }]}>
          {chip(left, true)}
          {backs(left, Math.floor(sideWidth / 11), 9)}
          {exposures(left, Math.floor((sideWidth - 4) / 5) - 1)}
        </View>

        {/* Centre: the latest discard and each player's discards */}
        <View style={[styles.center, { width: centerWidth }]}>
          <View style={styles.lastBox} accessibilityLiveRegion="polite">
            {centre}
          </View>
          {[across, left, right, me].map((s) => discardsOf(s))}
        </View>

        {/* Right */}
        <View style={[styles.side, { width: sideWidth }]}>
          {chip(right, true)}
          {backs(right, Math.floor(sideWidth / 11), 9)}
          {exposures(right, Math.floor((sideWidth - 4) / 5) - 1)}
        </View>
      </View>
    </View>
  );
}

export function Exposures({ exposures, width }: { exposures: Exposure[]; width: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
      {exposures.map((e, i) => {
        const natural = e.tiles.find((t) => !isJoker(t)) ?? e.tiles[0]!;
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 1 }} accessible accessibilityLabel={`Exposed ${groupName(e.tiles.length)} of ${tileName(natural)}${e.tiles.some(isJoker) ? ' with jokers' : ''}`}>
            {e.tiles.map((t, j) => (
              <Tile key={j} face={faceOf(t)} width={width} flat />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  felt: { backgroundColor: colors.felt, borderRadius: 22, padding: 8, paddingTop: 6, gap: 8, borderWidth: 4, borderColor: colors.woodDark },
  caption: { color: 'rgba(244,239,227,0.7)', fontSize: 11, textAlign: 'center' },
  acrossRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  middle: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  side: { alignItems: 'center', gap: 6 },
  center: { gap: 5, backgroundColor: colors.feltDark, borderRadius: 14, padding: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingVertical: 3, paddingLeft: 3, paddingRight: 10, borderWidth: 2, borderColor: 'transparent' },
  chipVertical: { flexDirection: 'column', gap: 2, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 5, width: '100%' },
  chipActive: { borderColor: colors.gold, backgroundColor: 'rgba(242,193,78,0.18)' },
  chipName: { color: colors.feltText, fontWeight: '700', fontSize: 13, maxWidth: 120 },
  chipMeta: { color: 'rgba(244,239,227,0.75)', fontSize: 11 },
  backs: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center' },
  lastBox: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46 },
  lastText: { color: colors.feltText, fontFamily: fonts.serif, fontSize: 15, lineHeight: 19 },
  calling: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  strip: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  stripLabel: { color: 'rgba(244,239,227,0.85)', fontSize: 11, fontWeight: '700', paddingTop: 2 },
  stripTiles: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2, minHeight: 16 },
  none: { color: 'rgba(244,239,227,0.45)', fontSize: 11, paddingTop: 2 },
});
