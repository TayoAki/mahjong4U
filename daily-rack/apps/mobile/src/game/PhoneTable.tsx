import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import {
  SEAT_WINDS,
  keyOf,
  type PlayerView,
  type Seat,
} from "@daily-rack/core/mahjong";
import type { TableSeat } from "../lib/api.ts";
import { Avatar } from "../components/ui.tsx";
import { Tile } from "../components/Tile.tsx";
import { colors, table } from "../theme.ts";
import { Exposures } from "./TableBoard.tsx";
import { faceOf, sortTiles, tileName } from "./tiles.ts";

// The table on a phone, built for playing rather than for looking like a table: the other
// three players in a strip along the top, and every discard in one big pool you can read at
// a glance, in the order they were thrown or gathered by tile with a count, so you can see
// what's gone. Your rack and your moves sit below it and never push it off the screen.

const formatScore = (n: number) => (n > 0 ? `+${n}` : String(n));

interface StripProps {
  view: PlayerView;
  seatInfo: (seat: number) => TableSeat;
  nameOf: (seat: number) => string;
  scoreOf: (seat: number) => number;
  active: (seat: Seat) => boolean;
  onPlayer: (seat: TableSeat) => void;
}

/** The other three players, left to right as they sit around you: left, across, right. */
export function OpponentStrip({
  view,
  seatInfo,
  nameOf,
  scoreOf,
  active,
  onPlayer,
}: StripProps) {
  const me = view.seat;
  const seats = [3, 2, 1].map((offset) => ((me + offset) % 4) as Seat);
  const sides = ["on your left", "across from you", "on your right"];
  return (
    <View style={styles.strip}>
      {seats.map((seat, i) => {
        const info = seatInfo(seat);
        const player = view.players[seat]!;
        const on = active(seat);
        const label = `${info.name}, ${sides[i]}, ${SEAT_WINDS[seat]} wind, ${player.handCount} tiles, score ${scoreOf(seat)}${on ? ", to play" : ""}${player.dead ? ", hand is dead" : ""}`;
        const body = (
          <View style={[styles.player, on && styles.playerOn]}>
            <View style={styles.playerTop}>
              <Avatar
                name={info.name}
                color={info.color}
                size={22}
                online={info.kind === "human" ? info.online : undefined}
              />
              <Text style={styles.playerName} numberOfLines={1}>
                {nameOf(seat)}
              </Text>
            </View>
            <Text
              style={[styles.playerMeta, player.dead && styles.playerDead]}
              numberOfLines={1}
            >
              {player.dead
                ? "Dead hand"
                : `${SEAT_WINDS[seat]} · ${player.handCount} tiles · ${formatScore(scoreOf(seat))}`}
            </Text>
            {player.exposures.length > 0 && (
              <Exposures
                exposures={player.exposures}
                width={15}
                align="flex-start"
              />
            )}
          </View>
        );
        return info.kind === "human" && info.principalId ? (
          <Pressable
            key={seat}
            style={styles.playerCell}
            accessibilityRole="button"
            accessibilityLabel={`${label}. Options to report or block`}
            onPress={() => onPlayer(info)}
          >
            {body}
          </Pressable>
        ) : (
          <View
            key={seat}
            style={styles.playerCell}
            accessible
            accessibilityLabel={label}
          >
            {body}
          </View>
        );
      })}
    </View>
  );
}

export type PoolMode = "order" | "tile";

interface PoolProps {
  view: PlayerView;
  /** "You" or a player's name, for the newest discard. */
  display: (seat: number) => string;
  mode: PoolMode;
  onMode: (mode: PoolMode) => void;
  /** The newest line of the play log: a call, a pass, who deals the next hand. */
  latest?: string | null;
}

const GAP = 3;

/**
 * Every discard in one place. "In order" shows them as they were thrown, newest last and
 * outlined; "By tile" shows each tile once with how many are out, which is what you need to
 * judge whether a hand can still be made.
 */
export function DiscardPool({
  view,
  display,
  mode,
  onMode,
  latest,
}: PoolProps) {
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollViewInstance>(null);
  const discards = view.discards;
  const last = discards.at(-1);
  const groups = useMemo(() => {
    const byKey = new Map<string, number[]>();
    for (const d of discards)
      byKey.set(keyOf(d.tile), [...(byKey.get(keyOf(d.tile)) ?? []), d.tile]);
    const firsts = sortTiles(
      [...byKey.values()].map((tiles) => tiles[0]!),
      "suit",
    );
    return firsts.map((t) => ({ tile: t, count: byKey.get(keyOf(t))!.length }));
  }, [discards]);
  // Big enough to read, small enough that a whole hand's discards usually fit.
  const tile =
    width > 0
      ? Math.max(24, Math.min(34, Math.floor((width - 16 - GAP * 11) / 12)))
      : 26;
  useEffect(() => {
    if (mode === "order") scroller.current?.scrollToEnd({ animated: true });
  }, [discards.length, mode]);

  const summary =
    discards.length === 0
      ? "No discards yet"
      : `${discards.length} ${discards.length === 1 ? "discard" : "discards"}${last ? `. Last: ${tileName(last.tile)} from ${display(last.seat)}` : ""}`;
  return (
    <View
      style={styles.pool}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      testID="discard-pool"
    >
      <View style={styles.poolHead}>
        <Text style={styles.poolTitle} accessibilityRole="header">
          Discards {discards.length > 0 ? `· ${discards.length}` : ""}
        </Text>
        <Text
          style={styles.wall}
          accessibilityLabel={`${view.wallCount} tiles left in the wall`}
        >
          {view.wallCount} left
        </Text>
        <View
          style={styles.toggle}
          accessibilityRole="radiogroup"
          accessibilityLabel="Show discards"
        >
          {(["order", "tile"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => onMode(m)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === m }}
              accessibilityLabel={
                m === "order"
                  ? "In the order thrown"
                  : "Grouped by tile, with counts"
              }
              style={[styles.toggleItem, mode === m && styles.toggleOn]}
              hitSlop={6}
              testID={`pool-${m}`}
            >
              <Text
                style={[styles.toggleText, mode === m && styles.toggleTextOn]}
              >
                {m === "order" ? "In order" : "By tile"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {/* Always one line, so news never moves the table. */}
      <Text
        style={styles.latest}
        numberOfLines={1}
        accessibilityLiveRegion="polite"
        testID="latest-event"
      >
        {latest ?? " "}
      </Text>
      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={styles.poolBody}
        accessibilityLabel={summary}
      >
        {discards.length === 0 ? (
          <Text style={styles.empty}>Thrown tiles land here.</Text>
        ) : mode === "order" ? (
          discards.map((d, i) => (
            <View
              key={d.tile}
              accessible
              accessibilityLabel={`${tileName(d.tile)}, thrown by ${display(d.seat)}`}
            >
              <Tile
                face={faceOf(d.tile)}
                width={tile}
                flat
                highlight={i === discards.length - 1 && !view.result}
              />
            </View>
          ))
        ) : (
          groups.map((g) => (
            <View
              key={g.tile}
              accessible
              accessibilityLabel={`${tileName(g.tile)}: ${g.count} out`}
            >
              <Tile face={faceOf(g.tile)} width={tile} flat />
              {g.count > 1 && (
                <View style={[styles.count, g.count >= 3 && styles.countHigh]}>
                  <Text style={styles.countText}>{g.count}</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 6 },
  playerCell: { flex: 1, minWidth: 0 },
  player: {
    flex: 1,
    gap: 3,
    backgroundColor: table.felt,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderWidth: 2,
    borderColor: "transparent",
  },
  playerOn: { borderColor: table.light, backgroundColor: table.feltDark },
  playerTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  playerName: { flex: 1, color: table.text, fontWeight: "700", fontSize: 13 },
  playerMeta: { color: "rgba(243,247,242,0.8)", fontSize: 11 },
  playerDead: { color: "#FFD3C9", fontWeight: "700" },
  pool: {
    flex: 1,
    minHeight: 110,
    backgroundColor: table.felt,
    borderRadius: 14,
    overflow: "hidden",
  },
  poolHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 4,
  },
  poolTitle: { color: table.text, fontWeight: "800", fontSize: 13 },
  wall: { flex: 1, color: colors.gold, fontWeight: "700", fontSize: 12 },
  toggle: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 999,
    padding: 2,
  },
  toggleItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    minHeight: 28,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: table.text },
  toggleText: { color: table.text, fontSize: 12, fontWeight: "700" },
  toggleTextOn: { color: table.feltDark },
  poolBody: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 2,
  },
  empty: { color: "rgba(243,247,242,0.7)", fontSize: 13, padding: 6 },
  latest: {
    color: "rgba(243,247,242,0.85)",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  count: {
    position: "absolute",
    right: -3,
    top: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  countHigh: { backgroundColor: colors.primary },
  countText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
