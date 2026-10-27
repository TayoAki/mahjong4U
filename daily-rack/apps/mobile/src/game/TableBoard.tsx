import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SEATS, SEAT_WINDS, isJoker, type Exposure, type PlayerView, type Seat } from '@daily-rack/core/mahjong';
import type { TableSeat } from '../lib/api.ts';
import { Arrive, useAfterFirstRender } from '../components/Arrive.tsx';
import { Avatar } from '../components/ui.tsx';
import { Tile, TileFromBehind, TileFromSide, type TileDepth } from '../components/Tile.tsx';
import { colors, table } from '../theme.ts';
import { faceOf, groupName, tileName } from './tiles.ts';

// The table seen from your chair, laid out like a real one: the player across holds their
// tiles up with the backs toward you, the players on your left and right are seen side on,
// and every player's discards lie in rows of six in front of them, turned their way, around
// the console in the middle. Hidden tiles stay hidden; all hands show when the hand ends.

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
const PER_ROW = 6;
const RIM = 7;
const PAD = 8;
const SIDE = 16;
const GAP = 4;

/** Height of a tile lying face up, including the edge that shows its thickness. */
function lyingHeight(width: number): number {
  const layer = Math.max(2, Math.round(width * 0.09));
  return width * 1.3 + Math.max(1, layer - 1) + layer;
}

/** Lays children out in a w×h box, then turns the box to face a player. */
function Turned({ deg, w, h, children }: { deg: number; w: number; h: number; children: ReactNode }) {
  const sideways = Math.abs(deg) % 180 === 90;
  return (
    <View style={{ width: sideways ? h : w, height: sideways ? w : h, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: w, height: h, transform: [{ rotate: `${deg}deg` }] }}>{children}</View>
    </View>
  );
}

export function TableBoard({ view, caption, seatInfo, scoreOf, nameOf, onPlayer, active }: Props) {
  const { width } = useWindowDimensions();
  const ready = useAfterFirstRender();
  const me = view.seat;
  const at = (offset: number) => ((me + offset) % 4) as Seat;
  const right = at(1);
  const across = at(2);
  const left = at(3);
  const result = view.result;
  const display = (seat: number) => (seat === me ? 'You' : nameOf(seat));

  // Size the discards so the cross of four rivers and the console fills the felt.
  const inner = Math.min(width, 560) - 40 - RIM * 2 - PAD * 2;
  const room = inner - 2 * (SIDE + GAP);
  const discardsOf = (seat: Seat) => view.discards.map((d, i) => ({ ...d, i })).filter((d) => d.seat === seat);
  const rows = Math.max(3, ...SEATS.map((s) => Math.ceil(discardsOf(s).length / PER_ROW)));
  let t = 26;
  while (t > 11 && 2 * rows * (lyingHeight(t) + 2) + PER_ROW * t + 5 + 2 * GAP > room) t -= 1;
  const riverW = PER_ROW * t + (PER_ROW - 1);
  const depth = rows * (lyingHeight(t) + 2);
  const cross = 2 * depth + riverW + 2 * GAP;
  const expo = Math.max(10, Math.floor(depth / 5.2));
  const last = view.discards.length - 1;

  const chip = (seat: Seat, align: 'left' | 'center' | 'right') => {
    const info = seatInfo(seat);
    const isActive = active(seat);
    const content = (
      <View style={[styles.chip, align === 'right' && { flexDirection: 'row-reverse' }, isActive && styles.chipActive]}>
        <Avatar name={info.name} color={info.color} size={24} online={info.kind === 'human' ? info.online : undefined} />
        <View style={{ flexShrink: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <Text style={styles.chipName} numberOfLines={1}>
            {nameOf(seat)}
          </Text>
          <Text style={styles.chipMeta} numberOfLines={1}>
            {SEAT_WINDS[seat]} · {formatScore(scoreOf(seat))}
          </Text>
        </View>
      </View>
    );
    const label = `${info.name}, ${['', 'on your right', 'across from you', 'on your left'][(seat - me + 4) % 4]}, ${SEAT_WINDS[seat]} wind, ${view.players[seat]!.handCount} tiles, score ${scoreOf(seat)}${isActive ? ', to play' : ''}`;
    return info.kind === 'human' && info.principalId ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Options to report or block`} onPress={() => onPlayer(info)} style={{ maxWidth: '34%' }}>
        {content}
      </Pressable>
    ) : (
      <View accessible accessibilityLabel={label} style={{ maxWidth: '34%' }}>
        {content}
      </View>
    );
  };

  const river = (seat: Seat, deg: number) => {
    const tiles = discardsOf(seat);
    return (
      <Turned deg={deg} w={riverW} h={depth}>
        <View
          style={styles.river}
          accessible
          accessibilityLabel={`${seat === me ? 'Your' : `${nameOf(seat)}’s`} discards: ${tiles.length ? tiles.map((d) => tileName(d.tile)).join(', ') : 'none'}`}
        >
          {tiles.map((d) => (
            // A new discard slides out from its player's side of the table.
            <Arrive key={d.tile} from={{ y: 28 }} animate={ready}>
              <Tile face={faceOf(d.tile)} width={t} depth="lying" highlight={d.i === last && !result} />
            </Arrive>
          ))}
        </View>
      </Turned>
    );
  };

  const corner = (seat: Seat, deg: number) => (
    <Turned deg={deg} w={depth} h={depth}>
      <View style={styles.corner}>
        <Exposures exposures={view.players[seat]!.exposures} width={expo} depth="lying" align="flex-start" />
      </View>
    </Turned>
  );

  const sideRack = (seat: Seat, faceFirst: boolean) => {
    const count = view.players[seat]!.handCount;
    const length = Math.max(10, Math.min(20, Math.floor((cross - count) / Math.max(13, count))));
    return (
      <View style={[styles.sideRack, { height: cross }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: count }, (_, i) => (
          <TileFromSide key={i} length={length} thickness={SIDE - 4} faceFirst={faceFirst} />
        ))}
      </View>
    );
  };

  // The console in the middle: a light on each side shows whose move it is.
  const light = (seat: Seat, deg: number) => (
    <Turned deg={deg} w={riverW} h={22}>
      <View style={styles.lightRow}>
        <View style={[styles.light, active(seat) && styles.lightOn]} />
        <Text style={[styles.wind, active(seat) && { color: table.light }]}>{SEAT_WINDS[seat][0]}</Text>
        <View style={[styles.light, active(seat) && styles.lightOn]} />
      </View>
    </Turned>
  );
  const lastTile = view.discards[last];
  const consoleLabel = result
    ? result.kind === 'wall'
      ? 'Wall game'
      : `${display(result.winner!)} won${result.from === null ? ', self-drawn' : ` on ${result.from === me ? 'your' : `${nameOf(result.from)}’s`} discard`}`
    : `${view.wallCount} tiles left in the wall${lastTile ? `. ${display(lastTile.seat)} threw ${tileName(lastTile.tile)}` : ''}`;
  const console_ = (
    <View style={[styles.console, { width: riverW, height: riverW }]} accessible accessibilityLabel={consoleLabel} accessibilityLiveRegion="polite">
      <View style={[styles.consoleRow, { top: 2 }]}>{light(across, 180)}</View>
      <View style={[styles.consoleRow, { bottom: 2 }]}>{light(me, 0)}</View>
      <View style={[styles.consoleCol, { left: 2 }]}>{light(left, 90)}</View>
      <View style={[styles.consoleCol, { right: 2 }]}>{light(right, -90)}</View>
      <View style={styles.consoleCenter}>
        {result ? (
          <Text style={styles.consoleText} numberOfLines={3}>
            {result.kind === 'wall' ? 'Wall game' : 'Mahjong!'}
          </Text>
        ) : lastTile ? (
          <>
            <Tile face={faceOf(lastTile.tile)} width={Math.round(riverW * 0.27)} depth="lying" highlight={view.phase.kind === 'claim'} />
            <Text style={styles.consoleSmall} numberOfLines={1}>
              {display(lastTile.seat)}
            </Text>
          </>
        ) : null}
        <Text style={styles.wall}>{view.wallCount} left</Text>
      </View>
    </View>
  );

  return (
    // Tipped back a little, as the table looks from your chair.
    <View style={[styles.rim, { transform: [{ perspective: 1100 }, { rotateX: '16deg' }, { scale: 0.98 }] }]}>
      <View style={styles.felt}>
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
        <View style={styles.chips}>
          {chip(left, 'left')}
          {chip(across, 'center')}
          {chip(right, 'right')}
        </View>
        <View style={styles.acrossRack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: view.players[across]!.handCount }, (_, i) => (
            <TileFromBehind key={i} width={Math.min(15, Math.floor((inner - 40) / 14) - 1)} />
          ))}
        </View>

        <View style={styles.middle}>
          {sideRack(left, true)}
          <View style={{ width: cross, gap: GAP }}>
            <View style={styles.crossRow}>
              {corner(across, 180)}
              {river(across, 180)}
              {corner(right, -90)}
            </View>
            <View style={styles.crossRow}>
              {river(left, 90)}
              {console_}
              {river(right, -90)}
            </View>
            <View style={styles.crossRow}>
              {corner(left, 90)}
              {river(me, 0)}
              {corner(me, 0)}
            </View>
          </View>
          {sideRack(right, false)}
        </View>
      </View>
    </View>
  );
}

export function Exposures({
  exposures,
  width,
  depth,
  align = 'center',
}: {
  exposures: Exposure[];
  width: number;
  depth?: TileDepth;
  align?: 'center' | 'flex-start';
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: align }}>
      {exposures.map((e, i) => {
        const natural = e.tiles.find((t) => !isJoker(t)) ?? e.tiles[0]!;
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 1 }} accessible accessibilityLabel={`Exposed ${groupName(e.tiles.length)} of ${tileName(natural)}${e.tiles.some(isJoker) ? ' with jokers' : ''}`}>
            {e.tiles.map((t, j) => (
              <Tile key={j} face={faceOf(t)} width={width} flat depth={depth} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rim: { backgroundColor: table.rim, borderRadius: 24, padding: RIM, borderBottomWidth: 5, borderBottomColor: table.rimDark },
  felt: { backgroundColor: table.felt, borderRadius: 18, padding: PAD, paddingTop: 4, gap: 6, borderWidth: 1, borderColor: table.feltDark },
  caption: { color: 'rgba(243,247,242,0.65)', fontSize: 11, textAlign: 'center' },
  chips: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.16)', borderRadius: 999, padding: 2, paddingHorizontal: 6, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { borderColor: table.light, backgroundColor: 'rgba(242,193,78,0.22)' },
  chipName: { color: table.text, fontWeight: '700', fontSize: 12 },
  chipMeta: { color: 'rgba(243,247,242,0.75)', fontSize: 10 },
  acrossRack: { flexDirection: 'row', justifyContent: 'center', gap: 1 },
  middle: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: GAP },
  sideRack: { width: SIDE, alignItems: 'center', justifyContent: 'center', gap: 1 },
  crossRow: { flexDirection: 'row', gap: GAP, alignItems: 'center' },
  river: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 1, rowGap: 2, alignContent: 'flex-start' },
  corner: { flex: 1, justifyContent: 'flex-end', padding: 2 },
  console: { backgroundColor: table.console, borderRadius: 14, borderWidth: 3, borderColor: table.consoleEdge, overflow: 'hidden' },
  consoleRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  consoleCol: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  lightRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  light: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  lightOn: { backgroundColor: table.light, shadowColor: table.light, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  wind: { color: 'rgba(243,247,242,0.55)', fontSize: 11, fontWeight: '800' },
  consoleCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 22 },
  consoleText: { color: table.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  consoleSmall: { color: 'rgba(243,247,242,0.8)', fontSize: 9, fontWeight: '600' },
  wall: { color: colors.gold, fontSize: 10, fontWeight: '700' },
});
