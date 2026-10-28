import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { TileButton } from '../components/Tile.tsx';
import { Arrive } from '../components/Arrive.tsx';
import { faceOf, moveTile, tileName } from './tiles.ts';
import { table } from '../theme.ts';

/** What one tile in your rack shows. */
export interface RackItem {
  tile: number;
  label: string;
  selected: boolean;
  highlight: boolean;
  badge?: string;
}

interface Props {
  items: RackItem[];
  tileWidth: number;
  /** Taps choose tiles only when there is something to choose; arranging always works. */
  tapsDisabled: boolean;
  /** Tiles that turn up after the first render drop into the rack. */
  animate: boolean;
  onTap: (tile: number) => void;
  /** A new order, after a drag or a Move left / Move right action. */
  onArrange: (order: number[]) => void;
  /** A tile has been picked up. */
  onLift?: () => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One drag, from picking a tile up to putting it down. */
interface Drag {
  tile: number;
  from: number;
  /** The rack as it was when the drag began. */
  tiles: number[];
  key: string;
  /** Follows the finger or mouse. */
  pan: Animated.ValueXY;
  lift: Animated.Value;
  /** The lifted tile floats a little above the finger, clear of the spot it will land in. */
  rise: Animated.AnimatedInterpolation<number>;
  /** The outline of the spot the tile will land in. */
  spot: Animated.ValueXY;
  /** How far each other tile has slid to make room. */
  shifts: Map<number, Animated.ValueXY>;
}

interface SlotEvents {
  register: (tile: number, view: ViewInstance | null) => void;
  press: (tile: number, event: GestureResponderEvent) => boolean;
  tap: (tile: number) => void;
  move: (tile: number, step: -1 | 1) => void;
}

const NATIVE = Platform.OS !== 'web';
/** How far a press travels before it counts as a drag rather than a tap. */
const SLOP = 8;
/** A new spot has to be this much closer than the current one, so the gap doesn't flicker on a boundary. */
const STICKY = 6;
/** How much bigger a picked-up tile looks. */
const LIFT = 1.12;
const SLIDE = { duration: 140, easing: Easing.out(Easing.quad) };
const SETTLE = { duration: 150, easing: Easing.out(Easing.cubic) };
/** Taps right after a drag are the mouse coming up, not a choice. */
const AFTER_DRAG_MS = 300;

const MOVE_LEFT = { name: 'moveLeft', label: 'Move left' };
const MOVE_RIGHT = { name: 'moveRight', label: 'Move right' };
const MOVES = { both: [MOVE_LEFT, MOVE_RIGHT], first: [MOVE_RIGHT], last: [MOVE_LEFT], none: [] };

/** On the web: no text selection or page panning while a tile is dragged by mouse or finger. */
const WEB_DRAG = Platform.OS === 'web' ? ({ userSelect: 'none', touchAction: 'none' } as ViewStyle) : null;

/** How far the finger (or mouse) has moved since it went down. */
function travel(event: GestureResponderEvent): { x: number; y: number } | null {
  const { touchBank, indexOfSingleActiveTouch } = event.touchHistory;
  const touch = touchBank[indexOfSingleActiveTouch];
  return touch ? { x: touch.currentPageX - touch.startPageX, y: touch.currentPageY - touch.startPageY } : null;
}

/** Tells one press from the next, so a drag only starts from a press that began on a tile. */
function pressId(event: GestureResponderEvent): string {
  const { touchBank, indexOfSingleActiveTouch } = event.touchHistory;
  const touch = touchBank[indexOfSingleActiveTouch];
  return touch ? `${touch.startTimeStamp}:${touch.startPageX}:${touch.startPageY}` : '';
}

const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/**
 * Your rack, which you can arrange however helps you see your hand: press a tile and drag
 * it to a new spot (the others slide aside to make room), or use the Move left and Move
 * right actions with a screen reader. A plain tap still chooses the tile.
 */
export function Rack({ items, tileWidth, tapsDisabled, animate, onTap, onArrange, onLift }: Props) {
  const tiles = useMemo(() => items.map((i) => i.tile), [items]);
  const key = tiles.join(',');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [spot, setSpot] = useState<Rect | null>(null);
  const container = useRef<ViewInstance>(null);
  // The latest props, for gesture handlers made once.
  const latest = useRef({ tiles, key, onTap, onArrange, onLift });
  latest.current = { tiles, key, onTap, onArrange, onLift };

  const { responder, events, gesture } = useMemo(() => {
    const views = new Map<number, ViewInstance>();
    // The drag in progress, kept out of state so moving the tile doesn't re-render anything.
    const gesture = {
      pressed: null as { tile: number; id: string } | null,
      drag: null as Drag | null,
      /** Where each spot in the rack is, measured when the drag starts. */
      slots: null as Rect[] | null,
      to: 0,
      moved: { x: 0, y: 0 },
      /** The spot each tile is sliding to. */
      targets: [] as number[],
      settling: false,
      droppedAt: 0,
    };

    // Slide the tiles between the drag's start and `to` along by one, leaving a gap at `to`.
    const openGap = (d: Drag, slots: Rect[], to: number) => {
      gesture.to = to;
      d.tiles.forEach((t, i) => {
        if (i === d.from) return;
        const j = i > d.from && i <= to ? i - 1 : i < d.from && i >= to ? i + 1 : i;
        if (gesture.targets[i] === j) return;
        gesture.targets[i] = j;
        Animated.timing(d.shifts.get(t)!, { toValue: { x: slots[j]!.x - slots[i]!.x, y: slots[j]!.y - slots[i]!.y }, ...SLIDE, useNativeDriver: NATIVE }).start();
      });
      Animated.timing(d.spot, { toValue: { x: slots[to]!.x, y: slots[to]!.y }, ...SLIDE, useNativeDriver: NATIVE }).start();
    };

    // The tile lands in whichever spot its middle is nearest.
    const retarget = () => {
      const d = gesture.drag;
      const slots = gesture.slots;
      if (!d || !slots || gesture.settling) return;
      const home = centre(slots[d.from]!);
      const at = { x: home.x + gesture.moved.x, y: home.y + gesture.moved.y };
      const distance = (i: number) => {
        const c = centre(slots[i]!);
        return Math.hypot(c.x - at.x, c.y - at.y);
      };
      let best = gesture.to;
      for (let i = 0; i < slots.length; i++) if (distance(i) < distance(best)) best = i;
      if (best !== gesture.to && distance(best) + STICKY < distance(gesture.to)) openGap(d, slots, best);
    };

    // Measure every spot before the lifted tile moves; all tiles are the same size, so
    // the spots stay put whatever order the tiles are in.
    const measure = (d: Drag) => {
      const box = container.current;
      if (!box) return;
      const slots: Rect[] = [];
      let left = d.tiles.length;
      d.tiles.forEach((t, i) => {
        views.get(t)?.measureLayout(
          box,
          (x, y, width, height) => {
            slots[i] = { x, y, width, height };
            left -= 1;
            if (left > 0 || gesture.drag !== d) return;
            gesture.slots = slots;
            d.spot.setValue({ x: slots[d.from]!.x, y: slots[d.from]!.y });
            setSpot(slots[d.from]!);
            retarget();
          },
          () => undefined,
        );
      });
    };

    const begin = (event: GestureResponderEvent) => {
      const { tiles, key } = latest.current;
      const pressed = gesture.pressed;
      const from = pressed ? tiles.indexOf(pressed.tile) : -1;
      if (!pressed || from < 0) return;
      const moved = travel(event) ?? { x: 0, y: 0 };
      const lift = new Animated.Value(1);
      const d: Drag = {
        tile: pressed.tile,
        from,
        tiles,
        key,
        pan: new Animated.ValueXY(moved),
        lift,
        rise: lift.interpolate({ inputRange: [1, LIFT], outputRange: [0, -10] }),
        spot: new Animated.ValueXY(),
        shifts: new Map(tiles.filter((t) => t !== pressed.tile).map((t) => [t, new Animated.ValueXY()])),
      };
      Object.assign(gesture, { drag: d, slots: null, to: from, moved, targets: tiles.map((_, i) => i) });
      measure(d);
      setDrag(d);
      // The lifted tile shares a transform with the finger-driven pan, so it runs in JS too.
      Animated.spring(d.lift, { toValue: LIFT, speed: 40, bounciness: 6, useNativeDriver: false }).start();
      latest.current.onLift?.();
    };

    const follow = (event: GestureResponderEvent) => {
      const d = gesture.drag;
      const moved = travel(event);
      if (!d || !moved || gesture.settling) return;
      gesture.moved = moved;
      d.pan.setValue(moved);
      retarget();
    };

    // Glide the tile into its spot (or back home), then commit the new order.
    const settle = (keep: boolean) => {
      const d = gesture.drag;
      if (!d || gesture.settling) return;
      const slots = gesture.slots;
      if (slots && !keep) openGap(d, slots, d.from);
      gesture.settling = true;
      gesture.droppedAt = Date.now();
      const to = slots ? gesture.to : d.from;
      const home = slots?.[d.from];
      const end = slots?.[to];
      const toValue = home && end ? { x: end.x - home.x, y: end.y - home.y } : { x: 0, y: 0 };
      Animated.parallel([
        Animated.timing(d.pan, { toValue, ...SETTLE, useNativeDriver: false }),
        Animated.timing(d.lift, { toValue: 1, ...SETTLE, useNativeDriver: false }),
      ]).start(() => {
        if (gesture.drag !== d) return;
        Object.assign(gesture, { drag: null, slots: null, settling: false, droppedAt: Date.now() });
        // One render puts the tiles in their new order and drops the slide offsets together.
        if (to !== d.from && latest.current.key === d.key) latest.current.onArrange(moveTile(d.tiles, d.from, to));
        setDrag(null);
        setSpot(null);
      });
    };

    const wantsDrag = (event: GestureResponderEvent) => {
      const moved = travel(event);
      return (
        gesture.pressed !== null &&
        gesture.drag === null &&
        moved !== null &&
        gesture.pressed.id === pressId(event) &&
        Math.hypot(moved.x, moved.y) > SLOP
      );
    };

    const responder = PanResponder.create({
      // Presses belong to the tiles (for taps) until they travel far enough to be a drag.
      onStartShouldSetPanResponderCapture: () => {
        gesture.pressed = null;
        return false;
      },
      onMoveShouldSetPanResponderCapture: wantsDrag,
      onMoveShouldSetPanResponder: wantsDrag,
      onPanResponderGrant: begin,
      onPanResponderMove: follow,
      onPanResponderRelease: () => settle(true),
      onPanResponderTerminate: () => settle(false),
      onPanResponderTerminationRequest: () => false,
    });

    const events: SlotEvents = {
      register: (tile, view) => {
        if (view) views.set(tile, view);
        else views.delete(tile);
      },
      press: (tile, event) => {
        gesture.pressed = { tile, id: pressId(event) };
        return false;
      },
      tap: (tile) => {
        if (gesture.drag || gesture.settling || Date.now() - gesture.droppedAt < AFTER_DRAG_MS) return;
        latest.current.onTap(tile);
      },
      move: (tile, step) => {
        const { tiles, onArrange } = latest.current;
        const from = tiles.indexOf(tile);
        const to = from + step;
        if (from < 0 || to < 0 || to >= tiles.length || gesture.drag) return;
        onArrange(moveTile(tiles, from, to));
        AccessibilityInfo.announceForAccessibility(`${tileName(tile)} moved to place ${to + 1} of ${tiles.length}`);
      },
    };

    return { responder, events, gesture };
  }, []);

  // A tile arrived or left mid-drag: drop the drag and show the rack as it now is.
  const live = drag?.key === key ? drag : null;
  useEffect(() => {
    if (!gesture.drag || gesture.drag.key === key) return;
    Object.assign(gesture, { drag: null, slots: null, settling: false });
    setDrag(null);
    setSpot(null);
  }, [key]);

  return (
    <View ref={container} style={[styles.rack, WEB_DRAG]} {...responder.panHandlers}>
      {live && spot ? (
        <Animated.View style={[styles.spot, { width: spot.width, height: spot.height, borderRadius: spot.width * 0.14, transform: live.spot.getTranslateTransform() }]} />
      ) : null}
      {items.map((item, i) => (
        <RackSlot
          key={item.tile}
          {...item}
          index={i}
          count={items.length}
          width={tileWidth}
          disabled={tapsDisabled}
          animate={animate}
          lifted={live?.tile === item.tile ? live : null}
          shift={live && live.tile !== item.tile ? live.shifts.get(item.tile) : undefined}
          events={events}
        />
      ))}
    </View>
  );
}

interface SlotProps extends RackItem {
  index: number;
  count: number;
  width: number;
  disabled: boolean;
  animate: boolean;
  /** The drag, while this is the tile being dragged. */
  lifted: Drag | null;
  /** While another tile is dragged, how far this one has slid to make room. */
  shift: Animated.ValueXY | undefined;
  events: SlotEvents;
}

const RackSlot = memo(function RackSlot({ tile, label, selected, highlight, badge, index, count, width, disabled, animate, lifted, shift, events }: SlotProps) {
  const register = useCallback((view: ViewInstance | null) => events.register(tile, view), [events, tile]);
  const press = useCallback((event: GestureResponderEvent) => events.press(tile, event), [events, tile]);
  const tap = useCallback(() => events.tap(tile), [events, tile]);
  const act = useCallback((event: AccessibilityActionEvent) => events.move(tile, event.nativeEvent.actionName === 'moveLeft' ? -1 : 1), [events, tile]);
  return (
    <Animated.View
      ref={register}
      onStartShouldSetResponderCapture={press}
      style={
        lifted
          ? [styles.lifted, { borderRadius: width * 0.1, transform: [...lifted.pan.getTranslateTransform(), { translateY: lifted.rise }, { scale: lifted.lift }] }]
          : shift
            ? { transform: shift.getTranslateTransform() }
            : null
      }
    >
      {/* Tiles you draw or are passed drop into the rack. */}
      <Arrive from={{ y: -26 }} animate={animate}>
        <TileButton
          face={faceOf(tile)}
          depth="standing"
          label={label}
          width={width}
          selected={selected}
          highlight={highlight}
          badge={badge}
          disabled={disabled}
          onPress={tap}
          testID={`rack-tile-${index}`}
          accessibilityActions={count < 2 ? MOVES.none : index === 0 ? MOVES.first : index === count - 1 ? MOVES.last : MOVES.both}
          onAccessibilityAction={act}
        />
      </Arrive>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  rack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    rowGap: 10,
    // The near edge of the table: your tiles stand on the felt in front of the rim.
    backgroundColor: table.felt,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 7,
    borderBottomColor: table.rim,
  },
  // Picked up: above its neighbours, with a deeper shadow.
  lifted: { zIndex: 2, boxShadow: '0px 10px 14px rgba(0, 0, 0, 0.35)' },
  // Where the dragged tile will land.
  spot: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    pointerEvents: 'none',
  },
});
