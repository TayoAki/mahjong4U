import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DAILY_SEAT, DEALT_WALL, SEATS, SEAT_WINDS, type PlayerView, type PublicPhase, type Seat, type TableDiscard } from '@daily-rack/core/mahjong';
import type { TableSeat } from '../lib/api.ts';
import { usePrefs } from '../lib/prefs.ts';
import { useLayout } from '../lib/layout.ts';
import { preloadSounds, setSoundsEnabled } from '../lib/sounds.ts';
import { Columns, Screen } from '../components/ui.tsx';
import { TileStyle } from '../components/Tile.tsx';
import { TableBoard } from '../game/TableBoard.tsx';
import { useRackOrder } from '../game/rackOrder.ts';
import { arrangeTiles, sortTiles, type SortMode } from '../game/tiles.ts';
import { colors, fonts } from '../theme.ts';

// The daily rack is played at the same table as a game: the felt seen from your chair, three
// players around it, the console with the wall count, and your rack along the bottom with
// the move above it. You sit South; East, on your left, holds fourteen tiles and opens.

const PLAYERS: Record<Seat, { name: string; color: string }> = {
  0: { name: 'Hazel', color: '#3E7C6B' },
  1: { name: 'You', color: colors.primary },
  2: { name: 'Rosie', color: '#B9773F' },
  3: { name: 'Dot', color: '#1B4F9C' },
};

export const playerName = (seat: number) => PLAYERS[seat as Seat]?.name ?? 'A player';

const seatInfo = (seat: number): TableSeat => ({
  position: seat,
  kind: seat === DAILY_SEAT ? 'human' : 'bot',
  principalId: null,
  reservedFor: null,
  name: playerName(seat),
  color: PLAYERS[seat as Seat]?.color ?? colors.muted,
  botLevel: null,
  online: seat === DAILY_SEAT,
  wind: SEAT_WINDS[seat as Seat] ?? '',
});

/** What the table shows: your seat's view, made up for a puzzle rather than dealt by a game. */
export function dailyView({ hand, phase, drawn = null, table = [], wallCount = DEALT_WALL }: { hand: number[]; phase: PublicPhase; drawn?: number | null; table?: TableDiscard[]; wallCount?: number }): PlayerView {
  // Between turns everyone holds thirteen; East holds fourteen until the opening throw.
  const opened = table.some((d) => d.seat === 0);
  return {
    seat: DAILY_SEAT,
    phase,
    hand,
    drawn,
    players: SEATS.map((seat) => ({ seat, handCount: seat === DAILY_SEAT ? hand.length : seat === 0 && !opened ? 14 : 13, exposures: [], dead: null })),
    discards: table,
    wallCount,
    prompt: null,
    submitted: false,
    result: null,
  };
}

/** The first Charleston, passing right. `waiting` is who's still choosing. */
export const charlestonPhase = (waiting: Seat[]): PublicPhase => ({ kind: 'charleston', round: 1, direction: 'right', waitingFor: waiting });

/** A little physical feedback on phones, as at the game table. */
export function feel(kind: 'pick' | 'place') {
  if (Platform.OS === 'web') return;
  const done = kind === 'pick' ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  done.catch(() => undefined);
}

/** The table's sounds, and sizes for the table and rack as the game has them on phones, tablets and in landscape. */
export function useDailyTable() {
  const layout = useLayout();
  const prefs = usePrefs();
  useEffect(() => setSoundsEnabled(prefs.sounds), [prefs.sounds]);
  useEffect(preloadSounds, []);
  // Tablets in landscape (and desktops): the table on the left, your rack and moves on the right.
  const sideBySide = layout.wide;
  const sideWidth = sideBySide ? Math.floor((layout.wideColumn - 56 - 22) / 2.25) : layout.contentWidth;
  const boardWidth = sideBySide ? Math.min(layout.wideColumn - 56 - 22 - sideWidth, layout.height - 120) : layout.contentWidth;
  const rackWidth = (sideBySide ? sideWidth - 28 : layout.contentWidth) - 16;
  // Large-tile mode stands five tiles to a row instead of seven; tablets get bigger tiles.
  const perRow = prefs.largeTiles ? 5 : 7;
  const maxTile = (prefs.largeTiles ? 72 : 52) + (layout.tablet ? 14 : 0);
  const tileWidth = Math.max(34, Math.min(maxTile, Math.floor((rackWidth - 6 * (perRow - 1)) / perRow)));
  return { sideBySide, boardWidth, tileWidth, large: prefs.largeTiles };
}

/**
 * Your rack's order at the daily table, kept for the day as the game keeps it for a hand:
 * sorted with the tile you drew at the end, or your own order once you've dragged a tile.
 * The "drag to arrange" hint shows until you do; it's the rack's own, so the game's first
 * hands still show theirs.
 */
export function useDailyRack(revisionId: string, hand: readonly number[], drawn: number | null = null) {
  const [sort, setSort] = useState<SortMode>('suit');
  const [arranged, setArranged] = useRackOrder(`daily:${revisionId}`);
  const own = arranged?.active ? arranged.order : null;
  const tiles = useMemo(() => {
    if (own) return arrangeTiles(own, hand, sort, drawn);
    const sorted = sortTiles(
      hand.filter((t) => t !== drawn),
      sort,
    );
    return drawn === null ? sorted : [...sorted, drawn];
  }, [hand, drawn, sort, own]);
  // Remember where new tiles landed, so they stay put when the next ones arrive.
  const key = tiles.join(',');
  useEffect(() => {
    if (own && own.join(',') !== key) setArranged({ order: tiles, active: true });
  }, [key]);
  return {
    tiles,
    hint: arranged === null,
    label: own ? 'Your order' : sort === 'suit' ? 'By suit' : 'By number',
    arrange: (order: number[]) => {
      setArranged({ order, active: true });
    },
    // By suit, by number, then back to your own order if you've made one.
    nextOrder: () => {
      if (own) {
        setArranged({ order: own, active: false });
        setSort('suit');
      } else if (sort === 'suit') setSort('number');
      else if (arranged) setArranged({ ...arranged, active: true });
      else setSort('suit');
    },
  };
}

/** The felt, with the daily rack's three other players around it. */
export function DailyBoard({ view, caption, width, large }: { view: PlayerView; caption: string; width: number; large: boolean }) {
  const phase = view.phase;
  const active = (seat: Seat) => (phase.kind === 'turn' && phase.seat === seat) || ('waitingFor' in phase && phase.waitingFor.includes(seat));
  return (
    <View testID="daily-board">
      <TableBoard view={view} caption={caption} large={large} seatInfo={seatInfo} scoreOf={() => 0} nameOf={playerName} active={active} width={width} onPlayer={() => undefined} />
    </View>
  );
}

/**
 * Lays a daily rack screen out like the game table. On a phone: `top`, the table, `left`
 * and `right` scroll, and `bar` (the move and your rack) stays at the bottom. Side by side:
 * the table and `left` on the left; `top`, `bar` and `right` on the right.
 */
export function TableFrame({ header, top, board, left, right, bar, large }: { header: ReactNode; top?: ReactNode; board: ReactNode; left?: ReactNode; right?: ReactNode; bar: ReactNode; large: boolean }) {
  const { wide } = useLayout();
  return (
    <TileStyle.Provider value={{ bigIndex: large }}>
      {wide ? (
        <Screen wide>
          {header}
          <Columns
            ratio={1.25}
            left={
              <>
                {board}
                {left}
              </>
            }
            right={
              <>
                {top}
                <View style={barStyles.side}>{bar}</View>
                {right}
              </>
            }
          />
        </Screen>
      ) : (
        <Screen footer={bar}>
          {header}
          {top}
          {board}
          {left}
          {right}
        </Screen>
      )}
    </TileStyle.Provider>
  );
}

/** The line above your rack that says what's happening, in the game's style. */
export function Status({ children, detail, testID }: { children: ReactNode; detail?: ReactNode; testID?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={barStyles.status} testID={testID} accessibilityLiveRegion="polite">
        {children}
      </Text>
      {detail ? <Text style={barStyles.detail}>{detail}</Text> : null}
    </View>
  );
}

export const barStyles = StyleSheet.create({
  side: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  status: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 22, color: colors.ink },
  detail: { fontSize: 14, lineHeight: 19, color: colors.muted },
  tip: { fontSize: 13, lineHeight: 18, color: colors.ink, backgroundColor: colors.sage, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  tipWarn: { backgroundColor: '#FFF2CC' },
  mine: { fontSize: 13, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  log: { fontSize: 13, color: colors.muted },
});
